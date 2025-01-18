import { randomUUID } from 'crypto';
import { config } from '@config';
import { Connection, ConnectionState } from '@core/connection/types';
import { InternalError, MalformedMessageError, MessageError } from '@core/errors';
import { MonitoringManager } from '@core/monitoring';
import { ServiceRegistry } from '@core/registry';
import { MessageRouter } from '@core/router';
import { SubscriptionManager } from '@core/subscription';
import { ActionType } from '@core/types';
import { BrokerHeader, ClientHeader, Exact, Message, MessageUtils, Payload } from '@core/utils';
import { SetupLogger } from '@utils/logger';
import { ConnectionMetrics } from './metrics';

const logger = SetupLogger('ConnectionManager');

/**
 * The header for a message audit when the broker sends a message to a client.
 */
interface BrokerMessageAudit {
    timestamp: string; // The ISO-8601 timestamp of when the message was sent
    to: string; // The service id of the client
    message: {
        header: BrokerHeader;
        payload: string;
    }; // The original broker message
    maskedId?: string; // The response id that the broker overwrote
}

/**
 * The header for a message audit when the broker receives a message from a client.
 */
interface ClientMessageAudit {
    timestamp: string; // The ISO-8601 timestamp of when the message was received
    timeout: number; // The timeout of the request
    from: string; // The service id of the client
    message: {
        header: ClientHeader;
        payload: string;
    }; // The original client message
}

/**
 * The header for an error message when the message header are malformed.
 */
const ERROR_HEADER: BrokerHeader = {
    action: ActionType.RESPONSE,
    topic: 'error',
    version: '1.0.0',
};

/**
 * Manages connections to services and handles sending messages.
 */
export class ConnectionManager {
    private connections: Map<string, Connection>;
    private metrics: ConnectionMetrics;

    constructor(private messageRouter: MessageRouter, private serviceRegistry: ServiceRegistry, monitorManager: MonitoringManager, private subscriptionManager: SubscriptionManager) {
        this.connections = new Map<string, Connection>();
        this.metrics = new ConnectionMetrics(monitorManager);
    }

    /**
     * Adds a new connection to the connection manager.
     *
     * @param serviceId The ID of the service that is connected.
     * @param ws The connection object.
     */
    addConnection(connection: Connection): void {
        try {
            connection.serviceId = randomUUID();
            // If registration succeeds, add the connection
            this.connections.set(connection.serviceId, connection);
            // Add a listeners
            connection.onMessage(this.handleMessage.bind(this, connection));
            connection.onClose(this.removeConnection.bind(this, connection.serviceId));
            // Register connection with service registry first
            this.serviceRegistry.registerService(connection.serviceId);
            // Update metrics
            this.metrics.onConnectionEstablished();
            logger.info(`Added connection for service ${connection.serviceId} (IP ${connection.ip})`);
        } catch (error) {
            // If registration fails, remove the connection
            this.connections.delete(connection.serviceId);
            // Unregister the connection from the service registry
            this.serviceRegistry.unregisterService(connection.serviceId);
            // Update metrics
            this.metrics.onConnectionFailed();
            throw error;
        }
    }

    /**
     * Removes a connection from the connection manager.
     *
     * @param serviceId The ID of the service that is disconnected.
     */
    removeConnection(serviceId: string): void {
        const connection = this.connections.get(serviceId);
        if (connection) {
            this.connections.delete(serviceId);
            this.serviceRegistry.unregisterService(serviceId);
            this.metrics.onConnectionClosed();
            logger.info(`Removed connection for service ${serviceId} (IP ${connection.ip})`);
        }
    }

    /**
     * Resolves a connection for a given service ID.
     *
     * @param serviceId The ID of the service.
     * @returns The connection object if found, undefined otherwise.
     */
    private _resolveConnection(serviceId: string): Connection | undefined {
        const connection = this.connections.get(serviceId);

        if (!connection) {
            logger.warn(`Unable to send message to service ${serviceId}: connection not found`);
            return;
        }

        if (connection.state !== ConnectionState.OPEN) {
            logger.warn(`Unable to send message to service ${serviceId}: Connection is not open`);
            connection.close();
            this.removeConnection(serviceId);
            throw new InternalError('Desired service connection is not open');
        }

        return connection;
    }

