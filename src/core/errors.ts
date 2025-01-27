import { Error } from '@core/utils/types';

/**
 * Custom error class for handling messages with additional details.
 * Extends the built-in Error class to include a code, message, timestamp, and optional details.
 */
export class MessageError extends Error {
    /**
     * Error code.
     * @type {string}
     */
    code: string;

    /**
     * Error message.
     * @type {string}
     */
    message: string;

    /**
     * Timestamp of when the error occurred.
     * @type {Date}
     */
    timestamp: Date;

    /**
     * Optional additional details about the error.
     * @type {object | undefined}
     */
    details?: object;

    /**
     * Creates a new MessageError instance.
     * @param {string} code - The error code.
     * @param {string} message - The error message.
     * @param {object} [details] - Optional additional details about the error.
     */
    constructor(code: string, message: string, details?: object, timestamp?: Date) {
        super(message);
        this.code = code;
        this.message = message;
        this.details = details;
        this.name = 'MessageError'; // Set the name of the error
        this.timestamp = timestamp ?? new Date();
    }

    /**
     * Converts the error to a JSON-serializable object.
     * @returns {Error} A plain object representation of the error.
     */
    toJSON(): Error {
        return {
            code: this.code,
            message: this.message,
            timestamp: this.timestamp.toISOString(),
            details: this.details,
        };
    }
}

type RemoveFirst<T extends unknown[]> = T extends [infer H, ...infer R] ? R : T;

/**
 * Error class for invalid requests.
 * @extends MessageError
 */
export class InvalidRequestError extends MessageError {
    /**
     * Creates a new InvalidRequestError instance.
     * @param {string} message - The error message.
     * @param {object} [details] - Optional additional details about the error.
     * @param {Date} [timestamp] - Optional timestamp of when the error occurred.
     */
    constructor(...args: RemoveFirst<ConstructorParameters<typeof MessageError>>) {
        super('INVALID_REQUEST', ...args);
    }
}

/**
 * Error class for malformed messages.
 * @extends MessageError
 */
export class MalformedMessageError extends MessageError {
    /**
     * Creates a new MalformedMessageError instance.
     * @param {string} message - The error message.
     * @param {object} [details] - Optional additional details about the error.
     * @param {Date} [timestamp] - Optional timestamp of when the error occurred.
     */
    constructor(...args: RemoveFirst<ConstructorParameters<typeof MessageError>>) {
        super('MALFORMED_MESSAGE', ...args);
    }
}

/**
 * Error class for invalid request IDs.
 * @extends MessageError
 */
export class InvalidRequestIdError extends MessageError {
    /**
     * Creates a new InvalidRequestIdError instance.
     * @param {string} message - The error message.
     * @param {object} [details] - Optional additional details about the error.
     * @param {Date} [timestamp] - Optional timestamp of when the error occurred.
     */
    constructor(...args: RemoveFirst<ConstructorParameters<typeof MessageError>>) {
        super('INVALID_REQUEST_ID', ...args);
    }
}

/**
 * Error class for unsupported versions.
 * @extends MessageError
 */
export class UnsupportedVersionError extends MessageError {
    /**
     * Creates a new UnsupportedVersionError instance.
     * @param {string} message - The error message.
     * @param {object} [details] - Optional additional details about the error.
     * @param {Date} [timestamp] - Optional timestamp of when the error occurred.
     */
    constructor(...args: RemoveFirst<ConstructorParameters<typeof MessageError>>) {
        super('VERSION_NOT_SUPPORTED', ...args);
    }
}

/**
 * Error class for unauthorized access.
 * @extends MessageError
 */
export class UnauthorizedError extends MessageError {
    /**
     * Creates a new UnauthorizedError instance.
     * @param {string} message - The error message.
     * @param {object} [details] - Optional additional details about the error.
     * @param {Date} [timestamp] - Optional timestamp of when the error occurred.
     */
    constructor(...args: RemoveFirst<ConstructorParameters<typeof MessageError>>) {
        super('UNAUTHORIZED', ...args);
    }
}

/**
 * Error class for forbidden access.
 * @extends MessageError
 */
export class ForbiddenError extends MessageError {
    /**
     * Creates a new ForbiddenError instance.
     * @param {string} message - The error message.
     * @param {object} [details] - Optional additional details about the error.
     * @param {Date} [timestamp] - Optional timestamp of when the error occurred.
     */
    constructor(...args: RemoveFirst<ConstructorParameters<typeof MessageError>>) {
        super('FORBIDDEN', ...args);
    }
}

/**
 * Error class for unsupported topics.
 * @extends MessageError
 */
export class TopicNotSupportedError extends MessageError {
    /**
     * Creates a new TopicNotSupportedError instance.
     * @param {string} message - The error message.
     * @param {object} [details] - Optional additional details about the error.
     * @param {Date} [timestamp] - Optional timestamp of when the error occurred.
     */
    constructor(...args: RemoveFirst<ConstructorParameters<typeof MessageError>>) {
        super('TOPIC_NOT_SUPPORTED', ...args);
    }
}

/**
 * Error class for when no route is found.
 * @extends MessageError
 */
export class NoRouteFoundError extends MessageError {
    /**
     * Creates a new NoRouteFoundError instance.
     * @param {string} message - The error message.
     * @param {object} [details] - Optional additional details about the error.
     * @param {Date} [timestamp] - Optional timestamp of when the error occurred.
     */
    constructor(...args: RemoveFirst<ConstructorParameters<typeof MessageError>>) {
        super('NO_ROUTE_FOUND', ...args);
    }
}

/**
 * Error class for service unavailable errors.
 * @extends MessageError
 */
export class ServiceUnavailableError extends MessageError {
    /**
     * Creates a new ServiceUnavailableError instance.
     * @param {string} message - The error message.
     * @param {object} [details] - Optional additional details about the error.
     * @param {Date} [timestamp] - Optional timestamp of when the error occurred.
     */
    constructor(...args: RemoveFirst<ConstructorParameters<typeof MessageError>>) {
        super('SERVICE_UNAVAILABLE', ...args);
    }
}

/**
 * Error class for timeout errors.
 * @extends MessageError
 */
export class TimeoutError extends MessageError {
    /**
     * Creates a new TimeoutError instance.
     * @param {string} message - The error message.
     * @param {object} [details] - Optional additional details about the error.
     * @param {Date} [timestamp] - Optional timestamp of when the error occurred.
     */
    constructor(...args: RemoveFirst<ConstructorParameters<typeof MessageError>>) {
        super('TIMEOUT', ...args);
    }
}

/**
 * Error class for internal errors.
 * @extends MessageError
 */
export class InternalError extends MessageError {
    /**
     * Creates a new InternalError instance.
     * @param {string} message - The error message.
     * @param {object} [details] - Optional additional details about the error.
     * @param {Date} [timestamp] - Optional timestamp of when the error occurred.
     */
    constructor(...args: RemoveFirst<ConstructorParameters<typeof MessageError>>) {
        super('INTERNAL_ERROR', ...args);
    }
}