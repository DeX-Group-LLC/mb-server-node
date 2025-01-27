import { MalformedMessageError, MessageError } from '@core/errors';
import { ActionType } from '@core/types';
import { Parser, serialize, prettySize, toBrokerHeader, serializePayload } from '@core/utils/message';

/**
 * Mock configuration for message tests
 * Sets up maximum payload length and timeout values
 */
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
 * @module MessageUtils
 * @category Tests
 */
describe('message utils', () => {
    /**
     * Tests for size formatting functionality.
     * Verifies the prettySize function properly formats file sizes.
     *
     * @group Formatting
     */
    describe('prettySize', () => {
        /**
         * Tests byte value formatting.
         * Values under 1KB should be formatted with 'B' suffix.
         */
        it('should format bytes correctly', () => {
            expect(prettySize(500)).toBe('500B');
        });

        /**
         * Tests kilobyte value formatting.
         * Values between 1KB and 1MB should be formatted with 'KB' suffix.
         */
        it('should format kilobytes correctly', () => {
            expect(prettySize(1500)).toBe('1.46484375KB');
        });

        /**
         * Tests megabyte value formatting.
         * Values between 1MB and 1GB should be formatted with 'MB' suffix.
         */
        it('should format megabytes correctly', () => {
            expect(prettySize(1500000)).toBe('1.430511474609375MB');
        });

        /**
         * Tests gigabyte value formatting.
         * Values over 1GB should be formatted with 'GB' suffix.
         */
        it('should format gigabytes correctly', () => {
            expect(prettySize(1500000000)).toBe('1.3969838619232178GB');
        });
    });

    /**
     * Tests for message parsing functionality.
     * Verifies the Parser class properly handles message parsing and validation.
     *
     * @group Parsing
     */
    describe('Parser', () => {
        /**
         * Tests basic message parsing with a valid message containing a request ID.
         * Verifies header components and payload are correctly parsed.
         */
        it('should parse valid message correctly', () => {
            const validMessageWithRequestId = Buffer.from('publish:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000\n{"data":"test"}');
            const parser = new Parser(validMessageWithRequestId);

            expect(parser.header).toEqual({
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: '123e4567-e89b-12d3-a456-426614174000'
            });

            expect(JSON.parse(parser.rawPayload.toString())).toEqual({ data: 'test' });
        });

        /**
         * Tests message parsing without a request ID.
         * Verifies header components and payload are correctly parsed when requestId is omitted.
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
         * Tests error handling for messages without a newline separator.
         * Should throw MalformedMessageError with appropriate message.
         */
        it('should throw MalformedMessageError for missing newline separator', () => {
            const messageWithoutNewline = Buffer.from('publish:test.topic:1.0.0');
            expect(() => new Parser(messageWithoutNewline)).toThrow(MalformedMessageError);
            expect(() => new Parser(messageWithoutNewline)).toThrow(/Invalid message format: no newline separator found/);
        });

        /**
         * Tests validation of action types in message headers.
         * Should throw MalformedMessageError for invalid actions.
         */
        it('should throw MalformedMessageError for invalid action type', () => {
            const messageWithInvalidAction = Buffer.from('invalid:test.topic:1.0.0\n{}');
            expect(() => new Parser(messageWithInvalidAction)).toThrow(MalformedMessageError);
            expect(() => new Parser(messageWithInvalidAction)).toThrow(/Invalid action: invalid/);
        });

        /**
         * Tests validation of topic names in message headers.
         * Should throw MalformedMessageError for invalid topic formats.
         */
        it('should throw MalformedMessageError for invalid topic name', () => {
            const messageWithInvalidTopic = Buffer.from('publish:invalid/topic:1.0.0\n{}');
            expect(() => new Parser(messageWithInvalidTopic)).toThrow(MalformedMessageError);
            expect(() => new Parser(messageWithInvalidTopic)).toThrow(/Invalid topic name: invalid\/topic/);
        });

        /**
         * Tests validation of version formats in message headers.
         * Should throw MalformedMessageError for invalid semver versions.
         */
        it('should throw MalformedMessageError for invalid version format', () => {
            const messageWithInvalidVersion = Buffer.from('publish:test.topic:invalid\n{}');
            expect(() => new Parser(messageWithInvalidVersion)).toThrow(MalformedMessageError);
            expect(() => new Parser(messageWithInvalidVersion)).toThrow(/Invalid message version format: invalid/);
        });

        /**
         * Tests validation of request ID formats.
         * Should throw MalformedMessageError for non-UUID request IDs.
         */
        it('should throw MalformedMessageError for invalid request ID format', () => {
            const messageWithInvalidRequestId = Buffer.from('publish:test.topic:1.0.0:invalid-req-id\n{}');
            expect(() => new Parser(messageWithInvalidRequestId)).toThrow(MalformedMessageError);
            expect(() => new Parser(messageWithInvalidRequestId)).toThrow(/Invalid request ID format: invalid-req-id/);
        });

        /**
         * Tests validation of required header components.
         * Should throw MalformedMessageError when required parts are missing.
         */
        it('should throw MalformedMessageError for missing header parts', () => {
            const messageWithMissingParts = Buffer.from('publish:test.topic\n{}');
            expect(() => new Parser(messageWithMissingParts)).toThrow(MalformedMessageError);
            expect(() => new Parser(messageWithMissingParts)).toThrow(/Invalid header format: missing action, topic, or version/);
        });

        /**
         * Tests validation of JSON payload format.
         * Should throw MalformedMessageError for invalid JSON.
         */
        it('should throw error for invalid JSON payload', () => {
            const message = Buffer.from('publish:test.topic:1.0.0\n{invalid:json}');
            const parser = new Parser(message);
            expect(() => parser.parsePayload()).toThrow(MalformedMessageError);
        });

        /**
         * Tests validation of timeout values.
         * Should throw MalformedMessageError for invalid timeout values.
         */
        it('should validate timeout value', () => {
            const payload = { timeout: -1 };
            const message = Buffer.from(`request:test.topic:1.0.0:req-1:parent-1:-1\n${JSON.stringify(payload)}`);
            expect(() => new Parser(message)).toThrow(MalformedMessageError);
        });

        /**
         * Tests validation of timeout usage in different message types.
         * Should throw MalformedMessageError when timeout is used in non-request messages.
         */
        it('should validate timeout is only allowed for request actions', () => {
            const payload = { timeout: 1000 };
            const message = Buffer.from(`publish:test.topic:1.0.0:req-1:parent-1:1000\n${JSON.stringify(payload)}`);
            expect(() => new Parser(message)).toThrow(MalformedMessageError);
        });

        /**
         * Tests validation of error object structure in payloads.
         * Should throw MalformedMessageError for invalid error objects.
         */
        it('should throw MalformedMessageError for invalid error object structure', () => {
            const message = Buffer.from('publish:test.topic:1.0.0\nerror:{"code":"TEST_ERROR"}');
            const parser = new Parser(message);
            expect(() => parser.parsePayload()).toThrow(MalformedMessageError);
            expect(() => parser.parsePayload()).toThrow(/Invalid error object in payload/);
        });

        /**
         * Tests handling of valid error objects in payloads.
         * Should throw MessageError with correct properties.
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
         * Tests handling of valid error objects in regular payloads.
         * Should accept error objects when properly formatted.
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
         * Tests enforcement of payload size limits.
         * Should throw MalformedMessageError for oversized payloads.
         */
        it('should handle payload size validation', () => {
            const largePayload = { data: 'x'.repeat(32 * 1024 + 1) };
            const message = Buffer.from(`publish:test.topic:1.0.0\n${JSON.stringify(largePayload)}`);
            const parser = new Parser(message);
            expect(() => parser.parsePayload()).toThrow(MalformedMessageError);
        });

        /**
         * Tests access to message components via getter methods.
         * Verifies all getter methods return correct values.
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
         * Tests validation of parent request ID format.
         * Should throw MalformedMessageError for invalid parent request IDs.
         */
        it('should throw MalformedMessageError for invalid parent request ID format', () => {
            const message = Buffer.from('publish:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000:invalid-parent\n{}');
            expect(() => new Parser(message)).toThrow(MalformedMessageError);
            expect(() => new Parser(message)).toThrow(/Invalid parent request ID format/);
        });

        /**
         * Tests validation of timeout values.
         * Should throw MalformedMessageError for invalid timeout values.
         */
        it('should throw MalformedMessageError for invalid timeout value', () => {
            const message = Buffer.from('request:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000::6000\n{}');
            expect(() => new Parser(message)).toThrow(MalformedMessageError);
            expect(() => new Parser(message)).toThrow(/Invalid timeout value/);
        });

        /**
         * Tests timeout validation in non-request messages.
         * Should throw MalformedMessageError when timeout is used in wrong message type.
         */
        it('should throw MalformedMessageError for timeout in non-request message', () => {
            const message = Buffer.from('publish:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000::1000\n{}');
            expect(() => new Parser(message)).toThrow(MalformedMessageError);
            expect(() => new Parser(message)).toThrow(/Timeout is only allowed for request actions/);
        });
    });

    /**
     * Tests for message serialization functionality.
     * Verifies proper serialization of messages with various header and payload combinations.
     *
     * @group Serialization
     */
    describe('serialize', () => {
        /**
         * Tests for payload serialization functionality.
         * Verifies proper handling of different payload types.
         */
        describe('serializePayload', () => {
            /**
             * Tests serialization of Buffer payloads.
             * Should convert Buffer to string correctly.
             */
            it('should handle Buffer payload', () => {
                const bufferPayload = Buffer.from('test payload');
                expect(serializePayload(bufferPayload)).toBe('test payload');
            });

            /**
             * Tests serialization with custom replacer function.
             * Should apply replacer function to filter payload properties.
             */
            it('should handle object payload with replacer', () => {
                const payload = { key: 'value', sensitive: 'secret' };
                const replacer = (key: string, value: any) => key === 'sensitive' ? undefined : value;
                expect(serializePayload(payload, replacer)).toBe('{"key":"value"}');
            });
        });

        /**
         * Tests serialization of messages with timeout.
         * Should include all header components including timeout.
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

        /**
         * Tests serialization of messages with parent request ID but no timeout.
         * Should include requestId and parentRequestId but omit timeout.
         */
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

        /**
         * Tests serialization with missing optional header fields.
         * Should handle undefined fields by using empty strings.
         */
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

        /**
         * Tests serialization with only requestId present.
         * Should include requestId but omit other optional fields.
         */
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

        /**
         * Tests serialization with both requestId and parentRequestId.
         * Should include both IDs in correct order.
         */
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

        /**
         * Tests serialization with blank requestId and parentRequestId.
         * Should handle undefined requestId correctly.
         */
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
         * Tests basic message serialization.
         * Should correctly format header and payload with newline separator.
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
         * Tests serialization without request ID.
         * Should omit requestId from header string.
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
         * Tests serialization with empty payload.
         * Should serialize as empty JSON object.
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
         * Tests serialization of error response messages.
         * Should correctly format error object in payload.
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
     * Tests for toBrokerHeader function.
     * Verifies proper conversion of client headers to broker headers.
     *
     * @group Headers
     */
    describe('toBrokerHeader', () => {
        /**
         * Tests basic header conversion with new request ID.
         * Should generate new request ID and maintain other fields.
         */
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

        /**
         * Tests header conversion with provided request ID.
         * Should use provided ID instead of generating new one.
         */
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

        /**
         * Tests header conversion with action override.
         * Should use provided action instead of original.
         */
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