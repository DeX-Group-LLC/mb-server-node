import { config } from '@/config';
import { ConnectionManager } from '@core/connection';
import {
    InvalidRequestError,
    ServiceUnavailableError,
    TopicNotSupportedError,
} from '@core/errors';
import { SubscriptionManager } from '@core/subscription';
import { Message, TopicUtils } from '@/core/utils';
import { ActionType } from '@core/types';
import logger from '@utils/logger';

interface ServiceRegistration {
    id: string;
    name: string;
    description: string;
    connectedAt: Date;
    lastHeartbeat: Date;
    heartbeatRetryTimeout: NodeJS.Timeout;
    heartbeatDeregisterTimeout: NodeJS.Timeout;
    logSubscriptions: {
        level: string;
        codes: string[];
    };
    metricSubscriptions: {
        metrics: string[];
        frequency: number;
    };
}

export class ServiceRegistry {
    private services: Map<string, ServiceRegistration>;
    private connectionManager!: ConnectionManager;
    private subscriptionManager: SubscriptionManager;

    constructor(subscriptionManager: SubscriptionManager) {
        this.services = new Map();
        this.subscriptionManager = subscriptionManager;
    }

    /**
     * Assigns a ConnectionManager to the ServiceRegistry.
     *
     * @param connectionManager The ConnectionManager to assign.
     */
    assignConnectionManager(connectionManager: ConnectionManager): void {
        this.connectionManager = connectionManager;
    }

    /**
     * Unregisters all services.
     */
    async clearAllServices() {
        for (const service of this.services.values()) {
            this.unregisterService(service.id);
        }
        this.services.clear();
        logger.info('Cleared all services');
    }

    /**
     * Registers a service in the registry.
     * @param serviceId The ID of the service.
     * @param name The name of the service. Defaults to the serviceId.
     * @param description The description of the service. Defaults to 'No description provided'.
     */
    registerService(serviceId: string, name: string = serviceId, description: string = 'No description provided'): void {
        // Update the last heartbeat
        const now = new Date();

        // Check if the service already exists
        const existingService = this.services.get(serviceId);
        if (existingService) {
            // Update the existing service
            existingService.name = name;
            existingService.description = description;
            existingService.lastHeartbeat = now;
            this.resetHeartbeat(existingService);
            this.services.set(serviceId, existingService);
            logger.info(`Service ${serviceId} updated.`);
        } else {
            // Add the new service
            this.services.set(serviceId, {
                id: serviceId,
                name,
                description,
                connectedAt: now,
                lastHeartbeat: now,
                logSubscriptions: { level: '', codes: [] }, // Default log subscription level
                metricSubscriptions: { metrics: [], frequency: 0 },
                heartbeatRetryTimeout: setTimeout(this.sendHeartbeat.bind(this, serviceId), config.connection.heartbeatRetryTimeout),
                heartbeatDeregisterTimeout: setTimeout(this.unregisterService.bind(this, serviceId), config.connection.heartbeatDeregisterTimeout),
            });
            logger.info(`Service ${serviceId} registered.`);
        }
    }

    /**
     * Unregisters a service from the registry.
     * @param serviceId The ID of the service.
     */
    unregisterService(serviceId: string): void {
        const service = this.services.get(serviceId);
        if (service) {
            clearTimeout(service.heartbeatRetryTimeout);
            clearTimeout(service.heartbeatDeregisterTimeout);
            this.services.delete(serviceId);
            this.subscriptionManager.unsubscribe(serviceId);
            this.connectionManager.removeConnection(serviceId);
            logger.info(`Service ${serviceId} unregistered.`);
        }
    }

    /**
     * Handles incoming system messages.
     *
     * @param serviceId The ID of the service sending the message.
     * @param message The received message.
     */
    handleSystemMessage(serviceId: string, message: Message): void {
        logger.info(`Received system message from ${serviceId}:`, message);

        // Check the actions are valid
        if (message.header.topic === 'system.heartbeat') {
            // If the topic is heartbeat, check if the action is request or response
            if (message.header.action !== ActionType.REQUEST && message.header.action !== ActionType.RESPONSE) {
                throw new InvalidRequestError(`Invalid action, expected REQUEST or RESPONSE for ${message.header.topic}`, { action: message.header.action, topic: message.header.topic });
            }
        } else if (message.header.action !== ActionType.REQUEST) {
            // If the topic is not heartbeat, check if the action is request
            throw new InvalidRequestError(`Invalid action, expected REQUEST for ${message.header.topic}`, { action: message.header.action, topic: message.header.topic });
        }

        switch (message.header.topic) {
            case 'system.heartbeat':
                this.handleHeartbeatRequest(serviceId, message);
                break;
            case 'system.log.subscribe':
                this.handleLogSubscribe(serviceId, message);
                break;
            case 'system.log.unsubscribe':
                this.handleLogUnsubscribe(serviceId, message);
                break;
            case 'system.metric':
                this.handleMetricRequest(serviceId, message);
                break;
            case 'system.service.list':
                this.handleServiceList(serviceId, message);
                break;
            case 'system.service.register':
                this.handleServiceRegister(serviceId, message);
                break;
            case 'system.topic.list':
                this.handleTopicList(serviceId, message);
                break;
            case 'system.topic.subscribe':
                this.handleTopicSubscribe(serviceId, message);
                break;
            case 'system.topic.unsubscribe':
                this.handleTopicUnsubscribe(serviceId, message);
                break;
            default:
                logger.warn(`Received unknown system message topic: ${message.header.topic}`);
                const header = { ...message.header, action: ActionType.RESPONSE };
                const payload = { error: new TopicNotSupportedError(`Unknown system message topic: ${message.header.topic}`).toJSON() };
                this.connectionManager.sendMessage(serviceId, header, payload);
        }
    }

