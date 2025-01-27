import { LogEntry, transports } from 'winston';
import { config } from '@config';
import { ConnectionManager } from '@core/connection';
import {
    InvalidRequestError,
    ServiceUnavailableError,
    TopicNotSupportedError,
} from '@core/errors';
import { MonitoringManager } from '@core/monitoring';
import { SubscriptionManager } from '@core/subscription';
import { ActionType } from '@core/types';
import { BrokerHeader, ClientHeader, Message, MessageUtils, TopicUtils } from '@core/utils';
import { SetupLogger } from '@utils/logger';
import { RegistryMetrics } from './metrics';
import { isUUID4 } from '@core/utils/uuid4';

const logger = SetupLogger('ServiceRegistry');

const SUBSCRIBABLE_SYSTEM_TOPICS = new Set(['system.log', 'system.message', 'system.service.register', 'system.topic.subscribe', 'system.topic.unsubscribe']);

interface ServiceRegistration {
    id: string;
    name: string;
    description: string;
    connectedAt: Date;
    lastHeartbeat: Date;
    heartbeatRetryTimeout: NodeJS.Timeout;
    heartbeatDeregisterTimeout: NodeJS.Timeout;
    logSubscriptions: {
        levels: string[];
        regex?: RegExp;
    };
    metricSubscriptions: {
        metrics: string[];
        frequency: number;
    };
}

export class ServiceRegistry {
    private readonly services: Map<string, ServiceRegistration>;
    private connectionManager!: ConnectionManager;
    private subscriptionManager: SubscriptionManager;
    private readonly metrics: RegistryMetrics;

    constructor(subscriptionManager: SubscriptionManager, private readonly monitoringManager: MonitoringManager) {
        this.services = new Map();
        this.subscriptionManager = subscriptionManager;
        this.metrics = new RegistryMetrics(monitoringManager);
        this.metrics.count.slot.set(0);

        // Hook into the logger:
        logger.stream({ start: -1 }).on('log', this._handleLogBind);
        logger.on('data', this._handleLogBind);
        logger.info('Hooked into the logger');
    }

    /**
     * Handles log events from the logger.
     *
     * @param message The log message.
     */
    private handleLog(message: LogEntry): void {
        //logger.off('data', this._handleLogBind);
        const header: BrokerHeader = {
            action: ActionType.RESPONSE,
            topic: 'system.log',
            version: '1.0.0',
        };
        // Loop through all services and check if the log message matches the service's log subscriptions
        for (const service of this.services.values()) {
            // Check if the service has subscribed to the log level and code (if codes are empty, subscribe to all codes)
            if (service.logSubscriptions.levels.includes(message.level) && (service.logSubscriptions.regex === undefined || service.logSubscriptions.regex.test(message.message))) {
                // Send the log message to the service
                try {
                    this.connectionManager.sendMessage(service.id, header, message, undefined);
                } catch (error) {
                    logger.error(`Error sending log message to service ${service.id}:`, error);
                }
            }
        }
        //logger.on('data', this._handleLogBind);
    }
    private _handleLogBind = this.handleLog.bind(this);

    /**
     * Assigns a ConnectionManager to the ServiceRegistry.
     *
     * @param connectionManager The ConnectionManager to assign.
     */
    assignConnectionManager(connectionManager: ConnectionManager): void {
        this.connectionManager = connectionManager;
    }

    /**
     * Disposes of all services and metrics.
     */
    dispose(): void {
        for (const service of this.services.values()) {
            this.unregisterService(service.id);
        }
        this.services.clear();
        logger.info('Unregistered all services');

        this.metrics.dispose();
        logger.info('Disposed of all metrics');

        // Unhook from the logger:
        logger.off('data', this._handleLogBind);
        logger.info('Unhooked from the logger');
    }

    /**
     * Registers a service in the registry.
     * @param serviceId The ID of the service.
     * @param name The name of the service. Defaults to the serviceId.
     * @param description The description of the service. Defaults to 'No description provided'.
     */
    registerService(serviceId: string, name: string = '', description: string = ''): void {
        // Check if name is longer than 36 characters
        if (name.length > 36) throw new InvalidRequestError('Name of service is too long', { name });
        // Check if description is longer than 1024 characters
        if (description.length > 1024) throw new InvalidRequestError('Description of service is too long', { description });

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
            logger.info(`Service ${serviceId} updated.`, { name, description });
        } else {
            // Add the new service
            this.services.set(serviceId, {
                id: serviceId,
                name,
                description,
                connectedAt: now,
                lastHeartbeat: now,
                logSubscriptions: { levels: [], regex: undefined }, // Default log subscription level
                metricSubscriptions: { metrics: [], frequency: 0 },
                heartbeatRetryTimeout: setTimeout(this.sendHeartbeat.bind(this, serviceId), config.connection.heartbeatRetryTimeout),
                heartbeatDeregisterTimeout: setTimeout(this.unregisterService.bind(this, serviceId), config.connection.heartbeatDeregisterTimeout),
            });
            logger.info(`Service ${serviceId} registered.`, { name, description });

            // Register parameterized metrics for the new service
            this.metrics.serviceUptime.registerMetric({ serviceId });
            this.metrics.serviceErrorRate.registerMetric({ serviceId });
        }

