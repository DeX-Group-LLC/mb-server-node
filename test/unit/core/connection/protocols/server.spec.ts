/**
 * @file Test suite for CombinedServer functionality
 * @description Tests the combined TCP/WebSocket server implementation, including:
 * - Server creation with and without SSL
 * - TCP and WebSocket connection handling
 * - Connection error handling
 * - Server lifecycle management (start/close)
 * - Edge cases like invalid WebSocket upgrades and socket timeouts
 */

import { jest } from '@jest/globals';
import { Socket } from 'net';
import { WebSocket, WebSocketServer, Server as WsServer } from 'ws';
import { IncomingMessage } from 'http';
import { config } from '@config';
import { ConnectionManager } from '@core/connection/manager';
import { createCombinedServer } from '@core/connection/protocols/server';
import { TCPSocketConnection } from '@core/connection/protocols/tcpsocket';
import { WebSocketConnection } from '@core/connection/protocols/websocket';
import { MAX_HEADER_LENGTH } from '@core/utils/message';

// Mock dependencies
jest.mock('fs');
jest.mock('net', () => {
    const actual = jest.requireActual<typeof import('net')>('net');
    return {
        createServer: jest.fn(),
        Socket: actual.Socket
    };
});
jest.mock('tls');
jest.mock('ws');
jest.mock('@config', () => ({
    config: {
        port: 8080,
        host: 'localhost',
        ssl: undefined,
        connection: {
            heartbeatDeregisterTimeout: 30000,
        },
        request: {
            response: {
                timeout: {
                    max: 3600000,
                },
            },
        },
        message: {
            payload: {
                maxLength: 1024,
            },
        },
        logging: {
            level: 'info'
        }
    }
}));
jest.mock('@utils/logger', () => ({
    SetupLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn()
    })
}));
jest.mock('@core/connection/protocols/tcpsocket');
jest.mock('@core/connection/protocols/websocket');

/**
 * Test suite for CombinedServer functionality
 * @group unit
 * @group connection
 * @group protocols
 */
