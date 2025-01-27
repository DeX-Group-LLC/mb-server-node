/**
 * @file Test suite for TCPSocketConnection class
 * @description Tests the TCP socket connection implementation, including:
 * - Connection state management (OPEN/CLOSED)
 * - Message framing and handling
 * - Message size validation
 * - Connection lifecycle (open/close)
 * - Error handling and cleanup
 * - Event listener management
 * - TLS/SSL support
 * @module test/unit/core/connection/protocols/tcpsocket
 */

import { jest } from '@jest/globals';
import { Socket } from 'net';
import { EventEmitter } from 'events';
import { config } from '@config';
import { TCPSocketConnection } from '@core/connection/protocols/tcpsocket';
import { ConnectionState, Connection } from '@core/connection/types';
import logger from '@utils/logger';
import { MAX_HEADER_LENGTH } from '@core/utils/message';
import * as net from 'net';
import * as tls from 'tls';
import * as fs from 'fs';
import { createTcpServer } from '@core/connection/protocols/tcpsocket';

// Mock external modules
jest.mock('@config', () => {
    const mockConfig = {
        message: {
            payload: {
                maxLength: 32 * 1024 // 32KB max message size
            }
        },
        ports: {
            tcp: 8080
        },
        allowUnsecure: true,
        host: 'localhost',
        connection: {
            heartbeatDeregisterTimeout: 30000
        },
        ssl: undefined
    };
    return { config: mockConfig };
});

jest.mock('@core/utils/message', () => ({
    MAX_HEADER_LENGTH: 512
}));

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

// Mock net and tls modules
jest.mock('net', () => {
    const mockServer = {
        on: jest.fn().mockReturnThis(),
        listen: jest.fn().mockImplementation(function(this: any, ...args: any[]) {
            const callback = args[2];
            if (callback && typeof callback === 'function') {
                callback();
            }
            return this;
        })
    };
    return {
        createServer: jest.fn().mockReturnValue(mockServer),
        Socket: jest.fn()
    };
});

jest.mock('tls', () => {
    const mockTlsServer = {
        on: jest.fn().mockReturnThis(),
        listen: jest.fn().mockImplementation(function(this: any, ...args: any[]) {
            const callback = args[2];
            if (callback && typeof callback === 'function') {
                callback();
            }
            return this;
        })
    };
    return {
        createServer: jest.fn().mockReturnValue(mockTlsServer),
        TLSSocket: jest.fn(),
        DEFAULT_MIN_VERSION: 'TLSv1.2'
    };
});

// Mock fs module
jest.mock('fs', () => ({
    readFileSync: jest.fn().mockReturnValue('mock-content')
}));

/**
 * Mock Socket class that extends EventEmitter
 * @class MockSocket
 * @extends {EventEmitter}
 * @description Used to simulate TCP socket behavior in tests:
 * - Implements basic socket operations (write, end)
 * - Provides event emission capabilities
 * - Tracks remote address information
 * - Simulates network operations
 */
class MockSocket extends EventEmitter {
    write = jest.fn();
    end = jest.fn();
    remoteAddress = '127.0.0.1';
}

/**
 * Test suite for TCPSocketConnection class
 * @group unit
 * @group connection
 * @group protocols
 * @description Tests the core functionality of TCP socket connections:
 * - Connection initialization and setup
 * - State management and transitions
 * - Message framing and transmission
 * - Error handling and recovery
 * - Resource cleanup
 */
