import { jest } from '@jest/globals';
import { randomUUID } from 'crypto';
import { ConnectionManager } from '@core/connection/manager';
import { Connection, ConnectionState } from '@core/connection/types';
import { Metric, MonitoringManager } from '@/core/monitoring';
import { ServiceRegistry } from '@core/registry';
import { MessageRouter } from '@core/router';
import { ActionType } from '@core/types';
import { Header, MessageUtils } from '@core/utils';
import logger from '@utils/logger';

// Mock external dependencies to isolate the ConnectionManager tests
jest.mock('@core/monitoring');
jest.mock('@core/registry');
jest.mock('@core/router');
jest.mock('@utils/logger');
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
    let mockConnection: jest.Mocked<Connection>;
    let mockMessageRouter: jest.Mocked<MessageRouter>;
    let mockMonitorManager: jest.Mocked<MonitoringManager>;
    let mockServiceRegistry: jest.Mocked<ServiceRegistry>;
    let mockMetric: any;

    beforeEach(() => {
        // Reset all mock implementations and call history before each test
        jest.resetAllMocks();

        // Mock UUID generation for consistent testing
        (randomUUID as jest.Mock).mockReturnValue('test-uuid');

        // Set up mock slot for metrics with basic functionality
        const mockSlot = {
            add: jest.fn(),
            reset: jest.fn(),
            dispose: jest.fn(),
            value: 0
        };

        // Create mock metric with slot
        mockMetric = {
            slot: mockSlot,
            dispose: jest.fn()
        } as unknown as jest.Mocked<Metric>;

        // Set up monitoring manager mock with metric registration
        mockMonitorManager = {
            registerMetric: jest.fn().mockReturnValue(mockMetric),
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
            dispose: jest.fn()
        } as unknown as jest.Mocked<MessageRouter>;

        // Create mock connection with basic WebSocket-like interface
        mockConnection = {
            serviceId: undefined,
            ip: '127.0.0.1',
            state: ConnectionState.OPEN,
            onMessage: jest.fn(),
            onClose: jest.fn(),
            send: jest.fn(),
            close: jest.fn(),
        } as any;

        // Initialize ConnectionManager with mocked dependencies
        connectionManager = new ConnectionManager(mockMessageRouter, mockServiceRegistry, mockMonitorManager);
    });

    afterEach(() => {
        // Clean up connections after each test
        connectionManager.closeAllConnections();
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

            // Verify connection count metric was incremented
            expect(mockMetric.slot.add).toHaveBeenCalledWith(1);

            // Verify successful connection was logged
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Added connection for service test-uuid')
            );
        });

        /**
         * Verifies proper error handling when connection registration fails:
         * - Error propagation
         * - Metric updates
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

            // Verify failure metric was incremented
            expect(mockMetric.slot.add).toHaveBeenCalledWith(1);

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
         * - Metric updates
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

            // Verify connection count metric was decremented
            expect(mockMetric.slot.add).toHaveBeenCalledWith(-1);

            // Verify removal was logged
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining(`Removed connection for service ${serviceId}`)
            );
        });

        /**
         * Verifies graceful handling of removal requests for non-existent connections
         */
        it('should handle non-existent connection gracefully', () => {
            connectionManager.removeConnection('non-existent');

            // Verify no service deregistration was attempted
            expect(mockServiceRegistry.unregisterService).not.toHaveBeenCalled();

            // Verify no metric updates were made
            expect(mockMetric.slot.add).not.toHaveBeenCalled();
        });
    });

    /**
     * Tests for the sendMessage method.
     * Verifies message sending functionality and error handling.
     */
    describe('sendMessage', () => {
        /**
         * Verifies successful message sending to a connected service
         */
        it('should send message to connected service', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);
            const serviceId = mockConnection.serviceId;

            // Create test message
            const validHeader: Header = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0'
            };
            const validPayload = { data: 'test' };

            // Send message
            connectionManager.sendMessage(serviceId, validHeader, validPayload);

            // Verify message was sent with correct format
            expect(mockConnection.send).toHaveBeenCalledWith(
                'publish:test.topic:1.0.0\n{"data":"test"}'
            );

            // Verify send was logged
            expect(logger.info).toHaveBeenCalledWith(
                `Sent message to service ${serviceId}`
            );
        });

        /**
         * Verifies that empty payload is handled correctly
         */
        it('should send message with default empty payload when no payload provided', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);
            const serviceId = mockConnection.serviceId;

            // Create test message with only header
            const validHeader: Header = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0'
            };

            // Send message without payload
            connectionManager.sendMessage(serviceId, validHeader);

            // Verify message was sent with empty payload
            expect(mockConnection.send).toHaveBeenCalledWith(
                'publish:test.topic:1.0.0\n{}'
            );

            // Verify send was logged
            expect(logger.info).toHaveBeenCalledWith(
                `Sent message to service ${serviceId}`
            );
        });

        /**
         * Verifies proper handling of send attempts to non-existent connections
         */
        it('should handle non-existent connection', () => {
            const nonExistentServiceId = 'non-existent';
            const validHeader: Header = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0'
            };
            const validPayload = { data: 'test' };

            // Attempt to send to non-existent service
            connectionManager.sendMessage(nonExistentServiceId, validHeader, validPayload);

            // Verify warning was logged
            expect(logger.warn).toHaveBeenCalledWith(
                `Unable to send message to service ${nonExistentServiceId}: connection not found`
            );
        });

        /**
         * Verifies proper handling of send attempts to closed connections
         */
        it('should handle closed connection', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);
            const serviceId = mockConnection.serviceId;

            // Create closed connection state
            const closedConnection = {
                ...mockConnection,
                state: ConnectionState.CLOSED,
                close: jest.fn()
            } as any;

            // Replace with closed connection
            (connectionManager as any).connections.set(serviceId, closedConnection);

            // Create test message
            const validHeader: Header = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0'
            };
            const validPayload = { data: 'test' };

            // Verify sending throws appropriate error
            expect(() => {
                connectionManager.sendMessage(serviceId, validHeader, validPayload);
            }).toThrow('Desired service connection is not open');

            // Verify connection was removed
            expect(connectionManager.hasConnection(serviceId)).toBe(false);

            // Verify warning was logged
            expect(logger.warn).toHaveBeenCalledWith(
                `Unable to send message to service ${serviceId}: Connection is not open`
            );

            // Verify connection was properly closed
            expect(closedConnection.close).toHaveBeenCalled();
        });
    });

    /**
     * Tests for the handleMessage method.
     * Verifies message parsing, routing, and error handling.
     */
    describe('handleMessage', () => {
        /**
         * Verifies successful handling of valid messages
         */
        it('should handle valid message correctly', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);

            // Get message handler function
            const messageHandler = mockConnection.onMessage.mock.calls[0][0];

            // Create valid test message
            const validMessage = 'publish:test.topic:1.0.0\n{"data":"test"}';

            // Process message
            messageHandler(validMessage);

            // Verify message was routed correctly
            expect(mockMessageRouter.routeMessage).toHaveBeenCalledWith(
                mockConnection.serviceId,
                {
                    header: {
                        action: ActionType.PUBLISH,
                        topic: 'test.topic',
                        version: '1.0.0'
                    },
                    payload: { data: 'test' }
                }
            );

            // Verify message receipt was logged
            expect(logger.info).toHaveBeenCalledWith(
                `Received message from service ${mockConnection.serviceId} (IP ${mockConnection.ip})`
            );
        });

        /**
         * Verifies proper handling of messages with malformed headers
         */
        it('should handle malformed message header', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);

            // Get message handler function
            const messageHandler = mockConnection.onMessage.mock.calls[0][0];

            // Create invalid message
            const invalidMessage = 'invalid:message';

            // Process invalid message
            messageHandler(invalidMessage);

            // Verify error response was sent
            const expectedErrorResponse = 'response:error:1.0.0\n{"error":{"code":"MALFORMED_MESSAGE","message":"Invalid message format: no newline separator found","timestamp":';
            expect(mockConnection.send).toHaveBeenCalledWith(
                expect.stringMatching(new RegExp(`^${expectedErrorResponse}`))
            );

            // Verify error was logged
            expect(logger.error).toHaveBeenCalledWith('[MALFORMED_MESSAGE] Invalid message format: no newline separator found', undefined);
        });

        /**
         * Verifies proper handling of messages with malformed payloads
         */
        it('should handle malformed message payload', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);

            // Get message handler function
            const messageHandler = mockConnection.onMessage.mock.calls[0][0];

            // Create message with invalid JSON payload
            const messageWithInvalidPayload = 'publish:test.topic:1.0.0\n{invalid:json}';

            // Process message
            messageHandler(messageWithInvalidPayload);

            // Verify error response was sent
            expect(mockConnection.send).toHaveBeenCalledWith(
                expect.stringContaining('response:test.topic:1.0.0\n{"error":{"code":"MALFORMED_MESSAGE","message":"Invalid JSON payload"')
            );

            // Verify error was logged
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringMatching(/\[MALFORMED_MESSAGE\].*Invalid JSON payload/),
                expect.any(Object)
            );
        });

        /**
         * Verifies proper handling of non-MessageError errors during message processing
         */
        it('should handle non-MessageError errors', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);

            // Get message handler function
            const messageHandler = mockConnection.onMessage.mock.calls[0][0];

            // Simulate unexpected error during routing
            mockMessageRouter.routeMessage.mockImplementationOnce(() => {
                throw new Error('Some unexpected error');
            });

            // Create valid message that will trigger the error
            const validMessage = 'publish:test.topic:1.0.0\n{"data":"test"}';

            // Process message
            messageHandler(validMessage);

            // Verify error was logged
            expect(logger.error).toHaveBeenCalledWith(
                'An unexpected error while routing the message:',
                expect.any(Error)
            );

            // Verify error response was sent
            expect(mockConnection.send).toHaveBeenCalledWith(
                expect.stringContaining('response:test.topic:1.0.0\n{"error":{"code":"INTERNAL_ERROR","message":"An unexpected error while routing the message"')
            );
        });

        /**
         * Verifies proper handling of unexpected errors during header parsing
         */
        it('should handle unexpected error during header parsing', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);

            // Get message handler function
            const messageHandler = mockConnection.onMessage.mock.calls[0][0];

            // Create test message
            const message = 'publish:test.topic:1.0.0\n{"data":"test"}';

            // Simulate parser error
            jest.spyOn(MessageUtils.Parser.prototype, 'parseHeader').mockImplementationOnce(() => {
                throw new Error('Unexpected error during header parsing');
            });

            // Process message
            messageHandler(message);

            // Verify error response was sent
            const expectedErrorResponse = 'response:error:1.0.0\n{"error":{"code":"MALFORMED_MESSAGE","message":"Unexpected error while parsing message header"';
            expect(mockConnection.send).toHaveBeenCalledWith(
                expect.stringMatching(new RegExp(`^${expectedErrorResponse}`))
            );

            // Verify error was logged
            expect(logger.error).toHaveBeenCalledWith(
                'Unexpected error while parsing message header:',
                expect.any(Error)
            );
        });

        /**
         * Verifies proper handling of unexpected errors during payload parsing
         */
        it('should handle unexpected error during payload parsing', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);

            // Get message handler function
            const messageHandler = mockConnection.onMessage.mock.calls[0][0];

            // Create test message
            const message = 'publish:test.topic:1.0.0\n{"data":"test"}';

            // Mock parser behavior
            jest.spyOn(MessageUtils.Parser.prototype, 'parseHeader').mockImplementationOnce(() => ({
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0'
            }));
            jest.spyOn(MessageUtils.Parser.prototype, 'parsePayload').mockImplementationOnce(() => {
                throw new Error('Unexpected error during payload parsing');
            });

            // Process message
            messageHandler(message);

            // Verify error response was sent
            const expectedErrorResponse = 'response:test.topic:1.0.0\n{"error":{"code":"MALFORMED_MESSAGE","message":"Unexpected error while parsing message payload"';
            expect(mockConnection.send).toHaveBeenCalledWith(
                expect.stringMatching(new RegExp(`^${expectedErrorResponse}`))
            );

            // Verify error was logged
            expect(logger.error).toHaveBeenCalledWith(
                'Unexpected error while parsing message payload:',
                expect.any(Error)
            );
        });
    });

    /**
     * Tests for connection management utility methods.
     * Verifies connection tracking and bulk operations.
     */
    describe('connection management methods', () => {
        /**
         * Verifies connection existence checking
         */
        it('should check for existing connection', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);
            const serviceId = mockConnection.serviceId;

            // Verify connection lookup
            expect(connectionManager.hasConnection(serviceId)).toBe(true);
            expect(connectionManager.hasConnection('non-existent')).toBe(false);
        });

        /**
         * Verifies connection retrieval by service ID
         */
        it('should get connection by service ID', () => {
            // Set up test connection
            connectionManager.addConnection(mockConnection);
            const serviceId = mockConnection.serviceId;

            // Verify connection retrieval
            expect(connectionManager.getConnection(serviceId)).toBe(mockConnection);
            expect(connectionManager.getConnection('non-existent')).toBeUndefined();
        });

        /**
         * Verifies connection count tracking
         */
        it('should get connection count', () => {
            // Verify initial empty state
            expect(connectionManager.getConnectionCount()).toBe(0);

            // Add connection and verify count
            connectionManager.addConnection(mockConnection);
            expect(connectionManager.getConnectionCount()).toBe(1);

            // Remove connection and verify count
            connectionManager.removeConnection(mockConnection.serviceId);
            expect(connectionManager.getConnectionCount()).toBe(0);
        });

        /**
         * Verifies bulk connection closure
         */
        it('should close all connections', async () => {
            // Set up multiple test connections
            const mockConnection2 = { ...mockConnection };
            connectionManager.addConnection(mockConnection);
            connectionManager.addConnection(mockConnection2);

            // Close all connections
            await connectionManager.closeAllConnections();

            // Verify connections were closed
            expect(mockConnection.close).toHaveBeenCalled();
            expect(connectionManager.getConnectionCount()).toBe(0);

            // Verify operation was logged
            expect(logger.info).toHaveBeenCalledWith('Closed all connections');
        });
    });
});