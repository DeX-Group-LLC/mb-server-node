import { jest } from '@jest/globals';
import { randomUUID } from 'crypto';
import { config } from '@config';
import { ConnectionManager } from '@core/connection/manager';
import { Connection, ConnectionState } from '@core/connection/types';
import { Metric, MonitoringManager } from '@core/monitoring';
import { ServiceRegistry } from '@core/registry';
import { MessageRouter } from '@core/router';
import { SubscriptionManager } from '@core/subscription';
import { ActionType } from '@core/types';
import { BrokerHeader, ClientHeader, Message, MessageUtils } from '@core/utils';
import logger from '@utils/logger';
import { InternalError, MalformedMessageError } from '@core/errors';
import { IManageableSlot, ISlotAddable } from '@core/monitoring/metrics/slots/interface';
import { GaugeSlot } from '@core/monitoring/metrics/slots';

// Mock external dependencies to isolate the ConnectionManager tests
jest.mock('@core/monitoring');
jest.mock('@core/registry');
jest.mock('@core/router');
jest.mock('@utils/logger', () => {
    const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    };
    return {
        __esModule: true,
        default: mockLogger,
        SetupLogger: jest.fn().mockReturnValue(mockLogger)
    };
});
jest.mock('crypto');

/**
 * Test suite for the ConnectionManager class.
 * Tests the core functionality of managing WebSocket connections, including:
 * - Adding and removing connections
 * - Sending messages to connected services
 * - Handling incoming messages and errors
 * - Managing connection lifecycle
 */
