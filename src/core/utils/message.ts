import { randomUUID } from 'crypto';
import * as semver from 'semver';
import { config } from '@config';
import { MalformedMessageError, MessageError } from '@core/errors';
import { ActionType } from '@core/types';
import { BrokerHeader, ClientHeader, Payload } from '@core/utils/types';
import * as Topic from '@core/utils/topic';
import { isUUID4 } from '@core/utils/uuid4';
/**
 * Pretty-prints a file size in bytes to a human-readable format
 * @param {number} size - The file size in bytes
 * @returns {string} - The pretty-printed file size
 */
export function prettySize(size: number): string {
    if (size < 1024) {
        return `${size}B`;
    } else if (size < 1024 * 1024) {
        return `${size / 1024}KB`;
    } else if (size < 1024 * 1024 * 1024) {
        return `${size / (1024 * 1024)}MB`;
    } else {
        return `${size / (1024 * 1024 * 1024)}GB`;
    }
}

const NEWLINE_CHAR = '\n'.charCodeAt(0);
/**
 * The maximum length of the header in bytes.
 * This is the sum of the maximum lengths of the action, topic, version, requestId, parentRequestId, and timeout.
 * The action is the longest action name, the topic is the maximum topic length, the version is the semver range, the requestId is the UUID length, the parentRequestId is the UUID length, and the timeout is the maximum timeout value.
 */
const MAX_HEADER_LENGTH = Object.values(ActionType).reduce((acc, action) => Math.max(acc, action.length), 0) + 1 + Topic.MAX_TOPIC_LENGTH + 1 + 20 + 1 + 36 + 1 + 36 + 1 + config.request.response.timeout.max.toString().length;

const ERROR_KEY = Buffer.from('error:');

/**
 * Parses a message string into a Message object.
 */
export class Parser {
    private headerEndIndex: number;
    private payloadStartIndex: number;
    public header: ClientHeader;
    private error: boolean;

    /**
     * Constructs a new Parser instance.
     * @param message The message string to parse.
     */
    constructor(private buffer: Buffer) {
        this.headerEndIndex = buffer.subarray(0, MAX_HEADER_LENGTH).indexOf(NEWLINE_CHAR);
        if (this.headerEndIndex === -1) {
            throw new MalformedMessageError(`Invalid message format: no newline separator found within the maximum header length of ${MAX_HEADER_LENGTH} bytes`);
        }
        // Parse the header
        this.header = this.parseHeader();
        // Determine if error is present in the payload
        const payloadStartIndex = this.headerEndIndex + 1;
        this.error = ERROR_KEY.compare(this.buffer, payloadStartIndex, Math.min(payloadStartIndex + ERROR_KEY.length, this.buffer.length)) === 0;
        this.payloadStartIndex = this.error ? payloadStartIndex + ERROR_KEY.length : payloadStartIndex;
    }

    get length(): number {
        return this.buffer.length;
    }

    get hasError(): boolean {
        return this.error;
    }

    get rawMessage(): Buffer {
        return this.buffer;
    }

    get rawHeader(): Buffer {
        return this.buffer.subarray(0, this.headerEndIndex);
    }

    get rawPayload(): Buffer {
        return this.buffer.subarray(this.headerEndIndex + 1);
    }

