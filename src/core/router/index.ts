import { randomUUID } from 'crypto';
import { config } from '@config';
import { ConnectionManager } from '@core/connection';
import { InvalidRequestIdError, MalformedMessageError, NoRouteFoundError, ServiceUnavailableError, TimeoutError } from '@core/errors';
import { MonitoringManager } from '@core/monitoring/manager';
import { ServiceRegistry } from '@core/registry';
import { SubscriptionManager } from '@core/subscription';
import { ActionType } from '@core/types';
import { Message, ClientHeader, MessageUtils, BrokerHeader } from '@core/utils';
import { SetupLogger } from '@utils/logger';
import { RouterMetrics } from './metrics';

const logger = SetupLogger('MessageRouter');

export interface Request {
    originServiceId: string;
    targetServiceId: string;
    targetRequestId: string;
    originalHeader: ClientHeader;
    timeout?: NodeJS.Timeout;
    createdAt: Date;
}

export class MessageRouter {
    private requests: Map<string, Request>;
    private subscriptionManager: SubscriptionManager;
    private connectionManager!: ConnectionManager;
    private serviceRegistry!: ServiceRegistry;
    private metrics: RouterMetrics;

    constructor(subscriptionManager: SubscriptionManager, monitoringManager: MonitoringManager) {
        this.requests = new Map();
        this.subscriptionManager = subscriptionManager;
        this.metrics = new RouterMetrics(monitoringManager);
    }

    /**
     * Assigns a ConnectionManager to the MessageRouter.
     *
     * @param connectionManager The ConnectionManager to assign.
     */
    assignConnectionManager(connectionManager: ConnectionManager): void {
        this.connectionManager = connectionManager;
    }

    /**
     * Assigns a ServiceRegistry to the MessageRouter.
     *
     * @param serviceRegistry The ServiceRegistry to assign.
     */
    assignServiceRegistry(serviceRegistry: ServiceRegistry): void {
        this.serviceRegistry = serviceRegistry;
    }

    /**
     * Routes a message to the appropriate subscribers or service.
     *
     * @param serviceId The ID of the service that sent the message.
     * @param parser The message to route.
     */
    routeMessage(serviceId: string, parser: MessageUtils.Parser): void {
        const { action, topic } = parser.header;

        // Reset the heartbeat for the service
        this.serviceRegistry.resetHeartbeat(serviceId);

        // Track messages and size
        this.metrics.messageCount.slot.add(1);
        this.metrics.messageRate.slot.add(1);
        this.metrics.messageSizeAvg.slot.add(parser.length);
        this.metrics.messageSizeMax.slot.add(parser.length);

        try {
            switch (action) {
                case ActionType.PUBLISH:
                    this.metrics.publishCount.slot.add(1);
                    this.metrics.publishRate.slot.add(1);
                    try {
                        this.handlePublish(serviceId, parser);
                    } catch (error) {
                        this.metrics.publishCountError.slot.add(1);
                        this.metrics.publishRateError.slot.add(1);
                        throw error;
                    }
                    break;
                case ActionType.REQUEST:
                    this.metrics.requestCount.slot.add(1);
                    this.metrics.requestRate.slot.add(1);
                    try {
                        this.handleRequest(serviceId, parser);
                    } catch (error) {
                        this.metrics.requestCountError.slot.add(1);
                        this.metrics.requestRateError.slot.add(1);
                        throw error;
                    }
                    break;
                case ActionType.RESPONSE:
                    this.metrics.responseCount.slot.add(1);
                    this.metrics.responseRate.slot.add(1);
                    try {
                        this.handleResponse(serviceId, parser);
                    } catch (error) {
                        this.metrics.responseCountError.slot.add(1);
                        this.metrics.responseRateError.slot.add(1);
                        throw error;
                    }
                    break;
                default:
                    // This should never happen
                    const exhaustiveCheck: never = action;
                    logger.error(`Unknown action type: ${exhaustiveCheck}`);
                    this.metrics.messageCountError.slot.add(1);
                    this.metrics.messageRateError.slot.add(1);
                    const header = MessageUtils.toBrokerHeader(parser.header, ActionType.RESPONSE);
                    const payload = { error: new MalformedMessageError(`Unknown action type: ${action}`).toJSON() };
                    this.connectionManager.sendMessage(serviceId, header, payload, undefined);
            }
        } catch (error) {
            this.metrics.messageCountError.slot.add(1);
            this.metrics.messageRateError.slot.add(1);
            throw error;
        }
    }

