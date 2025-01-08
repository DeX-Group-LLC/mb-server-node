import { WebSocket, WebSocketServer } from 'ws';
import { Socket } from 'net';
import { IncomingMessage } from 'http';
import { ConnectionManager } from '@core/connection';
import { createWebSocketServer, WebSocketConnection } from '@core/connection/websocket';
import { ConnectionState } from '@core/connection/types';
import { InternalError } from '@core/errors';
import logger from '@utils/logger';

jest.mock('ws');
jest.mock('@utils/logger');

// Mock config before imports
jest.mock('@/config', () => ({
    config: {
        port: 8080,
        message: {
            payload: {
                maxLength: 32 * 1024, // 32KB
            },
        },
        logging: {
            level: 'error',
        },
    },
}));

// Custom interfaces for our mocks
interface MockWebSocket extends WebSocket {
    _readyState: number;
    errorHandler: ((err: Error) => void) | null;
}

interface MockWebSocketServer extends jest.Mocked<WebSocketServer> {
    errorHandler: ((err: Error) => void) | null;
}

describe('WebSocket Implementation', () => {
    let mockConnectionManager: jest.Mocked<ConnectionManager>;
    let mockWs: MockWebSocket;
    let mockSocket: Partial<Socket>;
    let mockReq: Partial<IncomingMessage>;
    let wss: MockWebSocketServer;
    let connectionHandler: (ws: WebSocket, req: IncomingMessage) => void;
    let errorHandler: (error: Error) => void;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Create mock WebSocket
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
            // Add other required WebSocket properties
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

        // Add ability to modify readyState for testing
        Object.defineProperty(mockWs, 'readyState', {
            get: jest.fn(() => mockWs._readyState),
            set: jest.fn((value) => { mockWs._readyState = value; }),
            configurable: true
        });

        // Create mock socket with proper typing
        mockSocket = {
            remoteAddress: '127.0.0.1'
        };

        // Create mock request with minimum required properties
        mockReq = {
            socket: mockSocket as Socket,
            headers: {},
            httpVersion: '1.1',
            httpVersionMajor: 1,
            httpVersionMinor: 1,
            method: 'GET',
            url: '/',
        } as Partial<IncomingMessage>;

        mockConnectionManager = {
            addConnection: jest.fn(),
            removeConnection: jest.fn(),
            sendMessage: jest.fn(),
        } as unknown as jest.Mocked<ConnectionManager>;

        // Create mock WebSocketServer
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
        if (wss) {
            wss.close();
        }
    });

    afterAll(() => {
        jest.resetModules();
    });

    describe('createWebSocketServer', () => {
        it('should create WebSocket server with correct port', () => {
            createWebSocketServer(mockConnectionManager);

            expect(WebSocketServer).toHaveBeenCalledWith({
                port: 8080,
                maxPayload: 32 * 1024 + 512, // 32KB + 512 bytes
            });
        });

        it('should handle new connections', () => {
            createWebSocketServer(mockConnectionManager);

            // Simulate connection
            connectionHandler(mockWs, mockReq as IncomingMessage);

            expect(mockConnectionManager.addConnection).toHaveBeenCalled();
        });

        it('should handle connections without IP address', () => {
            createWebSocketServer(mockConnectionManager);

            // Create a request with no IP
            const reqWithoutIp = {
                ...mockReq,
                socket: { remoteAddress: undefined } as Socket
            } as IncomingMessage;

            // Simulate connection with no IP
            connectionHandler(mockWs, reqWithoutIp);

            expect(mockConnectionManager.addConnection).toHaveBeenCalled();
        });

        it('should handle WebSocket errors', () => {
            createWebSocketServer(mockConnectionManager);

            // Simulate connection
            connectionHandler(mockWs, mockReq as IncomingMessage);

            // Simulate error
            const testError = new Error('test error');
            mockWs.errorHandler?.(testError);

            expect(mockConnectionManager.removeConnection).toHaveBeenCalled();
        });

        it('should handle server errors', () => {
            const loggerSpy = jest.spyOn(logger, 'error');
            createWebSocketServer(mockConnectionManager);

            // Simulate server error
            const testError = new Error('test server error');
            errorHandler(testError);

            expect(loggerSpy).toHaveBeenCalledWith('WebSocket server error:', testError);
            loggerSpy.mockRestore();
        });
    });

    describe('WebSocketConnection', () => {
        let connection: WebSocketConnection;

        beforeEach(() => {
            connection = new WebSocketConnection(mockWs, '127.0.0.1');
            connection.serviceId = 'test-service';
        });

        describe('state', () => {
            it('should return OPEN when WebSocket is open', () => {
                mockWs._readyState = WebSocket.OPEN;
                expect(connection.state).toBe(ConnectionState.OPEN);
            });

            it('should return CLOSED when WebSocket is not open', () => {
                mockWs._readyState = WebSocket.CLOSED;
                expect(connection.state).toBe(ConnectionState.CLOSED);
            });
        });

        describe('onMessage', () => {
            it('should register message listener and handle Buffer messages', () => {
                const listener = jest.fn();
                const testMessage = 'test message';

                // Mock the message event
                (mockWs.on as jest.Mock).mockImplementation((event, handler) => {
                    if (event === 'message') {
                        handler(Buffer.from(testMessage));
                    }
                    return mockWs;
                });

                connection.onMessage(listener);
                expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
                expect(listener).toHaveBeenCalledWith(testMessage);
            });
        });

        describe('onClose', () => {
            it('should register close listener', () => {
                const listener = jest.fn();
                connection.onClose(listener);
                expect(mockWs.on).toHaveBeenCalledWith('close', listener);
            });
        });

        describe('send', () => {
            it('should send message when connection is open', () => {
                mockWs._readyState = WebSocket.OPEN;
                const message = 'test message';
                connection.send(message);
                expect(mockWs.send).toHaveBeenCalledWith(message);
            });

            it('should throw error when connection is not open', () => {
                mockWs._readyState = WebSocket.CLOSED;
                const message = 'test message';
                expect(() => connection.send(message)).toThrow(InternalError);
                expect(() => connection.send(message)).toThrow('Desired service connection is not open');
                expect(mockWs.send).not.toHaveBeenCalled();
            });

            it('should log warning when connection is not open', () => {
                const loggerSpy = jest.spyOn(logger, 'warn');
                mockWs._readyState = WebSocket.CLOSED;
                const message = 'test message';

                expect(() => connection.send(message)).toThrow(InternalError);
                expect(loggerSpy).toHaveBeenCalledWith(
                    'Unable to send message to service test-service: Connection is not open'
                );
                loggerSpy.mockRestore();
            });
        });

        describe('close', () => {
            it('should close connection when open', () => {
                mockWs._readyState = WebSocket.OPEN;
                connection.close();
                expect(mockWs.close).toHaveBeenCalled();
            });

            it('should not close connection when already closed', () => {
                mockWs._readyState = WebSocket.CLOSED;
                connection.close();
                expect(mockWs.close).not.toHaveBeenCalled();
            });
        });
    });
});