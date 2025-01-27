import { WebSocket, WebSocketServer } from 'ws';
import { Socket } from 'net';
import { IncomingMessage } from 'http';
import { ConnectionManager } from '@core/connection';
import { createWebSocketServer, WebSocketConnection } from '@core/connection/websocket';
import { ConnectionState } from '@core/connection/types';
import { InternalError } from '@core/errors';
import { SetupLogger } from '@utils/logger';
import logger from '@utils/logger';
import fs from 'fs';
import { createServer } from 'https';
import { config } from '@config';

jest.mock('@config', () => ({
    config: {
        port: 8080,
        message: {
            payload: {
                maxLength: 32 * 1024
            }
        }
    }
}));
jest.mock('fs');
jest.mock('https');
jest.mock('ws');
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
 * Extended WebSocket interface for testing.
 * Adds properties needed to track state and handlers in tests.
 */
interface MockWebSocket extends WebSocket {
    _readyState: number;
    errorHandler: ((err: Error) => void) | null;
}

/**
 * Extended WebSocketServer interface for testing.
 * Adds properties needed to track error handlers in tests.
 */
interface MockWebSocketServer extends jest.Mocked<WebSocketServer> {
    errorHandler: ((err: Error) => void) | null;
}

/**
 * Test suite for WebSocket implementation.
 * Tests the core functionality of WebSocket server creation and connection handling.
 *
 * Key areas tested:
 * - WebSocket server creation and configuration
 * - Connection establishment and management
 * - Message handling
 * - Error handling
 * - Connection state management
 */