describe('CombinedServer', () => {
    let mockConnectionManager: jest.Mocked<ConnectionManager>;
    let mockServer: jest.Mocked<any>;
    let mockWebSocketServer: jest.Mocked<WsServer>;
    let mockSocket: jest.Mocked<Socket>;
    let mockDataHandler: (data: Buffer) => void;
    let connectionHandler: (socket: Socket) => void;
    let wsConnectionHandler: (ws: WebSocket, req: IncomingMessage) => void;
    let serverErrorHandler: (error: Error) => void;
    let wsErrorHandler: (error: Error) => void;

    /**
     * Setup function run before each test
     * Creates new mock instances and resets all mocks
     */
    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Mock ConnectionManager
        mockConnectionManager = {
            addConnection: jest.fn(),
            removeConnection: jest.fn(),
        } as any;

        // Mock Socket
        let socketErrorHandler: ((error: Error) => void) | undefined;
        mockSocket = {
            on: jest.fn((event: string, handler: any) => {
                if (event === 'error') {
                    socketErrorHandler = handler;
                }
                return mockSocket;
            }),
            once: jest.fn((event: string, handler: (data: Buffer) => void) => {
                if (event === 'data') {
                    mockDataHandler = handler;
                }
                return mockSocket;
            }),
            setTimeout: jest.fn(),
            end: jest.fn(),
            unshift: jest.fn(),
            destroy: jest.fn(),
            remoteAddress: '127.0.0.1',
            emit: jest.fn(),
            socketErrorHandler: () => socketErrorHandler,
        } as any;

        // Mock Server
        const serverClose = jest.fn((callback?: (err?: Error) => void) => {
            if (callback) {
                process.nextTick(() => callback());
            }
            return mockServer;
        });

        mockServer = {
            on: jest.fn((event: string, handler: any) => {
                if (event === 'connection') {
                    connectionHandler = handler;
                } else if (event === 'error') {
                    serverErrorHandler = handler;
                }
                return mockServer;
            }),
            listen: jest.fn((port: number, host: string, callback: () => void) => {
                if (callback) callback();
                return mockServer;
            }),
            close: serverClose,
        };

        // Mock WebSocketServer
        const wsClose = jest.fn((callback?: (err?: Error) => void) => {
            if (callback) {
                process.nextTick(() => callback());
            }
            return mockWebSocketServer;
        });

        mockWebSocketServer = {
            on: jest.fn((event: string, handler: any) => {
                if (event === 'connection') {
                    wsConnectionHandler = handler;
                } else if (event === 'error') {
                    wsErrorHandler = handler;
                }
                return mockWebSocketServer;
            }),
            handleUpgrade: jest.fn(),
            emit: jest.fn(),
            clients: new Set<WebSocket>(),
            close: wsClose,
        } as any;

        // Setup WebSocketServer mock
        (WebSocketServer as unknown as jest.Mock).mockImplementation(() => mockWebSocketServer);
    });

    /**
     * Cleanup function run after each test
     * Resets all mocks and SSL configuration
     */
    afterEach(() => {
        jest.clearAllMocks();
        // Reset SSL config
        (config as jest.Mocked<typeof config>).ssl = undefined;
    });

    /**
     * Tests for server creation and connection handling
     * @group server
     */
    describe('createCombinedServer', () => {
        /**
         * Tests server creation without SSL configuration
         */
        it('should create a server without SSL', () => {
            const { createServer } = require('net');
            createServer.mockReturnValue(mockServer);

            createCombinedServer(mockConnectionManager);

            expect(createServer).toHaveBeenCalled();
            expect(WebSocketServer).toHaveBeenCalledWith({
                noServer: true,
                maxPayload: config.message.payload.maxLength + MAX_HEADER_LENGTH,
            });
        });

        /**
         * Tests server creation with SSL configuration
         */
        it('should create a server with SSL when configured', () => {
            const { createServer } = require('tls');
            createServer.mockReturnValue(mockServer);

            (config as jest.Mocked<typeof config>).ssl = {
                key: 'key.pem',
                cert: 'cert.pem',
            };

            createCombinedServer(mockConnectionManager);

            expect(createServer).toHaveBeenCalledWith({
                key: undefined, // fs.readFileSync is mocked
                cert: undefined, // fs.readFileSync is mocked
            });
        });

        /**
         * Tests handling of TCP connections
         */
        it('should handle TCP connections', () => {
            const { createServer } = require('net');
            createServer.mockReturnValue(mockServer);

            createCombinedServer(mockConnectionManager);

            // Simulate server 'connection' event
            expect(connectionHandler).toBeDefined();
            connectionHandler(mockSocket);

            // Simulate non-WebSocket data
            mockSocket.once('data', mockDataHandler);
            mockDataHandler(Buffer.from('TCP data'));

            expect(TCPSocketConnection).toHaveBeenCalledWith(mockSocket, '127.0.0.1');
            expect(mockConnectionManager.addConnection).toHaveBeenCalled();
        });

        /**
         * Tests handling of WebSocket upgrade requests
         */
        it('should handle WebSocket upgrade requests', () => {
            const { createServer } = require('net');
            createServer.mockReturnValue(mockServer);

            createCombinedServer(mockConnectionManager);

            // Simulate server 'connection' event
            expect(connectionHandler).toBeDefined();
            connectionHandler(mockSocket);

            // Simulate WebSocket upgrade request
            mockSocket.once('data', mockDataHandler);
            const upgradeRequest = [
                'GET /ws HTTP/1.1',
                'Host: localhost:8080',
                'Upgrade: websocket',
                'Connection: Upgrade',
                'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
                'Sec-WebSocket-Version: 13',
                '',
                ''
            ].join('\r\n');

            mockDataHandler(Buffer.from(upgradeRequest));

            expect(mockWebSocketServer.handleUpgrade).toHaveBeenCalled();
        });

        /**
         * Tests handling of WebSocket connections
         */
        it('should handle WebSocket connections', () => {
            const { createServer } = require('net');
            createServer.mockReturnValue(mockServer);

            createCombinedServer(mockConnectionManager);

            // Get WebSocket 'connection' handler
            expect(wsConnectionHandler).toBeDefined();

            // Create mock WebSocket and request
            const mockWs = {
                on: jest.fn(),
            } as unknown as WebSocket;

            const mockReq = {
                socket: {
                    remoteAddress: '127.0.0.1'
                }
            } as unknown as IncomingMessage;

            // Simulate WebSocket connection
            wsConnectionHandler(mockWs, mockReq);

            expect(WebSocketConnection).toHaveBeenCalledWith(mockWs, '127.0.0.1');
            expect(mockConnectionManager.addConnection).toHaveBeenCalled();
        });

        /**
         * Tests server close functionality
         */
        it('should handle server close', async () => {
            // Mock createTcpServer specifically
            const net = require('net');
            net.createServer = jest.fn().mockReturnValue(mockServer);

            const combinedServer = createCombinedServer(mockConnectionManager);

            // Add mock client to WebSocket server
            const mockWsClient = {
                terminate: jest.fn(),
                on: jest.fn(),
                ping: jest.fn(),
                pong: jest.fn(),
                send: jest.fn(),
                close: jest.fn(),
            } as unknown as WebSocket;
            mockWebSocketServer.clients.add(mockWsClient);

            // Call close and wait for it to complete
            await combinedServer.close();

            // Verify all close operations were called
            expect(mockWsClient.terminate).toHaveBeenCalled();
            expect(mockWebSocketServer.close).toHaveBeenCalled();
            expect(combinedServer.server.close).toHaveBeenCalled();
        });

        /**
         * Tests handling of connection errors
         */
        it('should handle connection errors', () => {
            const { createServer } = require('net');
            createServer.mockReturnValue(mockServer);

            createCombinedServer(mockConnectionManager);

            // Get error handlers
            expect(serverErrorHandler).toBeDefined();
            expect(wsErrorHandler).toBeDefined();

            // Simulate errors
            const error = new Error('Test error');
            serverErrorHandler(error);
            wsErrorHandler(error);

            // Errors should be logged but not crash the server
            expect(mockServer.close).not.toHaveBeenCalled();
        });

        /**
         * Tests handling of WebSocket client errors
         */
        it('should handle WebSocket client errors', () => {
            const { createServer } = require('net');
            createServer.mockReturnValue(mockServer);

            createCombinedServer(mockConnectionManager);

            // Create mock WebSocket and request
            type ErrorHandler = (error: Error) => void;
            let registeredErrorHandler: ErrorHandler | undefined;

            const mockWs = {
                on: jest.fn().mockImplementation(((event: string, handler: ErrorHandler) => {
                    if (event === 'error') {
                        registeredErrorHandler = handler;
                    }
                    return mockWs;
                }) as any),
            } as unknown as WebSocket;

            const mockReq = {
                socket: {
                    remoteAddress: '127.0.0.1'
                }
            } as unknown as IncomingMessage;

            // Create a mock connection with serviceId
            const mockConnection = { serviceId: 'test-service-id' };
            (WebSocketConnection as jest.Mock).mockReturnValue(mockConnection);

            // Simulate WebSocket connection
            wsConnectionHandler(mockWs, mockReq);

            // Verify error handler was registered
            expect(mockWs.on).toHaveBeenCalledWith('error', expect.any(Function));
            expect(registeredErrorHandler).toBeDefined();

            // Simulate WebSocket error
            const error = new Error('WebSocket client error');
            registeredErrorHandler?.(error);

            // Should remove the connection from the manager
            expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith('test-service-id');
        });

        /**
         * Tests handling of socket timeouts for non-WebSocket connections
         */
        it('should handle socket timeouts for non-WebSocket connections', () => {
            const { createServer } = require('net');
            createServer.mockReturnValue(mockServer);

            createCombinedServer(mockConnectionManager);

            // Simulate server 'connection' event
            expect(connectionHandler).toBeDefined();
            connectionHandler(mockSocket);

            // Verify timeout was set
            expect(mockSocket.setTimeout).toHaveBeenCalledWith(config.connection.heartbeatDeregisterTimeout + 1000);

            // Get the timeout handler
            const timeoutHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'timeout')?.[1];
            expect(timeoutHandler).toBeDefined();

            // Simulate timeout for non-WebSocket connection
            if (timeoutHandler) {
                timeoutHandler();
            }

            // Should end the socket
            expect(mockSocket.end).toHaveBeenCalled();
        });

        /**
         * Tests handling of WebSocket upgrade requests without required key
         */
        it('should handle WebSocket upgrade requests without Sec-WebSocket-Key', () => {
            const { createServer } = require('net');
            createServer.mockReturnValue(mockServer);

            createCombinedServer(mockConnectionManager);

            // Simulate server 'connection' event
            expect(connectionHandler).toBeDefined();
            connectionHandler(mockSocket);

            // Simulate invalid WebSocket upgrade request (missing key)
            mockSocket.once('data', mockDataHandler);
            const upgradeRequest = [
                'GET /ws HTTP/1.1',
                'Host: localhost:8080',
                'Upgrade: websocket',
                'Connection: Upgrade',
                'Sec-WebSocket-Version: 13',
                '',
                ''
            ].join('\r\n');

            mockDataHandler(Buffer.from(upgradeRequest));

            // Should respond with 400 Bad Request
            expect(mockSocket.end).toHaveBeenCalledWith('HTTP/1.1 400 Bad Request\r\n\r\n');
            expect(mockWebSocketServer.handleUpgrade).not.toHaveBeenCalled();
        });

        /**
         * Tests handling of socket errors
         */
        it('should handle socket errors', () => {
            const { createServer } = require('net');
            createServer.mockReturnValue(mockServer);

            createCombinedServer(mockConnectionManager);

            // Simulate server 'connection' event
            expect(connectionHandler).toBeDefined();
            connectionHandler(mockSocket);

            // Verify error handler was registered
            expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));

            // Get the stored error handler and call it
            const handler = (mockSocket as any).socketErrorHandler();
            expect(handler).toBeDefined();
            handler?.(new Error('Socket error'));

            // Should destroy the socket
            expect(mockSocket.destroy).toHaveBeenCalled();
        });

        /**
         * Tests connection event emission after WebSocket upgrade
         */
        it('should emit connection event after WebSocket upgrade', () => {
            const { createServer } = require('net');
            createServer.mockReturnValue(mockServer);

            createCombinedServer(mockConnectionManager);

            // Simulate server 'connection' event
            expect(connectionHandler).toBeDefined();
            connectionHandler(mockSocket);

            // Simulate WebSocket upgrade request
            mockSocket.once('data', mockDataHandler);
            const upgradeRequest = [
                'GET /ws HTTP/1.1',
                'Host: localhost:8080',
                'Upgrade: websocket',
                'Connection: Upgrade',
                'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
                'Sec-WebSocket-Version: 13',
                '',
                ''
            ].join('\r\n');

            // Mock the handleUpgrade to capture and call its callback
            mockWebSocketServer.handleUpgrade.mockImplementation((req: IncomingMessage, socket: Socket, head: Buffer, callback: (client: WebSocket, request: IncomingMessage) => void) => {
                const mockWs = { on: jest.fn() } as unknown as WebSocket;
                callback(mockWs, req);
            });

            mockDataHandler(Buffer.from(upgradeRequest));

            // Verify handleUpgrade was called
            expect(mockWebSocketServer.handleUpgrade).toHaveBeenCalled();

            // Verify connection event was emitted with the WebSocket instance
            expect(mockWebSocketServer.emit).toHaveBeenCalledWith('connection', expect.any(Object), expect.any(Object));
        });

        /**
         * Tests server listen callback execution
         */
        it('should call listen callback after server starts', () => {
            const { createServer } = require('net');
            createServer.mockReturnValue(mockServer);

            createCombinedServer(mockConnectionManager);

            // Verify server.listen was called with correct parameters
            expect(mockServer.listen).toHaveBeenCalledWith(
                config.port,
                config.host,
                expect.any(Function)
            );

            // Get and call the listen callback
            const listenCallback = mockServer.listen.mock.calls[0][2];
            listenCallback();

            // Should log the server start
            const logger = require('@utils/logger').SetupLogger();
            expect(logger.info).toHaveBeenCalledWith(
                `Listening on ${config.host}:${config.port} (TCP/WebSocket)`
            );
        });

        /**
         * Tests handling of TCP socket errors with service ID
         */
        it('should handle TCP socket error with service ID', () => {
            const { createServer } = require('net');
            createServer.mockReturnValue(mockServer);

            createCombinedServer(mockConnectionManager);

            // Simulate server 'connection' event
            connectionHandler(mockSocket);

            // Create a mock connection with serviceId
            const mockConnection = { serviceId: 'test-service-id' };
            (TCPSocketConnection as jest.Mock).mockReturnValue(mockConnection);

            // Simulate non-WebSocket data to trigger TCP connection
            mockSocket.once('data', mockDataHandler);
            mockDataHandler(Buffer.from('TCP data'));

            // Get the stored error handler and call it
            const handler = (mockSocket as any).socketErrorHandler();
            expect(handler).toBeDefined();

            // Simulate TCP error
            const error = new Error('TCP socket error');
            handler?.(error);

            // Should log error with service ID and remove connection
            const logger = require('@utils/logger').SetupLogger();
            expect(logger.error).toHaveBeenCalledWith(
                'TCP error from service test-service-id (IP 127.0.0.1):',
                {
                    serviceId: 'test-service-id',
                    error
                }
            );
            expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith('test-service-id');
        });

        /**
         * Tests handling of TCP socket errors with undefined remote address
         */
        it('should handle TCP socket error with undefined remoteAddress', () => {
            const { createServer } = require('net');
            createServer.mockReturnValue(mockServer);

            createCombinedServer(mockConnectionManager);

            // Create a socket with undefined remoteAddress
            let socketErrorHandler: ((error: Error) => void) | undefined;
            const mockSocketWithoutAddress = {
                on: jest.fn((event: string, handler: any) => {
                    if (event === 'error') {
                        socketErrorHandler = handler;
                    }
                    return mockSocketWithoutAddress;
                }),
                once: jest.fn((event: string, handler: (data: Buffer) => void) => {
                    if (event === 'data') {
                        mockDataHandler = handler;
                    }
                    return mockSocketWithoutAddress;
                }),
                setTimeout: jest.fn(),
                end: jest.fn(),
                unshift: jest.fn(),
                destroy: jest.fn(),
                remoteAddress: undefined,
                emit: jest.fn(),
                socketErrorHandler: () => socketErrorHandler,
            } as any;

            // Simulate server 'connection' event
            connectionHandler(mockSocketWithoutAddress);

            // Create a mock connection with serviceId
            const mockConnection = { serviceId: 'test-service-id' };
            (TCPSocketConnection as jest.Mock).mockReturnValue(mockConnection);

            // Simulate non-WebSocket data to trigger TCP connection
            mockSocketWithoutAddress.once('data', mockDataHandler);
            mockDataHandler(Buffer.from('TCP data'));

            // Get the stored error handler and call it
            const handler = mockSocketWithoutAddress.socketErrorHandler();
            expect(handler).toBeDefined();

            // Simulate TCP error
            const error = new Error('TCP socket error');
            handler?.(error);

            // Should log error with service ID and 'unknown' IP
            const logger = require('@utils/logger').SetupLogger();
            expect(logger.error).toHaveBeenCalledWith(
                'TCP error from service test-service-id (IP unknown):',
                {
                    serviceId: 'test-service-id',
                    error
                }
            );
            expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith('test-service-id');
        });

        /**
         * Tests handling of WebSocket connections with undefined remote address
         */
        it('should handle WebSocket connection with undefined remoteAddress', () => {
            const { createServer } = require('net');
            createServer.mockReturnValue(mockServer);

            createCombinedServer(mockConnectionManager);

            // Create mock WebSocket and request with undefined remoteAddress
            const mockWs = {
                on: jest.fn(),
            } as unknown as WebSocket;

            const mockReq = {
                socket: {
                    remoteAddress: undefined // Simulate destroyed socket
                }
            } as unknown as IncomingMessage;

            // Simulate WebSocket connection
            wsConnectionHandler(mockWs, mockReq);

            // Should use 'unknown' as the IP address
            expect(WebSocketConnection).toHaveBeenCalledWith(mockWs, 'unknown');
            expect(mockConnectionManager.addConnection).toHaveBeenCalled();
        });

        /**
         * Tests handling of server close errors
         */
        it('should handle server close error', async () => {
            // Mock createTcpServer specifically
            const net = require('net');
            net.createServer = jest.fn().mockReturnValue(mockServer);

            const combinedServer = createCombinedServer(mockConnectionManager);

            // Mock server.close to call callback with error
            const closeError = new Error('Failed to close server');
            mockServer.close.mockImplementationOnce((callback?: (err?: Error) => void) => {
                if (callback) {
                    process.nextTick(() => callback(closeError));
                }
                return mockServer;
            });

            // Call close and expect it to reject
            await expect(combinedServer.close()).rejects.toThrow(closeError);

            // Verify error was logged
            const logger = require('@utils/logger').SetupLogger();
            expect(logger.error).toHaveBeenCalledWith('Error closing server:', closeError);
        });

        /**
         * Tests handling of WebSocket server close errors
         */
        it('should handle WebSocket server close error', async () => {
            const { createServer } = require('net');
            createServer.mockReturnValue(mockServer);

            const combinedServer = createCombinedServer(mockConnectionManager);

            // Mock WebSocket server close to fail
            const wsCloseError = new Error('Failed to close WebSocket server');
            mockWebSocketServer.close.mockImplementationOnce((callback?: (err?: Error) => void) => {
                if (callback) {
                    process.nextTick(() => callback(wsCloseError));
                }
                return mockWebSocketServer;
            });

            // Call close - it should resolve but log the error
            await combinedServer.close();

            // Verify error was logged
            const logger = require('@utils/logger').SetupLogger();
            expect(logger.error).toHaveBeenCalledWith('Error closing WebSocket server:', wsCloseError);
        });

        /**
         * Tests handling of TLS client errors
         */
        it('should handle TLS client errors gracefully', () => {
            const { createServer } = require('tls');
            createServer.mockReturnValue(mockServer);

            // Configure SSL
            (config as jest.Mocked<typeof config>).ssl = {
                key: 'key.pem',
                cert: 'cert.pem',
            };

            // Initialize tlsErrorHandler with a no-op function
            let tlsErrorHandler: (err: Error, tlsSocket: Socket) => void = () => {};

            mockServer.on.mockImplementation((event: string, handler: any) => {
                if (event === 'tlsClientError') {
                    tlsErrorHandler = handler;
                }
                return mockServer;
            });

            createCombinedServer(mockConnectionManager);

            // Verify TLS error handler was set up
            expect(tlsErrorHandler).toBeDefined();

            // Test ECONNRESET error
            const mockTlsSocket = { remoteAddress: '127.0.0.1', destroy: jest.fn() };
            const resetError = new Error('read ECONNRESET');
            (resetError as any).code = 'ECONNRESET';
            tlsErrorHandler(resetError, mockTlsSocket as any);

            // Should log at debug level for ECONNRESET
            const logger = require('@utils/logger').SetupLogger();
            expect(logger.debug).toHaveBeenCalledWith('TLS handshake aborted by client (IP 127.0.0.1)');
            expect(mockTlsSocket.destroy).toHaveBeenCalled();

            // Test other TLS error
            const otherError = new Error('TLS error');
            tlsErrorHandler(otherError, mockTlsSocket as any);

            // Should log at error level for other TLS errors
            expect(logger.error).toHaveBeenCalledWith('TLS error with client (IP 127.0.0.1):', otherError);
            expect(mockTlsSocket.destroy).toHaveBeenCalledTimes(2);
        });

        /**
         * Tests SSL connection handling
         */
        it('should handle SSL connections with proper configuration', () => {
            const { createServer } = require('tls');
            createServer.mockReturnValue(mockServer);

            // Configure SSL
            (config as jest.Mocked<typeof config>).ssl = {
                key: 'key.pem',
                cert: 'cert.pem',
            };

            const server = createCombinedServer(mockConnectionManager);

            // Verify server was created with SSL config
            expect(createServer).toHaveBeenCalledWith({
                key: undefined, // fs.readFileSync is mocked
                cert: undefined, // fs.readFileSync is mocked
            });

            // Simulate SSL connection
            connectionHandler(mockSocket);

            // Verify connection is handled normally after SSL handshake
            mockSocket.once('data', mockDataHandler);
            mockDataHandler(Buffer.from('SSL data'));

            expect(TCPSocketConnection).toHaveBeenCalledWith(mockSocket, '127.0.0.1');
            expect(mockConnectionManager.addConnection).toHaveBeenCalled();
        });

        /**
         * Tests handling of TLS client errors with undefined remoteAddress
         */
        it('should handle TLS client errors with undefined remoteAddress', () => {
            const { createServer } = require('tls');
            createServer.mockReturnValue(mockServer);

            // Configure SSL
            (config as jest.Mocked<typeof config>).ssl = {
                key: 'key.pem',
                cert: 'cert.pem',
            };

            // Initialize tlsErrorHandler with a no-op function
            let tlsErrorHandler: (err: Error, tlsSocket: Socket) => void = () => {};

            mockServer.on.mockImplementation((event: string, handler: any) => {
                if (event === 'tlsClientError') {
                    tlsErrorHandler = handler;
                }
                return mockServer;
            });

            createCombinedServer(mockConnectionManager);

            // Verify TLS error handler was set up
            expect(tlsErrorHandler).toBeDefined();

            // Test ECONNRESET error with undefined remoteAddress
            const mockTlsSocket = { remoteAddress: undefined, destroy: jest.fn() };
            const resetError = new Error('read ECONNRESET');
            (resetError as any).code = 'ECONNRESET';
            tlsErrorHandler(resetError, mockTlsSocket as any);

            // Should log at debug level for ECONNRESET with 'unknown' IP
            const logger = require('@utils/logger').SetupLogger();
            expect(logger.debug).toHaveBeenCalledWith('TLS handshake aborted by client (IP unknown)');
            expect(mockTlsSocket.destroy).toHaveBeenCalled();

            // Test other TLS error with undefined remoteAddress
            const otherError = new Error('TLS error');
            tlsErrorHandler(otherError, mockTlsSocket as any);

            // Should log at error level for other TLS errors with 'unknown' IP
            expect(logger.error).toHaveBeenCalledWith('TLS error with client (IP unknown):', otherError);
            expect(mockTlsSocket.destroy).toHaveBeenCalledTimes(2);
        });
    });
});