    /**
     * Parses the message header from the message string.
     * {action}:{topic}:{version}[:{requestId}[:{parentRequestId}[:{timeout}]]]
     *
     * @returns The parsed message header.
     * @throws MalformedMessageError if the message format is invalid.
     */
    private parseHeader(): ClientHeader {
        const headerLine = this.buffer.toString('utf-8', 0, this.headerEndIndex);
        const headerParts = headerLine.split(':');

        if (headerParts.length < 3) {
            throw new MalformedMessageError('Invalid header format: missing action, topic, or version');
        }

        // Create header object
        const header: ClientHeader = {
            action: headerParts[0] as ActionType,
            topic: headerParts[1],
            version: headerParts[2],
        } as ClientHeader;
        if (headerParts.length >= 4 && headerParts[3]) header.requestId = headerParts[3];
        if (headerParts.length >= 5 && headerParts[4]) header.parentRequestId = headerParts[4];
        if (headerParts.length >= 6 && headerParts[5]) header.timeout = parseInt(headerParts[5]);

        // Validate the action
        const validActions = Object.values(ActionType);
        if (!validActions.includes(header.action)) {
            throw new MalformedMessageError(`Invalid action: ${header.action}`, { validActions });
        }

        // Validate the topic name
        if (!Topic.isValid(header.topic)) {
            throw new MalformedMessageError(`Invalid topic name: ${header.topic}`, { topic: header.topic });
        }

        // Validate the header version using semver
        if (!semver.valid(header.version)) {
            throw new MalformedMessageError(`Invalid message version format: ${header.version}`, { version: header.version });
        }

        // Validate the request ID
        if (header.requestId !== undefined) {
            /*if (header.action !== ActionType.REQUEST) {
                throw new MalformedMessageError(`Request ID is only allowed for request actions`, { action: header.action });
            }*/
            if (!isUUID4(header.requestId)) {
                throw new MalformedMessageError(`Invalid request ID format: ${header.requestId}`, { requestId: header.requestId });
            }
        }

        // Validate the parent request ID
        if (header.parentRequestId && !isUUID4(header.parentRequestId)) {
            throw new MalformedMessageError(`Invalid parent request ID format: ${header.parentRequestId}`, { parentRequestId: header.parentRequestId });
        }

        // Validate timeout if present in the header
        if (header.timeout !== undefined) {
            if (header.action !== ActionType.REQUEST) {
                throw new MalformedMessageError('Timeout is only allowed for request actions', { action: header.action });
            }
            if (isNaN(header.timeout) || header.timeout <= 0 || header.timeout > config.request.response.timeout.max) {
                throw new MalformedMessageError('Invalid timeout value', { timeout: header.timeout });
            }
        }

        return header;
    }

    /**
     * Parses the message payload from the message string.
     * @returns The parsed message payload.
     * @throws MalformedMessageError if the message format is invalid.
     */
    public parsePayload<T>(): T {
        // Check that the length of the payload is less than the maximum allowed
        const maxPayloadLength = config.message.payload.maxLength;
        if (this.buffer.length - this.payloadStartIndex > maxPayloadLength) {
            const prettyPayloadLength = prettySize(this.buffer.length - this.payloadStartIndex);
            throw new MalformedMessageError(`Payload exceeds maximum length of ${prettyPayloadLength}`, { payloadLength: this.buffer.length - this.payloadStartIndex });
        }

        // Parse the payload
        const payloadStr = this.buffer.toString('utf-8', this.payloadStartIndex);
        let payload;
        if (payloadStr) {
            try {
                payload = JSON.parse(payloadStr);
            } catch (error: unknown) {
                throw new MalformedMessageError('Invalid JSON payload', { payload: payloadStr });
            }
        }

        // Validate error object if present in the payload
        if (this.hasError) {
            if (!payload.code || !payload.message || !payload.timestamp) {
                throw new MalformedMessageError('Invalid error object in payload', { error: payload });
            }
            throw new MessageError(payload.code, payload.message, payload.details);
        }

        return payload as T;
    }
}

export function serializePayload(payload: Payload | Buffer, replacer?: (key: string, value: any) => any): string {
    if (Buffer.isBuffer(payload)) return payload.toString('utf-8');
    return JSON.stringify(payload, replacer);
}

/**
 * Serializes a message object into a string.
 * @param header The message header.
 * @param payload The message payload.
 * @returns The serialized message string.
 */
export function serialize<T extends BrokerHeader | ClientHeader>(header: T, payload: Payload | Buffer, replacer?: (key: string, value: any) => any): string {
    // Create the header line
    let headerLine = `${header.action}:${header.topic}:${header.version}`;

    // Add the requestId, parentRequestId, and timeout to the header line if present
    if ((header as ClientHeader).timeout) headerLine += `:${(header as ClientHeader).requestId ?? ''}:${(header as ClientHeader).parentRequestId ?? ''}:${(header as ClientHeader).timeout}`;
    else if ((header as ClientHeader).parentRequestId) headerLine += `:${(header as ClientHeader).requestId ?? ''}:${(header as ClientHeader).parentRequestId}`;
    else if (header.requestId) headerLine += `:${header.requestId}`;

    // Return the serialized message string
    return `${headerLine}\n${serializePayload(payload, replacer)}`;
}

export function toBrokerHeader(header: ClientHeader, action: ActionType = header.action, requestId?: string): BrokerHeader {
    // If no requestId is provided, generate a new one
    if (!requestId) requestId = randomUUID();
    // Create the broker header
    return { action, topic: header.topic, version: header.version, requestId/*, parentRequestId: requestId === header.requestId ? undefined : header.requestId */} as BrokerHeader;
}