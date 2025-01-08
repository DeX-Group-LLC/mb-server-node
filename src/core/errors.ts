import { Error } from '@core/utils/types';

export class MessageError extends Error {
    code: string;
    message: string;
    timestamp: Date;
    details?: object;

    constructor(code: string, message: string, details?: object) {
        super(message);
        this.code = code;
        this.message = message;
        this.details = details;
        this.name = 'MessageError'; // Set the name of the error
        this.timestamp = new Date();
    }

    toJSON(): Error {
        return {
            code: this.code,
            message: this.message,
            timestamp: this.timestamp.toISOString(),
            details: this.details,
        };
    }
}

// Specific error classes inheriting from MessageError
export class InvalidRequestError extends MessageError {
    constructor(message: string, details?: object) {
        super('INVALID_REQUEST', message, details);
    }
}

export class MalformedMessageError extends MessageError {
    constructor(message: string, details?: object) {
        super('MALFORMED_MESSAGE', message, details);
    }
}

export class InvalidRequestIdError extends MessageError {
    constructor(message: string, details?: object) {
        super('INVALID_REQUEST_ID', message, details);
    }
}

export class UnsupportedVersionError extends MessageError {
    constructor(message: string, details?: object) {
        super('VERSION_NOT_SUPPORTED', message, details);
    }
}

export class UnauthorizedError extends MessageError {
    constructor(message: string, details?: object) {
        super('UNAUTHORIZED', message, details);
    }
}

export class ForbiddenError extends MessageError {
    constructor(message: string, details?: object) {
        super('FORBIDDEN', message, details);
    }
}

export class TopicNotSupportedError extends MessageError {
    constructor(message: string, details?: object) {
        super('TOPIC_NOT_SUPPORTED', message, details);
    }
}

export class NoRouteFoundError extends MessageError {
    constructor(message: string, details?: object) {
        super('NO_ROUTE_FOUND', message, details);
    }
}

export class ServiceUnavailableError extends MessageError {
    constructor(message: string, details?: object) {
        super('SERVICE_UNAVAILABLE', message, details);
    }
}

export class TimeoutError extends MessageError {
    constructor(message: string, details?: object) {
        super('TIMEOUT', message, details);
    }
}

export class InternalError extends MessageError {
    constructor(message: string, details?: object) {
        super('INTERNAL_ERROR', message, details);
    }
}