describe('TCPSocketConnection', () => {
    let socket: MockSocket;
    let connection: TCPSocketConnection;

    /**
     * Setup function run before each test
     * Creates new socket and connection instances with default test configuration
     */
    beforeEach(() => {
        socket = new MockSocket();
        connection = new TCPSocketConnection(socket as unknown as Socket, socket.remoteAddress);
        connection.serviceId = 'test-service';
    });

    /**
     * Cleanup function run after each test
     * Resets all mocks to ensure test isolation
     */
    afterEach(() => {
        jest.clearAllMocks();
    });

    /**
     * Tests for connection constructor and initialization
     * @group initialization
     * @description Verifies proper connection setup:
     * - IP address assignment
     * - Initial state configuration
     * - Event handler registration
     */
    describe('constructor', () => {
        /**
         * @test Verifies initial connection state and IP address assignment
         * @expected IP should be '127.0.0.1' and state should be OPEN
         */
        it('should initialize with correct IP and open state', () => {
            expect(connection.ip).toBe('127.0.0.1');
            expect(connection.state).toBe(ConnectionState.OPEN);
        });
    });

    /**
     * Tests for connection state management
     * @group state
     * @description Verifies state transitions:
     * - Initial OPEN state
     * - Transition to CLOSED state
     * - State consistency
     */
    describe('state', () => {
        /**
         * @test Verifies initial connection state after construction
         * @expected Connection state should be OPEN
         */
        it('should return OPEN when connected', () => {
            expect(connection.state).toBe(ConnectionState.OPEN);
        });

        /**
         * Tests that connection reports CLOSED state after close event
         * Verifies state transition on socket close
         */
        it('should return CLOSED after close event', () => {
            socket.emit('close');
            expect(connection.state).toBe(ConnectionState.CLOSED);
        });
    });

    /**
     * Tests for message handling functionality
     * @group messaging
     * @description Verifies message processing:
     * - Message framing and reassembly
     * - Fragmented message handling
     * - Multiple message processing
     * - Size limit enforcement
     */
    describe('onMessage', () => {
        /**
         * @test Verifies message reception and listener notification
         * @expected Listener should be called with the message content
         */
        it('should call listener when data is received', () => {
            const listener = jest.fn();
            connection.onMessage(listener);

            // Create a test message with length prefix
            const testData = Buffer.from('test message');
            const lengthBuffer = Buffer.alloc(4);
            lengthBuffer.writeUInt32BE(testData.length);
            const message = Buffer.concat([lengthBuffer, testData]);

            // Emit the framed data
            socket.emit('data', message);

            // Listener should receive just the message part, not the length prefix
            expect(listener).toHaveBeenCalledWith(testData);
        });

        /**
         * @test Verifies handling of fragmented message data
         * @expected Message should be reassembled and listener called once with complete message
         */
        it('should handle fragmented messages correctly', () => {
            const listener = jest.fn();
            connection.onMessage(listener);

            // Create a test message with length prefix
            const testData = Buffer.from('test message');
            const lengthBuffer = Buffer.alloc(4);
            lengthBuffer.writeUInt32BE(testData.length);
            const message = Buffer.concat([lengthBuffer, testData]);

            // Split the message into fragments
            const fragment1 = message.subarray(0, 6); // Part of length + start of message
            const fragment2 = message.subarray(6);    // Rest of the message

            // Emit fragments
            socket.emit('data', fragment1);
            socket.emit('data', fragment2);

            // Listener should receive the complete message
            expect(listener).toHaveBeenCalledWith(testData);
        });

        /**
         * Tests that connection handles partial length frame correctly
         * Verifies handling of split length prefix
         */
        it('should handle partial length frame correctly', () => {
            const listener = jest.fn();
            connection.onMessage(listener);

            // Create a test message with length prefix
            const testData = Buffer.from('test message');
            const lengthBuffer = Buffer.alloc(4);
            lengthBuffer.writeUInt32BE(testData.length);
            const message = Buffer.concat([lengthBuffer, testData]);

            // Split the length buffer itself into fragments
            const lengthFragment1 = message.subarray(0, 2);  // First half of length
            const lengthFragment2 = message.subarray(2, 4);  // Second half of length
            const dataFragment = message.subarray(4);        // The actual message

            // Emit fragments
            socket.emit('data', lengthFragment1);
            socket.emit('data', lengthFragment2);
            socket.emit('data', dataFragment);

            // Listener should receive the complete message
            expect(listener).toHaveBeenCalledWith(testData);
        });

        /**
         * Tests that connection handles multiple complete messages in one chunk
         * Verifies message boundary detection and separation
         */
        it('should handle multiple complete messages in one chunk', () => {
            const listener = jest.fn();
            connection.onMessage(listener);

            // Create two test messages
            const testData1 = Buffer.from('first message');
            const testData2 = Buffer.from('second message');

            const lengthBuffer1 = Buffer.alloc(4);
            const lengthBuffer2 = Buffer.alloc(4);

            lengthBuffer1.writeUInt32BE(testData1.length);
            lengthBuffer2.writeUInt32BE(testData2.length);

            const message = Buffer.concat([
                lengthBuffer1, testData1,
                lengthBuffer2, testData2
            ]);

            // Emit both messages at once
            socket.emit('data', message);

            // Listener should receive both messages
            expect(listener).toHaveBeenCalledWith(testData1);
            expect(listener).toHaveBeenCalledWith(testData2);
            expect(listener).toHaveBeenCalledTimes(2);
        });

        /**
         * @test Verifies behavior when no message listener is registered
         * @expected Should not throw error when processing message
         */
        it('should not call listener if none is registered', () => {
            const testData = Buffer.from('test message');
            const lengthBuffer = Buffer.alloc(4);
            lengthBuffer.writeUInt32BE(testData.length);

            expect(() => {
                socket.emit('data', Buffer.concat([lengthBuffer, testData]));
            }).not.toThrow();
        });

        /**
         * @test Verifies message size limit enforcement
         * @expected Should close connection and log error when message exceeds size limit
         */
        it('should close connection when message length exceeds maximum', () => {
            // Register a message listener to ensure it's not called
            const messageListener = jest.fn();
            connection.onMessage(messageListener);

            // Create a length frame that exceeds max length
            const lengthBuffer = Buffer.alloc(4);
            lengthBuffer.writeUInt32BE(config.message.payload.maxLength + MAX_HEADER_LENGTH + 1); // Just over the limit
            socket.emit('data', lengthBuffer);

            // Should log error and close connection
            const mockLogger = require('@utils/logger').SetupLogger();
            expect(mockLogger.error).toHaveBeenCalledWith(
                `Received message with length ${config.message.payload.maxLength + MAX_HEADER_LENGTH + 1} which exceeds the maximum allowed size of ${config.message.payload.maxLength}`
            );
            expect(socket.end).toHaveBeenCalled();
            expect(messageListener).not.toHaveBeenCalled();
        });
    });

    /**
     * Tests for connection closure handling
     * @group closure
     * @description Verifies connection termination:
     * - Clean shutdown
     * - Event propagation
     * - Resource cleanup
     */
    describe('onClose', () => {
        /**
         * @test Verifies close event propagation to listener
         * @expected Close listener should be called when connection closes
         */
        it('should call listener when connection closes', () => {
            const listener = jest.fn();
            connection.onClose(listener);
            socket.emit('close');
            expect(listener).toHaveBeenCalled();
        });

        /**
         * @test Verifies behavior when no close listener is registered
         * @expected Should not throw error when connection closes
         */
        it('should not call listener if none is registered', () => {
            expect(() => {
                socket.emit('close');
            }).not.toThrow();
        });
    });

    /**
     * Tests for message sending functionality
     * @group messaging
     * @description Verifies outbound message handling:
     * - Message framing
     * - State validation
     * - Error handling
     */
    describe('send', () => {
        /**
         * @test Verifies message framing and transmission
         * @expected Message should be properly framed and written to socket
         */
        it('should write framed message to socket when connection is open', () => {
            const message = 'test message';
            const messageBuffer = Buffer.from(message);
            const lengthBuffer = Buffer.alloc(4);
            lengthBuffer.writeUInt32BE(messageBuffer.length);

            connection.send(message);

            expect(socket.write).toHaveBeenCalledWith(
                Buffer.concat([lengthBuffer, messageBuffer])
            );
        });

        /**
         * @test Verifies error handling when sending to closed connection
         * @expected Should throw error with appropriate message
         */
        it('should throw error when trying to send message on closed connection', () => {
            socket.emit('close');
            expect(() => {
                connection.send('test message');
            }).toThrow('Desired service connection is not open');
        });
    });

    /**
     * Tests for connection closure functionality
     * @group closure
     * @description Verifies connection closure operations:
     * - Socket termination
     * - Event notification
     * - State updates
     */
    describe('close', () => {
        /**
         * @test Verifies connection closure with listener
         * @expected Socket should end, listener called, and state updated
         */
        it('should end socket and call close listener when connection is open', () => {
            const closeListener = jest.fn();
            connection.onClose(closeListener);
            connection.close();
            expect(socket.end).toHaveBeenCalled();
            expect(closeListener).toHaveBeenCalled();
            expect(connection.state).toBe(ConnectionState.CLOSED);
        });

        /**
         * @test Verifies connection closure without listener
         * @expected Socket should end and state updated without error
         */
        it('should end socket without error when no close listener is set', () => {
            connection.close();
            expect(socket.end).toHaveBeenCalled();
            expect(connection.state).toBe(ConnectionState.CLOSED);
        });

        /**
         * @test Verifies closure of already closed connection
         * @expected Should not attempt to end socket again
         */
        it('should not end socket when connection is already closed', () => {
            socket.emit('close');
            connection.close();
            expect(socket.end).not.toHaveBeenCalled();
        });
    });

    /**
     * Tests for error handling functionality
     * @group errors
     * @description Verifies error management:
     * - Socket error handling
     * - Connection state updates
     * - Resource cleanup
     */
    describe('error handling', () => {
        /**
         * @test Verifies connection state after socket error
         * @expected Connection should transition to CLOSED state
         */
        it('should close connection on socket error', () => {
            socket.emit('error', new Error('test error'));
            expect(connection.state).toBe(ConnectionState.CLOSED);
        });
    });
});