        this.metrics.count.slot.set(this.services.size);
        this.metrics.registrationRate.slot.add(1);
        const serviceMetric = this.metrics.serviceUptime.getMetric({ serviceId });
        if (serviceMetric) {
            serviceMetric.slot.reset();
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
            logger.info(`Service ${serviceId} unregistered.`, { name: service.name, description: service.description });
        }

        this.metrics.count.slot.set(this.services.size);
        this.metrics.unregistrationRate.slot.add(1);

        // Dispose of service-specific metrics
        const uptimeMetric = this.metrics.serviceUptime.getMetric({ serviceId });
        if (uptimeMetric) {
            uptimeMetric.dispose();
        }
        const errorMetric = this.metrics.serviceErrorRate.getMetric({ serviceId });
        if (errorMetric) {
            errorMetric.dispose();
        }
    }

    /**
     * Handles incoming system messages.
     *
     * @param serviceId The ID of the service sending the message.
     * @param message The received message.
     */
    handleSystemMessage(serviceId: string, message: MessageUtils.Parser): void {
        logger.debug(`Received system message ${message.header.action}:${message.header.topic}:${message.header.version}${message.header.requestId ? ':' +message.header.requestId : ''}`, { serviceId, header: message.header });

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

        try {
            switch (message.header.topic) {
                case 'system.heartbeat':
                    this.handleHeartbeatMessage(serviceId, message);
                    break;
                case 'system.log.subscribe':
                    this.handleLogSubscribe(serviceId, message);
                    break;
                case 'system.log.unsubscribe':
                    this.handleLogUnsubscribe(serviceId, message);
                    break;
                case 'system.metrics':
                    this.handleMetricsRequest(serviceId, message);
                    break;
                case 'system.service.list':
                    this.handleServiceList(serviceId, message);
                    break;
                case 'system.service.subscriptions':
                    this.handleServiceSubscriptions(serviceId, message);
                    break;
                case 'system.service.register':
                    this.handleServiceRegister(serviceId, message);
                    break;
                case 'system.topic.list':
                    this.handleTopicList(serviceId, message);
                    break;
                case 'system.topic.subscribers':
                    this.handleTopicSubscribers(serviceId, message);
                    break;
                case 'system.topic.subscribe':
                    this.handleTopicSubscribe(serviceId, message);
                    break;
                case 'system.topic.unsubscribe':
                    this.handleTopicUnsubscribe(serviceId, message);
                    break;
                default:
                    throw new TopicNotSupportedError(`Unknown system message topic: ${message.header.topic}`);
            }
        } catch (error) {
            logger.error(`Error handling system message ${message.header.action}:${message.header.topic}:${message.header.version}${message.header.requestId ? ':' +message.header.requestId : ''}`, { serviceId, error });
            this.metrics.serviceErrorRate.getMetric({ serviceId })?.slot.add(1);
            throw error;
        }
    }

    private sendHeartbeat(serviceId: string): void {
        const header: BrokerHeader = { action: ActionType.REQUEST, topic: 'system.heartbeat', version: '1.0.0' };
        this.connectionManager.sendMessage(serviceId, header, undefined, undefined);
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
    private handleHeartbeatMessage(serviceId: string, message: MessageUtils.Parser): void {
        // Check if the service exists
        const service = this.services.get(serviceId);
        if (!service) {
            this.connectionManager.removeConnection(serviceId);
            throw new ServiceUnavailableError(`Service ${serviceId} not found`);
        }

        // Update the last heartbeat
        this.resetHeartbeat(serviceId);

        // If the message is a request, send a response, ignore for responses
        if (message.header.action === ActionType.REQUEST) {
            const responseHeader = MessageUtils.toBrokerHeader(message.header, ActionType.RESPONSE, message.header.requestId);
            const responsePayload = { status: 'success' };
            this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload, undefined);
        }
    }

    /**
     * Handles a log subscription request.
     * @param serviceId The ID of the service subscribing to the logs
     * @param message The message to handle.
     */
    private handleLogSubscribe(serviceId: string, message: MessageUtils.Parser): void {
        const service = this.services.get(serviceId);
        if (!service) {
            this.connectionManager.removeConnection(serviceId);
            throw new ServiceUnavailableError(`Service ${serviceId} not found`);
        }

        let { levels = ['error'], regex = undefined } = message.parsePayload<{ levels?: string[], regex?: string }>(); // Default to error if no level is specified

        // Validate the level
        const validLevels = ['debug', 'info', 'warn', 'error'];
        if (levels) {
            if (Array.isArray(levels)) {
                for (const level of levels) {
                    if (typeof level !== 'string' || !validLevels.includes(level)) {
                        throw new InvalidRequestError('Invalid log level', { level });
                    }
                }
            } else {
                throw new InvalidRequestError('Invalid log levels', { levels });
            }
        }

        let regexObj: RegExp | undefined;
        // Validate the regex (if provided)
        if (regex) {
            if (typeof regex !== 'string') {
                throw new InvalidRequestError('Invalid log regex', { regex });
            }
            try {
                regexObj = new RegExp(regex);
            } catch (error) {
                throw new InvalidRequestError('Invalid log regex', { regex });
            }
        }

        // Update the service's log subscriptions
        service.logSubscriptions = { levels, regex: regexObj };

        // Subscribe to the log level and regex
        if (!this.subscriptionManager.isSubscribed(serviceId, 'system.log')) {
            this.subscriptionManager.subscribe(serviceId, 'system.log');
        }

        // Send a success response
        const responseHeader = MessageUtils.toBrokerHeader(message.header, ActionType.RESPONSE, message.header.requestId);
        const responsePayload = { status: 'success' };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload, undefined);
    }

    /**
     * Handles a log unsubscription request.
     *
     * @param serviceId The ID of the service unsubscribing from the logs.
     * @param message The message to handle.
     */
    private handleLogUnsubscribe(serviceId: string, message: MessageUtils.Parser): void {
        const service = this.services.get(serviceId);
        if (!service) {
            this.connectionManager.removeConnection(serviceId);
            throw new ServiceUnavailableError(`Service ${serviceId} not found`);
        }

        // Reset log subscriptions to default (no level, no codes)
        service.logSubscriptions = { levels: [], regex: undefined };

        // Unsubscribe from the log level and regex
        this.subscriptionManager.unsubscribe(serviceId, `system.log`);

        // Send a success response
        const responseHeader = MessageUtils.toBrokerHeader(message.header, ActionType.RESPONSE, message.header.requestId);
        const responsePayload = { status: 'success' };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload, undefined);
    }

    /**
     * Handles a metrics request.
     *
     * @param serviceId The ID of the service requesting the metrics.
     * @param message The message to handle.
     */
    private handleMetricsRequest(serviceId: string, message: MessageUtils.Parser): void {
        // Check if the service exists
        const service = this.services.get(serviceId);
        if (!service) {
            this.connectionManager.removeConnection(serviceId);
            throw new ServiceUnavailableError(`Service ${serviceId} not found`);
        }

        // TODO: Implement logic to fetch the latest metrics
        const { showAll, paramFilter } = message.parsePayload<{ showAll: boolean, paramFilter?: Record<string, string> }>();
        const metrics = this.monitoringManager.serializeMetrics(showAll, paramFilter);

        const responseHeader = MessageUtils.toBrokerHeader(message.header, ActionType.RESPONSE, message.header.requestId);
        const responsePayload = { metrics };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload, undefined);
    }

    /**
     * Handles a service list request.
     *
     * @param serviceId The ID of the service requesting the list.
     * @param message The message to handle.
     */
    private handleServiceList(serviceId: string, message: MessageUtils.Parser): void {
        const services = Array.from(this.services.values()).map(service => ({
            id: service.id,
            name: service.name,
            description: service.description,
            connectedAt: service.connectedAt,
            lastHeartbeat: service.lastHeartbeat.toISOString(),
        }));

        const responseHeader = MessageUtils.toBrokerHeader(message.header, ActionType.RESPONSE, message.header.requestId);
        const responsePayload = { services };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload, undefined);

        this.metrics.discoveryRate.slot.add(1);
    }

    /**
     * Handles a service subscriptions request.
     *
     * @param serviceId The ID of the service requesting the subscriptions.
     * @param message The message to handle.
     */
    private handleServiceSubscriptions(serviceId: string, message: MessageUtils.Parser): void {
        const service = this.services.get(serviceId);
        if (!service) {
            this.connectionManager.removeConnection(serviceId);
            throw new ServiceUnavailableError(`Service ${serviceId} not found`);
        }

        const payload = message.parsePayload<{ serviceId: string }>();
        let targetServiceId = payload.serviceId ?? serviceId;

        // Check if the topic is valid
        if (typeof targetServiceId !== 'string' || !isUUID4(targetServiceId)) {
            throw new InvalidRequestError('Invalid serviceId', { serviceId: targetServiceId });
        }

        const targetService = this.services.get(targetServiceId);
        if (!targetService) {
            throw new ServiceUnavailableError(`Service ${targetServiceId} not found`);
        }

        // Get the latest subscriptions for the service given:
        const subscriptions = this.subscriptionManager.getSubscribedInfo(targetServiceId);

        const responseHeader = MessageUtils.toBrokerHeader(message.header, ActionType.RESPONSE, message.header.requestId);
        const responsePayload = { subscriptions };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload, undefined);
    }

    /**
     * Registers or updates a service.
     *
     * @param serviceId The ID of the service.
     * @param message The message to handle.
     */
    private handleServiceRegister(serviceId: string, message: MessageUtils.Parser): void {
        const { name, description } = message.parsePayload<{ name?: string, description?: string }>();

        // Validate the payload
        if (!name || typeof name !== 'string' || !description || typeof description !== 'string') {
            throw new InvalidRequestError('Missing or invalid name or description', { name, description });
        }

        // Register the service
        this.registerService(serviceId, name, description);

        // Send a success response
        const responseHeader = MessageUtils.toBrokerHeader(message.header, ActionType.RESPONSE, message.header.requestId);
        const responsePayload = { status: 'success' };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload, undefined);
    }

    /**
     * Handles a topic list request.
     *
     * @param serviceId The ID of the service requesting the list.
     * @param message The message to handle.
     */
    private handleTopicList(serviceId: string, message: MessageUtils.Parser): void {
        const topics = this.subscriptionManager.getAllSubscribedTopics();
        const responseHeader = MessageUtils.toBrokerHeader(message.header, ActionType.RESPONSE, message.header.requestId);
        const responsePayload = { topics };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload, undefined);
    }

    /**
     * Handles a topic subscribers request.
     *
     * @param serviceId The ID of the service requesting the subscribers.
     * @param message The message to handle.
     */
    private handleTopicSubscribers(serviceId: string, message: MessageUtils.Parser): void {
        const subscribers = this.subscriptionManager.getAllSubscribedTopicWithSubscribers();
        const responseHeader = MessageUtils.toBrokerHeader(message.header, ActionType.RESPONSE, message.header.requestId);
        const responsePayload = { subscribers };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload, undefined);
    }

    /**
     * Handles a topic subscription request.
     *
     * @param serviceId The ID of the service subscribing to the topic.
     * @param message The message to handle.
     */
    private handleTopicSubscribe(serviceId: string, message: MessageUtils.Parser): void {
        const { topic, priority } = message.parsePayload<{ topic?: string, priority?: number }>();

        // Check if the topic is valid
        if (!topic || typeof topic !== 'string' || !TopicUtils.isValid(topic)) {
            throw new InvalidRequestError('Missing or invalid topic', { topic });
        }

        // Only allow subscribing to topics that are not restricted system topics
        if (topic.startsWith('system.') && !SUBSCRIBABLE_SYSTEM_TOPICS.has(topic)) {
            throw new InvalidRequestError('Unable to subscribe to restricted topic', { topic });
        }

        // Check if the priority is a valid number
        if (typeof priority !== 'number' || isNaN(priority) || !isFinite(priority)) {
            throw new InvalidRequestError('Invalid priority', { priority });
        }

        const success = this.subscriptionManager.subscribe(serviceId, topic, priority);
        const responseHeader = MessageUtils.toBrokerHeader(message.header, ActionType.RESPONSE, message.header.requestId);
        const responsePayload = { status: success ? 'success' : 'failure' };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload, undefined);
    }

    /**
     * Handles a topic unsubscription request.
     *
     * @param serviceId The ID of the service unsubscribing from the topic.
     * @param message The message to handle.
     */
    private handleTopicUnsubscribe(serviceId: string, message: MessageUtils.Parser): void {
        const { topic } = message.parsePayload<{ topic?: string }>();

        if (!topic || typeof topic !== 'string' || !TopicUtils.isValid(topic)) {
            throw new InvalidRequestError('Missing or invalid topic', { topic });
        }

        // Only allow unsubscribing from topics that are not system topics, or system.service.register, or system.topic.subscribe
        if (topic.startsWith('system.') && topic !== 'system.service.register' && topic !== 'system.topic.subscribe') {
            throw new InvalidRequestError('Unable to unsubscribe from restricted topic', { topic });
        }

        const success = this.subscriptionManager.unsubscribe(serviceId, topic);
        const responseHeader = MessageUtils.toBrokerHeader(message.header, ActionType.RESPONSE, message.header.requestId);
        const responsePayload = { status: success ? 'success' : 'failure' };
        this.connectionManager.sendMessage(serviceId, responseHeader, responsePayload, undefined);
    }
}