describe('ConnectionManager', () => {
    let connectionManager: ConnectionManager;
    let mockMessageRouter: jest.Mocked<MessageRouter>;
    let mockServiceRegistry: jest.Mocked<ServiceRegistry>;
    let mockMonitorManager: jest.Mocked<MonitoringManager>;
    let mockSubscriptionManager: jest.Mocked<SubscriptionManager>;
    let mockConnection: jest.Mocked<Connection>;
    let mockMetric: jest.Mocked<Metric<GaugeSlot>>;

    beforeEach(() => {
        // Reset all mock implementations and call history before each test
        jest.resetAllMocks();

        // Mock UUID generation for consistent testing
        (randomUUID as jest.Mock).mockReturnValue('test-uuid');

        // Set up mock slot for metrics with basic functionality
        const mockSlot = {
            value: 0,
            lastModified: new Date(),
            dispose: jest.fn()
        } as unknown as jest.Mocked<GaugeSlot>;

        // Create mock metric with slot
        mockMetric = {
            slot: mockSlot,
            dispose: jest.fn()
        } as unknown as jest.Mocked<Metric<GaugeSlot>>;

        // Set up monitoring manager mock with metric registration
        mockMonitorManager = {
            registerMetric: jest.fn().mockReturnValue(mockMetric),
            registerParameterized: jest.fn(),
            dispose: jest.fn(),
        } as unknown as jest.Mocked<MonitoringManager>;

        // Set up service registry mock for service management
        mockServiceRegistry = {
            registerService: jest.fn(),
            unregisterService: jest.fn(),
            getService: jest.fn(),
            dispose: jest.fn()
        } as unknown as jest.Mocked<ServiceRegistry>;

        // Set up message router mock for message handling
        mockMessageRouter = {
            routeMessage: jest.fn(),
            assignConnectionManager: jest.fn(),
            assignServiceRegistry: jest.fn(),
            dispose: jest.fn()
        } as unknown as jest.Mocked<MessageRouter>;

        // Set up subscription manager mock for subscription management
        mockSubscriptionManager = {
            unsubscribeAll: jest.fn(),
            getSubscribers: jest.fn().mockReturnValue([]),
            dispose: jest.fn(),
        } as unknown as jest.Mocked<SubscriptionManager>;

        // Create mock connection with basic WebSocket-like interface
        mockConnection = {
            serviceId: '',
            ip: '127.0.0.1',
            state: ConnectionState.OPEN,
            onMessage: jest.fn(),
            onClose: jest.fn(),
            send: jest.fn(),
            close: jest.fn(),
        } as any;

        // Initialize ConnectionManager with mocked dependencies
        connectionManager = new ConnectionManager(mockMessageRouter, mockServiceRegistry, mockMonitorManager, mockSubscriptionManager);
    });

    afterEach(() => {
        // Clean up connections after each test
        connectionManager.dispose();
    });

    /**
     * Tests for the addConnection method.
     * Verifies connection registration, event handling, and metric updates.
     */
    describe('addConnection', () => {
        /**
         * Verifies that a new connection is properly added with:
         * - Generated UUID assignment
         * - Event listener setup
         * - Metric updates
         * - Logging
         */
        it('should add a new connection and set up listeners', () => {
            // Register new connection
            connectionManager.addConnection(mockConnection);

            // Verify connection was registered with expected ID
            expect(connectionManager.hasConnection('test-uuid')).toBe(true);
            expect(connectionManager.getConnection('test-uuid')).toBe(mockConnection);

            // Verify event listeners were attached
            expect(mockConnection.onMessage).toHaveBeenCalled();
            expect(mockConnection.onClose).toHaveBeenCalled();

            // Verify successful connection was logged
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Added connection for service test-uuid')
            );
        });

        /**
         * Verifies proper error handling when connection registration fails:
         * - Error propagation
         * - Connection cleanup
         */
        it('should handle errors during connection setup', () => {
            // Simulate registration failure
            mockServiceRegistry.registerService.mockImplementationOnce(() => {
                throw new Error('Registration failed');
            });

            // Verify error is thrown and handled
            expect(() => {
                connectionManager.addConnection(mockConnection);
            }).toThrow('Registration failed');

            // Verify connection was not registered
            expect(connectionManager.hasConnection('test-uuid')).toBe(false);
        });
    });

    /**
     * Tests for the removeConnection method.
     * Verifies connection removal, service deregistration, and cleanup.
     */
    describe('removeConnection', () => {
        /**
         * Verifies that an existing connection is properly removed with:
         * - Service deregistration
         * - Logging
         */
        it('should remove an existing connection', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);
            const serviceId = mockConnection.serviceId;

            // Remove the connection
            connectionManager.removeConnection(serviceId);

            // Verify connection was removed
            expect(connectionManager.hasConnection(serviceId)).toBe(false);

            // Verify service was deregistered
            expect(mockServiceRegistry.unregisterService).toHaveBeenCalledWith(serviceId);

            // Verify removal was logged
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining(`Removed connection for service ${serviceId}`)
            );
        });
    });

    /**
     * Tests for the sendMessage method.
     * Verifies message sending, error handling, and subscriber notifications.
     */
    describe('sendMessage', () => {
        it('should send message to connected service', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);
            const serviceId = mockConnection.serviceId;

            // Prepare test message
            const header: BrokerHeader = {
                action: ActionType.RESPONSE,
                topic: 'test',
                version: '1.0.0'
            };
            const payload = { data: 'test' };

            // Send message
            connectionManager.sendMessage(serviceId, header, payload, undefined);

            // Verify message was sent
            expect(mockConnection.send).toHaveBeenCalled();
        });

        it('should handle non-existent connection', () => {
            // Attempt to send to non-existent connection
            connectionManager.sendMessage('non-existent', {
                action: ActionType.RESPONSE,
                topic: 'test',
                version: '1.0.0'
            }, {}, undefined);

            // Verify warning was logged
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Unable to send message to service non-existent')
            );
        });
    });

    /**
     * Tests for connection state management.
     * Verifies proper handling of connection states.
     */
    describe('connection state', () => {
        it('should handle closed connections', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);
            const serviceId = mockConnection.serviceId;

            // Change connection state to closed
            mockConnection.state = ConnectionState.CLOSED;

            // Attempt to send message
            expect(() => {
                connectionManager.sendMessage(serviceId, {
                    action: ActionType.RESPONSE,
                    topic: 'test',
                    version: '1.0.0'
                }, {}, undefined);
            }).toThrow(InternalError);

            // Verify connection was removed
            expect(connectionManager.hasConnection(serviceId)).toBe(false);
        });
    });
});