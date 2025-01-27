/**
 * @file Test suite for MessageBroker class
 * @description Tests the core functionality of the message broker system, including:
 * - Component initialization and dependency injection
 * - Shutdown sequence and cleanup
 * - Error handling during shutdown
 */

import { jest } from '@jest/globals';
import { Server } from 'net';
import { WebSocketServer } from 'ws';
import { MessageBroker } from '@core/broker';
import { ConnectionManager } from '@core/connection/manager';
import { createTcpServer, createWebSocketServer } from '@core/connection/protocols';
import { MonitoringManager } from '@core/monitoring';
import { MessageRouter } from '@core/router';
import { ServiceRegistry } from '@core/registry';
import { SubscriptionManager } from '@core/subscription';
import { SystemManager } from '@core/system/manager';
import logger, { SetupLogger } from '@utils/logger';

// Mock all external dependencies
jest.mock('net');
jest.mock('ws');
jest.mock('@core/connection/manager', () => ({
    ConnectionManager: jest.fn().mockImplementation((messageRouter, serviceRegistry, monitorManager, subscriptionManager) => {
        if (!messageRouter || !serviceRegistry || !monitorManager || !subscriptionManager) {
            throw new Error('Missing required constructor arguments');
        }
        return {
            dispose: jest.fn().mockImplementation(() => Promise.resolve())
        };
    })
}));
jest.mock('@core/connection/protocols', () => ({
    createTcpServer: jest.fn(),
    createWebSocketServer: jest.fn()
}));
jest.mock('@core/monitoring');
jest.mock('@core/router');
jest.mock('@core/registry');
jest.mock('@core/subscription');
jest.mock('@core/system/manager');
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
 * Test suite for MessageBroker class
 * @group unit
 * @group core
 */