    /**
     * Handles a publish message.
     *
     * @param serviceId The ID of the service that sent the message.
     * @param parser The message to publish.
     * @returns True if the message was successfully published, false otherwise.
     */
    private handlePublish(serviceId: string, parser: MessageUtils.Parser): boolean {
        const { topic } = parser.header;

        // Handle system messages
        if (topic.startsWith('system.')) {
            this.serviceRegistry.handleSystemMessage(serviceId, parser);
            return true;
        }

        // Check if the topic has any subscribers
        const subscribers = this.subscriptionManager.getSubscribers(topic);
        if (subscribers.length === 0) {
            logger.debug(`No subscribers for topic: ${topic}`);
            // Send an error response to the requester
            const responseHeader = MessageUtils.toBrokerHeader(parser.header, ActionType.RESPONSE, parser.header.requestId);
            const responsePayload = { error: new NoRouteFoundError(`No subscribers for topic ${topic}`).toJSON() };
            this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload, undefined);
            this.metrics.publishCountDropped.slot.add(1);
            this.metrics.publishRateDropped.slot.add(1);
            return false;
        }

        // Remove the requestId from the header before forwarding
        const newRequestId = this.generateRequestId();
        const forwardedHeader = MessageUtils.toBrokerHeader(parser.header, undefined, newRequestId);
        // Forward the message to all subscribers
        logger.info(`Publishing message to topic: ${topic} for service: ${serviceId}`);
        for (const subscriber of subscribers) {
            this.connectionManager.sendMessage(subscriber, forwardedHeader, parser.rawPayload, parser.header.requestId);
        }

        // If the message had a requestId, send a response to the original sender
        // NOTE: This is commented out for now due to tracer code issues.
        if (parser.header.requestId) {
            const responseHeader = MessageUtils.toBrokerHeader(parser.header, ActionType.RESPONSE, parser.header.requestId);
            const payload = { status: 'success' };
            this.connectionManager.sendMessage(serviceId, responseHeader, payload, undefined);
            logger.info(`Sent publish response to service: ${serviceId} for request: ${parser.header.requestId}`);
        }

