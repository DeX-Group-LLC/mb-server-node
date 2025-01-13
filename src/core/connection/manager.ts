import { randomUUID } from 'crypto';
import { Connection, ConnectionState } from '@core/connection/types';
import { InternalError, MalformedMessageError, MessageError } from '@core/errors';
import { MonitoringManager } from '@core/monitoring';
import { ServiceRegistry } from '@core/registry';
import { MessageRouter } from '@core/router';
import { MessageUtils, Header, Payload } from '@core/utils';
import { ActionType } from '@core/types';
import { SetupLogger } from '@utils/logger';
import { ConnectionMetrics } from './metrics';

const logger = SetupLogger('ConnectionManager');

/**
 * The header for an error message when the message header are malformed.
 */
const ERROR_HEADER: Header = {
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

    constructor(private messageRouter: MessageRouter, private serviceRegistry: ServiceRegistry, private monitorManager: MonitoringManager) {
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
     * Sends a message to a specific service over its connection.
     *
     * @param serviceId The ID of the service to send the message to.
     * @param header The message header.
     * @param payload The message payload.
     */
    sendMessage(serviceId: string, header: Header, payload: Payload = {}): void {
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

        connection.send(MessageUtils.serialize(header, payload));
        //logger.debug(`Sent message ${header.action}:${header.topic}:${header.version}:${header.requestid ? ':' +header.requestid : ''} to ${serviceId}`, { header, payload, serviceId });
    }

    /**
     * Handles a message from a connection.
     *
     * @param connection The connection that received the message.
     * @param message The message to handle.
     */
    private handleMessage(connection: Connection, message: string): void {
        let header: Header | null = null;
        let payload: Payload | null = null;

        //logger.debug(`Received message from service ${connection.serviceId} (IP ${connection.ip})`);

        try {
            // Create the parser and parse the message
            const parser = new MessageUtils.Parser(message.toString());
            header = parser.parseHeader();
            payload = parser.parsePayload(header.action);

            // Route the message to the message router
            this.messageRouter.routeMessage(connection.serviceId, { header, payload });
        } catch (error) {
            // Set the action to Response
            header = header !== null ? { ...header, action: ActionType.RESPONSE } : ERROR_HEADER;
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
                } else if (payload == null) {
                    // If the payload is null, the message is malformed
                    logger.error('Unexpected error while parsing message payload:', { serviceId: connection.serviceId, error });
                    connection.send(MessageUtils.serialize(header, { error: new MalformedMessageError('Unexpected error while parsing message payload').toJSON() }));
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