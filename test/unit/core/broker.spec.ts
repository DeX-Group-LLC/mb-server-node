import { jest } from '@jest/globals';
import { WebSocketServer } from 'ws';
import { MessageBroker } from '@core/broker';
import { ConnectionManager } from '@core/connection';
import { createWebSocketServer } from '@core/connection/websocket';
import { MonitoringManager } from '@core/monitoring';
import { MessageRouter } from '@core/router';
import { ServiceRegistry } from '@core/registry';
import { SubscriptionManager } from '@core/subscription';
import logger from '@utils/logger';

jest.mock('ws');
jest.mock('@core/connection');
jest.mock('@core/connection/websocket');
jest.mock('@core/monitoring');
jest.mock('@core/router');
jest.mock('@core/registry');
jest.mock('@core/subscription');
jest.mock('@utils/logger', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        error: jest.fn(),
    },
}));

describe('MessageBroker', () => {
    let mockWss: jest.Mocked<WebSocketServer>;
    let mockConnectionManager: jest.Mocked<ConnectionManager>;
    let mockMessageRouter: jest.Mocked<MessageRouter>;
    let mockMonitorManager: jest.Mocked<MonitoringManager>;
    let mockSubscriptionManager: jest.Mocked<SubscriptionManager>;
    let mockServiceRegistry: jest.Mocked<ServiceRegistry>;

    beforeEach(() => {
        // Reset all mocks
        jest.resetAllMocks();

        // Setup WebSocket server mock
        mockWss = {
            close: jest.fn((cb?: (err?: Error) => void) => {
                if (cb) cb();
                return mockWss;
            }),
        } as unknown as jest.Mocked<WebSocketServer>;
        (createWebSocketServer as jest.Mock).mockReturnValue(mockWss);

        mockConnectionManager = {
            closeAllConnections: jest.fn().mockImplementation(() => Promise.resolve()),
        } as unknown as jest.Mocked<ConnectionManager>;
        (ConnectionManager as jest.Mock).mockImplementation(() => mockConnectionManager);

        mockMessageRouter = {
            assignConnectionManager: jest.fn(),
            assignServiceRegistry: jest.fn(),
            clearRequests: jest.fn().mockImplementation(() => Promise.resolve()),
        } as unknown as jest.Mocked<MessageRouter>;
        (MessageRouter as jest.Mock).mockImplementation(() => mockMessageRouter);

        mockMonitorManager = {
            createMetric: jest.fn(),
        } as unknown as jest.Mocked<MonitoringManager>;
        (MonitoringManager as jest.Mock).mockImplementation(() => mockMonitorManager);

        mockServiceRegistry = {
            assignConnectionManager: jest.fn(),
            clearAllServices: jest.fn().mockImplementation(() => Promise.resolve()),
        } as unknown as jest.Mocked<ServiceRegistry>;
        (ServiceRegistry as jest.Mock).mockImplementation(() => mockServiceRegistry);

        // Setup manager mocks
        mockSubscriptionManager = {
            clearAllSubscriptions: jest.fn().mockImplementation(() => Promise.resolve()),
        } as unknown as jest.Mocked<SubscriptionManager>;
        (SubscriptionManager as jest.Mock).mockImplementation(() => mockSubscriptionManager);
    });

    describe('constructor', () => {
        it('should initialize all components in correct order', () => {
            // Create broker instance
            const broker = new MessageBroker();

            // Verify all components were initialized
            expect(SubscriptionManager).toHaveBeenCalledTimes(1);
            expect(MessageRouter).toHaveBeenCalledWith(mockSubscriptionManager);
            expect(ServiceRegistry).toHaveBeenCalledWith(mockSubscriptionManager);
            expect(ConnectionManager).toHaveBeenCalledWith(mockMessageRouter, mockServiceRegistry, mockMonitorManager);
            expect(mockServiceRegistry.assignConnectionManager).toHaveBeenCalledWith(mockConnectionManager);
            expect(mockMessageRouter.assignConnectionManager).toHaveBeenCalledWith(mockConnectionManager);
            expect(mockMessageRouter.assignServiceRegistry).toHaveBeenCalledWith(mockServiceRegistry);
            expect(createWebSocketServer).toHaveBeenCalledWith(mockConnectionManager);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Message Broker listening'));

            // Verify initialization order
            const subscriptionManagerCall = (SubscriptionManager as jest.Mock).mock.invocationCallOrder[0];
            const messageRouterCall = (MessageRouter as jest.Mock).mock.invocationCallOrder[0];
            const serviceRegistryCall = (ServiceRegistry as jest.Mock).mock.invocationCallOrder[0];
            const connectionManagerCall = (ConnectionManager as jest.Mock).mock.invocationCallOrder[0];

            expect(subscriptionManagerCall).toBeLessThan(messageRouterCall);
            expect(messageRouterCall).toBeLessThan(serviceRegistryCall);
            expect(serviceRegistryCall).toBeLessThan(connectionManagerCall);
        });

        it('should log server start with correct host and port', () => {
            // Create broker instance
            const broker = new MessageBroker();

            // Verify logging
            expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/Message Broker listening on .+:\d+ \(WebSocket\)/));
        });
    });

    describe('shutdown', () => {
        it('should shutdown all components in correct order', async () => {
            // Create broker instance
            const broker = new MessageBroker();

            // Shutdown the broker
            await broker.shutdown();

            // Verify all components were shutdown in correct order
            expect(mockMessageRouter.clearRequests).toHaveBeenCalled();
            expect(mockSubscriptionManager.clearAllSubscriptions).toHaveBeenCalled();
            expect(mockServiceRegistry.clearAllServices).toHaveBeenCalled();
            expect(mockConnectionManager.closeAllConnections).toHaveBeenCalled();
            expect(mockWss.close).toHaveBeenCalled();

            // Verify shutdown order
            const clearRequestsCall = mockMessageRouter.clearRequests.mock.invocationCallOrder[0];
            const clearSubscriptionsCall = mockSubscriptionManager.clearAllSubscriptions.mock.invocationCallOrder[0];
            const clearServicesCall = mockServiceRegistry.clearAllServices.mock.invocationCallOrder[0];
            const closeConnectionsCall = mockConnectionManager.closeAllConnections.mock.invocationCallOrder[0];
            const closeWssCall = mockWss.close.mock.invocationCallOrder[0];

            expect(clearRequestsCall).toBeLessThan(clearSubscriptionsCall);
            expect(clearSubscriptionsCall).toBeLessThan(clearServicesCall);
            expect(clearServicesCall).toBeLessThan(closeConnectionsCall);
            expect(closeConnectionsCall).toBeLessThan(closeWssCall);
        });

        it('should handle WebSocket server close error', async () => {
            // Create broker instance
            const broker = new MessageBroker();

            // Mock WebSocket server close to fail
            const error = new Error('Failed to close WebSocket server');
            mockWss.close.mockImplementationOnce((cb?: (err?: Error) => void) => {
                if (cb) cb(error);
                return mockWss;
            });

            // Attempt to shutdown the broker and expect it to reject
            await expect(broker.shutdown()).rejects.toThrow('Failed to close WebSocket server');

            // Verify error was logged
            expect(logger.error).toHaveBeenCalledWith('Error closing WebSocket server:', error);
        });

        it('should log shutdown steps', async () => {
            // Create broker instance
            const broker = new MessageBroker();

            // Shutdown the broker
            await broker.shutdown();

            // Verify logging
            expect(logger.info).toHaveBeenCalledWith('Shutting down Message Broker...');
            expect(logger.info).toHaveBeenCalledWith('WebSocket server closed');
            expect(logger.info).toHaveBeenCalledWith('Message Broker shutdown complete.');
        });
    });
});