        return true;
    }

    /**
     * Handles a request message.
     *
     * @param serviceId The ID of the service making the request.
     * @param parser The request message.
     * @returns True if the request was successfully handled, false otherwise.
     */
    private handleRequest(serviceId: string, parser: MessageUtils.Parser): boolean {
        const { topic } = parser.header;

        // Handle system messages
        if (topic.startsWith('system.')) {
            this.serviceRegistry.handleSystemMessage(serviceId, parser);
            return true;
        }

        // Check if the topic has any subscribers
        const subscribers = this.subscriptionManager.getTopSubscribers(topic);
        if (!subscribers || subscribers.length === 0) {
            throw new NoRouteFoundError(`No subscribers for topic ${topic}`);
        }

        // Pick a subscriber based on priority. If there are multiple subscribers with the same
        // highest priority, randomly select one.
        const targetServiceId = subscribers[Math.floor(Math.random() * subscribers.length)];

        // Create the request object
        const request = this.generateRequest(serviceId, targetServiceId, parser.header);

        // Add the targetRequestId to the message header before forwarding
        const forwardedHeader = MessageUtils.toBrokerHeader(parser.header, undefined, request.targetRequestId);
        logger.info(`Forwarding request for topic: ${topic} from service: ${serviceId} to: ${targetServiceId} with new request ID: ${request.targetRequestId}`);
        this.connectionManager.sendMessage(targetServiceId, forwardedHeader, parser.rawPayload, parser.header.requestId);

        return true;
    }

    /**
     * Handles a response message.
     *
     * @param serviceId The ID of the service that sent the response.
     * @param parser The response message.
     * @returns True if the response was successfully handled, false otherwise.
     */
    private handleResponse(serviceId: string, parser: MessageUtils.Parser): boolean {
        const targetRequestId = parser.header.requestId;
        const { topic } = parser.header;

        // Handle system messages
        if (topic.startsWith('system.')) {
            this.serviceRegistry.handleSystemMessage(serviceId, parser);
            return true;
        }

        if (!targetRequestId) {
            throw new InvalidRequestIdError('Received response message without requestId.');
        }

        // Get the request out from the requestsOut map
        const request = this.getRequest(serviceId, targetRequestId);
        if (!request) {
            throw new InvalidRequestIdError(`No matching request found for requestId: ${targetRequestId}`);
        }

        // Remove the request from the map (which also clears the timeout associated with the request)
        this.removeRequest(request.targetServiceId, request.targetRequestId);

        // Send the response to the original requester
        if (request.originalHeader.requestId || parser.hasError) {
            const responseHeader = MessageUtils.toBrokerHeader(request.originalHeader, ActionType.RESPONSE, request.originalHeader.requestId);
            this.connectionManager.sendMessage(request.originServiceId, responseHeader, parser.rawPayload, undefined);
            if (parser.hasError) {
                logger.warn(`Error received from service: ${request.targetServiceId} for request: ${request.targetRequestId}`, { serviceId: request.targetServiceId });
                this.metrics.responseCountError.slot.add(1);
                this.metrics.responseRateError.slot.add(1);
            }
            if (request.originalHeader.requestId) {
                logger.debug(`Sent request response to service: ${request.originServiceId} for request: ${request.originalHeader.requestId}`);
            } else {
                logger.debug(`Sent request response to service: ${request.originServiceId}`);
            }
        }

        return true;
    }

    /**
     * Adds a request to the requests map.
     *
     * @param targetServiceId The ID of the service that made the request.
     * @param targetRequestId The ID of the request.
     * @param request The request object.
     * @param originalServiceId The ID of the service that made the request.
     * @param originalRequestId The ID of the original request.
     */
    private generateRequest(originServiceId: string, targetServiceId: string, originalHeader: ClientHeader): Request {
        const targetRequestId = this.generateRequestId();
        // Create the request object
        const request: Request = {
            originServiceId,
            targetServiceId,
            targetRequestId,
            originalHeader,
            timeout: originalHeader.requestId ? setTimeout(() => {
                // NOTE: If this runs, the request is still in the map
                this.requests.delete(`${targetServiceId}:${targetRequestId}`);
                logger.warn(`Request ${originServiceId}:${originalHeader.requestId} to ${targetServiceId}:${targetRequestId} timed out`, {
                    originServiceId,
                    originalHeader,
                    targetServiceId,
                    targetRequestId,
                });

                // Track timeout metrics
                this.metrics.requestCountTimeout.slot.add(1);
                this.metrics.requestRateTimeout.slot.add(1);

                // Send a timeout error back to the original requester
                const responsePayload = { error: new TimeoutError('Request timed out', { targetServiceId }).toJSON() };
                const responseHeader = MessageUtils.toBrokerHeader(originalHeader, ActionType.RESPONSE, originalHeader.requestId);
                this.connectionManager.sendMessage(originServiceId, responseHeader, responsePayload, undefined);
            }, originalHeader.timeout ?? config.request.response.timeout.default) : undefined,
            createdAt: new Date(),
        };

        // Check if the number of outstanding requests has reached the limit
        if (this.requests.size >= config.max.outstanding.requests) {
            // Find the oldest request
            let oldestRequest: Request | null = null;
            for (const request of this.requests.values()) {
                if (!oldestRequest || request.createdAt < oldestRequest.createdAt) {
                    oldestRequest = request;
                }
            }

            // Remove the oldest request and send an error response
            if (oldestRequest) {
                this.removeRequest(oldestRequest.targetServiceId, oldestRequest.targetRequestId);
                const responseHeader = MessageUtils.toBrokerHeader(oldestRequest.originalHeader, ActionType.RESPONSE, oldestRequest.originServiceId);
                const responsePayload = { error: new ServiceUnavailableError('Message broker is busy').toJSON() };
                this.connectionManager.sendMessage(oldestRequest.originServiceId, responseHeader, responsePayload, undefined);
                logger.warn(`Removed oldest request ${oldestRequest.originalHeader.requestId} from ${oldestRequest.originServiceId} due to exceeding max outstanding requests`);
                this.metrics.requestCountDropped.slot.add(1);
                this.metrics.requestRateDropped.slot.add(1);
            }
        }

        // Add the request to the requests map
        this.requests.set(`${targetServiceId}:${targetRequestId}`, request);

        return request;
    }

    /**
     * Gets a request from the requests map.
     *
     * @param targetServiceId The ID of the service that made the request.
     * @param targetRequestId The ID of the request.
     * @returns The request object.
     */
    private getRequest(targetServiceId: string, targetRequestId: string): Request | undefined {
        return this.requests.get(`${targetServiceId}:${targetRequestId}`);
    }

    /**
     * Removes a request from the requests map, and clears the timeout associated with the request (if exists).
     *
     * @param targetServiceId The ID of the service that made the request.
     * @param targetRequestId The ID of the request.
     * @returns True if the request was successfully removed, false otherwise.
     */
    private removeRequest(targetServiceId: string, targetRequestId: string): boolean {
        const request = this.getRequest(targetServiceId, targetRequestId);
        clearTimeout(request?.timeout);
        return this.requests.delete(`${targetServiceId}:${targetRequestId}`);
    }

    /**
     * Generates a unique request ID using crypto.randomUUID.
     *
     * @returns The generated request ID.
     */
    private generateRequestId(): string {
        return randomUUID();
    }

    /**
     * Disposes of all outstanding requests and their associated timeouts.
     */
    async dispose(): Promise<void> {
        // Clear all timeouts
        for (const request of this.requests.values()) {
            if (request.timeout) {
                clearTimeout(request.timeout);
            }
        }
        this.requests.clear();

        // Dispose metrics
        this.metrics.dispose();
    }
}