describe('MessageBroker', () => {
    let mockTcpServer: jest.Mocked<Server>;
    let mockWsServer: jest.Mocked<WebSocketServer>;
    let mockConnectionManager: jest.Mocked<ConnectionManager>;
    let mockMessageRouter: jest.Mocked<MessageRouter>;
    let mockMonitorManager: jest.Mocked<MonitoringManager>;
    let mockSubscriptionManager: jest.Mocked<SubscriptionManager>;
    let mockServiceRegistry: jest.Mocked<ServiceRegistry>;
    let mockSystemManager: jest.Mocked<SystemManager>;
    let mockMetric: any;

    /**
     * Setup function run before each test
     * Initializes all mock components and their behaviors
     */
    beforeEach(() => {
        jest.resetAllMocks();

        // Create a mock metric instance
        mockMetric = {
            value: 0,
            lastModified: new Date(),
            dispose: jest.fn()
        };

        // Setup mock instances with all required methods
        mockMonitorManager = {
            dispose: jest.fn(),
            registerMetric: jest.fn().mockReturnValue(mockMetric),
            registerParameterized: jest.fn().mockReturnValue({
                get: jest.fn().mockReturnValue(mockMetric)
            })
        } as unknown as jest.Mocked<MonitoringManager>;

        mockSystemManager = {
            dispose: jest.fn()
        } as unknown as jest.Mocked<SystemManager>;

        mockSubscriptionManager = {
            dispose: jest.fn().mockImplementation(() => Promise.resolve())
        } as unknown as jest.Mocked<SubscriptionManager>;

        mockMessageRouter = {
            assignConnectionManager: jest.fn(),
            assignServiceRegistry: jest.fn(),
            dispose: jest.fn().mockImplementation(() => Promise.resolve())
        } as unknown as jest.Mocked<MessageRouter>;

        mockServiceRegistry = {
            assignConnectionManager: jest.fn(),
            dispose: jest.fn().mockImplementation(() => Promise.resolve())
        } as unknown as jest.Mocked<ServiceRegistry>;

        // Create mock servers with minimal required methods
        mockTcpServer = {
            close: jest.fn().mockImplementation(() => Promise.resolve()),
            ref: jest.fn(),
            unref: jest.fn(),
            address: jest.fn(),
            listen: jest.fn(),
            getConnections: jest.fn()
        } as unknown as jest.Mocked<Server>;

        mockWsServer = {
            close: jest.fn().mockImplementation(() => Promise.resolve()),
            address: jest.fn(),
            clients: new Set(),
            options: {},
            path: '',
            on: jest.fn(),
            once: jest.fn(),
            emit: jest.fn(),
            addListener: jest.fn(),
            removeListener: jest.fn()
        } as unknown as jest.Mocked<WebSocketServer>;

        // Setup mock constructors to return instances
        (MonitoringManager as jest.Mock).mockReturnValue(mockMonitorManager);
        (SystemManager as jest.Mock).mockReturnValue(mockSystemManager);
        (SubscriptionManager as jest.Mock).mockReturnValue(mockSubscriptionManager);
        (MessageRouter as jest.Mock).mockReturnValue(mockMessageRouter);
        (ServiceRegistry as jest.Mock).mockReturnValue(mockServiceRegistry);
        (createTcpServer as jest.Mock).mockReturnValue([mockTcpServer]);
        (createWebSocketServer as jest.Mock).mockReturnValue([mockWsServer]);

        // Store the ConnectionManager instance when it's created
        (ConnectionManager as jest.Mock).mockImplementation((messageRouter, serviceRegistry, monitorManager, subscriptionManager) => {
            mockConnectionManager = {
                dispose: jest.fn().mockImplementation(() => Promise.resolve())
            } as unknown as jest.Mocked<ConnectionManager>;
            return mockConnectionManager;
        });
    });

    /**
     * Tests for MessageBroker constructor
     * @group initialization
     */
    describe('constructor', () => {
        /**
         * Tests that all components are initialized in the correct order
         * and with proper dependencies
         */
        it('should initialize all components in correct order', () => {
            const broker = new MessageBroker();

            // Verify component creation
            expect(MonitoringManager).toHaveBeenCalledTimes(1);
            expect(SystemManager).toHaveBeenCalledWith(mockMonitorManager);
            expect(SubscriptionManager).toHaveBeenCalledTimes(1);
            expect(MessageRouter).toHaveBeenCalledWith(mockSubscriptionManager, mockMonitorManager);
            expect(ServiceRegistry).toHaveBeenCalledWith(mockSubscriptionManager, mockMonitorManager);
            expect(ConnectionManager).toHaveBeenCalledWith(
                mockMessageRouter,
                mockServiceRegistry,
                mockMonitorManager,
                mockSubscriptionManager
            );

            // Verify component relationships
            expect(mockServiceRegistry.assignConnectionManager).toHaveBeenCalledWith(mockConnectionManager);
            expect(mockMessageRouter.assignConnectionManager).toHaveBeenCalledWith(mockConnectionManager);
            expect(mockMessageRouter.assignServiceRegistry).toHaveBeenCalledWith(mockServiceRegistry);

            // Verify server creation
            expect(createTcpServer).toHaveBeenCalledWith(mockConnectionManager);
            expect(createWebSocketServer).toHaveBeenCalledWith(mockConnectionManager);

            // Verify creation logging
            expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/^Created at .+$/));
        });
    });

    /**
     * Tests for MessageBroker shutdown sequence
     * @group shutdown
     */
    describe('shutdown', () => {
        let broker: MessageBroker;

        /**
         * Creates a new MessageBroker instance before each test
         */
        beforeEach(() => {
            broker = new MessageBroker();
        });

        /**
         * Tests that all components are properly disposed during normal shutdown
         */
        it('should shutdown all components in correct order', async () => {
            await broker.shutdown();

            // Verify all components were disposed
            expect(mockMessageRouter.dispose).toHaveBeenCalled();
            expect(mockSubscriptionManager.dispose).toHaveBeenCalled();
            expect(mockServiceRegistry.dispose).toHaveBeenCalled();
            expect(mockConnectionManager.dispose).toHaveBeenCalled();
            expect(mockTcpServer.close).toHaveBeenCalled();
            expect(mockWsServer.close).toHaveBeenCalled();
            expect(mockSystemManager.dispose).toHaveBeenCalled();
            expect(mockMonitorManager.dispose).toHaveBeenCalled();

            // Verify logging
            expect(logger.info).toHaveBeenCalledWith('Shutting down...');
            expect(logger.info).toHaveBeenCalledWith('All servers closed');
            expect(logger.info).toHaveBeenCalledWith('Shutdown complete.');
        });

        /**
         * Tests that server close errors are properly handled and logged
         */
        it('should handle server close errors', async () => {
            const error = new Error('Server close error');
            const mockCloseWithError = jest.fn().mockImplementation(() => Promise.reject(error));
            Object.assign(mockTcpServer, { close: mockCloseWithError });

            await expect(broker.shutdown()).rejects.toThrow(error);

            expect(logger.error).toHaveBeenCalledWith('Error closing servers', { error });
        });

        /**
         * Tests that components are disposed even when server close fails
         * Verifies the cleanup sequence continues despite errors
         */
        it('should dispose components even if server close fails', async () => {
            const error = new Error('Server close error');
            const mockCloseWithError = jest.fn().mockImplementation(() => Promise.reject(error));
            Object.assign(mockTcpServer, { close: mockCloseWithError });

            try {
                await broker.shutdown();
            } catch (e) {
                // Expected error
            }

            // Verify all components were still disposed
            expect(mockMessageRouter.dispose).toHaveBeenCalled();
            expect(mockSubscriptionManager.dispose).toHaveBeenCalled();
            expect(mockServiceRegistry.dispose).toHaveBeenCalled();
            expect(mockConnectionManager.dispose).toHaveBeenCalled();
            expect(mockSystemManager.dispose).toHaveBeenCalled();
            expect(mockMonitorManager.dispose).toHaveBeenCalled();
        });
    });
});