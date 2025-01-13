import * as semver from 'semver';
import { config } from '@config';
import { MalformedMessageError } from '@core/errors';
import { ActionType } from '@core/types';
import { Header, Payload } from '@core/utils/types';
import * as topic from '@core/utils/topic';
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

/**
 * Parses a message string into a Message object.
 */
export class Parser {
    private newlineIndex: number;

    /**
     * Constructs a new Parser instance.
     * @param message The message string to parse.
     */
    constructor(private message: string) {
        this.newlineIndex = message.indexOf('\n');
        if (this.newlineIndex === -1) {
            throw new MalformedMessageError('Invalid message format: no newline separator found');
        }
    }

    /**
     * Parses the message header from the message string.
     * @returns The parsed message header.
     * @throws MalformedMessageError if the message format is invalid.
     */
    public parseHeader(): Header {
        const headerLine = this.message.substring(0, this.newlineIndex);
        const headerParts = headerLine.split(':');

        if (headerParts.length < 3) {
            throw new MalformedMessageError('Invalid header format: missing action, topic, or version');
        }

        // Create header object
        const header: Header = {
            action: headerParts[0] as ActionType,
            topic: headerParts[1],
            version: headerParts[2],
            requestid: headerParts.length === 4 ? headerParts[3] : undefined,
        };

        // Validate the action
        const validActions = Object.values(ActionType);
        if (!validActions.includes(header.action)) {
            throw new MalformedMessageError(`Invalid action: ${header.action}`, { validActions });
        }

        // Validate the topic name
        if (!topic.isValid(header.topic)) {
            throw new MalformedMessageError(`Invalid topic name: ${header.topic}`, { topic: header.topic });
        }

        // Validate the header version using semver
        if (!semver.valid(header.version)) {
            throw new MalformedMessageError(`Invalid message version format: ${header.version}`, { version: header.version });
        }

        // Validate the request ID
        if (header.requestid && !isUUID4(header.requestid)) {
            throw new MalformedMessageError(`Invalid request ID format: ${header.requestid}`, { requestId: header.requestid });
        }

        return header;
    }

    /**
     * Parses the message payload from the message string.
     * @returns The parsed message payload.
     * @throws MalformedMessageError if the message format is invalid.
     */
    public parsePayload(action: ActionType): Payload {
        // Check that the length of the payload is less than the maximum allowed
        const maxPayloadLength = config.message.payload.maxLength;
        if (this.message.length - this.newlineIndex - 1 > maxPayloadLength) {
            const prettyPayloadLength = prettySize(this.message.length - this.newlineIndex - 1);
            throw new MalformedMessageError(`Payload exceeds maximum length of ${prettyPayloadLength}`, { payloadLength: this.message.length - this.newlineIndex - 1 });
        }

        const payloadStr = this.message.substring(this.newlineIndex + 1);
        let payload: Payload = {};
        if (payloadStr) {
            try {
                payload = JSON.parse(payloadStr);
            } catch (error: unknown) {
                throw new MalformedMessageError('Invalid JSON payload', { payload: payloadStr });
            }
        }

        // Validate timeout if present in the payload
        if (payload.timeout !== undefined) {
            if (isNaN(payload.timeout) || payload.timeout <= 0 || payload.timeout > config.request.response.timeout.max) {
                throw new MalformedMessageError('Invalid timeout value', { timeout: payload.timeout });
            }
            if (action !== ActionType.REQUEST) {
                throw new MalformedMessageError('Timeout is only allowed for request actions', { action: action });
            }
        }

        // Validate error object if present in the payload
        if (payload.error) {
            if (!payload.error.code || !payload.error.message || !payload.error.timestamp) {
                throw new MalformedMessageError('Invalid error object in payload', { error: payload.error });
            }
        }

        return payload;
    }
}

/**
 * Serializes a message object into a string.
 * @param header The message header.
 * @param payload The message payload.
 * @returns The serialized message string.
 */
export function serialize(header: Header, payload: Payload): string {
    // Create the header line
    let headerLine = `${header.action}:${header.topic}:${header.version}`;
    if (header.requestid) {
        // Add the request ID if it exists
        headerLine += `:${header.requestid}`;
    }

    // Create the payload line
    const payloadLine = JSON.stringify(payload);

    // Return the serialized message string
    return `${headerLine}\n${payloadLine}`;
}