    private sendHeartbeat(serviceId: string): void {
        const header = { action: ActionType.REQUEST, topic: 'system.heartbeat', version: '1.0.0' };
        this.connectionManager.sendMessage(serviceId, header);
    }

    resetHeartbeat(serviceIdOrService: string | ServiceRegistration): void {
        const service = typeof serviceIdOrService === 'string' ? this.services.get(serviceIdOrService) : serviceIdOrService;
        if (service) {
            const serviceId = service.id;
            service.lastHeartbeat = new Date();
            clearTimeout(service.heartbeatRetryTimeout);
            clearTimeout(service.heartbeatDeregisterTimeout);
            service.heartbeatRetryTimeout = setTimeout(this.sendHeartbeat.bind(this, serviceId), config.connection.heartbeatRetryTimeout);
            service.heartbeatDeregisterTimeout = setTimeout(this.unregisterService.bind(this, serviceId), config.connection.heartbeatDeregisterTimeout);
        }
    }

    /**
     * Handles a heartbeat request.
     *
     * @param serviceId The ID of the service requesting the metrics.
     * @param message The message to handle.
     */
    private handleHeartbeatRequest(serviceId: string, message: Message): void {
        // Check if the service exists
        const service = this.services.get(serviceId);
        if (!service) {
            const responseHeader = { ...message.header, action: ActionType.RESPONSE };
            const responsePayload = { error: new ServiceUnavailableError(`Service ${serviceId} not found`).toJSON() };
            this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
            this.connectionManager.removeConnection(serviceId);
            return;
        }

        // Update the last heartbeat
        this.resetHeartbeat(serviceId);

        // If the message is a request, send a response, ignore for responses
        if (message.header.action === ActionType.REQUEST) {
            const responseHeader = { ...message.header, action: ActionType.RESPONSE };
            const responsePayload = { status: 'success' };
            this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
        }
    }

    /**
     * Handles a log subscription request.
     * @param serviceId The ID of the service subscribing to the logs
     * @param message The message to handle.
     */
    private handleLogSubscribe(serviceId: string, message: Message): void {
        const service = this.services.get(serviceId);
        if (!service) {
            const responseHeader = { ...message.header, action: ActionType.RESPONSE };
            const responsePayload = { error: new ServiceUnavailableError(`Service ${serviceId} not found`).toJSON() };
            this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
            this.connectionManager.removeConnection(serviceId);
            return;
        }

        const { level = 'error', codes = [] } = message.payload; // Default to error if no level is specified

        // Validate the level
        const validLevels = ['debug', 'info', 'warn', 'error'];
        if (typeof level !== 'string' || !validLevels.includes(level)) {
            const responseHeader = { ...message.header, action: ActionType.RESPONSE };
            const responsePayload = { error: new InvalidRequestError('Invalid log level', { level }).toJSON() };
            this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
            return;
        }

        // Validate the codes (if provided)
        if (!Array.isArray(codes) || !codes.every(code => typeof code === 'string')) {
            const responseHeader = { ...message.header, action: ActionType.RESPONSE };
            const responsePayload = { error: new InvalidRequestError('Invalid log codes', { codes }).toJSON() };
            this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
            return;
        }

        // Update the service's log subscriptions
        service.logSubscriptions = { level, codes };
        this.services.set(serviceId, service);

        const responseHeader = { ...message.header, action: ActionType.RESPONSE };
        const responsePayload = { status: 'success' };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
    }

    /**
     * Handles a log unsubscription request.
     *
     * @param serviceId The ID of the service unsubscribing from the logs.
     * @param message The message to handle.
     */
    private handleLogUnsubscribe(serviceId: string, message: Message): void {
        const service = this.services.get(serviceId);
        if (!service) {
            const responseHeader = { ...message.header, action: ActionType.RESPONSE };
            const responsePayload = { error: new ServiceUnavailableError(`Service ${serviceId} not found`).toJSON() };
            this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
            this.connectionManager.removeConnection(serviceId);
            return;
        }

        // Reset log subscriptions to default (no level, no codes)
        service.logSubscriptions = { level: '', codes: [] };
        this.services.set(serviceId, service);

        const responseHeader = { ...message.header, action: ActionType.RESPONSE };
        const responsePayload = { status: 'success' };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
    }

