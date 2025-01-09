import { LogEntry } from 'winston';
import { config } from '@config';
import { ConnectionManager } from '@core/connection';
import { MonitoringManager } from '@core/monitoring';
import { InvalidRequestError, ServiceUnavailableError, TopicNotSupportedError } from '@core/errors';
import { ServiceRegistry } from '@core/registry';
import { SubscriptionManager } from '@core/subscription';
import { ActionType } from '@core/types';
import { Message, TopicUtils } from '@core/utils';
import logger from '@utils/logger';

jest.mock('@config', () => ({
    config: {
        connection: {
            heartbeatRetryTimeout: 30000,
            heartbeatDeregisterTimeout: 60000,
        },
        logging: {
            level: 'info',
            format: 'json'
        }
    },
}));
jest.mock('@core/connection');
jest.mock('@core/subscription');
jest.mock('@core/utils');
jest.mock('@utils/logger');

/**
 * Test suite for ServiceRegistry.
 * Tests the core functionality of service registration, heartbeat management,
 * topic subscription/unsubscription, and system message handling.
 *
 * Key areas tested:
 * - Service registration and updates
 * - Heartbeat mechanism and timeouts
 * - Topic subscription management
 * - System message handling
 * - Error cases and edge conditions
 */
describe('ServiceRegistry', () => {
    let serviceRegistry: ServiceRegistry;
    let mockConnectionManager: jest.Mocked<ConnectionManager>;
    let monitoringManager: MonitoringManager;
    let mockSubscriptionManager: jest.Mocked<SubscriptionManager>;
    const serviceId = 'test-service';
    const requestId = 'req-1';
    const mockDate = new Date('2023-01-01T00:00:00.000Z');

    beforeAll(() => {
        // Use fake timers to control time-based operations
        jest.useFakeTimers();
    });

    beforeEach(() => {
        // Setup mock connection manager with required methods
        mockConnectionManager = {
            sendMessage: jest.fn(),
            removeConnection: jest.fn(),
        } as unknown as jest.Mocked<ConnectionManager>;

        // Setup mock subscription manager with required methods
        mockSubscriptionManager = {
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
            getAllSubscribedTopics: jest.fn(),
            getSubscribers: jest.fn(),
            getTopSubscribers: jest.fn(),
        } as unknown as jest.Mocked<SubscriptionManager>;

        // Create fresh monitoring manager for metrics
        monitoringManager = new MonitoringManager();

        // Default to valid topics for most tests
        (TopicUtils.isValid as jest.Mock).mockReturnValue(true);

        // Create fresh service registry instance
        serviceRegistry = new ServiceRegistry(mockSubscriptionManager, monitoringManager);
        serviceRegistry.assignConnectionManager(mockConnectionManager);

        // Set consistent date for all tests
        jest.setSystemTime(mockDate);
    });

    afterEach(() => {
        // Clean up mocks and timers after each test
        jest.clearAllMocks();
        jest.clearAllTimers();
    });

    afterAll(() => {
        // Restore real timers after all tests
        jest.useRealTimers();
    });

    /**
     * Tests for service registration functionality.
     * Verifies the service registry can properly:
     * - Register new services with default and custom values
     * - Update existing service registrations
     * - Set up heartbeat timeouts
     * - Handle registration via system messages
     */
    describe('Service Registration', () => {
        /**
         * Verifies that a service can be registered with default values.
         * The service should:
         * - Use the serviceId as the default name
         * - Use a default description
         * - Be immediately accessible via system.service.list
         */
        it('should register a new service with default values', () => {
            // Register service with minimal parameters
            serviceRegistry.registerService(serviceId);

            // Create message to verify registration via service list
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.service.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Request service list and verify response
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify response contains service with default values
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.service.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                {
                    services: [{
                        id: serviceId,
                        name: serviceId, // Default name is serviceId
                        description: 'No description provided', // Default description
                        connectedAt: mockDate,
                    }],
                }
            );
        });

        /**
         * Verifies that a service can be registered with custom values.
         * The service should:
         * - Use the provided name and description
         * - Be immediately accessible via system.service.list
         * - Return the custom values in the service list
         */
        it('should register a new service with custom values', () => {
            // Register service with custom name and description
            const name = 'test-service';
            const description = 'test description';
            serviceRegistry.registerService(serviceId, name, description);

            // Create message to verify registration via service list
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.service.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Request service list and verify response
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify response contains service with custom values
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.service.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                {
                    services: [{
                        id: serviceId,
                        name,
                        description,
                        connectedAt: mockDate,
                    }],
                }
            );
        });

        /**
         * Verifies that re-registering an existing service updates its values.
         * The service should:
         * - Maintain the same serviceId
         * - Update name and description
         * - Maintain the original connection time
         */
        it('should update existing service on re-registration', () => {
            // Initial registration with original values
            serviceRegistry.registerService(serviceId, 'initial-name', 'initial description');

            // Re-register with updated values
            const updatedName = 'updated-name';
            const updatedDescription = 'updated description';
            serviceRegistry.registerService(serviceId, updatedName, updatedDescription);

            // Create message to verify update via service list
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.service.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Request service list and verify response
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify response shows updated values
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.service.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                {
                    services: [{
                        id: serviceId,
                        name: updatedName,
                        description: updatedDescription,
                        connectedAt: mockDate,
                    }],
                }
            );
        });

        /**
         * Verifies that service registration properly sets up heartbeat timeouts.
         * The service should:
         * - Set up a retry timeout for heartbeat checks
         * - Set up a deregister timeout for service removal
         * - Only trigger timeouts at the exact configured times
         */
        it('should set up heartbeat timeouts on registration', () => {
            // Register service to start timeouts
            serviceRegistry.registerService(serviceId);

            // Verify no heartbeat sent before retry timeout
            jest.advanceTimersByTime(config.connection.heartbeatRetryTimeout - 1);
            expect(mockConnectionManager.sendMessage).not.toHaveBeenCalled();

            // Verify heartbeat sent at retry timeout
            jest.advanceTimersByTime(1);
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.REQUEST,
                    topic: 'system.heartbeat',
                    version: '1.0.0',
                }
            );

            // Verify service not removed before deregister timeout
            jest.advanceTimersByTime(config.connection.heartbeatDeregisterTimeout - config.connection.heartbeatRetryTimeout - 1);
            expect(mockConnectionManager.removeConnection).not.toHaveBeenCalled();

            // Verify service removed at deregister timeout
            jest.advanceTimersByTime(1);
            expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith(serviceId);
        });

        /**
         * Verifies that service registration can be handled via system messages.
         * The service should:
         * - Accept registration requests via system.service.register
         * - Send a success response on completion
         */
        it('should handle successful service registration via message', () => {
            // Create registration request message
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.service.register',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    name: 'test-service',
                    description: 'test description',
                },
            };

            // Handle registration message
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify success response sent
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.service.register',
                    requestid: requestId,
                    version: '1.0.0',
                },
                { status: 'success' }
            );
        });
    });

    /**
     * Tests for heartbeat handling functionality.
     * Verifies the service registry properly:
     * - Handles heartbeat requests from registered services
     * - Handles heartbeat requests from unregistered services
     * - Processes heartbeat responses
     * - Manages heartbeat timeouts correctly
     */
    describe('Heartbeat Handling', () => {
        /**
         * Verifies that heartbeat requests from registered services are handled correctly.
         * The service should:
         * - Accept the heartbeat request
         * - Send a success response
         * - Reset its heartbeat timeouts
         */
        it('should handle heartbeat request for registered service', () => {
            // Register service first to establish valid state
            serviceRegistry.registerService(serviceId);

            // Create heartbeat request message
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.heartbeat',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Process heartbeat request
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify success response sent
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.heartbeat',
                    requestid: requestId,
                    version: '1.0.0',
                },
                { status: 'success' }
            );
        });

        /**
         * Verifies that heartbeat requests from unregistered services are rejected.
         * The system should:
         * - Throw a ServiceUnavailableError
         * - Remove the connection for the unregistered service
         */
        it('should handle heartbeat request for unregistered service', () => {
            // Create heartbeat request message
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.heartbeat',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Verify error thrown for unregistered service
            expect(() => {
                serviceRegistry.handleSystemMessage(serviceId, message);
            }).toThrow(ServiceUnavailableError);

            // Verify connection removed for unregistered service
            expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith(serviceId);
        });

        /**
         * Verifies that heartbeat responses are handled correctly.
         * The service should:
         * - Accept the heartbeat response
         * - Not send any response back
         * - Reset its heartbeat timeouts
         */
        it('should handle heartbeat response', () => {
            // Register service first to establish valid state
            serviceRegistry.registerService(serviceId);

            // Create heartbeat response message
            const message: Message = {
                header: {
                    action: ActionType.RESPONSE,
                    topic: 'system.heartbeat',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Process heartbeat response
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify no response sent for a response message
            expect(mockConnectionManager.sendMessage).not.toHaveBeenCalled();
        });

        /**
         * Verifies that heartbeat timeouts are reset properly when heartbeats are received.
         * The service should:
         * - Reset its retry timeout
         * - Reset its deregister timeout
         * - Only send the next heartbeat request after the new retry timeout
         */
        it('should reset heartbeat timeouts on heartbeat', () => {
            // Register service first to establish valid state
            serviceRegistry.registerService(serviceId);

            // Advance time to just before first heartbeat retry
            jest.advanceTimersByTime(config.connection.heartbeatRetryTimeout - 1);

            // Send heartbeat to reset timeouts
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.heartbeat',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify original timeout was cancelled (only response to our request sent)
            jest.advanceTimersByTime(2);
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledTimes(1);

            // Verify new timeout is set up correctly
            jest.advanceTimersByTime(config.connection.heartbeatRetryTimeout - 1);
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledTimes(2);
        });
    });

    /**
     * Tests for topic subscription functionality.
     * Verifies the service registry properly:
     * - Handles successful topic subscriptions
     * - Validates and restricts system topic subscriptions
     * - Handles subscription failures
     */
    describe('Topic Subscription', () => {
        beforeEach(() => {
            // Register service and reset mocks for each test
            serviceRegistry.registerService(serviceId);
            jest.clearAllMocks();
        });

        /**
         * Verifies that valid topic subscriptions are handled successfully.
         * The service should:
         * - Accept valid topic subscriptions
         * - Process the subscription through the subscription manager
         * - Send a success response
         */
        it('should handle successful topic subscription', () => {
            // Create subscription request message
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.topic.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    topic: 'test.topic',
                    priority: 1,
                },
            };

            // Setup mocks for successful subscription
            mockSubscriptionManager.subscribe.mockReturnValue(true);
            (TopicUtils.isValid as jest.Mock).mockReturnValue(true);

            // Process subscription request
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify success response sent
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                { status: 'success' }
            );
        });

        /**
         * Verifies that restricted system topic subscriptions are rejected.
         * The service should:
         * - Identify restricted system topics
         * - Reject subscription attempts to these topics
         * - Throw an InvalidRequestError
         */
        it('should handle subscription to restricted system topic', () => {
            // Create subscription request for restricted topic
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.topic.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    topic: 'system.heartbeat',
                    priority: 1,
                },
            };

            // Setup mock for valid topic format
            (TopicUtils.isValid as jest.Mock).mockReturnValue(true);
            // Verify error thrown for restricted topic
            expect(() => {
                serviceRegistry.handleSystemMessage(serviceId, message);
            }).toThrow(InvalidRequestError);
        });

        /**
         * Verifies that subscriptions with invalid topics are rejected.
         * The service should:
         * - Validate the topic format
         * - Reject invalid topic formats
         * - Throw an InvalidRequestError
         */
        it('should handle subscription with invalid topic', () => {
            // Create subscription request message
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.topic.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    topic: 'test.topic',
                    priority: 1,
                },
            };

            // Setup mocks for invalid topic
            mockSubscriptionManager.subscribe.mockReturnValue(false);
            (TopicUtils.isValid as jest.Mock).mockReturnValue(false);

            // Verify error thrown for invalid topic
            expect(() => {
                serviceRegistry.handleSystemMessage(serviceId, message);
            }).toThrow(InvalidRequestError);
        });

        /**
         * Verifies that subscriptions with invalid priority values are rejected.
         * The service should:
         * - Validate the priority value
         * - Reject invalid priority values (NaN)
         * - Throw an InvalidRequestError
         */
        it('should handle subscription with invalid priority', () => {
            // Create subscription request with invalid priority
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.topic.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    topic: 'test.topic',
                    priority: NaN,
                },
            };

            // Setup mock for valid topic format
            (TopicUtils.isValid as jest.Mock).mockReturnValue(true);

            // Verify error thrown for invalid priority
            expect(() => {
                serviceRegistry.handleSystemMessage(serviceId, message);
            }).toThrow(InvalidRequestError);
        });
    });

    /**
     * Tests for error handling functionality.
     * Verifies the service registry properly:
     * - Handles invalid action types
     * - Processes unknown system topics
     * - Manages service registration errors
     * - Tracks error metrics
     */
    describe('Error Handling', () => {
        beforeEach(() => {
            // Register service and reset mocks for each test
            serviceRegistry.registerService(serviceId);
            jest.clearAllMocks();
        });

        /**
         * Verifies that invalid action types for heartbeat messages are rejected.
         * The service should:
         * - Validate the action type
         * - Throw an InvalidRequestError for incorrect actions
         */
        it('should handle invalid action type for heartbeat', () => {
            // Create message with invalid action type
            const message: Message = {
                header: {
                    action: ActionType.PUBLISH,  // Invalid action type
                    topic: 'system.heartbeat',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Verify specific error thrown with details
            expect(() => serviceRegistry.handleSystemMessage(serviceId, message)).toThrow(
                new InvalidRequestError(
                    'Invalid action, expected REQUEST or RESPONSE for system.heartbeat',
                    { action: ActionType.PUBLISH, topic: 'system.heartbeat' }
                )
            );
        });

        /**
         * Verifies that invalid action types for non-heartbeat topics are rejected.
         * The service should:
         * - Validate the action type
         * - Throw an InvalidRequestError for incorrect actions
         */
        it('should handle invalid action type for non-heartbeat topics', () => {
            // Create message with invalid action type
            const message: Message = {
                header: {
                    action: ActionType.RESPONSE,  // Invalid action type
                    topic: 'system.service.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Verify specific error thrown with details
            expect(() => serviceRegistry.handleSystemMessage(serviceId, message)).toThrow(
                new InvalidRequestError(
                    'Invalid action, expected REQUEST for system.service.list',
                    { action: ActionType.RESPONSE, topic: 'system.service.list' }
                )
            );
        });

        /**
         * Verifies that unknown system topics are rejected.
         * The service should:
         * - Identify unknown system topics
         * - Throw a TopicNotSupportedError
         */
        it('should handle unknown system topic', () => {
            // Create message with unknown topic
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.unknown',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Verify error thrown for unknown topic
            expect(() => {
                serviceRegistry.handleSystemMessage(serviceId, message);
            }).toThrow(TopicNotSupportedError);
        });

        /**
         * Verifies that service registration with invalid payload is rejected.
         * The service should:
         * - Validate the registration payload
         * - Throw an InvalidRequestError for invalid data
         */
        it('should handle service registration with invalid payload', () => {
            // Create message with invalid payload types
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.service.register',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    name: 123, // Invalid type to trigger error
                    description: null,
                },
            };

            // Verify error thrown for invalid payload
            expect(() => {
                serviceRegistry.handleSystemMessage(serviceId, message);
            }).toThrow(InvalidRequestError);
        });

        /**
         * Verifies that non-MessageError errors are handled properly.
         * The service should:
         * - Catch and process unexpected errors
         * - Track error metrics
         * - Propagate the error
         */
        it('should handle non-MessageError errors', () => {
            // Create test message
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.service.register',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Mock handleServiceRegister to throw unexpected error
            jest.spyOn(serviceRegistry as any, 'handleServiceRegister').mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            // Verify error propagated
            expect(() => {
                serviceRegistry.handleSystemMessage(serviceId, message);
            }).toThrow('Unexpected error');
        });

        /**
         * Verifies that MessageError errors are tracked and propagated.
         * The service should:
         * - Track the error metric
         * - Log the error
         * - Propagate the error
         */
        it('should track metrics and throw error for MessageError', () => {
            // Create message to trigger error
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.service.register',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    name: 123, // Invalid type to trigger error
                    description: null,
                },
            };

            // Verify error handling and metric tracking
            expect(() => {
                serviceRegistry.handleSystemMessage(serviceId, message);
            }).toThrow(InvalidRequestError);

            // Verify error was logged
            expect(logger.error).toHaveBeenCalledWith(
                `[ServiceRegistry] Error handling system message from ${serviceId}:`,
                expect.any(InvalidRequestError)
            );

            // Verify metric was tracked
            const metrics = serviceRegistry['metrics'];
            const errorMetric = metrics.serviceErrorRate.getMetric({ serviceId });
            expect(errorMetric).toBeDefined();
            expect(errorMetric?.slot.accumulatedValue).toBe(1);
        });

        /**
         * Verifies that non-MessageError errors are tracked and propagated.
         * The service should:
         * - Track the error metric
         * - Log the error
         * - Propagate the error
         */
        it('should track metrics and throw error for non-MessageError', () => {
            // Create test message
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.service.register',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Mock handleServiceRegister to throw unexpected error
            jest.spyOn(serviceRegistry as any, 'handleServiceRegister').mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            // Verify error handling and metric tracking
            expect(() => {
                serviceRegistry.handleSystemMessage(serviceId, message);
            }).toThrow('Unexpected error');

            // Verify error was logged
            expect(logger.error).toHaveBeenCalledWith(
                `[ServiceRegistry] Error handling system message from ${serviceId}:`,
                expect.any(Error)
            );

            // Verify metric was tracked
            const metrics = serviceRegistry['metrics'];
            const errorMetric = metrics.serviceErrorRate.getMetric({ serviceId });
            expect(errorMetric).toBeDefined();
            expect(errorMetric?.slot.accumulatedValue).toBe(1);
        });
    });

    /**
     * Tests for metrics tracking functionality.
     * Verifies the service registry properly:
     * - Tracks service registration metrics
     * - Tracks service unregistration metrics
     * - Tracks service discovery metrics
     * - Tracks error metrics
     * - Handles metric disposal
     */
    describe('Metrics Tracking', () => {
        /**
         * Verifies that service registration metrics are tracked properly.
         * The service should:
         * - Track registration rate
         * - Track service count
         * - Track service uptime
         */
        it('should track service registration metrics', () => {
            // Register service with custom values
            serviceRegistry.registerService(serviceId, 'test-service', 'test description');

            // Advance time to verify uptime tracking
            jest.advanceTimersByTime(1000);

            // Get metrics and verify values
            const metrics = serviceRegistry['metrics'];
            expect(metrics.registrationRate.slot.accumulatedValue).toBe(1);
            expect(metrics.count.slot.value).toBe(1);

            const uptimeMetric = metrics.serviceUptime.getMetric({ serviceId });
            expect(uptimeMetric).toBeDefined();
            expect(uptimeMetric?.slot.value).toBe(1);
        });

        /**
         * Verifies that service unregistration metrics are tracked properly.
         * The service should:
         * - Track unregistration rate
         * - Update service count
         */
        it('should track service unregistration metrics', () => {
            // Register and then unregister the service
            serviceRegistry.registerService(serviceId);
            serviceRegistry.unregisterService(serviceId);

            // Verify metrics updated correctly
            const metrics = serviceRegistry['metrics'];
            expect(metrics.unregistrationRate.slot.accumulatedValue).toBe(1);
            expect(metrics.count.slot.value).toBe(0);
        });

        /**
         * Verifies that service discovery metrics are tracked properly.
         * The service should:
         * - Track discovery rate when service list is requested
         */
        it('should track service discovery rate metrics', () => {
            // Register a service first
            serviceRegistry.registerService(serviceId);

            // Create and process service list request
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.service.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify discovery rate tracked
            const metrics = serviceRegistry['metrics'];
            expect(metrics.discoveryRate.slot.accumulatedValue).toBe(1);
        });

        /**
         * Verifies that error metrics are tracked for unknown system topics.
         * The service should:
         * - Track error rate per service
         */
        it('should track error metrics for unknown system topics', () => {
            // Register a service first
            serviceRegistry.registerService(serviceId);

            // Create message with unknown topic
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.unknown',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Trigger error and verify metric tracking
            expect(() => {
                serviceRegistry.handleSystemMessage(serviceId, message);
            }).toThrow(TopicNotSupportedError);

            // Verify error metric tracked
            const metrics = serviceRegistry['metrics'];
            const errorMetric = metrics.serviceErrorRate.getMetric({ serviceId });
            expect(errorMetric).toBeDefined();
            expect(errorMetric?.slot.accumulatedValue).toBe(1);
        });

        /**
         * Verifies that metrics are properly disposed when clearing services.
         * The service should:
         * - Clear all service metrics
         * - Dispose of parameterized metrics
         * - Reset service count
         */
        it('should dispose of metrics when clearing all services', async () => {
            // Register multiple services
            serviceRegistry.registerService('service1', 'Service 1', 'Description 1');
            serviceRegistry.registerService('service2', 'Service 2', 'Description 2');

            // Clear all services
            await serviceRegistry.dispose();

            // Verify metrics cleared
            const metrics = serviceRegistry['metrics'];
            expect(metrics.count.slot.value).toBe(0);

            // Verify parameterized metrics disposed
            const uptime1 = metrics.serviceUptime.getMetric({ serviceId: 'service1' });
            const uptime2 = metrics.serviceUptime.getMetric({ serviceId: 'service2' });
            expect(uptime1).toBeUndefined();
            expect(uptime2).toBeUndefined();
        });
    });

    /**
     * Tests for log subscription functionality.
     * Verifies the service registry properly:
     * - Handles log subscriptions with various parameters
     * - Validates subscription parameters
     * - Manages unsubscription requests
     */
    describe('Log Subscription', () => {
        beforeEach(() => {
            // Register service and reset mocks for each test
            serviceRegistry.registerService(serviceId);
            jest.clearAllMocks();
        });

        /**
         * Verifies that log subscriptions with default level are handled properly.
         * The service should:
         * - Accept subscriptions with only regex specified
         * - Use default level settings
         * - Send success response
         */
        it('should handle valid log subscription with default level', () => {
            // Create subscription request with only regex
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.log.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    regex: '.*ERROR.*',
                },
            };

            // Process subscription request
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify success response sent
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.log.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                { status: 'success' }
            );

            // Verify the service's log subscriptions
            const service = (serviceRegistry as any).services.get(serviceId);
            expect(service.logSubscriptions.level).toBe('error');
            expect(service.logSubscriptions.regex.source).toBe('.*ERROR.*');
        });

        /**
         * Verifies that log subscriptions with default codes are handled properly.
         * The service should:
         * - Accept subscriptions with only level specified
         * - Use default code settings
         * - Send success response
         */
        it('should handle valid log subscription with default codes', () => {
            // Create subscription request with only level
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.log.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    level: 'debug',
                },
            };

            // Process subscription request
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify success response sent
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.log.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                { status: 'success' }
            );

            // Verify the service's log subscriptions
            const service = (serviceRegistry as any).services.get(serviceId);
            expect(service.logSubscriptions.level).toBe('debug');
            expect(service.logSubscriptions.regex).toBeUndefined();
        });

        /**
         * Verifies that log subscriptions from unregistered services are rejected.
         * The service should:
         * - Verify service registration
         * - Throw ServiceUnavailableError for unregistered services
         * - Remove the connection
         */
        it('should handle log subscription for unregistered service', () => {
            // Create subscription request
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.log.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    level: 'debug',
                    codes: ['ERROR_1'],
                },
            };

            // Attempt subscription with unregistered service
            const unregisteredServiceId = 'unregistered-service';
            expect(() => {
                serviceRegistry.handleSystemMessage(unregisteredServiceId, message);
            }).toThrow(ServiceUnavailableError);

            // Verify connection removed
            expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith(unregisteredServiceId);
        });

        /**
         * Verifies that log unsubscriptions from unregistered services are rejected.
         * The service should:
         * - Verify service registration
         * - Throw ServiceUnavailableError for unregistered services
         * - Remove the connection
         */
        it('should handle log unsubscription for unregistered service', () => {
            // Create unsubscription request
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.log.unsubscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Attempt unsubscription with unregistered service
            const unregisteredServiceId = 'unregistered-service';
            expect(() => {
                serviceRegistry.handleSystemMessage(unregisteredServiceId, message);
            }).toThrow(ServiceUnavailableError);

            // Verify connection removed
            expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith(unregisteredServiceId);
        });

        /**
         * Verifies that metric requests from unregistered services are rejected.
         * The service should:
         * - Verify service registration
         * - Throw ServiceUnavailableError for unregistered services
         * - Remove the connection
         */
        it('should handle metric request for unregistered service', () => {
            // Create metric request
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.metric',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Attempt metric request with unregistered service
            const unregisteredServiceId = 'unregistered-service';
            expect(() => {
                serviceRegistry.handleSystemMessage(unregisteredServiceId, message);
            }).toThrow(ServiceUnavailableError);

            // Verify connection removed
            expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith(unregisteredServiceId);
        });

        /**
         * Verifies that successful log unsubscription requests are handled properly.
         * The service should:
         * - Process the unsubscription
         * - Send a success response
         */
        it('should handle successful log unsubscription', () => {
            // Create unsubscription request
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.log.unsubscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Process unsubscription request
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify success response sent
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.log.unsubscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                { status: 'success' }
            );
        });

        /**
         * Verifies that log subscriptions with invalid level are rejected.
         * The service should:
         * - Validate the log level
         * - Throw InvalidRequestError for invalid levels
         */
        it('should handle log subscription with invalid level', () => {
            // Create subscription request with invalid level
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.log.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    level: 'invalid-level',
                    codes: ['ERROR_1'],
                },
            };

            // Verify error thrown for invalid level
            expect(() => {
                serviceRegistry.handleSystemMessage(serviceId, message);
            }).toThrow(InvalidRequestError);
        });

        /**
         * Verifies that log subscriptions with invalid regex are rejected.
         * The service should:
         * - Validate the error codes
         * - Throw InvalidRequestError for invalid regex
         */
        it('should handle log subscription with invalid regex', () => {
            // Create subscription request with invalid codes
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.log.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    level: 'debug',
                    regex: "[", // Invalid regex
                },
            };

            // Verify error thrown for invalid regex
            expect(() => {
                serviceRegistry.handleSystemMessage(serviceId, message);
            }).toThrow(InvalidRequestError);
        });

        /**
         * Verifies that log subscriptions with a non-string regex are rejected.
         * The service should:
         * - Validate the regex type
         * - Throw InvalidRequestError for non-string regex
         */
        it('should handle log subscription with non-string regex', () => {
            // Create subscription request with non-string regex
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.log.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    level: 'debug',
                    regex: 123, // Non-string regex
                },
            };

            // Verify error thrown for non-string regex
            expect(() => {
                serviceRegistry.handleSystemMessage(serviceId, message);
            }).toThrow(InvalidRequestError);
        });

        /**
         * Verifies that log messages are correctly filtered and sent to subscribed services.
         * The service should:
         * - Filter log messages based on level and regex
         * - Send matching log messages to subscribed services
         */
        it('should filter and send log messages to subscribed services', () => {
            // Create a mock log entry
            const logEntry: LogEntry = {
                level: 'error',
                message: 'This is an ERROR message',
            };

            // Set up log subscriptions for a service
            const service = (serviceRegistry as any).services.get(serviceId);
            service.logSubscriptions = { level: 'error', regex: /.*ERROR.*/ };

            // Mock sendMessage to capture sent messages
            const sendMessageSpy = jest.spyOn(mockConnectionManager, 'sendMessage');

            // Call handleLog with the mock log entry
            (serviceRegistry as any).handleLog(logEntry);

            // Verify that sendMessage was called with the correct parameters
            expect(sendMessageSpy).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.log',
                    version: '1.0.0',
                },
                { level: 'error', message: 'This is an ERROR message' }
            );

            // Reset the mock
            sendMessageSpy.mockReset();

            // Test with a log entry that doesn't match the regex
            const nonMatchingLogEntry: LogEntry = {
                level: 'error',
                message: 'This is a different message',
            };

            // Call handleLog with the non-matching log entry
            (serviceRegistry as any).handleLog(nonMatchingLogEntry);

            // Verify that sendMessage was not called
            expect(sendMessageSpy).not.toHaveBeenCalled();

            // Reset the mock
            sendMessageSpy.mockReset();

            // Test with a log entry that doesn't match the level
            const wrongLevelLogEntry: LogEntry = {
                level: 'info',
                message: 'This is an ERROR message',
            };

            // Call handleLog with the wrong level log entry
            (serviceRegistry as any).handleLog(wrongLevelLogEntry);

            // Verify that sendMessage was not called
            expect(sendMessageSpy).not.toHaveBeenCalled();
        });
    });

    /**
     * Tests for metric request functionality.
     * Verifies the service registry properly:
     * - Handles metric requests
     * - Returns serialized metrics
     * - Validates service registration
     */
    describe('Metric Requests', () => {
        beforeEach(() => {
            // Register service and reset mocks for each test
            serviceRegistry.registerService(serviceId);
            jest.clearAllMocks();
        });

        /**
         * Verifies that metric requests are handled properly.
         * The service should:
         * - Serialize current metrics
         * - Return them in the response
         */
        it('should handle metric request', () => {
            // Create metric request message
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.metric',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Setup mock metrics data
            const mockMetrics = { metric1: 1, metric2: 2 };
            jest.spyOn(monitoringManager, 'serializeMetrics').mockReturnValue(mockMetrics);

            // Process metric request
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify response contains metrics
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.metric',
                    requestid: requestId,
                    version: '1.0.0',
                },
                { metrics: mockMetrics }
            );
        });
    });

    /**
     * Tests for topic management functionality.
     * Verifies the service registry properly:
     * - Handles topic listing
     * - Manages topic unsubscriptions
     * - Validates topic restrictions
     * - Handles invalid topics
     */
    describe('Topic Management', () => {
        beforeEach(() => {
            // Register service and reset mocks for each test
            serviceRegistry.registerService(serviceId);
            jest.clearAllMocks();
        });

        /**
         * Verifies that topic list requests return all subscribed topics.
         * The service should:
         * - Query the subscription manager for all topics
         * - Return the complete list in the response
         * - Include all topics in the correct format
         */
        it('should handle topic list request', () => {
            // Setup mock topics to be returned
            const topics = ['topic1', 'topic2'];
            mockSubscriptionManager.getAllSubscribedTopics.mockReturnValue(topics);

            // Create topic list request message
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.topic.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Process topic list request
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify response contains all topics
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                { topics }
            );
        });

        /**
         * Verifies that services can subscribe to the system.service.register topic.
         * The service should:
         * - Allow subscription to this specific system topic
         * - Process the subscription through the subscription manager
         * - Send a success response
         */
        it('should allow subscribing to system.service.register', () => {
            // Create subscription request for system topic
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.topic.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    topic: 'system.service.register',
                    priority: 1,
                },
            };

            // Setup mocks for successful subscription
            mockSubscriptionManager.subscribe.mockReturnValue(true);
            (TopicUtils.isValid as jest.Mock).mockReturnValue(true);

            // Process subscription request
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify success response sent
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                { status: 'success' }
            );
        });

        /**
         * Verifies that failed subscription attempts are handled properly.
         * The service should:
         * - Attempt the subscription through the subscription manager
         * - Handle the failure gracefully
         * - Send a failure response
         */
        it('should handle failed subscription', () => {
            // Create subscription request message
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.topic.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    topic: 'test.topic',
                    priority: 1,
                },
            };

            // Setup mocks for failed subscription
            mockSubscriptionManager.subscribe.mockReturnValue(false);
            (TopicUtils.isValid as jest.Mock).mockReturnValue(true);

            // Process subscription request
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify failure response sent
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                { status: 'failure' }
            );
        });

        /**
         * Verifies that failed unsubscription attempts are handled properly.
         * The service should:
         * - Attempt the unsubscription through the subscription manager
         * - Handle the failure gracefully
         * - Send a failure response
         */
        it('should handle failed unsubscription', () => {
            // Create unsubscription request message
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.topic.unsubscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    topic: 'test.topic',
                },
            };

            // Setup mocks for failed unsubscription
            mockSubscriptionManager.unsubscribe.mockReturnValue(false);
            (TopicUtils.isValid as jest.Mock).mockReturnValue(true);

            // Process unsubscription request
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify failure response sent
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.unsubscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                { status: 'failure' }
            );
        });

        /**
         * Verifies that unsubscription requests with invalid topics are rejected.
         * The service should:
         * - Validate the topic format
         * - Reject empty or invalid topics
         * - Throw an InvalidRequestError
         */
        it('should handle unsubscription with invalid topic', () => {
            // Create unsubscription request with invalid topic
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.topic.unsubscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    topic: '', // Invalid topic
                },
            };

            // Verify error thrown for invalid topic
            expect(() => {
                serviceRegistry.handleSystemMessage(serviceId, message);
            }).toThrow(InvalidRequestError);
        });

        /**
         * Verifies that unsubscription from restricted system topics is prevented.
         * The service should:
         * - Identify restricted system topics
         * - Prevent unsubscription from these topics
         * - Throw an InvalidRequestError
         */
        it('should handle unsubscription from restricted system topic', () => {
            // Create unsubscription request for restricted topic
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.topic.unsubscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    topic: 'system.heartbeat', // Restricted system topic
                },
            };

            // Setup mock for valid topic format
            (TopicUtils.isValid as jest.Mock).mockReturnValue(true);

            // Verify error thrown for restricted topic
            expect(() => {
                serviceRegistry.handleSystemMessage(serviceId, message);
            }).toThrow(InvalidRequestError);
        });

        /**
         * Verifies that successful unsubscription requests are handled properly.
         * The service should:
         * - Process the unsubscription through the subscription manager
         * - Send a success response
         * - Include the correct request details in the response
         */
        it('should handle successful unsubscription', () => {
            // Create unsubscription request message
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.topic.unsubscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    topic: 'test.topic',
                },
            };

            // Setup mocks for successful unsubscription
            mockSubscriptionManager.unsubscribe.mockReturnValue(true);
            (TopicUtils.isValid as jest.Mock).mockReturnValue(true);

            // Process unsubscription request
            serviceRegistry.handleSystemMessage(serviceId, message);

            // Verify unsubscription was called with correct parameters
            expect(mockSubscriptionManager.unsubscribe).toHaveBeenCalledWith(serviceId, 'test.topic');

            // Verify success response sent with correct details
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.unsubscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                { status: 'success' }
            );
        });
    });

    /**
     * Tests for handling unknown system messages.
     * Verifies the service registry properly:
     * - Identifies unknown system message topics
     * - Rejects them with appropriate errors
     * - Does not send responses for unknown topics
     */
    describe('Unknown System Message', () => {
        /**
         * Verifies that unknown system message topics are rejected.
         * The service should:
         * - Identify the unknown topic
         * - Throw a TopicNotSupportedError
         * - Not send any response message
         */
        it('should throw TopicNotSupportedError for unknown system message topic', () => {
            // Register service first to establish valid state
            serviceRegistry.registerService(serviceId);

            // Create message with unknown system topic
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.unknown.topic',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Verify error thrown for unknown topic
            expect(() => serviceRegistry.handleSystemMessage(serviceId, message))
                .toThrow(TopicNotSupportedError);

            // Verify no response was sent
            expect(mockConnectionManager.sendMessage).not.toHaveBeenCalled();
        });
    });
});