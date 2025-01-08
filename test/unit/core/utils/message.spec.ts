import { MalformedMessageError } from '@core/errors';
import { ActionType } from '@core/types';
import { Parser, serialize, prettySize } from '@core/utils/message';

// Mock external dependencies
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

describe('message utils', () => {
    describe('prettySize', () => {
        it('should format bytes correctly', () => {
            expect(prettySize(500)).toBe('500B');
        });

        it('should format kilobytes correctly', () => {
            expect(prettySize(1500)).toBe('1.46484375KB');
        });

        it('should format megabytes correctly', () => {
            expect(prettySize(1500000)).toBe('1.430511474609375MB');
        });

        it('should format gigabytes correctly', () => {
            expect(prettySize(1500000000)).toBe('1.3969838619232178GB');
        });
    });

    describe('Parser', () => {
        it('should parse valid message correctly', () => {
            // Setup test message with valid header
            const validMessageWithRequestId = 'publish:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000\n{"data":"test"}';
            const parser = new Parser(validMessageWithRequestId);
            const header = parser.parseHeader();
            const payload = parser.parsePayload(header.action);

            // Verify parsed message
            expect(header).toEqual({
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0',
                requestid: '123e4567-e89b-12d3-a456-426614174000'
            });
            expect(payload).toEqual({ data: 'test' });
        });

        it('should parse message without requestid correctly', () => {
            // Setup test message without requestid
            const validMessageWithoutRequestId = 'publish:test.topic:1.0.0\n{"data":"test"}';
            const parser = new Parser(validMessageWithoutRequestId);
            const header = parser.parseHeader();
            const payload = parser.parsePayload(header.action);

            // Verify parsed message
            expect(header).toEqual({
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0',
                requestid: undefined
            });
            expect(payload).toEqual({ data: 'test' });
        });

        it('should throw MalformedMessageError for missing newline separator', () => {
            // Setup test message without newline
            const messageWithoutNewline = 'publish:test.topic:1.0.0';

            // Verify error is thrown
            expect(() => new Parser(messageWithoutNewline)).toThrow(MalformedMessageError);
            expect(() => new Parser(messageWithoutNewline)).toThrow('Invalid message format: no newline separator found');
        });

        it('should throw MalformedMessageError for invalid action type', () => {
            // Setup test message with invalid action
            const messageWithInvalidAction = 'invalid:test.topic:1.0.0\n{}';
            const parser = new Parser(messageWithInvalidAction);

            // Verify error is thrown
            expect(() => parser.parseHeader()).toThrow(MalformedMessageError);
            expect(() => parser.parseHeader()).toThrow('Invalid action: invalid');
        });

        it('should throw MalformedMessageError for invalid topic name', () => {
            // Setup test message with invalid topic
            const messageWithInvalidTopic = 'publish:invalid/topic:1.0.0\n{}';
            const parser = new Parser(messageWithInvalidTopic);

            // Verify error is thrown
            expect(() => parser.parseHeader()).toThrow(MalformedMessageError);
            expect(() => parser.parseHeader()).toThrow('Invalid topic name: invalid/topic');
        });

        it('should throw MalformedMessageError for invalid version format', () => {
            // Setup test message with invalid version
            const messageWithInvalidVersion = 'publish:test.topic:invalid\n{}';
            const parser = new Parser(messageWithInvalidVersion);

            // Verify error is thrown
            expect(() => parser.parseHeader()).toThrow(MalformedMessageError);
            expect(() => parser.parseHeader()).toThrow('Invalid message version format: invalid');
        });

        it('should throw MalformedMessageError for invalid request ID format', () => {
            // Setup test message with invalid request ID
            const messageWithInvalidRequestId = 'publish:test.topic:1.0.0:invalid-req-id\n{}';
            const parser = new Parser(messageWithInvalidRequestId);

            // Verify error is thrown
            expect(() => parser.parseHeader()).toThrow(MalformedMessageError);
            expect(() => parser.parseHeader()).toThrow('Invalid request ID format: invalid-req-id');
        });

        it('should throw MalformedMessageError for missing header parts', () => {
            // Setup test message with missing header parts
            const messageWithMissingParts = 'publish:test.topic\n{}';
            const parser = new Parser(messageWithMissingParts);

            // Verify error is thrown
            expect(() => parser.parseHeader()).toThrow(MalformedMessageError);
            expect(() => parser.parseHeader()).toThrow('Invalid header format: missing action, topic, or version');
        });

        it('should throw error for invalid JSON payload', () => {
            const message = 'publish:test.topic:1.0.0\n{invalid:json}';
            const parser = new Parser(message);
            const header = parser.parseHeader();

            expect(() => parser.parsePayload(header.action)).toThrow(MalformedMessageError);
            expect(() => parser.parsePayload(header.action)).toThrow(/Invalid JSON payload/);
        });

        it('should validate timeout value', () => {
            const payload = { timeout: -1 };
            const message = `request:test.topic:1.0.0\n${JSON.stringify(payload)}`;
            const parser = new Parser(message);
            const header = parser.parseHeader();

            expect(() => parser.parsePayload(header.action)).toThrow(MalformedMessageError);
            expect(() => parser.parsePayload(header.action)).toThrow(/Invalid timeout value/);
        });

        it('should validate timeout is only allowed for request actions', () => {
            const payload = { timeout: 1000 };
            const message = `publish:test.topic:1.0.0\n${JSON.stringify(payload)}`;
            const parser = new Parser(message);
            const header = parser.parseHeader();

            expect(() => parser.parsePayload(header.action)).toThrow(MalformedMessageError);
            expect(() => parser.parsePayload(header.action)).toThrow(/Timeout is only allowed for request actions/);
        });

        it('should validate error object in payload', () => {
            const payload = { error: { code: 'ERR_001' } }; // Missing message and timestamp
            const message = `publish:test.topic:1.0.0\n${JSON.stringify(payload)}`;
            const parser = new Parser(message);
            const header = parser.parseHeader();

            expect(() => parser.parsePayload(header.action)).toThrow(MalformedMessageError);
            expect(() => parser.parsePayload(header.action)).toThrow(/Invalid error object in payload/);
        });

        it('should accept valid error object in payload', () => {
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

            expect(result).toEqual(payload);
        });

        it('should handle payload size validation', () => {
            const largePayload = { data: 'x'.repeat(32 * 1024 + 1) }; // Just over 32KB
            const message = `publish:test.topic:1.0.0\n${JSON.stringify(largePayload)}`;
            const parser = new Parser(message);
            const header = parser.parseHeader();

            expect(() => parser.parsePayload(header.action)).toThrow(MalformedMessageError);
            expect(() => parser.parsePayload(header.action)).toThrow(/Payload exceeds maximum length/);
        });
    });

    describe('serialize', () => {
        it('should serialize message with header and payload correctly', () => {
            // Setup test header and payload
            const header = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0',
                requestid: '123e4567-e89b-12d3-a456-426614174000'
            };
            const payload = {
                data: 'test',
                count: 123
            };

            // Serialize message
            const serialized = serialize(header, payload);

            // Verify serialized message
            expect(serialized).toBe('publish:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000\n{"data":"test","count":123}');
        });

        it('should serialize message without requestid correctly', () => {
            // Setup test header without requestid
            const header = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0'
            };
            const payload = {
                data: 'test'
            };

            // Serialize message
            const serialized = serialize(header, payload);

            // Verify serialized message
            expect(serialized).toBe('publish:test.topic:1.0.0\n{"data":"test"}');
        });

        it('should serialize message with empty payload correctly', () => {
            // Setup test header with empty payload
            const header = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0'
            };
            const payload = {};

            // Serialize message
            const serialized = serialize(header, payload);

            // Verify serialized message
            expect(serialized).toBe('publish:test.topic:1.0.0\n{}');
        });

        it('should serialize error response message correctly', () => {
            // Setup test header and error payload
            const header = {
                action: ActionType.RESPONSE,
                topic: 'test.topic',
                version: '1.0.0',
                requestid: '123e4567-e89b-12d3-a456-426614174000'
            };
            const payload = {
                error: {
                    code: 'TEST_ERROR',
                    message: 'Test error message',
                    details: { additionalInfo: 'test details' },
                    timestamp: '2023-01-01T00:00:00Z'
                }
            };

            // Serialize message
            const serialized = serialize(header, payload);

            // Verify serialized message
            expect(serialized).toBe('response:test.topic:1.0.0:123e4567-e89b-12d3-a456-426614174000\n{"error":{"code":"TEST_ERROR","message":"Test error message","details":{"additionalInfo":"test details"},"timestamp":"2023-01-01T00:00:00Z"}}');
        });
    });
});