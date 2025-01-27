/**
 * @file Test suite for WebSocketConnection class
 * @description Tests the WebSocket connection implementation, including:
 * - Connection state management
 * - Message handling and validation
 * - Connection closure and cleanup
 * - Error handling and logging
 */

import { WebSocket, WebSocketServer } from 'ws';
import { WebSocketConnection } from '@core/connection/protocols/websocket';
import { ConnectionState } from '@core/connection/types';
import { InternalError } from '@core/errors';
import logger from '@utils/logger';

jest.mock('@config', () => ({
    config: {
        port: 8080,
        message: {
            payload: {
                maxLength: 32 * 1024
            }
        },
        request: {
            response: {
                timeout: {
                    max: 30000 // Adding default 30 second max timeout
                }
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
 * Extended WebSocket interface for testing
 * @interface MockWebSocket
 * @extends {Partial<WebSocket>}
 * @description Adds properties needed to track state and handlers in tests
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
 * @description Adds properties needed to track error handlers in tests
 */
interface MockWebSocketServer extends jest.Mocked<WebSocketServer> {
    errorHandler: ((err: Error) => void) | null;
}

/**
 * Test suite for WebSocket connection implementation
 * @group unit
 * @group connection
 * @group protocols
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
         * Tests that connection reports OPEN state when WebSocket is open
         */
        it('should return OPEN when WebSocket is open', () => {
            mockWs._readyState = WebSocket.OPEN;
            expect(connection.state).toBe(ConnectionState.OPEN);
        });

        /**
         * Tests that connection reports CLOSED state when WebSocket is not open
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
         * Tests that message listener is properly registered
         */
        it('should register message listener', () => {
            const listener = jest.fn();
            connection.onMessage(listener);
            expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
        });

        /**
         * Tests that received messages are forwarded to listener
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