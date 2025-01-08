import {
    MessageError,
    InvalidRequestError,
    MalformedMessageError,
    InvalidRequestIdError,
    UnsupportedVersionError,
    UnauthorizedError,
    ForbiddenError,
    TopicNotSupportedError,
    NoRouteFoundError,
    ServiceUnavailableError,
    TimeoutError,
    InternalError
} from '@core/errors';

describe('Error Classes', () => {
    describe('MessageError', () => {
        it('should create a MessageError with all properties', () => {
            const error = new MessageError('TEST_CODE', 'Test message', { detail: 'test' });
            expect(error.code).toBe('TEST_CODE');
            expect(error.message).toBe('Test message');
            expect(error.details).toEqual({ detail: 'test' });
            expect(error.name).toBe('MessageError');
            expect(error.timestamp).toBeInstanceOf(Date);
        });

        it('should create a MessageError without details', () => {
            const error = new MessageError('TEST_CODE', 'Test message');
            expect(error.code).toBe('TEST_CODE');
            expect(error.message).toBe('Test message');
            expect(error.details).toBeUndefined();
        });

        it('should convert to JSON correctly', () => {
            const error = new MessageError('TEST_CODE', 'Test message', { detail: 'test' });
            const json = error.toJSON();
            expect(json.code).toBe('TEST_CODE');
            expect(json.message).toBe('Test message');
            expect(json.details).toEqual({ detail: 'test' });
            expect(typeof json.timestamp).toBe('string');
        });
    });

    describe('Specific Error Classes', () => {
        const testCases = [
            {
                ErrorClass: InvalidRequestError,
                code: 'INVALID_REQUEST',
                name: 'InvalidRequestError'
            },
            {
                ErrorClass: MalformedMessageError,
                code: 'MALFORMED_MESSAGE',
                name: 'MalformedMessageError'
            },
            {
                ErrorClass: InvalidRequestIdError,
                code: 'INVALID_REQUEST_ID',
                name: 'InvalidRequestIdError'
            },
            {
                ErrorClass: UnsupportedVersionError,
                code: 'VERSION_NOT_SUPPORTED',
                name: 'UnsupportedVersionError'
            },
            {
                ErrorClass: UnauthorizedError,
                code: 'UNAUTHORIZED',
                name: 'UnauthorizedError'
            },
            {
                ErrorClass: ForbiddenError,
                code: 'FORBIDDEN',
                name: 'ForbiddenError'
            },
            {
                ErrorClass: TopicNotSupportedError,
                code: 'TOPIC_NOT_SUPPORTED',
                name: 'TopicNotSupportedError'
            },
            {
                ErrorClass: NoRouteFoundError,
                code: 'NO_ROUTE_FOUND',
                name: 'NoRouteFoundError'
            },
            {
                ErrorClass: ServiceUnavailableError,
                code: 'SERVICE_UNAVAILABLE',
                name: 'ServiceUnavailableError'
            },
            {
                ErrorClass: TimeoutError,
                code: 'TIMEOUT',
                name: 'TimeoutError'
            },
            {
                ErrorClass: InternalError,
                code: 'INTERNAL_ERROR',
                name: 'InternalError'
            }
        ];

        testCases.forEach(({ ErrorClass, code, name }) => {
            describe(name, () => {
                it('should create error with correct code and message', () => {
                    const error = new ErrorClass('Test message');
                    expect(error.code).toBe(code);
                    expect(error.message).toBe('Test message');
                    expect(error.name).toBe('MessageError');
                });

                it('should create error with details', () => {
                    const details = { detail: 'test' };
                    const error = new ErrorClass('Test message', details);
                    expect(error.details).toEqual(details);
                });

                it('should convert to JSON correctly', () => {
                    const error = new ErrorClass('Test message', { detail: 'test' });
                    const json = error.toJSON();
                    expect(json.code).toBe(code);
                    expect(json.message).toBe('Test message');
                    expect(json.details).toEqual({ detail: 'test' });
                    expect(typeof json.timestamp).toBe('string');
                });
            });
        });
    });
});