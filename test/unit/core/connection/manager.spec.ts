import { randomUUID } from 'crypto';
import { jest } from '@jest/globals';
import { ConnectionManager } from '@core/connection/manager';
import { Connection, ConnectionState } from '@core/connection/types';
import { Metric, MonitoringManager } from '@core/monitoring';
import { ServiceRegistry } from '@core/registry';
import { MessageRouter } from '@core/router';
import { SubscriptionManager } from '@core/subscription';
import { ActionType } from '@core/types';
import { BrokerHeader } from '@core/utils';
import logger from '@utils/logger';
import { InternalError } from '@core/errors';
import { GaugeSlot } from '@core/monitoring/metrics/slots';
import { MessageError } from '@core/errors';
import { MessageUtils } from '@core/utils';

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

        // Set up mock slot for metrics with basic functionality
        const mockSlot = {
            value: 0,
            lastModified: new Date(),
            dispose: jest.fn(),
            add: jest.fn()
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
            serviceId: randomUUID(),
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
            expect(connectionManager.hasConnection(mockConnection.serviceId)).toBe(true);
            expect(connectionManager.getConnection(mockConnection.serviceId)).toBe(mockConnection);

            // Verify event listeners were attached
            expect(mockConnection.onMessage).toHaveBeenCalled();
            expect(mockConnection.onClose).toHaveBeenCalled();

            // Verify successful connection was logged
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining(`Added connection for service ${mockConnection.serviceId}`)
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

        it('should use empty object as default payload', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);
            const serviceId = mockConnection.serviceId;

            // Send message without payload
            connectionManager.sendMessage<BrokerHeader>(serviceId, {
                action: ActionType.RESPONSE,
                topic: 'test',
                version: '1.0.0'
            }, undefined, undefined);

            // Verify message was sent with empty object payload
            expect(mockConnection.send).toHaveBeenCalledWith(
                expect.stringMatching(/\n{}$/)
            );
        });

        it('should handle non-existent connection', () => {
            // Attempt to send to non-existent connection
            connectionManager.sendMessage<BrokerHeader>('non-existent', {
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
            Object.defineProperty(mockConnection, 'state', { value: ConnectionState.CLOSED });

            // Attempt to send message
            expect(() => {
                connectionManager.sendMessage<BrokerHeader>(serviceId, {
                    action: ActionType.RESPONSE,
                    topic: 'test',
                    version: '1.0.0'
                }, {}, undefined);
            }).toThrow(InternalError);

            // Verify connection was removed
            expect(connectionManager.hasConnection(serviceId)).toBe(false);
        });
    });

    describe('message handling', () => {
        it('should handle messages and notify subscribers', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);
            const serviceId = mockConnection.serviceId;

            // Set up subscribers
            mockSubscriptionManager.getSubscribers.mockReturnValue(['subscriber1', 'subscriber2']);
            const mockSubscriber1 = { ...mockConnection, serviceId: 'subscriber1' };
            const mockSubscriber2 = { ...mockConnection, serviceId: 'subscriber2' };

            // Mock connections for subscribers
            jest.spyOn(connectionManager as any, '_resolveConnection')
                .mockReturnValueOnce(mockSubscriber1)
                .mockReturnValueOnce(mockSubscriber2);

            // Create message using proper serialization
            const header = {
                action: ActionType.REQUEST,
                topic: 'test',
                version: '1.0.0',
                requestId: '123e4567-e89b-12d3-a456-426614174000'
            };
            const payload = { data: 'test' };
            const message = Buffer.from(MessageUtils.serialize(header, payload));

            // Trigger message handler
            (connectionManager as any).handleMessage(mockConnection, message);

            // Verify subscribers were notified
            expect(mockSubscriber1.send).toHaveBeenCalled();
            expect(mockSubscriber2.send).toHaveBeenCalled();
        });

        it('should handle malformed message errors', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);
            const serviceId = mockConnection.serviceId;

            // Simulate malformed message
            const malformedMessage = Buffer.from('invalid json');

            // Trigger message handler
            (connectionManager as any).handleMessage(mockConnection, malformedMessage);

            // Verify error response was sent
            expect(mockConnection.send).toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringMatching(/^\[MALFORMED_MESSAGE\]/),
                expect.any(Object)
            );
        });

        it('should handle MessageError during routing', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);
            const serviceId = mockConnection.serviceId;

            // Create message using proper serialization
            const header = {
                action: ActionType.REQUEST,
                topic: 'test',
                version: '1.0.0',
                requestId: '123e4567-e89b-12d3-a456-426614174000'
            };
            const payload = { data: 'test' };
            const message = Buffer.from(MessageUtils.serialize(header, payload));

            // Mock router to throw MessageError
            mockMessageRouter.routeMessage.mockImplementationOnce(() => {
                const error = new MessageError('TEST_ERROR', 'Test error message');
                throw error;
            });

            // Trigger message handler
            (connectionManager as any).handleMessage(mockConnection, message);

            // Verify error response was sent
            expect(mockConnection.send).toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(
                '[TEST_ERROR] Test error message',
                expect.any(Object)
            );
        });

        it('should handle routing errors', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);
            const serviceId = mockConnection.serviceId;

            // Create message using proper serialization
            const header = {
                action: ActionType.REQUEST,
                topic: 'test',
                version: '1.0.0',
                requestId: '123e4567-e89b-12d3-a456-426614174000'
            };
            const payload = { data: 'test' };
            const message = Buffer.from(MessageUtils.serialize(header, payload));

            // Mock router to throw error
            mockMessageRouter.routeMessage.mockImplementationOnce(() => {
                throw new Error('Routing failed');
            });

            // Trigger message handler
            (connectionManager as any).handleMessage(mockConnection, message);

            // Verify error response was sent
            expect(mockConnection.send).toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(
                'An unexpected error while routing the message:',
                expect.any(Object)
            );
        });

        it('should forward messages to system.message subscribers', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);
            const serviceId = mockConnection.serviceId;

            // Set up subscribers for system.message
            mockSubscriptionManager.getSubscribers.mockReturnValue(['subscriber1', 'subscriber2']);
            const mockSubscriber1 = { ...mockConnection, serviceId: 'subscriber1' };
            const mockSubscriber2 = { ...mockConnection, serviceId: 'subscriber2' };

            // Mock connections for subscribers
            jest.spyOn(connectionManager as any, '_resolveConnection')
                .mockReturnValueOnce(mockSubscriber1)
                .mockReturnValueOnce(mockSubscriber2);

            // Send a message that should be forwarded
            const header = {
                action: ActionType.REQUEST,
                topic: 'test',
                version: '1.0.0',
                requestId: '123e4567-e89b-12d3-a456-426614174000',
                parentRequestId: '123e4567-e89b-12d3-a456-426614174001'
            };
            const payload = { data: 'test' };
            const message = Buffer.from(MessageUtils.serialize(header, payload));

            // Send message with maskedId
            connectionManager.sendMessage(serviceId, header, payload, 'masked-id');

            // Verify subscribers received the forwarded message
            expect(mockSubscriber1.send).toHaveBeenCalled();
            expect(mockSubscriber2.send).toHaveBeenCalled();
        });

        it('should handle header parsing errors', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);
            const serviceId = mockConnection.serviceId;

            // Create an invalid message that will cause header parsing to fail
            const message = Buffer.from('REQUEST:invalid:1.0.0\n{"data":"test"}');

            // Trigger message handler
            (connectionManager as any).handleMessage(mockConnection, message);

            // Verify error was logged and error response was sent
            expect(logger.error).toHaveBeenCalledWith(
                '[MALFORMED_MESSAGE] Invalid action: REQUEST',
                expect.any(Object)
            );
            expect(mockConnection.send).toHaveBeenCalled();
        });

        it('should forward messages with timeout to system.message subscribers', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);
            const serviceId = mockConnection.serviceId;

            // Set up subscribers for system.message
            mockSubscriptionManager.getSubscribers.mockReturnValue(['subscriber1']);
            const mockSubscriber = { ...mockConnection, serviceId: 'subscriber1' };

            // Mock connection for subscriber
            jest.spyOn(connectionManager as any, '_resolveConnection')
                .mockReturnValueOnce(mockSubscriber);

            // Create message with timeout using proper serialization
            const header = {
                action: ActionType.REQUEST,
                topic: 'test',
                version: '1.0.0',
                requestId: '123e4567-e89b-12d3-a456-426614174000',
                timeout: 5000
            };
            const payload = { data: 'test' };
            const message = Buffer.from(MessageUtils.serialize(header, payload));

            // Trigger message handler
            (connectionManager as any).handleMessage(mockConnection, message);

            // Verify subscriber received the forwarded message with timeout
            expect(mockSubscriber.send).toHaveBeenCalledWith(
                expect.stringContaining('"timeout":5000')
            );
        });

        it('should forward messages with raw payload to system.message subscribers', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);

            // Set up subscribers for system.message
            mockSubscriptionManager.getSubscribers.mockReturnValue(['subscriber1']);
            const mockSubscriber = { ...mockConnection, serviceId: 'subscriber1' };

            // Mock connection for subscriber
            jest.spyOn(connectionManager as any, '_resolveConnection')
                .mockReturnValueOnce(mockSubscriber);

            // Create message with non-empty payload
            const header = {
                action: ActionType.REQUEST,
                topic: 'test',
                version: '1.0.0',
                requestId: '123e4567-e89b-12d3-a456-426614174000'
            };
            const payload = { data: 'test' };
            const message = Buffer.from(MessageUtils.serialize(header, payload));

            // Trigger message handler
            (connectionManager as any).handleMessage(mockConnection, message);

            // Verify subscriber received the forwarded message with raw payload
            expect(mockSubscriber.send).toHaveBeenCalledWith(
                expect.stringMatching(/.*"payload":\{"data":"test"\}.*/)
            );
        });
    });

    describe('connection count', () => {
        it('should return the correct number of connections', () => {
            // Initially should have no connections
            expect(connectionManager.getConnectionCount()).toBe(0);

            // Add a connection
            connectionManager.addConnection(mockConnection);
            expect(connectionManager.getConnectionCount()).toBe(1);

            // Add another connection with a different serviceId
            const mockConnection2 = {
                serviceId: '',
                ip: '127.0.0.1',
                state: ConnectionState.OPEN,
                onMessage: jest.fn(),
                onClose: jest.fn(),
                send: jest.fn(),
                close: jest.fn(),
            } as any;
            connectionManager.addConnection(mockConnection2);
            expect(connectionManager.getConnectionCount()).toBe(2);

            // Remove a connection
            connectionManager.removeConnection(mockConnection2.serviceId);
            expect(connectionManager.getConnectionCount()).toBe(1);
        });
    });
});