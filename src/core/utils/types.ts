import { ActionType } from '@core/types';

/**
 * Represents the header section of a message.
 * Contains metadata about the message including its action type, topic, and version.
 */
export type BrokerHeader = {
    /** The type of action this message represents (e.g., REQUEST, RESPONSE, PUBLISH) */
    action: ActionType;

    /** The topic this message belongs to, using dot notation (e.g., 'service.event') */
    topic: string;

    /** The version of the message format (e.g., '1.0.0') */
    version: string;

    /** Optional unique identifier for request-response message pairs */
    requestid?: string;

    /** Optional unique identifier for parent request-response message pairs */
    parentRequestId?: string;
};

export type ClientHeader = BrokerHeader & {
    /** Optional timeout for request-response message pairs */
    timeout?: number;
};

/**
 * Represents an error structure within a message.
 * Used to communicate error details in a standardized format.
 */
export type Error = {
    /** Unique error code identifying the type of error */
    code: string;

    /** Human-readable error message describing what went wrong */
    message: string;

    /** Timestamp when the error occurred in ISO 8601 format */
    timestamp: string; // ISO 8601 format (e.g., "2023-10-27T10:30:00Z")

    /** Optional additional error details as a structured object */
    details?: object;
};

export type PayloadError = Error;

export type PayloadSuccess = Record<string, any>;

/**
 * Represents the payload section of a message.
 * Contains the actual data being transmitted along with optional control fields.
 */
export type Payload = PayloadSuccess | PayloadError;

/**
 * Represents a complete message in the system.
 * Combines a header and payload to form a full message structure.
 */
export type Message<T extends BrokerHeader | ClientHeader, U extends Payload = Payload> = {
    /** Message metadata and routing information */
    header: T;

    /** Message content and data */
    payload: U;

    /** The size of the message in bytes */
    size: number;
};

/*export type Brand<B> = { __brand: B };
export type Branded<T, B extends string> = T & Brand<B>;
export type ExcludeBrand<T> = T extends Brand<infer B> ? Exclude<T, Brand<B>> : T;*/
export type Exact<A, B> = Required<A> extends Required<B> ? (Required<B> extends Required<A> ? A : never) : never;