    /**
     * Sends a message to a specific service over its connection.
     *
     * @param serviceId The ID of the service to send the message to.
     * @param header The message header.
     * @param payload The message payload.
     */
    sendMessage<T>(serviceId: string, header: Exact<T, BrokerHeader>, payload: Payload = {}, maskedId: string | undefined): void {
        const connection = this._resolveConnection(serviceId);
        if (!connection) return;

        // Send the message to the service
        connection.send(MessageUtils.serialize(header as BrokerHeader, payload));
        //logger.debug(`Sent message ${header.action}:${header.topic}:${header.version}:${header.requestid ? ':' +header.requestid : ''} to ${serviceId}`, { header, payload, serviceId });

        // Notify all subscribers of `system.message`:
        const subscribers = this.subscriptionManager.getSubscribers('system.message');
        if (subscribers.length) {
            const subHeader = { action: ActionType.PUBLISH, topic: 'system.message', version: '1.0.0' } as BrokerHeader;
            const message = { header, payload } as any as BrokerMessageAudit['message'];
            const msg = MessageUtils.serialize(subHeader, { timestamp: new Date().toISOString(), to: serviceId, message, maskedId } as BrokerMessageAudit);
            // Forward the message to all subscribers
            for (const subscriber of subscribers) {
                const connection = this._resolveConnection(subscriber);
                if (!connection) continue;
                connection.send(msg);
            }
        }
    }

    /**
     * Handles a message from a connection.
     *
     * @param connection The connection that received the message.
     * @param message The message to handle.
     */
    private handleMessage(connection: Connection, buffer: Buffer): void {
        let parser: MessageUtils.Parser | null = null;

        //logger.debug(`Received message from service ${connection.serviceId} (IP ${connection.ip})`);

        try {
            // Parse the message
            parser = new MessageUtils.Parser(buffer);

            // Notify all subscribers of `system.message`:
            const subscribers = this.subscriptionManager.getSubscribers('system.message');
            if (subscribers.length) {
                const subHeader = { action: ActionType.PUBLISH, topic: 'system.message', version: '1.0.0' } as BrokerHeader;
                const message = { header: parser.header, payload: 'payload' } as any as ClientMessageAudit['message'];
                const msg = MessageUtils.serialize(subHeader, { timestamp: new Date().toISOString(), timeout: parser.header.timeout ?? config.request.response.timeout.default, from: connection.serviceId, message } as any as ClientMessageAudit).replace('"payload":"payload"', `"payload":${parser!.rawPayload.toString('utf-8')}`);
                // Forward the message to all subscribers
                for (const subscriber of subscribers) {
                    const connection = this._resolveConnection(subscriber);
                    if (!connection) continue;
                    connection.send(msg);
                }
            }

            // Route the message to the message router
            this.messageRouter.routeMessage(connection.serviceId, parser);
        } catch (error) {
            // Set the action to Response
            const header = parser?.header ? MessageUtils.toBrokerHeader(parser.header, ActionType.RESPONSE, parser.header.requestId) : ERROR_HEADER;
            // If the error is a MessageError, send an error message to the client
            if (error instanceof MessageError) {
                logger.error(`[${error.code}] ${error.message}`, { serviceId: connection.serviceId, error });
                connection.send(MessageUtils.serialize(header, { error: error.toJSON() }));
                return;
            } else if (error instanceof Error) {
                if (header == ERROR_HEADER) {
                    // If the header is null, the message is malformed
                    logger.error('Unexpected error while parsing message header:', { serviceId: connection.serviceId, error });
                    connection.send(MessageUtils.serialize(header, { error: new MalformedMessageError('Unexpected error while parsing message header').toJSON() }));
                    return;
                } else {
                    // If the error is not a MessageError and the header and payload are not null, then the error is during routing
                    // Send an internal error message to the client
                    logger.error('An unexpected error while routing the message:', { serviceId: connection.serviceId, error });
                    connection.send(MessageUtils.serialize(header, { error: new InternalError('An unexpected error while routing the message').toJSON() }));
                    return;
                }
            }
        }
    }

    /**
     * Checks if a connection exists for a given service ID.
     *
     * @param serviceId The ID of the service to check.
     * @returns True if a connection exists, false otherwise.
     */
    hasConnection(serviceId: string): boolean {
        return this.connections.has(serviceId);
    }

    /**
     * Gets the connection for a given service ID.
     *
     * @param serviceId The ID of the service.
     * @returns The connection object if found, undefined otherwise.
     */
    getConnection(serviceId: string): Connection | undefined {
        return this.connections.get(serviceId);
    }

    /**
     * Gets the number of active connections.
     *
     * @returns The number of active connections.
     */
    getConnectionCount(): number {
        return this.connections.size;
    }

    /**
     * Disposes of all connections and metrics.
     */
    async dispose(): Promise<void> {
        for (const connection of this.connections.values()) {
            connection.close();
        }
        this.connections.clear();
        logger.info('Closed all connections');
        this.metrics.dispose();
        logger.info('Disposed of all metrics');
    }
}