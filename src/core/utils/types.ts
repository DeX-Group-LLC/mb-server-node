import { ActionType } from '@core/types';

/**
 * Represents the header section of a message.
 * Contains metadata about the message including its action type, topic, and version.
 */
export interface Header {
    /** The type of action this message represents (e.g., REQUEST, RESPONSE, PUBLISH) */
    action: ActionType;

    /** The topic this message belongs to, using dot notation (e.g., 'service.event') */
    topic: string;

    /** The version of the message format (e.g., '1.0.0') */
    version: string;

    /** Optional unique identifier for request-response message pairs */
    requestid?: string;
}

/**
 * Represents an error structure within a message.
 * Used to communicate error details in a standardized format.
 */
export interface Error {
    /** Unique error code identifying the type of error */
    code: string;

    /** Human-readable error message describing what went wrong */
    message: string;

    /** Timestamp when the error occurred in ISO 8601 format */
    timestamp: string; // ISO 8601 format (e.g., "2023-10-27T10:30:00Z")

    /** Optional additional error details as a structured object */
    details?: object;
}

/**
 * Represents the payload section of a message.
 * Contains the actual data being transmitted along with optional control fields.
 */
export interface Payload {
    /** Optional timeout in milliseconds for request messages */
    timeout?: number;

    /** Optional error information for error responses */
    error?: Error;

    /** Additional payload fields with any valid JSON value */
    [key: string]: any; // Allow other fields in the payload
}

/**
 * Represents a complete message in the system.
 * Combines a header and payload to form a full message structure.
 */
export interface Message {
    /** Message metadata and routing information */
    header: Header;

    /** Message content and data */
    payload: Payload;
}