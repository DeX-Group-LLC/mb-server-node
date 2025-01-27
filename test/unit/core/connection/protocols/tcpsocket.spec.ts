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
import { ConnectionState } from '@core/connection/types';
import logger from '@utils/logger';
import { MAX_HEADER_LENGTH } from '@core/utils/message';

// Mock message utilities to provide consistent header length
jest.mock('@core/utils/message', () => ({
    MAX_HEADER_LENGTH: 512
}));

/**
 * Mock logger to track error and info messages
 */
jest.mock('@utils/logger', () => ({
    SetupLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn()
    })
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
        /**
         * Tests that socket is properly ended when connection is open
         * Verifies clean connection shutdown
         */
        it('should end socket when connection is open', () => {
            connection.close();
            expect(socket.end).toHaveBeenCalled();
            expect(connection.state).toBe(ConnectionState.CLOSED);
        });

        /**
         * Tests that closing already closed connection is handled gracefully
         * Verifies idempotent close behavior
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