/**
 * Test suite for TCP server creation and management
 * @group unit
 * @group connection
 * @group protocols
 * @description Tests TCP server functionality:
 * - Server creation and configuration
 * - Connection acceptance and handling
 * - TLS/SSL support
 * - Error management
 */
describe('createTcpServer', () => {
    let mockConnectionManager: any;
    let mockServer: jest.Mocked<net.Server>;
    let mockTlsServer: jest.Mocked<tls.Server>;
    let mockSocket: jest.Mocked<net.Socket>;
    let mockTlsSocket: jest.Mocked<tls.TLSSocket>;

    /**
     * Helper function to safely get event handler
     * @template T - The type of the event handler
     * @param {[string, any][]} calls - Array of event registration calls
     * @param {string} eventName - Name of the event to find handler for
     * @returns {T | undefined} The event handler if found
     */
    function getEventHandler<T>(calls: [string, any][], eventName: string): T | undefined {
        const call = calls.find(([event]) => event === eventName);
        return call?.[1] as T;
    }

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Create a mock socket that extends EventEmitter for proper event handling
        const socket = new EventEmitter();
        mockSocket = Object.assign(socket, {
            remoteAddress: '127.0.0.1',
            setTimeout: jest.fn(),
            end: jest.fn(),
            destroy: jest.fn(),
            on: jest.spyOn(socket, 'on')
        }) as unknown as jest.Mocked<net.Socket>;

        // Mock the TLS socket
        mockTlsSocket = {
            remoteAddress: '127.0.0.1',
            destroy: jest.fn()
        } as unknown as jest.Mocked<tls.TLSSocket>;

        // Get the mocked servers from the mocked modules
        mockServer = require('net').createServer() as jest.Mocked<net.Server>;
        mockTlsServer = require('tls').createServer() as jest.Mocked<tls.Server>;

        // Mock connection manager
        mockConnectionManager = {
            addConnection: jest.fn(),
            removeConnection: jest.fn(),
            handleMessage: jest.fn(),
            handleClose: jest.fn(),
            dispose: jest.fn(),
            _resolveConnection: jest.fn(),
            sendMessage: jest.fn(),
            hasConnection: jest.fn(),
            getConnection: jest.fn(),
            getConnections: jest.fn(),
            getConnectionCount: jest.fn()
        };
    });

    /**
     * Tests for non-TLS server configuration
     * @description Verifies plain TCP server:
     * - Server creation
     * - Connection handling
     * - Timeout management
     * - Error scenarios
     */
    describe('non-TLS server', () => {
        beforeEach(() => {
            // Reset SSL settings and mocks
            const { config } = require('@config');
            config.ssl = undefined;
            jest.clearAllMocks();

            mockSocket.on.mockReset();
        });

        /**
         * @test Verifies TCP server creation without TLS
         * @expected Should create plain TCP server without TLS configuration when allowUnsecure is true
         */
        it('should create a TCP server without TLS', () => {
            // Configure allowUnsecure
            const { config } = require('@config');
            config.allowUnsecure = true;

            const servers = createTcpServer(mockConnectionManager);

            expect(net.createServer).toHaveBeenCalled();
            expect(tls.createServer).not.toHaveBeenCalled();
            expect(servers).toHaveLength(1);
            expect(servers[0]).toBe(mockServer);
        });

        /**
         * @test Verifies handling of incoming TCP connections
         * @expected Should add connection and set appropriate timeouts
         */
        it('should handle incoming connections', () => {
            // Configure allowUnsecure
            const { config } = require('@config');
            config.allowUnsecure = true;

            createTcpServer(mockConnectionManager);

            // Get and call the connection handler
            const connectionHandler = getEventHandler<(socket: net.Socket) => void>(
                mockServer.on.mock.calls,
                'connection'
            );
            expect(connectionHandler).toBeDefined();
            if (connectionHandler) {
                connectionHandler(mockSocket);
            }

            expect(mockConnectionManager.addConnection).toHaveBeenCalled();
            expect(mockSocket.setTimeout).toHaveBeenCalledWith(31000);
            expect(mockSocket.on).toHaveBeenCalledWith('timeout', expect.any(Function));
            expect(logger.info).toHaveBeenCalledWith('Client connected (TCP) from IP 127.0.0.1');
        });

        it('should handle socket errors', () => {
            createTcpServer(mockConnectionManager);

            // Get and call the connection handler
            const connectionHandler = getEventHandler<(socket: net.Socket) => void>(
                mockServer.on.mock.calls,
                'connection'
            );
            expect(connectionHandler).toBeDefined();
            if (connectionHandler) {
                // Mock addConnection to set the serviceId on the connection it receives
                mockConnectionManager.addConnection.mockImplementation((conn: Connection) => {
                    conn.serviceId = 'test-service';
                    return conn;
                });

                // Now trigger the connection - this creates the connection and sets up the error handler
                connectionHandler(mockSocket);

                // Get both error handlers that were registered
                const errorHandlers = mockSocket.on.mock.calls
                    .filter(([event]: [string, any]) => event === 'error')
                    .map(([_, handler]: [string, (err: Error) => void]) => handler);

                expect(errorHandlers).toHaveLength(2); // Should have both TCPSocketConnection and server error handlers

                // Clear any previous calls
                mockConnectionManager.removeConnection.mockClear();
                (logger.error as jest.Mock).mockClear();

                // Trigger both error handlers
                const error = new Error('test error');
                errorHandlers.forEach(handler => handler(error));

                // Verify both handlers worked
                expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith('test-service');
                expect(logger.error).toHaveBeenCalledWith(
                    expect.stringContaining('TCP error from service test-service'),
                    expect.objectContaining({
                        serviceId: 'test-service',
                        error
                    })
                );
            }
        });

        /**
         * @test Verifies socket timeout handling
         * @expected Should end socket when timeout occurs
         */
        it('should handle socket timeout', () => {
            createTcpServer(mockConnectionManager);

            // Get and call the connection handler
            const connectionHandler = getEventHandler<(socket: net.Socket) => void>(
                mockServer.on.mock.calls,
                'connection'
            );
            expect(connectionHandler).toBeDefined();
            if (connectionHandler) {
                connectionHandler(mockSocket);
            }

            // Get and call the timeout handler
            const timeoutHandler = getEventHandler<() => void>(
                mockSocket.on.mock.calls,
                'timeout'
            );
            expect(timeoutHandler).toBeDefined();
            if (timeoutHandler) {
                timeoutHandler();
            }

            expect(mockSocket.end).toHaveBeenCalled();
        });

        /**
         * @test Verifies handling of connections with undefined remote address
         * @expected Should handle connection with 'unknown' IP address
         */
        it('should handle incoming connections with undefined remote address', () => {
            createTcpServer(mockConnectionManager);

            // Get and call the connection handler
            const connectionHandler = getEventHandler<(socket: net.Socket) => void>(
                mockServer.on.mock.calls,
                'connection'
            );
            expect(connectionHandler).toBeDefined();
            if (connectionHandler) {
                // Create a socket with undefined remoteAddress
                const socketWithoutAddress = {
                    ...mockSocket,
                    remoteAddress: undefined,
                    on: jest.fn().mockReturnThis(),
                    setTimeout: jest.fn()
                } as unknown as net.Socket;

                // Trigger connection
                connectionHandler(socketWithoutAddress);

                // Verify connection setup with 'unknown' IP
                expect(mockConnectionManager.addConnection).toHaveBeenCalledWith(
                    expect.objectContaining({
                        ip: 'unknown'
                    })
                );
                expect(logger.info).toHaveBeenCalledWith('Client connected (TCP) from IP unknown');
            }
        });
    });

    /**
     * Tests for TLS server configuration
     * @description Verifies TLS-enabled server:
     * - Secure server creation
     * - Certificate handling
     * - TLS handshake
     * - Secure connection management
     */
    describe('TLS server', () => {
        beforeEach(() => {
            const { config } = require('@config');
            Object.assign(config, {
                ssl: {
                    key: 'key.pem',
                    cert: 'cert.pem'
                },
                allowUnsecure: false
            });
            jest.clearAllMocks();
        });

        afterEach(() => {
            const { config } = require('@config');
            config.ssl = undefined;
            config.allowUnsecure = false;
        });

        /**
         * @test Verifies TLS server creation with SSL configuration
         * @expected Should create TLS server with proper SSL settings
         */
        it('should create a TLS server when SSL is configured', () => {
            const servers = createTcpServer(mockConnectionManager);

            expect(tls.createServer).toHaveBeenCalledWith({
                key: 'mock-content',
                cert: 'mock-content',
                handshakeTimeout: 5000,
                minVersion: 'TLSv1.2'
            });
            expect(net.createServer).not.toHaveBeenCalled();
            expect(servers).toHaveLength(1);
            expect(servers[0]).toBe(mockTlsServer);
        });

        /**
         * @test Verifies TLS error handling for undefined remote addresses
         * @expected Should handle and log TLS errors appropriately
         */
        it('should handle TLS client errors with undefined remote address', () => {
            createTcpServer(mockConnectionManager);

            // Get and call the TLS error handler
            const tlsErrorHandler = getEventHandler<(err: Error, tlsSocket: tls.TLSSocket) => void>(
                mockTlsServer.on.mock.calls,
                'tlsClientError'
            );
            expect(tlsErrorHandler).toBeDefined();
            if (tlsErrorHandler) {
                // Create a TLS socket with undefined remoteAddress
                const socketWithoutAddress = {
                    remoteAddress: undefined,
                    destroy: jest.fn()
                } as unknown as tls.TLSSocket;

                // Test ECONNRESET error
                const econnresetError = new Error('test error');
                (econnresetError as any).code = 'ECONNRESET';
                tlsErrorHandler(econnresetError, socketWithoutAddress);
                expect(logger.debug).toHaveBeenCalledWith('TLS handshake aborted by client (IP unknown)');
                expect(socketWithoutAddress.destroy).toHaveBeenCalled();

                // Test other TLS errors
                tlsErrorHandler(new Error('other error'), socketWithoutAddress);
                expect(logger.error).toHaveBeenCalledWith(
                    'TLS error with client (IP unknown):',
                    expect.any(Error)
                );
                expect(socketWithoutAddress.destroy).toHaveBeenCalledTimes(2);
            }
        });

        /**
         * @test Verifies handling of secure connections
         * @expected Should properly handle TLS connections and their errors
         */
        it('should handle secure connections', () => {
            // Configure SSL
            const { config } = require('@config');
            config.ssl = {
                key: 'key.pem',
                cert: 'cert.pem'
            };
            config.allowUnsecure = false;

            // Create a mock socket that extends EventEmitter for proper event handling
            const secureSocket = {
                remoteAddress: '127.0.0.1',
                setTimeout: jest.fn(),
                end: jest.fn(),
                destroy: jest.fn(),
                on: jest.fn().mockReturnThis(),
                write: jest.fn(),
                connect: jest.fn(),
                setEncoding: jest.fn(),
                // Add other required Socket properties as needed
            } as unknown as net.Socket;

            createTcpServer(mockConnectionManager);

            // Get and call the secure connection handler
            const connectionHandler = getEventHandler<(socket: net.Socket) => void>(
                mockTlsServer.on.mock.calls,
                'secureConnection'
            );
            expect(connectionHandler).toBeDefined();
            if (connectionHandler) {
                // Mock addConnection to set the serviceId
                mockConnectionManager.addConnection.mockImplementation((conn: Connection) => {
                    conn.serviceId = 'test-service';
                    return conn;
                });

                // Trigger secure connection
                connectionHandler(secureSocket);

                // Verify connection setup
                expect(mockConnectionManager.addConnection).toHaveBeenCalled();
                expect(secureSocket.setTimeout).toHaveBeenCalledWith(31000);
                expect(secureSocket.on).toHaveBeenCalledWith('timeout', expect.any(Function));
                expect(logger.info).toHaveBeenCalledWith('Client connected (TCP/TLS) from IP 127.0.0.1');

                // Get and trigger the error handler
                const onCalls = (secureSocket.on as jest.Mock).mock.calls as [string, (...args: any[]) => void][];
                const errorHandlers = onCalls
                    .filter(([event]) => event === 'error')
                    .map(([_, handler]) => handler);
                expect(errorHandlers).toHaveLength(2); // Should have both TCPSocketConnection and server error handlers

                // Test error handling
                const error = new Error('secure connection error');
                errorHandlers.forEach(handler => handler(error));

                // Verify error was handled correctly - should be called twice
                expect(logger.error).toHaveBeenCalledWith(
                    'Socket error from service test-service (IP 127.0.0.1):',
                    {
                        serviceId: 'test-service',
                        error
                    }
                );
                expect(logger.error).toHaveBeenCalledWith(
                    'TCP/TLS error from service test-service (IP 127.0.0.1):',
                    {
                        serviceId: 'test-service',
                        error
                    }
                );
                expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith('test-service');

                // Get and test timeout handler
                const timeoutHandler = onCalls.find(([event]) => event === 'timeout')?.[1];
                expect(timeoutHandler).toBeDefined();

                timeoutHandler!();
                expect(secureSocket.end).toHaveBeenCalled();
            }
        });
    });

    /**
     * Tests for server error handling
     * @description Verifies server-level errors:
     * - Error event handling
     * - Logging behavior
     * - Server stability
     */
    describe('server error handling', () => {
        /**
         * @test Verifies server-level error handling for both TLS and non-TLS servers
         * @expected Should log server errors appropriately with correct prefix
         */
        it('should handle server errors for both TLS and non-TLS servers', () => {
            // Test non-TLS server error
            const { config } = require('@config');
            config.allowUnsecure = true;
            config.ssl = undefined;

            createTcpServer(mockConnectionManager);

            // Get and call the error handler for non-TLS server
            const errorHandler = getEventHandler<(err: Error) => void>(
                mockServer.on.mock.calls,
                'error'
            );
            expect(errorHandler).toBeDefined();
            if (errorHandler) {
                errorHandler(new Error('server error'));
            }
            expect(logger.error).toHaveBeenCalledWith('TCP server error:', expect.any(Error));

            // Clear mocks for TLS test
            jest.clearAllMocks();

            // Test TLS server error
            config.ssl = {
                key: 'key.pem',
                cert: 'cert.pem'
            };
            config.allowUnsecure = false;

            createTcpServer(mockConnectionManager);

            // Get and call the error handler for TLS server
            const tlsErrorHandler = getEventHandler<(err: Error) => void>(
                mockTlsServer.on.mock.calls,
                'error'
            );
            expect(tlsErrorHandler).toBeDefined();
            if (tlsErrorHandler) {
                tlsErrorHandler(new Error('tls server error'));
            }
            expect(logger.error).toHaveBeenCalledWith('TCP/TLS server error:', expect.any(Error));
        });
    });

    /**
     * Tests for server listening functionality
     * @description Verifies server startup:
     * - Port binding
     * - Host configuration
     * - SSL/TLS setup
     */
    describe('server listening', () => {
        /**
         * @test Verifies server port and host configuration
         * @expected Should listen on configured port and host
         */
        it('should start listening on configured port and host', () => {
            // Configure allowUnsecure to ensure server creation succeeds
            const { config } = require('@config');
            config.allowUnsecure = true;

            createTcpServer(mockConnectionManager);

            expect(mockServer.listen).toHaveBeenCalledWith(
                config.ports.tcp,
                config.host,
                expect.any(Function)
            );
        });

        /**
         * @test Verifies server startup logging without SSL
         * @expected Should log appropriate startup message without SSL
         */
        it('should log appropriate message when server starts listening without SSL', () => {
            // Configure allowUnsecure
            const { config } = require('@config');
            config.allowUnsecure = true;
            config.ssl = undefined;

            createTcpServer(mockConnectionManager);

            expect(logger.info).toHaveBeenCalledWith(
                `Unsecure TCP server listening on ${config.host}:${config.ports.tcp}`
            );
        });

        /**
         * @test Verifies server startup logging with SSL
         * @expected Should log appropriate startup message with SSL enabled
         */
        it('should log appropriate message when server starts listening with SSL', () => {
            // Configure SSL
            const { config } = require('@config');
            config.ssl = {
                key: 'key.pem',
                cert: 'cert.pem'
            };
            config.allowUnsecure = false;

            createTcpServer(mockConnectionManager);

            expect(logger.info).toHaveBeenCalledWith(
                `Secure TCP server (TLS) listening on ${config.host}:${config.ports.tls}`
            );
        });
    });

    describe('server creation', () => {
        /**
         * @test Verifies error when no servers can be started
         * @expected Should throw error when neither SSL is configured nor unsecure is allowed
         */
        it('should throw error when no servers can be started', () => {
            // Configure to disallow both secure and unsecure
            const { config } = require('@config');
            config.ssl = undefined;
            config.allowUnsecure = false;

            expect(() => createTcpServer(mockConnectionManager))
                .toThrow('No TCP servers could be started. Check SSL configuration or enable unsecure TCP.');
        });
    });
});