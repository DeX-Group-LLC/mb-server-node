import { MalformedMessageError, MessageError } from '@core/errors';
import { ActionType } from '@core/types';
import { Parser, serialize, prettySize, toBrokerHeader, serializePayload } from '@core/utils/message';

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
            const validMessageWithRequestId = Buffer.from('publish:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000\n{"data":"test"}');
            const parser = new Parser(validMessageWithRequestId);

            // Access header property instead of calling private parseHeader
            expect(parser.header).toEqual({
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: '123e4567-e89b-12d3-a456-426614174000'
            });

            // Use public property for payload
            expect(JSON.parse(parser.rawPayload.toString())).toEqual({ data: 'test' });
        });

        /**
         * Verifies that valid messages without request IDs are parsed correctly.
         * The parser should:
         * - Parse the header components (action, topic, version)
         * - Handle missing requestid gracefully
         * - Parse the JSON payload
         */
        it('should parse message without requestid correctly', () => {
            const validMessageWithoutRequestId = Buffer.from('publish:test.topic:1.0.0\n{"data":"test"}');
            const parser = new Parser(validMessageWithoutRequestId);

            expect(parser.header).toEqual({
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: undefined
            });

            expect(JSON.parse(parser.rawPayload.toString())).toEqual({ data: 'test' });
        });

        /**
         * Verifies that messages without newline separators are rejected.
         * The parser should:
         * - Detect missing newline separator
         * - Throw MalformedMessageError with descriptive message
         */
        it('should throw MalformedMessageError for missing newline separator', () => {
            const messageWithoutNewline = Buffer.from('publish:test.topic:1.0.0');
            expect(() => new Parser(messageWithoutNewline)).toThrow(MalformedMessageError);
            expect(() => new Parser(messageWithoutNewline)).toThrow(/Invalid message format: no newline separator found/);
        });

        /**
         * Verifies that messages with invalid action types are rejected.
         * The parser should:
         * - Validate the action type
         * - Throw MalformedMessageError for unknown actions
         */
        it('should throw MalformedMessageError for invalid action type', () => {
            const messageWithInvalidAction = Buffer.from('invalid:test.topic:1.0.0\n{}');
            expect(() => new Parser(messageWithInvalidAction)).toThrow(MalformedMessageError);
            expect(() => new Parser(messageWithInvalidAction)).toThrow(/Invalid action: invalid/);
        });

        /**
         * Verifies that messages with invalid topic names are rejected.
         * The parser should:
         * - Validate the topic name format
         * - Throw MalformedMessageError for invalid topics
         */
        it('should throw MalformedMessageError for invalid topic name', () => {
            const messageWithInvalidTopic = Buffer.from('publish:invalid/topic:1.0.0\n{}');
            expect(() => new Parser(messageWithInvalidTopic)).toThrow(MalformedMessageError);
            expect(() => new Parser(messageWithInvalidTopic)).toThrow(/Invalid topic name: invalid\/topic/);
        });

        /**
         * Verifies that messages with invalid version formats are rejected.
         * The parser should:
         * - Validate the version format
         * - Throw MalformedMessageError for invalid versions
         */
        it('should throw MalformedMessageError for invalid version format', () => {
            const messageWithInvalidVersion = Buffer.from('publish:test.topic:invalid\n{}');
            expect(() => new Parser(messageWithInvalidVersion)).toThrow(MalformedMessageError);
            expect(() => new Parser(messageWithInvalidVersion)).toThrow(/Invalid message version format: invalid/);
        });

        /**
         * Verifies that messages with invalid request ID formats are rejected.
         * The parser should:
         * - Validate the request ID format
         * - Throw MalformedMessageError for invalid request IDs
         */
        it('should throw MalformedMessageError for invalid request ID format', () => {
            const messageWithInvalidRequestId = Buffer.from('publish:test.topic:1.0.0:invalid-req-id\n{}');
            expect(() => new Parser(messageWithInvalidRequestId)).toThrow(MalformedMessageError);
            expect(() => new Parser(messageWithInvalidRequestId)).toThrow(/Invalid request ID format: invalid-req-id/);
        });

        /**
         * Verifies that messages with missing header parts are rejected.
         * The parser should:
         * - Validate all required header components
         * - Throw MalformedMessageError for missing parts
         */
        it('should throw MalformedMessageError for missing header parts', () => {
            const messageWithMissingParts = Buffer.from('publish:test.topic\n{}');
            expect(() => new Parser(messageWithMissingParts)).toThrow(MalformedMessageError);
            expect(() => new Parser(messageWithMissingParts)).toThrow(/Invalid header format: missing action, topic, or version/);
        });

        /**
         * Verifies that messages with invalid JSON payloads are rejected.
         * The parser should:
         * - Validate JSON payload format
         * - Throw MalformedMessageError for invalid JSON
         */
        it('should throw error for invalid JSON payload', () => {
            const message = Buffer.from('publish:test.topic:1.0.0\n{invalid:json}');
            const parser = new Parser(message);
            expect(() => parser.parsePayload()).toThrow(MalformedMessageError);
        });

        /**
         * Verifies that timeout values are validated correctly.
         * The parser should:
         * - Validate timeout values
         * - Throw MalformedMessageError for invalid timeouts
         */
        it('should validate timeout value', () => {
            const payload = { timeout: -1 };
            const message = Buffer.from(`request:test.topic:1.0.0:req-1:parent-1:-1\n${JSON.stringify(payload)}`);
            expect(() => new Parser(message)).toThrow(MalformedMessageError);
        });

        /**
         * Verifies that timeout is only allowed in request messages.
         * The parser should:
         * - Validate timeout usage
         * - Throw MalformedMessageError for timeouts in non-request messages
         */
        it('should validate timeout is only allowed for request actions', () => {
            const payload = { timeout: 1000 };
            const message = Buffer.from(`publish:test.topic:1.0.0:req-1:parent-1:1000\n${JSON.stringify(payload)}`);
            expect(() => new Parser(message)).toThrow(MalformedMessageError);
        });

        /**
         * Tests error object validation in payload
         */
        it('should throw MalformedMessageError for invalid error object structure', () => {
            const message = Buffer.from('publish:test.topic:1.0.0\nerror:{"code":"TEST_ERROR"}');
            const parser = new Parser(message);
            expect(() => parser.parsePayload()).toThrow(MalformedMessageError);
            expect(() => parser.parsePayload()).toThrow(/Invalid error object in payload/);
        });

        /**
         * Tests throwing MessageError for valid error objects
         */
        it('should throw MessageError for valid error object', () => {
            const errorPayload = {
                code: 'TEST_ERROR',
                message: 'Test error message',
                details: { additionalInfo: 'test details' },
                timestamp: '2023-01-01T00:00:00Z'
            };
            const message = Buffer.from(`publish:test.topic:1.0.0\nerror:${JSON.stringify(errorPayload)}`);
            const parser = new Parser(message);

            try {
                parser.parsePayload();
                fail('Expected MessageError to be thrown');
            } catch (error) {
                expect(error instanceof MessageError).toBe(true);
                const messageError = error as MessageError;
                expect(messageError.code).toBe('TEST_ERROR');
                expect(messageError.message).toBe('Test error message');
                expect(messageError.details).toEqual({ additionalInfo: 'test details' });
            }
        });

        /**
         * Verifies that valid error objects in payloads are accepted.
         * The parser should:
         * - Validate complete error object structure
         * - Accept valid error objects
         */
        it('should accept valid error object in payload', () => {
            const payload = {
                error: {
                    code: 'ERR_001',
                    message: 'Test error',
                    timestamp: '2023-01-01T00:00:00Z'
                }
            };
            const message = Buffer.from(`publish:test.topic:1.0.0\n${JSON.stringify(payload)}`);
            const parser = new Parser(message);
            expect(parser.parsePayload()).toEqual(payload);
        });

        /**
         * Verifies that payload size limits are enforced.
         * The parser should:
         * - Validate payload size
         * - Throw MalformedMessageError for oversized payloads
         */
        it('should handle payload size validation', () => {
            const largePayload = { data: 'x'.repeat(32 * 1024 + 1) };
            const message = Buffer.from(`publish:test.topic:1.0.0\n${JSON.stringify(largePayload)}`);
            const parser = new Parser(message);
            expect(() => parser.parsePayload()).toThrow(MalformedMessageError);
        });

        /**
         * Tests the getter methods of the Parser class
         */
        it('should provide access to message components via getters', () => {
            const message = Buffer.from('publish:test.topic:1.0.0\n{"data":"test"}');
            const parser = new Parser(message);

            expect(parser.length).toBe(message.length);
            expect(parser.hasError).toBe(false);
            expect(parser.rawMessage).toEqual(message);
            expect(parser.rawHeader).toEqual(Buffer.from('publish:test.topic:1.0.0'));
            expect(parser.rawPayload).toEqual(Buffer.from('{"data":"test"}'));
        });

        /**
         * Tests parent request ID validation
         */
        it('should throw MalformedMessageError for invalid parent request ID format', () => {
            const message = Buffer.from('publish:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000:invalid-parent\n{}');
            expect(() => new Parser(message)).toThrow(MalformedMessageError);
            expect(() => new Parser(message)).toThrow(/Invalid parent request ID format/);
        });

        /**
         * Tests invalid timeout value validation
         */
        it('should throw MalformedMessageError for invalid timeout value', () => {
            const message = Buffer.from('request:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000::6000\n{}');
            expect(() => new Parser(message)).toThrow(MalformedMessageError);
            expect(() => new Parser(message)).toThrow(/Invalid timeout value/);
        });

        /**
         * Tests timeout validation in non-request messages
         */
        it('should throw MalformedMessageError for timeout in non-request message', () => {
            const message = Buffer.from('publish:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000::1000\n{}');
            expect(() => new Parser(message)).toThrow(MalformedMessageError);
            expect(() => new Parser(message)).toThrow(/Timeout is only allowed for request actions/);
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
         * Tests for serializePayload function
         */
        describe('serializePayload', () => {
            it('should handle Buffer payload', () => {
                const bufferPayload = Buffer.from('test payload');
                expect(serializePayload(bufferPayload)).toBe('test payload');
            });

            it('should handle object payload with replacer', () => {
                const payload = { key: 'value', sensitive: 'secret' };
                const replacer = (key: string, value: any) => key === 'sensitive' ? undefined : value;
                expect(serializePayload(payload, replacer)).toBe('{"key":"value"}');
            });
        });

        /**
         * Tests for header combinations in serialize function
         */
        it('should serialize message with timeout', () => {
            const header = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: '123e4567-e89b-12d3-a456-426614174000',
                parentRequestId: '987fcdeb-51a2-43e8-9876-543210fedcba',
                timeout: 1000
            };
            const payload = { data: 'test' };

            const serialized = serialize(header, payload);
            expect(serialized).toBe('request:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000:987fcdeb-51a2-43e8-9876-543210fedcba:1000\n{"data":"test"}');
        });

        it('should serialize message with parent request ID but no timeout', () => {
            const header = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: '123e4567-e89b-12d3-a456-426614174000',
                parentRequestId: '987fcdeb-51a2-43e8-9876-543210fedcba'
            };
            const payload = { data: 'test' };

            const serialized = serialize(header, payload);
            expect(serialized).toBe('request:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000:987fcdeb-51a2-43e8-9876-543210fedcba\n{"data":"test"}');
        });

        it('should handle missing optional fields in header', () => {
            const header = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0',
                timeout: 1000
            };
            const payload = { data: 'test' };

            const serialized = serialize(header, payload);
            expect(serialized).toBe('request:test.topic:1.0.0:::1000\n{"data":"test"}');
        });

        it('should serialize message with requestId only', () => {
            const header = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: '123e4567-e89b-12d3-a456-426614174000'
            };
            const payload = { data: 'test' };

            const serialized = serialize(header, payload);
            expect(serialized).toBe('request:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000\n{"data":"test"}');
        });

        it('should serialize message with requestId and parentRequestId', () => {
            const header = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: '123e4567-e89b-12d3-a456-426614174000',
                parentRequestId: '987fcdeb-51a2-43e8-9876-543210fedcba'
            };
            const payload = { data: 'test' };

            const serialized = serialize(header, payload);
            expect(serialized).toBe('request:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000:987fcdeb-51a2-43e8-9876-543210fedcba\n{"data":"test"}');
        });

        it('should serialize message with blank requestId and parentRequestId', () => {
            const header = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: undefined,
                parentRequestId: '987fcdeb-51a2-43e8-9876-543210fedcba'
            };
            const payload = { data: 'test' };

            const serialized = serialize(header, payload);
            expect(serialized).toBe('request:test.topic:1.0.0::987fcdeb-51a2-43e8-9876-543210fedcba\n{"data":"test"}');
        });

        /**
         * Verifies that messages with complete headers and payloads are serialized correctly.
         * The function should:
         * - Format the header with all components
         * - Serialize the payload to JSON
         * - Combine with correct separator
         */
        it('should serialize message with header and payload correctly', () => {
            const header = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0'
            };
            const payload = {
                data: 'test',
                count: 123
            };

            const serialized = serialize(header, payload);
            expect(serialized).toBe('publish:test.topic:1.0.0\n{"data":"test","count":123}');
        });

        /**
         * Verifies that messages without request IDs are serialized correctly.
         * The function should:
         * - Format the header without requestid
         * - Serialize the payload to JSON
         * - Combine with correct separator
         */
        it('should serialize message without requestid correctly', () => {
            const header = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0'
            };
            const payload = {
                data: 'test'
            };

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
            const header = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0'
            };
            const payload = {};

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
            const header = {
                action: ActionType.RESPONSE,
                topic: 'test.topic',
                version: '1.0.0'
            };
            const payload = {
                error: {
                    code: 'TEST_ERROR',
                    message: 'Test error message',
                    details: { additionalInfo: 'test details' },
                    timestamp: '2023-01-01T00:00:00Z'
                }
            };

            const serialized = serialize(header, payload);
            expect(serialized).toBe('response:test.topic:1.0.0\n{"error":{"code":"TEST_ERROR","message":"Test error message","details":{"additionalInfo":"test details"},"timestamp":"2023-01-01T00:00:00Z"}}');
        });
    });

    /**
     * Tests for toBrokerHeader function
     */
    describe('toBrokerHeader', () => {
        it('should convert client header to broker header with new request ID', () => {
            const clientHeader = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: '123e4567-e89b-12d3-a456-426614174000'
            };

            const brokerHeader = toBrokerHeader(clientHeader);
            expect(brokerHeader).toMatchObject({
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0'
            });
            expect(brokerHeader.requestId).toBeDefined();
            expect(brokerHeader.requestId).not.toBe(clientHeader.requestId);
        });

        it('should use provided request ID when specified', () => {
            const clientHeader = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0'
            };
            const newRequestId = '987fcdeb-51a2-43e8-9876-543210fedcba';

            const brokerHeader = toBrokerHeader(clientHeader, undefined, newRequestId);
            expect(brokerHeader.requestId).toBe(newRequestId);
        });

        it('should override action when specified', () => {
            const clientHeader = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0'
            };

            const brokerHeader = toBrokerHeader(clientHeader, ActionType.REQUEST);
            expect(brokerHeader.action).toBe(ActionType.REQUEST);
        });
    });
});