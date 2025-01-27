/**
 * @file Test suite for WebSocketConnection class
 * @description Tests the WebSocket connection implementation, including:
 * - Connection state management
 * - Message handling and validation
 * - Connection closure and cleanup
 * - Error handling and logging
 * - WebSocket server creation and configuration
 * @module test/unit/core/connection/protocols/websocket
 */

import { WebSocket, WebSocketServer } from 'ws';
import { WebSocketConnection } from '@core/connection/protocols/websocket';
import { ConnectionState, Connection } from '@core/connection/types';
import { InternalError } from '@core/errors';
import logger from '@utils/logger';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import { config } from '@config';
import { createWebSocketServer } from '@core/connection/protocols/websocket';

jest.mock('@config', () => ({
    config: {
        ports: {
            ws: 8080,
            wss: 8443
        },
        host: 'localhost',
        allowUnsecure: true,
        message: {
            payload: {
                maxLength: 32 * 1024
            }
        },
        request: {
            response: {
                timeout: {
                    max: 30000
                }
            }
        }
    }
}));
jest.mock('fs', () => ({
    readFileSync: jest.fn().mockReturnValue('mock-content')
}));
jest.mock('https');
jest.mock('ws');
jest.mock('http', () => ({
    createServer: jest.fn().mockImplementation(() => ({
        listen: jest.fn().mockImplementation((port, host, callback) => {
            if (typeof callback === 'function') {
                callback();
            }
            return this;
        })
    }))
}));
jest.mock('https', () => ({
    createServer: jest.fn().mockImplementation(() => ({
        listen: jest.fn().mockImplementation((port, host, callback) => {
            if (typeof callback === 'function') {
                callback();
            }
            return this;
        })
    }))
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

/**
 * Extended WebSocket interface for testing
 * @interface MockWebSocket
 * @extends {Partial<WebSocket>}
 * @description Adds properties needed to track state and handlers in tests:
 * - _readyState: Internal state tracking
 * - readyState: Public state accessor
 * - errorHandler: Optional error callback
 * - on: Mock event handler registration
 * - send: Mock message sending
 * - close: Mock connection closure
 */
interface MockWebSocket extends Partial<WebSocket> {
    _readyState: WebSocket['readyState'];
    readyState: WebSocket['readyState'];
    errorHandler: ((err: Error) => void) | null;
    on: jest.Mock;
    send: jest.Mock;
    close: jest.Mock;
}

/**
 * Extended WebSocketServer interface for testing
 * @interface MockWebSocketServer
 * @extends {jest.Mocked<WebSocketServer>}
 * @description Adds properties needed to track error handlers in tests:
 * - errorHandler: Optional error callback for server-level errors
 */
interface MockWebSocketServer extends jest.Mocked<WebSocketServer> {
    errorHandler: ((err: Error) => void) | null;
}

/**
 * Test suite for WebSocket connection implementation
 * @group unit
 * @group connection
 * @group protocols
 * @description Tests the WebSocketConnection class functionality including:
 * - Connection state transitions
 * - Message handling and validation
 * - Error scenarios and recovery
 * - Connection lifecycle management
 */
describe('WebSocket Implementation', () => {
    let mockWs: MockWebSocket;
    let connection: WebSocketConnection;
    const mockIp = '127.0.0.1';

    /**
     * Setup function run before each test
     * Initializes mock WebSocket and connection instances
     */
    beforeEach(() => {
        jest.resetAllMocks();

        mockWs = {
            _readyState: WebSocket.OPEN,
            get readyState() {
                return this._readyState;
            },
            on: jest.fn(),
            send: jest.fn(),
            close: jest.fn(),
            errorHandler: null
        };

        connection = new WebSocketConnection(mockWs as WebSocket, mockIp);
        connection.serviceId = 'test-service';
    });

    /**
     * Tests for connection state management
     * @group state
     */
    describe('state', () => {
        /**
         * @test Verifies that the connection state is reported as OPEN when the WebSocket is open
         * @expected Connection state should be ConnectionState.OPEN
         */
        it('should return OPEN when WebSocket is open', () => {
            mockWs._readyState = WebSocket.OPEN;
            expect(connection.state).toBe(ConnectionState.OPEN);
        });

        /**
         * @test Verifies that the connection state is reported as CLOSED when the WebSocket is closed
         * @expected Connection state should be ConnectionState.CLOSED
         */
        it('should return CLOSED when WebSocket is not open', () => {
            mockWs._readyState = WebSocket.CLOSED;
            expect(connection.state).toBe(ConnectionState.CLOSED);
        });
    });

    /**
     * Tests for message handling functionality
     * @group messaging
     */
    describe('onMessage', () => {
        /**
         * @test Verifies that message listener is properly registered with the WebSocket
         * @expected WebSocket.on should be called with 'message' event and a function handler
         */
        it('should register message listener', () => {
            const listener = jest.fn();
            connection.onMessage(listener);
            expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
        });

        /**
         * @test Verifies that received messages are correctly forwarded to the registered listener
         * @expected Listener should be called with the message buffer
         */
        it('should forward received messages to listener', () => {
            const listener = jest.fn();
            connection.onMessage(listener);

            // Get the registered message handler
            const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')[1];
            const testMessage = Buffer.from('test message');
            messageHandler(testMessage);

            expect(listener).toHaveBeenCalledWith(testMessage);
        });
    });

    /**
     * Tests for connection closure handling
     * @group closure
     */
    describe('onClose', () => {
        /**
         * Tests that close listener is properly registered
         */
        it('should register close listener', () => {
            const listener = jest.fn();
            connection.onClose(listener);
            expect(mockWs.on).toHaveBeenCalledWith('close', listener);
        });
    });

    /**
     * Tests for message sending functionality
     * @group messaging
     */
    describe('send', () => {
        /**
         * Tests that messages are sent when connection is open
         */
        it('should send message when connection is open', () => {
            const message = 'test message';
            connection.send(message);
            expect(mockWs.send).toHaveBeenCalledWith(message);
        });

        /**
         * Tests that sending messages on closed connection throws error
         */
        it('should throw error when connection is not open', () => {
            mockWs._readyState = WebSocket.CLOSED;
            const message = 'test message';

            expect(() => connection.send(message)).toThrow(InternalError);
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Unable to send message to service test-service')
            );
        });
    });

    /**
     * Tests for connection closure functionality
     * @group closure
     */
    describe('close', () => {
        /**
         * Tests that WebSocket is properly closed when connection is open
         */
        it('should close WebSocket when connection is open', () => {
            mockWs._readyState = WebSocket.OPEN;
            connection.close();
            expect(mockWs.close).toHaveBeenCalled();
        });

        /**
         * Tests that closing already closed connection is handled gracefully
         */
        it('should not close WebSocket when connection is already closed', () => {
            mockWs._readyState = WebSocket.CLOSED;
            connection.close();
            expect(mockWs.close).not.toHaveBeenCalled();
        });
    });
});

/**
 * Test suite for WebSocket server creation and management
 * @group unit
 * @group connection
 * @group protocols
 * @description Tests the WebSocket server creation and configuration including:
 * - Server initialization with and without SSL
 * - Connection handling and validation
 * - Error handling at server level
 * - Client connection management
 */
describe('createWebSocketServer', () => {
    let mockConnectionManager: any;
    let mockHttpServer: jest.Mocked<http.Server>;
    let mockHttpsServer: jest.Mocked<https.Server>;
    let mockWss: jest.Mocked<WebSocketServer>;
    let mockWs: jest.Mocked<WebSocket>;
    let mockReq: jest.Mocked<http.IncomingMessage>;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

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

        // Mock HTTP server
        mockHttpServer = {
            listen: jest.fn().mockImplementation((port, host, callback) => {
                if (typeof callback === 'function') {
                    callback();
                }
                return mockHttpServer;
            })
        } as unknown as jest.Mocked<http.Server>;

        // Mock HTTPS server
        mockHttpsServer = {
            listen: jest.fn().mockImplementation((port, host, callback) => {
                if (typeof callback === 'function') {
                    callback();
                }
                return mockHttpsServer;
            })
        } as unknown as jest.Mocked<https.Server>;

        // Mock WebSocket client
        mockWs = {
            on: jest.fn().mockReturnThis(),
            send: jest.fn(),
            close: jest.fn()
        } as unknown as jest.Mocked<WebSocket>;

        // Mock WebSocket server
        mockWss = {
            on: jest.fn().mockReturnThis()
        } as unknown as jest.Mocked<WebSocketServer>;

        // Mock HTTP request
        mockReq = {
            socket: {
                remoteAddress: '127.0.0.1'
            }
        } as unknown as jest.Mocked<http.IncomingMessage>;

        // Set up mock return values
        (http.createServer as jest.Mock).mockReturnValue(mockHttpServer);
        (https.createServer as jest.Mock).mockReturnValue(mockHttpsServer);
        (WebSocketServer as unknown as jest.Mock).mockImplementation(() => mockWss);
    });

    /**
     * Tests for non-SSL server configuration
     * @description Verifies server behavior without SSL:
     * - Basic server creation
     * - Connection handling
     * - Error management
     * - IP address validation
     */
    describe('non-SSL server', () => {
        /**
         * @test Verifies WebSocket server creation without SSL
         * @expected Should create an unsecure WebSocket server with correct configuration
         */
        it('should create a WebSocket server without SSL', () => {
            // Configure allowUnsecure to ensure server creation succeeds
            const { config } = require('@config');
            config.allowUnsecure = true;
            config.ssl = undefined;

            const servers = createWebSocketServer(mockConnectionManager);
            expect(servers).toHaveLength(1);
            expect(servers[0]).toBe(mockWss);

            // Verify HTTP server was created
            expect(http.createServer).toHaveBeenCalled();
            expect(https.createServer).not.toHaveBeenCalled();

            // Verify WebSocket server was created with correct config
            expect(WebSocket.Server).toHaveBeenCalledWith({
                server: mockHttpServer,
                maxPayload: expect.any(Number)
            });

            // Verify server starts listening
            expect(mockHttpServer.listen).toHaveBeenCalledWith(
                config.ports.ws,
                config.host,
                expect.any(Function)
            );

            // Verify logging after callback
            expect(logger.info).toHaveBeenCalledWith(
                `Unsecure WebSocket server listening on ${config.host}:${config.ports.ws}`
            );
        });

        /**
         * @test Verifies handling of incoming WebSocket connections
         * @expected Should add connection to manager and log connection info
         */
        it('should handle incoming connections', () => {
            createWebSocketServer(mockConnectionManager);

            // Get and call the connection handler
            const connectionHandler = mockWss.on.mock.calls.find(
                ([event]) => event === 'connection'
            )?.[1];
            expect(connectionHandler).toBeDefined();

            if (connectionHandler) {
                // Mock addConnection to set the serviceId
                mockConnectionManager.addConnection.mockImplementation((conn: Connection) => {
                    conn.serviceId = 'test-service';
                    return conn;
                });

                // Trigger connection with proper binding
                connectionHandler.bind(mockWss)(mockWs, mockReq);

                expect(mockConnectionManager.addConnection).toHaveBeenCalled();
                expect(logger.info).toHaveBeenCalledWith(
                    'Client connected (WebSocket) from IP 127.0.0.1'
                );
            }
        });

        /**
         * @test Verifies handling of connections with undefined remote address
         * @expected Should handle connection with 'unknown' IP address
         */
        it('should handle connections with undefined remote address', () => {
            createWebSocketServer(mockConnectionManager);

            const connectionHandler = mockWss.on.mock.calls.find(
                ([event]) => event === 'connection'
            )?.[1];

            if (connectionHandler) {
                // Create request with undefined remoteAddress
                const reqWithoutAddress = {
                    socket: { remoteAddress: undefined }
                } as http.IncomingMessage;

                // Trigger connection with proper binding
                connectionHandler.bind(mockWss)(mockWs, reqWithoutAddress);

                expect(mockConnectionManager.addConnection).toHaveBeenCalledWith(
                    expect.objectContaining({
                        ip: 'unknown'
                    })
                );
                expect(logger.info).toHaveBeenCalledWith(
                    'Client connected (WebSocket) from IP unknown'
                );
            }
        });

        /**
         * @test Verifies WebSocket error handling
         * @expected Should remove connection and log error with service details
         */
        it('should handle WebSocket errors', () => {
            createWebSocketServer(mockConnectionManager);

            const connectionHandler = mockWss.on.mock.calls.find(
                ([event]) => event === 'connection'
            )?.[1];

            if (connectionHandler) {
                // Mock addConnection to set the serviceId
                mockConnectionManager.addConnection.mockImplementation((conn: Connection) => {
                    conn.serviceId = 'test-service';
                    return conn;
                });

                // Trigger connection with proper binding
                connectionHandler.bind(mockWss)(mockWs, mockReq);

                // Get and verify error handler was set
                const errorHandler = mockWs.on.mock.calls.find(
                    ([event]) => event === 'error'
                )?.[1];
                expect(errorHandler).toBeDefined();

                if (errorHandler) {
                    const error = new Error('test error');
                    errorHandler.bind(mockWs)(error);

                    expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith('test-service');
                    expect(logger.error).toHaveBeenCalledWith(
                        'WebSocket error from service test-service (IP 127.0.0.1):',
                        expect.objectContaining({
                            serviceId: 'test-service',
                            error
                        })
                    );
                }
            }
        });
    });

    /**
     * Tests for SSL server configuration
     * @description Verifies server behavior with SSL:
     * - SSL server creation
     * - Certificate handling
     * - Secure connection establishment
     */
    describe('SSL server', () => {
        /**
         * @test Verifies server startup logging with SSL
         * @expected Should log appropriate startup message for secure WebSocket server
         */
        it('should log appropriate message when server starts listening', () => {
            // Configure SSL
            const { config } = require('@config');
            config.ssl = {
                key: 'key.pem',
                cert: 'cert.pem'
            };
            config.allowUnsecure = false;

            const servers = createWebSocketServer(mockConnectionManager);
            expect(servers).toHaveLength(1);
            expect(servers[0]).toBe(mockWss);

            // Verify SSL files are read
            expect(fs.readFileSync).toHaveBeenCalledWith('key.pem');
            expect(fs.readFileSync).toHaveBeenCalledWith('cert.pem');

            // Verify HTTPS server was created with the read content
            expect(https.createServer).toHaveBeenCalledWith({
                key: fs.readFileSync('key.pem'),
                cert: fs.readFileSync('cert.pem')
            });
            expect(http.createServer).not.toHaveBeenCalled();

            // Verify WebSocket server was created with correct config
            expect(WebSocket.Server).toHaveBeenCalledWith({
                server: mockHttpsServer,
                maxPayload: expect.any(Number)
            });

            // Verify server starts listening
            expect(mockHttpsServer.listen).toHaveBeenCalledWith(
                config.ports.wss,
                config.host,
                expect.any(Function)
            );

            // Verify logging after callback
            expect(logger.info).toHaveBeenCalledWith(
                `Secure WebSocket server listening on ${config.host}:${config.ports.wss}`
            );
        });
    });

    /**
     * Tests for server error handling
     * @description Verifies server-level error handling:
     * - Error event propagation
     * - Error logging
     * - Server stability after errors
     */
    describe('server error handling', () => {
        /**
         * @test Verifies server-level error handling
         * @expected Should log server error with appropriate message
         */
        it('should handle server errors', () => {
            createWebSocketServer(mockConnectionManager);

            // Get and call the error handler
            const errorHandler = mockWss.on.mock.calls.find(
                ([event]) => event === 'error'
            )?.[1];
            expect(errorHandler).toBeDefined();

            if (errorHandler) {
                const error = new Error('server error');
                errorHandler.bind(mockWss)(error);
                expect(logger.error).toHaveBeenCalledWith('WebSocket server error:', error);
            }
        });
    });

    describe('server creation', () => {
        /**
         * @test Verifies error when no servers can be started
         * @expected Should throw error when neither SSL is configured nor unsecure is allowed
         */
        it('should throw error when no servers can be started', () => {
            // Configure to disable both secure and unsecure
            const { config } = require('@config');
            config.ssl = undefined;
            config.allowUnsecure = false;

            expect(() => createWebSocketServer(mockConnectionManager))
                .toThrow('No WebSocket servers could be started. Check SSL configuration or enable unsecure WebSocket.');
        });
    });
});