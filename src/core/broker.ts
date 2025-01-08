import { WebSocketServer } from 'ws';
import { config } from '@config';
import { ConnectionManager } from '@core/connection';
import { createWebSocketServer } from '@core/connection/websocket';
import { MonitoringManager } from '@core/monitoring';
import { ServiceRegistry } from '@core/registry';
import { MessageRouter } from '@core/router';
import { SubscriptionManager } from '@core/subscription';
import logger from '@utils/logger';

export class MessageBroker {
    private wss: WebSocketServer;
    private connectionManager: ConnectionManager;
    private messageRouter: MessageRouter;
    private monitorManager: MonitoringManager;
    private subscriptionManager: SubscriptionManager;
    private serviceRegistry: ServiceRegistry;
    private createdAt: Date;

    /**
     * Initializes the Message Broker.
     */
    constructor() {
        this.monitorManager = new MonitoringManager();
        this.subscriptionManager = new SubscriptionManager();
        this.messageRouter = new MessageRouter(this.subscriptionManager);
        this.serviceRegistry = new ServiceRegistry(this.subscriptionManager);
        this.connectionManager = new ConnectionManager(this.messageRouter, this.serviceRegistry, this.monitorManager);
        this.serviceRegistry.assignConnectionManager(this.connectionManager);
        this.messageRouter.assignConnectionManager(this.connectionManager);
        this.messageRouter.assignServiceRegistry(this.serviceRegistry);
        this.wss = createWebSocketServer(this.connectionManager);
        this.createdAt = new Date();
        logger.info(`Message Broker created at ${this.createdAt.toISOString()}`);
        logger.info(`Message Broker listening on ${config.host}:${config.port} (WebSocket)`);
    }

    /**
     * Shuts down the Message Broker.
     */
    async shutdown(): Promise<void> {
        logger.info('Shutting down Message Broker...');

        // Clear all requests
        await this.messageRouter.clearRequests();

        // Clear all subscriptions
        await this.subscriptionManager.clearAllSubscriptions();

        // Clear all services
        await this.serviceRegistry.clearAllServices();

        // Close all connections
        await this.connectionManager.closeAllConnections();

        // Stop the WebSocket server
        await new Promise<void>((resolve, reject) => {
            this.wss.close((err) => {
                if (err) {
                    logger.error('Error closing WebSocket server:', err);
                    reject(err);
                } else {
                    logger.info('WebSocket server closed');
                    resolve();
                }
            });
        });

        logger.info('Message Broker shutdown complete.');
    }
}