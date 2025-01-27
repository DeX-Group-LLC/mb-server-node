/**
 * @file Test suite for TCPSocketConnection class
 * @description Tests the TCP socket connection implementation, including:
 * - Connection state management (OPEN/CLOSED)
 * - Message framing and handling
 * - Message size validation
 * - Connection lifecycle (open/close)
 * - Error handling and cleanup
 * - Event listener management
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
 * Used to simulate TCP socket behavior in tests
 * Provides basic socket functionality needed for testing
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
     */
    describe('constructor', () => {
        /**
         * Tests that connection is initialized with correct IP and state
         * Verifies basic connection setup functionality
         */
        it('should initialize with correct IP and open state', () => {
            expect(connection.ip).toBe('127.0.0.1');
            expect(connection.state).toBe(ConnectionState.OPEN);
        });
    });

    /**
     * Tests for connection state management
     * @group state
     */
    describe('state', () => {
        /**
         * Tests that connection reports OPEN state when connected
         * Verifies initial state after construction
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
     */
    describe('onMessage', () => {
        /**
         * Tests that message listener is called when data is received
         * Verifies basic message reception and framing
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
         * Tests that connection handles fragmented messages correctly
         * Verifies message reassembly from multiple data chunks
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
         * Tests that connection handles missing message listener gracefully
         * Verifies robustness when no listener is registered
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
         * Tests that connection enforces message size limits
         * Verifies message length validation and connection closure on violation
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
     */
    describe('onClose', () => {
        /**
         * Tests that close listener is called when connection closes
         * Verifies close event propagation
         */
        it('should call listener when connection closes', () => {
            const listener = jest.fn();
            connection.onClose(listener);
            socket.emit('close');
            expect(listener).toHaveBeenCalled();
        });

        /**
         * Tests that connection handles missing close listener gracefully
         * Verifies robustness when no listener is registered
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
     */
    describe('send', () => {
        /**
         * Tests that messages are written to socket when connection is open
         * Verifies message framing and transmission
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
         * Tests that sending messages on closed connection throws error
         * Verifies proper error handling for invalid state
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
     */
    describe('close', () => {
        it('should end socket and call close listener when connection is open', () => {
            const closeListener = jest.fn();
            connection.onClose(closeListener);
            connection.close();
            expect(socket.end).toHaveBeenCalled();
            expect(closeListener).toHaveBeenCalled();
            expect(connection.state).toBe(ConnectionState.CLOSED);
        });

        it('should end socket without error when no close listener is set', () => {
            connection.close();
            expect(socket.end).toHaveBeenCalled();
            expect(connection.state).toBe(ConnectionState.CLOSED);
        });

        it('should not end socket when connection is already closed', () => {
            socket.emit('close');
            connection.close();
            expect(socket.end).not.toHaveBeenCalled();
        });
    });

    /**
     * Tests for error handling functionality
     * @group errors
     */
    describe('error handling', () => {
        /**
         * Tests that socket errors trigger connection closure
         * Verifies error event handling and cleanup
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
 */
describe('createTcpServer', () => {
    let mockConnectionManager: any;
    let mockServer: jest.Mocked<net.Server>;
    let mockTlsServer: jest.Mocked<tls.Server>;
    let mockSocket: jest.Mocked<net.Socket>;
    let mockTlsSocket: jest.Mocked<tls.TLSSocket>;

    // Helper function to safely get event handler
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

    describe('non-TLS server', () => {
        beforeEach(() => {
            // Reset SSL settings and mocks
            const { config } = require('@config');
            config.ssl = undefined;
            jest.clearAllMocks();

            mockSocket.on.mockReset();
        });

        it('should create a TCP server without TLS', () => {
            const server = createTcpServer(mockConnectionManager);

            expect(net.createServer).toHaveBeenCalled();
            expect(tls.createServer).not.toHaveBeenCalled();
            expect(server).toBe(mockServer);
        });

        it('should handle incoming connections', () => {
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

    describe('TLS server', () => {
        beforeEach(() => {
            const { config } = require('@config');
            Object.assign(config, {
                ssl: {
                    key: 'key.pem',
                    cert: 'cert.pem'
                }
            });
            jest.clearAllMocks();
        });

        afterEach(() => {
            const { config } = require('@config');
            config.ssl = undefined;
        });

        it('should create a TLS server when SSL is configured', () => {
            const server = createTcpServer(mockConnectionManager);

            expect(tls.createServer).toHaveBeenCalledWith(expect.objectContaining({
                key: 'mock-content',
                cert: 'mock-content',
                handshakeTimeout: 5000
            }));
            expect(net.createServer).not.toHaveBeenCalled();
            expect(server).toBe(mockTlsServer);
        });

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

        it('should handle secure connections', () => {
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
                connectionHandler(mockSocket);

                // Verify connection setup
                expect(mockConnectionManager.addConnection).toHaveBeenCalled();
                expect(mockSocket.setTimeout).toHaveBeenCalledWith(31000);
                expect(mockSocket.on).toHaveBeenCalledWith('timeout', expect.any(Function));
                expect(logger.info).toHaveBeenCalledWith('Client connected (TCP) from IP 127.0.0.1');
            }
        });
    });

    describe('server error handling', () => {
        it('should handle server errors', () => {
            createTcpServer(mockConnectionManager);

            // Get and call the error handler
            const errorHandler = getEventHandler<(err: Error) => void>(
                mockServer.on.mock.calls,
                'error'
            );
            expect(errorHandler).toBeDefined();
            if (errorHandler) {
                errorHandler(new Error('server error'));
            }

            expect(logger.error).toHaveBeenCalledWith('TCP server error:', expect.any(Error));
        });
    });

    describe('server listening', () => {
        it('should start listening on configured port and host', () => {
            createTcpServer(mockConnectionManager);

            expect(mockServer.listen).toHaveBeenCalledWith(
                config.ports.tcp,
                config.host,
                expect.any(Function)
            );
        });

        it('should log appropriate message when server starts listening without SSL', () => {
            const { config } = require('@config');
            config.ssl = undefined;
            createTcpServer(mockConnectionManager);

            expect(logger.info).toHaveBeenCalledWith(
                `TCP server listening on ${config.host}:${config.ports.tcp}`
            );
        });

        it('should log appropriate message when server starts listening with SSL', () => {
            const { config } = require('@config');
            config.ssl = {
                key: 'key.pem',
                cert: 'cert.pem'
            };
            createTcpServer(mockConnectionManager);

            expect(logger.info).toHaveBeenCalledWith(
                `TCP server listening on ${config.host}:${config.ports.tcp} with SSL`
            );
        });
    });
});