    /**
     * Handles a metric request.
     *
     * @param serviceId The ID of the service requesting the metrics.
     * @param message The message to handle.
     */
    private handleMetricRequest(serviceId: string, message: Message): void {
        // TODO: Implement logic to fetch the latest metrics
        // const metrics = this.monitoring.getLatestMetrics();

        const responseHeader = { ...message.header, action: ActionType.RESPONSE };
        // const responsePayload = { timestamp: new Date().toISOString(), metrics };
        const responsePayload = { error: new ServiceUnavailableError('Metric collection not implemented yet').toJSON() }; // Placeholder
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
    }

    /**
     * Handles a service list request.
     *
     * @param serviceId The ID of the service requesting the list.
     * @param message The message to handle.
     */
    private handleServiceList(serviceId: string, message: Message): void {
        const services = Array.from(this.services.values()).map(service => ({
            id: service.id,
            name: service.name,
            description: service.description,
            connectedAt: service.connectedAt,
        }));

        const responseHeader = { ...message.header, action: ActionType.RESPONSE };
        const responsePayload = { services };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
    }

    /**
     * Registers or updates a service.
     *
     * @param serviceId The ID of the service.
     * @param message The message to handle.
     */
    private handleServiceRegister(serviceId: string, message: Message): void {
        logger.info(`Service ${serviceId} registered with header:`, message.header, `and payload:`, message.payload);
        const { name, description } = message.payload;

        // Validate the payload
        if (!name || typeof name !== 'string' || !description || typeof description !== 'string') {
            const responseHeader = { ...message.header, action: ActionType.RESPONSE };
            const responsePayload = { error: new InvalidRequestError('Missing or invalid name or description', { name, description }).toJSON() };
            this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
            return;
        }

        // Register the service
        this.registerService(serviceId, name, description);

        // Send a success response
        const responseHeader = { ...message.header, action: ActionType.RESPONSE };
        const responsePayload = { status: 'success' };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
    }

    /**
     * Handles a topic list request.
     *
     * @param serviceId The ID of the service requesting the list.
     * @param message The message to handle.
     */
    private handleTopicList(serviceId: string, message: Message): void {
        const topics = this.subscriptionManager.getAllSubscribedTopics();
        const responseHeader = { ...message.header, action: ActionType.RESPONSE };
        const responsePayload = { topics };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
    }

    /**
     * Handles a topic subscription request.
     *
     * @param serviceId The ID of the service subscribing to the topic.
     * @param message The message to handle.
     */
    private handleTopicSubscribe(serviceId: string, message: Message): void {
        const { topic, priority } = message.payload;

        // Check if the topic is valid
        if (!topic || typeof topic !== 'string' || !TopicUtils.isValid(topic)) {
            const responseHeader = { ...message.header, action: ActionType.RESPONSE };
            const responsePayload = { error: new InvalidRequestError('Missing or invalid topic', { topic }).toJSON() };
            this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
            return;
        }

        // Only allow subscribing to topics that are not system topics, or system.service.register, or system.topic.subscribe
        if (topic.startsWith('system.') && topic !== 'system.service.register' && topic !== 'system.topic.subscribe') {
            const responseHeader = { ...message.header, action: ActionType.RESPONSE };
            const responsePayload = { error: new InvalidRequestError('Unable to subscribe to restricted topic', { topic }).toJSON() };
            this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
            return;
        }

        // Check if the priority is a valid number
        if (typeof priority !== 'number' || isNaN(priority) || !isFinite(priority)) {
            const responseHeader = { ...message.header, action: ActionType.RESPONSE };
            const responsePayload = { error: new InvalidRequestError('Invalid priority', { priority }).toJSON() };
            this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
            return;
        }

        const success = this.subscriptionManager.subscribe(serviceId, topic, priority);
        const responseHeader = { ...message.header, action: ActionType.RESPONSE };
        const responsePayload = { status: success ? 'success' : 'failure' };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
    }

    /**
     * Handles a topic unsubscription request.
     *
     * @param serviceId The ID of the service unsubscribing from the topic.
     * @param message The message to handle.
     */
    private handleTopicUnsubscribe(serviceId: string, message: Message): void {
        const { topic } = message.payload;

        if (!topic || typeof topic !== 'string' || !TopicUtils.isValid(topic)) {
            const responseHeader = { ...message.header, action: ActionType.RESPONSE };
            const responsePayload = { error: new InvalidRequestError('Missing or invalid topic', { topic }).toJSON() };
            this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
            return;
        }

        // Only allow unsubscribing from topics that are not system topics, or system.service.register, or system.topic.subscribe
        if (topic.startsWith('system.') && topic !== 'system.service.register' && topic !== 'system.topic.subscribe') {
            const responseHeader = { ...message.header, action: ActionType.RESPONSE };
            const responsePayload = { error: new InvalidRequestError('Unable to unsubscribe from restricted topic', { topic }).toJSON() };
            this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
            return;
        }

        const success = this.subscriptionManager.unsubscribe(serviceId, topic);
        const responseHeader = { ...message.header, action: ActionType.RESPONSE };
        const responsePayload = { status: success ? 'success' : 'failure' };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload);
    }
}