import { jest } from '@jest/globals';
import { WebSocketServer } from 'ws';
import { MessageBroker } from '@core/broker';
import { ConnectionManager } from '@core/connection';
import { createWebSocketServer } from '@core/connection/websocket';
import { MonitoringManager } from '@core/monitoring';
import { MessageRouter } from '@core/router';
import { ServiceRegistry } from '@core/registry';
import { SubscriptionManager } from '@core/subscription';
import logger, { SetupLogger } from '@utils/logger';

// Mock external dependencies
jest.mock('ws');
jest.mock('@core/connection');
jest.mock('@core/connection/websocket');
jest.mock('@core/monitoring');
jest.mock('@core/router');
jest.mock('@core/registry');
jest.mock('@core/subscription');
jest.mock('@core/system/manager');
jest.mock('@config', () => ({
    config: {
        host: 'localhost',
        port: 8080,
        request: {
            response: {
                timeout: {
                    max: 60000
                }
            }
        }
    }
}));
jest.mock('@utils/logger', () => {
    const mockLogger = {
        info: jest.fn(),
        error: jest.fn()
    };
    return {
        __esModule: true,
        default: mockLogger,
        SetupLogger: jest.fn().mockReturnValue(mockLogger)
    };
});

/**
 * Test suite for MessageBroker class.
 * Tests the core functionality of the message broker system.
 *
 * Key areas tested:
 * - Component initialization and dependencies
 * - Initialization order
 * - Shutdown sequence
 * - Error handling during shutdown
 */
