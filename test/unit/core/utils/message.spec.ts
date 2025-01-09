import { MalformedMessageError } from '@core/errors';
import { ActionType } from '@core/types';
import { Parser, serialize, prettySize } from '@core/utils/message';

// Mock config before imports
jest.mock('@config', () => ({
    config: {
        message: {
            payload: {
                maxLength: 32 * 1024, // 32KB
            },
        },
        request: {
            response: {
                timeout: {
                    max: 5000,
                },
            },
        },
    },
}));

/**
 * Test suite for message utility functions.
 * Tests the core functionality of message parsing, serialization, and formatting.
 *
 * Key areas tested:
 * - Message size formatting
 * - Message parsing and validation
 * - Message serialization
 * - Error handling for malformed messages
 */
describe('message utils', () => {
    /**
     * Tests for size formatting functionality.
     * Verifies the prettySize function properly formats:
     * - Byte values
     * - Kilobyte values
     * - Megabyte values
     * - Gigabyte values
     */
    describe('prettySize', () => {
        /**
         * Verifies that byte values are formatted correctly.
         * The function should:
         * - Format values under 1KB
         * - Append 'B' suffix
         */
        it('should format bytes correctly', () => {
            // Test formatting of byte-sized value
            expect(prettySize(500)).toBe('500B');
        });

        /**
         * Verifies that kilobyte values are formatted correctly.
         * The function should:
         * - Convert bytes to kilobytes
         * - Format with proper precision
         * - Append 'KB' suffix
         */
        it('should format kilobytes correctly', () => {
            // Test formatting of kilobyte-sized value
            expect(prettySize(1500)).toBe('1.46484375KB');
        });

        /**
         * Verifies that megabyte values are formatted correctly.
         * The function should:
         * - Convert bytes to megabytes
         * - Format with proper precision
         * - Append 'MB' suffix
         */
        it('should format megabytes correctly', () => {
            // Test formatting of megabyte-sized value
            expect(prettySize(1500000)).toBe('1.430511474609375MB');
        });

        /**
         * Verifies that gigabyte values are formatted correctly.
         * The function should:
         * - Convert bytes to gigabytes
         * - Format with proper precision
         * - Append 'GB' suffix
         */
        it('should format gigabytes correctly', () => {
            // Test formatting of gigabyte-sized value
            expect(prettySize(1500000000)).toBe('1.3969838619232178GB');
        });
    });

    /**
     * Tests for message parsing functionality.
     * Verifies the Parser class properly handles:
     * - Valid message formats with and without request IDs
     * - Message header validation
     * - Message payload validation
     * - Various error conditions and malformed messages
     */
    describe('Parser', () => {
        /**
         * Verifies that valid messages with request IDs are parsed correctly.
         * The parser should:
         * - Parse the header components (action, topic, version, requestid)
         * - Parse the JSON payload
         * - Return correctly structured objects
         */
        it('should parse valid message correctly', () => {
            // Setup test message with complete header including request ID
            const validMessageWithRequestId = 'publish:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000\n{"data":"test"}';
            const parser = new Parser(validMessageWithRequestId);
            const header = parser.parseHeader();
            const payload = parser.parsePayload(header.action);

            // Verify header components are correctly parsed
            expect(header).toEqual({
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0',
                requestid: '123e4567-e89b-12d3-a456-426614174000'
            });
            // Verify payload is correctly parsed
            expect(payload).toEqual({ data: 'test' });
        });

        /**
         * Verifies that valid messages without request IDs are parsed correctly.
         * The parser should:
         * - Parse the header components (action, topic, version)
         * - Handle missing requestid gracefully
         * - Parse the JSON payload
         */
        it('should parse message without requestid correctly', () => {
            // Setup test message without request ID
            const validMessageWithoutRequestId = 'publish:test.topic:1.0.0\n{"data":"test"}';
            const parser = new Parser(validMessageWithoutRequestId);
            const header = parser.parseHeader();
            const payload = parser.parsePayload(header.action);

            // Verify header components are correctly parsed
            expect(header).toEqual({
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0',
                requestid: undefined
            });
            // Verify payload is correctly parsed
            expect(payload).toEqual({ data: 'test' });
        });

        /**
         * Verifies that messages without newline separators are rejected.
         * The parser should:
         * - Detect missing newline separator
         * - Throw MalformedMessageError with descriptive message
         */
        it('should throw MalformedMessageError for missing newline separator', () => {
            // Setup test message without newline separator
            const messageWithoutNewline = 'publish:test.topic:1.0.0';

            // Verify appropriate error is thrown
            expect(() => new Parser(messageWithoutNewline)).toThrow(MalformedMessageError);
            expect(() => new Parser(messageWithoutNewline)).toThrow('Invalid message format: no newline separator found');
        });

        /**
         * Verifies that messages with invalid action types are rejected.
         * The parser should:
         * - Validate the action type
         * - Throw MalformedMessageError for unknown actions
         */
        it('should throw MalformedMessageError for invalid action type', () => {
            // Setup test message with invalid action type
            const messageWithInvalidAction = 'invalid:test.topic:1.0.0\n{}';
            const parser = new Parser(messageWithInvalidAction);

            // Verify appropriate error is thrown
            expect(() => parser.parseHeader()).toThrow(MalformedMessageError);
            expect(() => parser.parseHeader()).toThrow('Invalid action: invalid');
        });

        /**
         * Verifies that messages with invalid topic names are rejected.
         * The parser should:
         * - Validate the topic name format
         * - Throw MalformedMessageError for invalid topics
         */
        it('should throw MalformedMessageError for invalid topic name', () => {
            // Setup test message with invalid topic name
            const messageWithInvalidTopic = 'publish:invalid/topic:1.0.0\n{}';
            const parser = new Parser(messageWithInvalidTopic);

            // Verify appropriate error is thrown
            expect(() => parser.parseHeader()).toThrow(MalformedMessageError);
            expect(() => parser.parseHeader()).toThrow('Invalid topic name: invalid/topic');
        });

        /**
         * Verifies that messages with invalid version formats are rejected.
         * The parser should:
         * - Validate the version format
         * - Throw MalformedMessageError for invalid versions
         */
        it('should throw MalformedMessageError for invalid version format', () => {
            // Setup test message with invalid version format
            const messageWithInvalidVersion = 'publish:test.topic:invalid\n{}';
            const parser = new Parser(messageWithInvalidVersion);

            // Verify appropriate error is thrown
            expect(() => parser.parseHeader()).toThrow(MalformedMessageError);
            expect(() => parser.parseHeader()).toThrow('Invalid message version format: invalid');
        });

        /**
         * Verifies that messages with invalid request ID formats are rejected.
         * The parser should:
         * - Validate the request ID format
         * - Throw MalformedMessageError for invalid request IDs
         */
        it('should throw MalformedMessageError for invalid request ID format', () => {
            // Setup test message with invalid request ID
            const messageWithInvalidRequestId = 'publish:test.topic:1.0.0:invalid-req-id\n{}';
            const parser = new Parser(messageWithInvalidRequestId);

            // Verify appropriate error is thrown
            expect(() => parser.parseHeader()).toThrow(MalformedMessageError);
            expect(() => parser.parseHeader()).toThrow('Invalid request ID format: invalid-req-id');
        });

        /**
         * Verifies that messages with missing header parts are rejected.
         * The parser should:
         * - Validate all required header components
         * - Throw MalformedMessageError for missing parts
         */
        it('should throw MalformedMessageError for missing header parts', () => {
            // Setup test message with incomplete header
            const messageWithMissingParts = 'publish:test.topic\n{}';
            const parser = new Parser(messageWithMissingParts);

            // Verify appropriate error is thrown
            expect(() => parser.parseHeader()).toThrow(MalformedMessageError);
            expect(() => parser.parseHeader()).toThrow('Invalid header format: missing action, topic, or version');
        });

        /**
         * Verifies that messages with invalid JSON payloads are rejected.
         * The parser should:
         * - Validate JSON payload format
         * - Throw MalformedMessageError for invalid JSON
         */
        it('should throw error for invalid JSON payload', () => {
            // Setup test message with malformed JSON
            const message = 'publish:test.topic:1.0.0\n{invalid:json}';
            const parser = new Parser(message);
            const header = parser.parseHeader();

            // Verify appropriate error is thrown
            expect(() => parser.parsePayload(header.action)).toThrow(MalformedMessageError);
            expect(() => parser.parsePayload(header.action)).toThrow(/Invalid JSON payload/);
        });

        /**
         * Verifies that timeout values are validated correctly.
         * The parser should:
         * - Validate timeout values
         * - Throw MalformedMessageError for invalid timeouts
         */
        it('should validate timeout value', () => {
            // Setup test message with invalid timeout
            const payload = { timeout: -1 };
            const message = `request:test.topic:1.0.0\n${JSON.stringify(payload)}`;
            const parser = new Parser(message);
            const header = parser.parseHeader();

            // Verify appropriate error is thrown
            expect(() => parser.parsePayload(header.action)).toThrow(MalformedMessageError);
            expect(() => parser.parsePayload(header.action)).toThrow(/Invalid timeout value/);
        });

        /**
         * Verifies that timeout is only allowed in request messages.
         * The parser should:
         * - Validate timeout usage
         * - Throw MalformedMessageError for timeouts in non-request messages
         */
        it('should validate timeout is only allowed for request actions', () => {
            // Setup test message with timeout in non-request message
            const payload = { timeout: 1000 };
            const message = `publish:test.topic:1.0.0\n${JSON.stringify(payload)}`;
            const parser = new Parser(message);
            const header = parser.parseHeader();

            // Verify appropriate error is thrown
            expect(() => parser.parsePayload(header.action)).toThrow(MalformedMessageError);
            expect(() => parser.parsePayload(header.action)).toThrow(/Timeout is only allowed for request actions/);
        });

        /**
         * Verifies that error objects in payloads are validated correctly.
         * The parser should:
         * - Validate error object structure
         * - Throw MalformedMessageError for invalid error objects
         */
        it('should validate error object in payload', () => {
            // Setup test message with incomplete error object
            const payload = { error: { code: 'ERR_001' } }; // Missing message and timestamp
            const message = `publish:test.topic:1.0.0\n${JSON.stringify(payload)}`;
            const parser = new Parser(message);
            const header = parser.parseHeader();

            // Verify appropriate error is thrown
            expect(() => parser.parsePayload(header.action)).toThrow(MalformedMessageError);
            expect(() => parser.parsePayload(header.action)).toThrow(/Invalid error object in payload/);
        });

        /**
         * Verifies that valid error objects in payloads are accepted.
         * The parser should:
         * - Validate complete error object structure
         * - Accept valid error objects
         */
        it('should accept valid error object in payload', () => {
            // Setup test message with valid error object
            const payload = {
                error: {
                    code: 'ERR_001',
                    message: 'Test error',
                    timestamp: '2023-01-01T00:00:00Z'
                }
            };
            const message = `publish:test.topic:1.0.0\n${JSON.stringify(payload)}`;
            const parser = new Parser(message);
            const header = parser.parseHeader();
            const result = parser.parsePayload(header.action);

            // Verify payload is accepted
            expect(result).toEqual(payload);
        });

        /**
         * Verifies that payload size limits are enforced.
         * The parser should:
         * - Validate payload size
         * - Throw MalformedMessageError for oversized payloads
         */
        it('should handle payload size validation', () => {
            // Setup test message with oversized payload
            const largePayload = { data: 'x'.repeat(32 * 1024 + 1) }; // Just over 32KB
            const message = `publish:test.topic:1.0.0\n${JSON.stringify(largePayload)}`;
            const parser = new Parser(message);
            const header = parser.parseHeader();

            // Verify appropriate error is thrown
            expect(() => parser.parsePayload(header.action)).toThrow(MalformedMessageError);
            expect(() => parser.parsePayload(header.action)).toThrow(/Payload exceeds maximum length/);
        });
    });

    /**
     * Tests for message serialization functionality.
     * Verifies the serialize function properly handles:
     * - Messages with complete headers and payloads
     * - Messages without request IDs
     * - Messages with empty payloads
     * - Error response messages
     */
    describe('serialize', () => {
        /**
         * Verifies that messages with complete headers and payloads are serialized correctly.
         * The function should:
         * - Format the header with all components
         * - Serialize the payload to JSON
         * - Combine with correct separator
         */
        it('should serialize message with header and payload correctly', () => {
            // Setup test header with all components
            const header = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0',
                requestid: '123e4567-e89b-12d3-a456-426614174000'
            };
            // Setup test payload with multiple fields
            const payload = {
                data: 'test',
                count: 123
            };

            // Serialize message and verify format
            const serialized = serialize(header, payload);
            expect(serialized).toBe('publish:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000\n{"data":"test","count":123}');
        });

        /**
         * Verifies that messages without request IDs are serialized correctly.
         * The function should:
         * - Format the header without requestid
         * - Serialize the payload to JSON
         * - Combine with correct separator
         */
        it('should serialize message without requestid correctly', () => {
            // Setup test header without requestid
            const header = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0'
            };
            // Setup simple test payload
            const payload = {
                data: 'test'
            };

            // Serialize message and verify format
            const serialized = serialize(header, payload);
            expect(serialized).toBe('publish:test.topic:1.0.0\n{"data":"test"}');
        });

        /**
         * Verifies that messages with empty payloads are serialized correctly.
         * The function should:
         * - Format the header normally
         * - Serialize empty payload as empty object
         * - Combine with correct separator
         */
        it('should serialize message with empty payload correctly', () => {
            // Setup test header with empty payload
            const header = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0'
            };
            const payload = {};

            // Serialize message and verify format
            const serialized = serialize(header, payload);
            expect(serialized).toBe('publish:test.topic:1.0.0\n{}');
        });

        /**
         * Verifies that error response messages are serialized correctly.
         * The function should:
         * - Format the response header
         * - Serialize error payload with all components
         * - Combine with correct separator
         */
        it('should serialize error response message correctly', () => {
            // Setup test header for error response
            const header = {
                action: ActionType.RESPONSE,
                topic: 'test.topic',
                version: '1.0.0',
                requestid: '123e4567-e89b-12d3-a456-426614174000'
            };
            // Setup error payload with all required fields
            const payload = {
                error: {
                    code: 'TEST_ERROR',
                    message: 'Test error message',
                    details: { additionalInfo: 'test details' },
                    timestamp: '2023-01-01T00:00:00Z'
                }
            };

            // Serialize message and verify format
            const serialized = serialize(header, payload);
            expect(serialized).toBe('response:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000\n{"error":{"code":"TEST_ERROR","message":"Test error message","details":{"additionalInfo":"test details"},"timestamp":"2023-01-01T00:00:00Z"}}');
        });
    });
});