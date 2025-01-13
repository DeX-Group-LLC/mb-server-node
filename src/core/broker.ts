import { WebSocketServer } from 'ws';
import { config } from '@config';
import { ConnectionManager } from '@core/connection';
import { createWebSocketServer } from '@core/connection/websocket';
import { MonitoringManager } from '@core/monitoring';
import { ServiceRegistry } from '@core/registry';
import { MessageRouter } from '@core/router';
import { SubscriptionManager } from '@core/subscription';
import { SetupLogger } from '@utils/logger';
import { SystemManager } from './system/manager';

const logger = SetupLogger('MessageBroker');

export class MessageBroker {
    private wss: WebSocketServer;
    private connectionManager: ConnectionManager;
    private messageRouter: MessageRouter;
    private monitorManager: MonitoringManager;
    private subscriptionManager: SubscriptionManager;
    private serviceRegistry: ServiceRegistry;
    private systemManager: SystemManager;
    private createdAt: Date;

    /**
     * Initializes the Message Broker.
     */
    constructor() {
        this.monitorManager = new MonitoringManager();
        this.systemManager = new SystemManager(this.monitorManager);
        this.subscriptionManager = new SubscriptionManager();
        this.messageRouter = new MessageRouter(this.subscriptionManager, this.monitorManager);
        this.serviceRegistry = new ServiceRegistry(this.subscriptionManager, this.monitorManager);
        this.connectionManager = new ConnectionManager(this.messageRouter, this.serviceRegistry, this.monitorManager);
        this.serviceRegistry.assignConnectionManager(this.connectionManager);
        this.messageRouter.assignConnectionManager(this.connectionManager);
        this.messageRouter.assignServiceRegistry(this.serviceRegistry);
        this.wss = createWebSocketServer(this.connectionManager);
        this.createdAt = new Date();
        logger.info(`Created at ${this.createdAt.toISOString()}`);
        logger.info(`Listening on ${config.host}:${config.port} (WebSocket)`);
    }

    /**
     * Shuts down the Message Broker.
     */
    async shutdown(): Promise<void> {
        logger.info('Shutting down...');

        // Clear all requests
        await this.messageRouter.dispose();

        // Clear all subscriptions
        await this.subscriptionManager.dispose();

        // Clear all services
        await this.serviceRegistry.dispose();

        // Close all connections
        await this.connectionManager.dispose();

        // Stop the WebSocket server
        await new Promise<void>((resolve, reject) => {
            this.wss.close((err) => {
                if (err) {
                    logger.error('Error closing WebSocket server', { error: err });
                    reject(err);
                } else {
                    logger.info('WebSocket server closed');
                    resolve();
                }
            });
        });

        // Dispose of system manager
        this.systemManager.dispose();

        // Dispose of monitoring manager
        this.monitorManager.dispose();

        logger.info('Shutdown complete.');
    }
}