describe('MessageBroker', () => {
    // Mock component instances
    let mockWss: jest.Mocked<WebSocketServer>;
    let mockConnectionManager: jest.Mocked<ConnectionManager>;
    let mockMessageRouter: jest.Mocked<MessageRouter>;
    let mockMonitorManager: jest.Mocked<MonitoringManager>;
    let mockSubscriptionManager: jest.Mocked<SubscriptionManager>;
    let mockServiceRegistry: jest.Mocked<ServiceRegistry>;

    beforeEach(() => {
        // Reset all mocks before each test
        jest.resetAllMocks();

        // Setup MonitoringManager mock first since other components depend on it
        mockMonitorManager = {
            createMetric: jest.fn(),
            registerMetric: jest.fn().mockReturnValue({
                value: 0,
                lastModified: new Date(),
                dispose: jest.fn()
            }),
            registerParameterized: jest.fn().mockReturnValue({
                get: jest.fn().mockReturnValue({
                    value: 0,
                    lastModified: new Date(),
                    dispose: jest.fn()
                })
            }),
            dispose: jest.fn()
        } as unknown as jest.Mocked<MonitoringManager>;
        (MonitoringManager as jest.Mock).mockImplementation(() => mockMonitorManager);

        // Setup WebSocket server mock with close functionality
        mockWss = {
            close: jest.fn((cb?: (err?: Error) => void) => {
                if (cb) cb();
                return mockWss;
            }),
        } as unknown as jest.Mocked<WebSocketServer>;
        (createWebSocketServer as jest.Mock).mockReturnValue(mockWss);

        // Setup SubscriptionManager mock with dispose method
        mockSubscriptionManager = {
            dispose: jest.fn().mockImplementation(() => Promise.resolve()),
        } as unknown as jest.Mocked<SubscriptionManager>;
        (SubscriptionManager as jest.Mock).mockImplementation(() => mockSubscriptionManager);

        // Setup MessageRouter mock with required methods
        mockMessageRouter = {
            assignConnectionManager: jest.fn(),
            assignServiceRegistry: jest.fn(),
            dispose: jest.fn().mockImplementation(() => Promise.resolve()),
        } as unknown as jest.Mocked<MessageRouter>;
        (MessageRouter as jest.Mock).mockImplementation(() => mockMessageRouter);

        // Setup ServiceRegistry mock with required methods
        mockServiceRegistry = {
            assignConnectionManager: jest.fn(),
            dispose: jest.fn().mockImplementation(() => Promise.resolve()),
        } as unknown as jest.Mocked<ServiceRegistry>;
        (ServiceRegistry as jest.Mock).mockImplementation(() => mockServiceRegistry);

        // Setup ConnectionManager mock with dispose method
        mockConnectionManager = {
            dispose: jest.fn().mockImplementation(() => Promise.resolve()),
        } as unknown as jest.Mocked<ConnectionManager>;
        (ConnectionManager as jest.Mock).mockImplementation(() => mockConnectionManager);
    });

    /**
     * Tests for MessageBroker constructor functionality.
     * Verifies the broker properly:
     * - Initializes all required components
     * - Establishes component dependencies
     * - Maintains correct initialization order
     * - Starts the WebSocket server
     */
    describe('constructor', () => {
        /**
         * Verifies that all components are initialized in the correct order.
         * The constructor should:
         * - Create components in dependency order
         * - Establish component relationships
         * - Start the WebSocket server
         * - Log server startup
         */
        it('should initialize all components in correct order', () => {
            // Create broker instance to trigger initialization
            const broker = new MessageBroker();

            // Verify all components were created
            expect(SubscriptionManager).toHaveBeenCalledTimes(1);
            expect(MessageRouter).toHaveBeenCalledWith(mockSubscriptionManager, mockMonitorManager);
            expect(ServiceRegistry).toHaveBeenCalledWith(mockSubscriptionManager, mockMonitorManager);
            expect(ConnectionManager).toHaveBeenCalledWith(mockMessageRouter, mockServiceRegistry, mockMonitorManager, mockSubscriptionManager);

            // Verify component relationships were established
            expect(mockServiceRegistry.assignConnectionManager).toHaveBeenCalledWith(mockConnectionManager);
            expect(mockMessageRouter.assignConnectionManager).toHaveBeenCalledWith(mockConnectionManager);
            expect(mockMessageRouter.assignServiceRegistry).toHaveBeenCalledWith(mockServiceRegistry);

            // Verify WebSocket server was created
            expect(createWebSocketServer).toHaveBeenCalledWith(mockConnectionManager);
            expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/^Listening on .+:\d+ \(WebSocket\)$/));

            // Verify initialization order through call order
            const subscriptionManagerCall = (SubscriptionManager as jest.Mock).mock.invocationCallOrder[0];
            const messageRouterCall = (MessageRouter as jest.Mock).mock.invocationCallOrder[0];
            const serviceRegistryCall = (ServiceRegistry as jest.Mock).mock.invocationCallOrder[0];
            const connectionManagerCall = (ConnectionManager as jest.Mock).mock.invocationCallOrder[0];

            // Verify dependency-based initialization sequence
            expect(subscriptionManagerCall).toBeLessThan(messageRouterCall);
            expect(messageRouterCall).toBeLessThan(serviceRegistryCall);
            expect(serviceRegistryCall).toBeLessThan(connectionManagerCall);
        });

        /**
         * Verifies that server startup is logged correctly.
         * The constructor should:
         * - Log server startup with host and port
         * - Use correct message format
         */
        it('should log server start with correct host and port', () => {
            // Create broker instance to trigger logging
            const broker = new MessageBroker();

            // Verify startup was logged with correct format
            expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/^Created at .+$/));
            expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/^Listening on .+:\d+ \(WebSocket\)$/));
        });
    });

    /**
     * Tests for MessageBroker shutdown functionality.
     * Verifies the broker properly:
     * - Shuts down all components
     * - Maintains correct shutdown order
     * - Handles shutdown errors
     * - Logs shutdown progress
     */
    describe('shutdown', () => {
        /**
         * Verifies that all components are shut down in the correct order.
         * The shutdown should:
         * - Clear pending requests
         * - Clear subscriptions
         * - Clear services
         * - Close connections
         * - Close WebSocket server
         */
        it('should shutdown all components in correct order', async () => {
            // Create and initialize broker instance
            const broker = new MessageBroker();

            // Trigger broker shutdown
            await broker.shutdown();

            // Verify all components were shut down
            expect(mockMessageRouter.dispose).toHaveBeenCalled();
            expect(mockSubscriptionManager.dispose).toHaveBeenCalled();
            expect(mockServiceRegistry.dispose).toHaveBeenCalled();
            expect(mockConnectionManager.dispose).toHaveBeenCalled();
            expect(mockWss.close).toHaveBeenCalled();

            // Verify shutdown order through call order
            const clearRequestsCall = mockMessageRouter.dispose.mock.invocationCallOrder[0];
            const clearSubscriptionsCall = mockSubscriptionManager.dispose.mock.invocationCallOrder[0];
            const clearServicesCall = mockServiceRegistry.dispose.mock.invocationCallOrder[0];
            const closeConnectionsCall = mockConnectionManager.dispose.mock.invocationCallOrder[0];
            const closeWssCall = mockWss.close.mock.invocationCallOrder[0];

            // Verify dependency-based shutdown sequence
            expect(clearRequestsCall).toBeLessThan(clearSubscriptionsCall);
            expect(clearSubscriptionsCall).toBeLessThan(clearServicesCall);
            expect(clearServicesCall).toBeLessThan(closeConnectionsCall);
            expect(closeConnectionsCall).toBeLessThan(closeWssCall);
        });

        /**
         * Verifies that WebSocket server close errors are handled properly.
         * The shutdown should:
         * - Detect server close errors
         * - Log the error
         * - Propagate the error
         */
        it('should handle WebSocket server close error', async () => {
            // Create and initialize broker instance
            const broker = new MessageBroker();

            // Setup WebSocket server to fail on close
            const error = new Error('Failed to close WebSocket server');
            mockWss.close.mockImplementationOnce((cb?: (err?: Error) => void) => {
                if (cb) cb(error);
                return mockWss;
            });

            // Verify error is propagated
            await expect(broker.shutdown()).rejects.toThrow('Failed to close WebSocket server');

            // Verify error was logged
            expect(logger.error).toHaveBeenCalledWith('Error closing WebSocket server', { error });
        });

        /**
         * Verifies that shutdown progress is properly logged.
         * The shutdown should:
         * - Log shutdown initiation
         * - Log server closure
         * - Log shutdown completion
         */
        it('should log shutdown steps', async () => {
            // Create and initialize broker instance
            const broker = new MessageBroker();

            // Trigger broker shutdown
            await broker.shutdown();

            // Verify shutdown steps were logged
            expect(logger.info).toHaveBeenCalledWith('Shutting down...');
            expect(logger.info).toHaveBeenCalledWith('WebSocket server closed');
            expect(logger.info).toHaveBeenCalledWith('Shutdown complete.');
        });
    });
});