describe('WebSocket Implementation', () => {
    let mockConnectionManager: jest.Mocked<ConnectionManager>;
    let mockWs: MockWebSocket;
    let mockSocket: Partial<Socket>;
    let mockReq: Partial<IncomingMessage>;
    let wss: MockWebSocketServer;
    let connectionHandler: (ws: WebSocket, req: IncomingMessage) => void;
    let errorHandler: (error: Error) => void;

    beforeEach(() => {
        // Create mock connection manager with all required methods
        mockConnectionManager = {
            onConnection: jest.fn(),
            addConnection: jest.fn(),
            removeConnection: jest.fn(),
            sendMessage: jest.fn(),
        } as any;

        // Reset all mocks and config
        jest.clearAllMocks();

        // Reset config to initial state before each test
        Object.assign(config, {
            port: 8080,
            message: {
                payload: {
                    maxLength: 32 * 1024 // 32KB
                }
            },
            ssl: undefined
        });

        // Create mock WebSocket with full implementation
        mockWs = {
            readyState: WebSocket.OPEN,
            on: jest.fn((event, handler) => {
                if (event === 'message') {
                    handler(Buffer.from('test message'));
                } else if (event === 'error') {
                    mockWs.errorHandler = handler;
                }
                return mockWs;
            }),
            send: jest.fn(),
            close: jest.fn(),
            CONNECTING: 0,
            OPEN: 1,
            CLOSING: 2,
            CLOSED: 3,
            _readyState: WebSocket.OPEN,
            // Required WebSocket interface properties
            binaryType: 'nodebuffer',
            bufferedAmount: 0,
            url: '',
            protocol: '',
            extensions: '',
            isPaused: false,
            removeListener: jest.fn(),
            off: jest.fn(),
            addListener: jest.fn(),
            removeAllListeners: jest.fn(),
            setMaxListeners: jest.fn(),
            getMaxListeners: jest.fn(),
            listeners: jest.fn(),
            rawListeners: jest.fn(),
            emit: jest.fn(),
            listenerCount: jest.fn(),
            prependListener: jest.fn(),
            prependOnceListener: jest.fn(),
            eventNames: jest.fn(),
            ping: jest.fn(),
            pong: jest.fn(),
            terminate: jest.fn(),
            once: jest.fn(),
            errorHandler: null,
        } as unknown as MockWebSocket;

        // Setup readyState property with getter/setter for testing
        Object.defineProperty(mockWs, 'readyState', {
            get: jest.fn(() => mockWs._readyState),
            set: jest.fn((value) => { mockWs._readyState = value; }),
            configurable: true
        });

        // Create mock socket with remote address for testing
        mockSocket = {
            remoteAddress: '127.0.0.1'
        };

        // Create mock HTTP request with required properties
        mockReq = {
            socket: mockSocket as Socket,
            headers: {},
            httpVersion: '1.1',
            httpVersionMajor: 1,
            httpVersionMinor: 1,
            method: 'GET',
            url: '/',
        } as Partial<IncomingMessage>;

        // Create mock WebSocket server with handlers
        wss = {
            on: jest.fn((event, handler) => {
                if (event === 'connection') {
                    connectionHandler = handler;
                } else if (event === 'error') {
                    errorHandler = handler;
                }
                return wss;
            }),
            close: jest.fn(),
            errorHandler: null,
        } as unknown as MockWebSocketServer;

        // Mock WebSocketServer constructor
        (WebSocketServer as unknown as jest.Mock).mockImplementation(() => wss);
    });

    afterEach(() => {
        // Clean up WebSocket server after each test
        if (wss) {
            wss.close();
        }
    });

    afterAll(() => {
        // Reset all Jest modules after all tests
        jest.resetModules();
    });

    /**
     * Tests for WebSocket server creation functionality.
     * Verifies the server is properly configured and handles:
     * - Server initialization with correct port and payload settings
     * - New connection establishment
     * - IP address validation
     * - WebSocket and server error handling
     */
    describe('createWebSocketServer', () => {
        /**
         * Verifies that the WebSocket server is created with correct configuration.
         * The server should:
         * - Use the configured port
         * - Set maximum payload size with buffer
         */
        it('should create WebSocket server with correct port', () => {
            // Create server and verify configuration
            createWebSocketServer(mockConnectionManager);

            expect(WebSocketServer).toHaveBeenCalledWith({
                port: 8080,
                maxPayload: 32 * 1024 + 512, // 32KB + 512 bytes buffer
            });
        });

        /**
         * Verifies that new WebSocket connections are properly handled.
         * The server should:
         * - Accept the connection
         * - Add it to the connection manager
         */
        it('should handle new connections', () => {
            // Initialize server
            createWebSocketServer(mockConnectionManager);

            // Simulate new WebSocket connection
            connectionHandler(mockWs, mockReq as IncomingMessage);

            // Verify connection was added to manager
            expect(mockConnectionManager.addConnection).toHaveBeenCalled();
        });

        /**
         * Verifies that connections without IP addresses are handled gracefully.
         * The server should:
         * - Accept connections with missing IP
         * - Add them to the connection manager
         */
        it('should handle connections without IP address', () => {
            // Initialize server
            createWebSocketServer(mockConnectionManager);

            // Create request object without IP address
            const reqWithoutIp = {
                ...mockReq,
                socket: { remoteAddress: undefined } as Socket
            } as IncomingMessage;

            // Simulate connection with missing IP
            connectionHandler(mockWs, reqWithoutIp);

            // Verify connection was still added to manager
            expect(mockConnectionManager.addConnection).toHaveBeenCalled();
        });

        /**
         * Verifies that WebSocket errors are handled properly.
         * The server should:
         * - Detect WebSocket errors
         * - Remove the errored connection
         */
        it('should handle WebSocket errors', () => {
            // Initialize server
            createWebSocketServer(mockConnectionManager);

            // Simulate connection establishment
            connectionHandler(mockWs, mockReq as IncomingMessage);

            // Trigger WebSocket error
            const testError = new Error('test error');
            mockWs.errorHandler?.(testError);

            // Verify errored connection was removed
            expect(mockConnectionManager.removeConnection).toHaveBeenCalled();
        });

        /**
         * Verifies that server-level errors are handled properly.
         * The server should:
         * - Detect server errors
         * - Log the error details
         */
        it('should handle server errors', () => {
            // Setup spy on logger
            const loggerSpy = jest.spyOn(logger, 'error');

            // Initialize server
            createWebSocketServer(mockConnectionManager);

            // Trigger server error
            const testError = new Error('test server error');
            errorHandler(testError);

            // Verify error was logged
            expect(loggerSpy).toHaveBeenCalledWith('WebSocket server error:', testError);
            loggerSpy.mockRestore();
        });

        /**
         * Tests WebSocket server creation with SSL configuration.
         * Should create a secure WebSocket server when SSL config is present.
         */
        it('should create WebSocket server with SSL when SSL config is present', () => {
            // Add SSL config to the mock config
            Object.assign(config, {
                ssl: {
                    key: '/path/to/key.pem',
                    cert: '/path/to/cert.pem'
                }
            });

            // Mock fs readFileSync
            const mockKey = Buffer.from('mock-key');
            const mockCert = Buffer.from('mock-cert');
            (fs.readFileSync as jest.Mock)
                .mockReturnValueOnce(mockKey)
                .mockReturnValueOnce(mockCert);

            // Mock https server
            const mockHttpsServer = {
                listen: jest.fn().mockReturnThis()
            };
            (createServer as jest.Mock).mockReturnValue(mockHttpsServer);

            // Create WebSocket server
            createWebSocketServer(mockConnectionManager);

            // Verify SSL setup
            expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/key.pem');
            expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/cert.pem');
            expect(createServer).toHaveBeenCalledWith({ key: mockKey, cert: mockCert });
            expect(mockHttpsServer.listen).toHaveBeenCalledWith(config.port);
            expect(WebSocketServer).toHaveBeenCalledWith({
                maxPayload: config.message.payload.maxLength + 512,
                server: mockHttpsServer
            });
            expect(logger.info).toHaveBeenCalledWith('SSL is enabled');
        });
    });

    /**
     * Tests for WebSocketConnection class functionality.
     * Verifies the connection wrapper properly handles:
     * - Connection state management
     * - Message reception and handling
     * - Connection closure
     * - Message sending with state validation
     */
    describe('WebSocketConnection', () => {
        let connection: WebSocketConnection;

        beforeEach(() => {
            // Create fresh connection instance for each test
            connection = new WebSocketConnection(mockWs, '127.0.0.1');
            connection.serviceId = 'test-service';
        });

        /**
         * Tests for connection state management.
         * Verifies the connection properly:
         * - Reports OPEN state for open connections
         * - Reports CLOSED state for non-open connections
         */
        describe('state', () => {
            /**
             * Verifies that OPEN state is reported when WebSocket is open.
             * The connection should:
             * - Check WebSocket readyState
             * - Return ConnectionState.OPEN when open
             */
            it('should return OPEN when WebSocket is open', () => {
                // Set WebSocket to open state
                mockWs._readyState = WebSocket.OPEN;
                expect(connection.state).toBe(ConnectionState.OPEN);
            });

            /**
             * Verifies that CLOSED state is reported when WebSocket is not open.
             * The connection should:
             * - Check WebSocket readyState
             * - Return ConnectionState.CLOSED when not open
             */
            it('should return CLOSED when WebSocket is not open', () => {
                // Set WebSocket to closed state
                mockWs._readyState = WebSocket.CLOSED;
                expect(connection.state).toBe(ConnectionState.CLOSED);
            });
        });

        /**
         * Tests for message handling functionality.
         * Verifies the connection properly:
         * - Registers message listeners
         * - Handles Buffer messages
         * - Converts messages to strings
         */
        describe('onMessage', () => {
            /**
             * Verifies that message listeners are registered and Buffer messages are handled.
             * The connection should:
             * - Register the message listener
             * - Convert Buffer messages to strings
             * - Pass converted messages to the listener
             */
            it('should register message listener and handle Buffer messages', () => {
                const listener = jest.fn();
                const testMessage = 'test message';

                // Setup message event mock
                (mockWs.on as jest.Mock).mockImplementation((event, handler) => {
                    if (event === 'message') {
                        handler(Buffer.from(testMessage));
                    }
                    return mockWs;
                });

                // Register message listener
                connection.onMessage(listener);

                // Verify listener was registered and received message
                expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
                expect(listener).toHaveBeenCalledWith(Buffer.from(testMessage));
            });
        });

        /**
         * Tests for connection closure handling.
         * Verifies the connection properly:
         * - Registers close listeners
         */
        describe('onClose', () => {
            /**
             * Verifies that close listeners are registered properly.
             * The connection should:
             * - Register the close listener
             */
            it('should register close listener', () => {
                const listener = jest.fn();
                connection.onClose(listener);
                expect(mockWs.on).toHaveBeenCalledWith('close', listener);
            });
        });

        /**
         * Tests for message sending functionality.
         * Verifies the connection properly:
         * - Sends messages when connection is open
         * - Handles send attempts when connection is closed
         * - Logs appropriate warnings
         */
        describe('send', () => {
            /**
             * Verifies that messages can be sent when connection is open.
             * The connection should:
             * - Check connection state
             * - Send message through WebSocket
             */
            it('should send message when connection is open', () => {
                // Ensure connection is open
                mockWs._readyState = WebSocket.OPEN;
                const message = 'test message';

                // Send message and verify
                connection.send(message);
                expect(mockWs.send).toHaveBeenCalledWith(message);
            });

            /**
             * Verifies that send attempts are rejected when connection is closed.
             * The connection should:
             * - Check connection state
             * - Throw InternalError when closed
             * - Not attempt to send message
             */
            it('should throw error when connection is not open', () => {
                // Set connection to closed state
                mockWs._readyState = WebSocket.CLOSED;
                const message = 'test message';

                // Verify error thrown and message not sent
                expect(() => connection.send(message)).toThrow(InternalError);
                expect(() => connection.send(message)).toThrow('Desired service connection is not open');
                expect(mockWs.send).not.toHaveBeenCalled();
            });

            /**
             * Verifies that warnings are logged for failed send attempts.
             * The connection should:
             * - Log warning message
             * - Include service ID in warning
             */
            it('should log warning when connection is not open', () => {
                // Setup logger spy
                const loggerSpy = jest.spyOn(logger, 'warn');

                // Set connection to closed state and attempt send
                mockWs._readyState = WebSocket.CLOSED;
                const message = 'test message';

                // Verify warning logged with correct message
                expect(() => connection.send(message)).toThrow(InternalError);
                expect(loggerSpy).toHaveBeenCalledWith(
                    'Unable to send message to service test-service: Connection is not open'
                );
                loggerSpy.mockRestore();
            });
        });

        /**
         * Tests for connection closure functionality.
         * Verifies the connection properly:
         * - Closes open connections
         * - Handles closure attempts on already closed connections
         */
        describe('close', () => {
            /**
             * Verifies that open connections can be closed.
             * The connection should:
             * - Check connection state
             * - Close the WebSocket if open
             */
            it('should close connection when open', () => {
                // Ensure connection is open
                mockWs._readyState = WebSocket.OPEN;
                connection.close();
                expect(mockWs.close).toHaveBeenCalled();
            });

            /**
             * Verifies that closure attempts on closed connections are handled gracefully.
             * The connection should:
             * - Check connection state
             * - Not attempt to close already closed connections
             */
            it('should not close connection when already closed', () => {
                // Set connection to closed state
                mockWs._readyState = WebSocket.CLOSED;
                connection.close();
                expect(mockWs.close).not.toHaveBeenCalled();
            });
        });
    });
});