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

/**
 * Test suite for error classes used in the message broker system.
 * Tests the core functionality of error handling and error message formatting.
 *
 * Key areas tested:
 * - Base MessageError functionality
 * - Specific error type implementations
 * - Error serialization
 * - Error details handling
 */
describe('Error Classes', () => {
    /**
     * Tests for the base MessageError class.
     * Verifies the error class properly:
     * - Handles error code, message, and details
     * - Manages error timestamps
     * - Serializes to JSON format
     */
    describe('MessageError', () => {
        /**
         * Verifies that a MessageError can be created with all properties.
         * The error should:
         * - Set the error code
         * - Set the error message
         * - Store optional details
         * - Set a timestamp
         * - Have the correct name
         */
        it('should create a MessageError with all properties', () => {
            // Create error with all optional properties
            const error = new MessageError('TEST_CODE', 'Test message', { detail: 'test' });

            // Verify all properties are set correctly
            expect(error.code).toBe('TEST_CODE');
            expect(error.message).toBe('Test message');
            expect(error.details).toEqual({ detail: 'test' });
            expect(error.name).toBe('MessageError');
            expect(error.timestamp).toBeInstanceOf(Date);
        });

        /**
         * Verifies that a MessageError can be created without details.
         * The error should:
         * - Set the error code
         * - Set the error message
         * - Have undefined details
         */
        it('should create a MessageError without details', () => {
            // Create error without optional details
            const error = new MessageError('TEST_CODE', 'Test message');

            // Verify required properties are set and details is undefined
            expect(error.code).toBe('TEST_CODE');
            expect(error.message).toBe('Test message');
            expect(error.details).toBeUndefined();
        });

        /**
         * Verifies that a MessageError can be converted to JSON.
         * The serialized error should:
         * - Include the error code
         * - Include the error message
         * - Include any details
         * - Include the timestamp as a string
         */
        it('should convert to JSON correctly', () => {
            // Create error with all properties
            const error = new MessageError('TEST_CODE', 'Test message', { detail: 'test' });

            // Convert to JSON and verify format
            const json = error.toJSON();
            expect(json.code).toBe('TEST_CODE');
            expect(json.message).toBe('Test message');
            expect(json.details).toEqual({ detail: 'test' });
            expect(typeof json.timestamp).toBe('string');
        });
    });

    /**
     * Tests for specific error class implementations.
     * Verifies each error type properly:
     * - Sets its specific error code
     * - Inherits MessageError functionality
     * - Handles details correctly
     * - Serializes properly
     */
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
            /**
             * Test suite for each specific error class.
             * Verifies the error class properly:
             * - Uses its designated error code
             * - Handles messages and details
             * - Serializes correctly
             */
            describe(name, () => {
                /**
                 * Verifies that the error is created with the correct code and message.
                 * The error should:
                 * - Use its specific error code
                 * - Set the provided message
                 * - Inherit MessageError name
                 */
                it('should create error with correct code and message', () => {
                    // Create error with basic message
                    const error = new ErrorClass('Test message');

                    // Verify error properties
                    expect(error.code).toBe(code);
                    expect(error.message).toBe('Test message');
                    expect(error.name).toBe('MessageError');
                });

                /**
                 * Verifies that the error can include additional details.
                 * The error should:
                 * - Store the provided details object
                 * - Make details accessible via property
                 */
                it('should create error with details', () => {
                    // Create error with details object
                    const details = { detail: 'test' };
                    const error = new ErrorClass('Test message', details);

                    // Verify details are stored
                    expect(error.details).toEqual(details);
                });

                /**
                 * Verifies that the error serializes to JSON correctly.
                 * The serialized error should:
                 * - Include the specific error code
                 * - Include the message
                 * - Include any details
                 * - Include a timestamp string
                 */
                it('should convert to JSON correctly', () => {
                    // Create error with message and details
                    const error = new ErrorClass('Test message', { detail: 'test' });

                    // Convert to JSON and verify format
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