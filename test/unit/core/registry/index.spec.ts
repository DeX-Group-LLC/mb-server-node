import { ConnectionManager } from '@core/connection';
import { InvalidRequestError } from '@core/errors';
import { ServiceRegistry } from '@core/registry';
import { SubscriptionManager } from '@core/subscription';
import { ActionType } from '@core/types';
import { Message, TopicUtils } from '@core/utils';

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
jest.mock('@core/utils');
jest.mock('@utils/logger');

describe('ServiceRegistry', () => {
    let serviceRegistry: ServiceRegistry;
    let mockConnectionManager: jest.Mocked<ConnectionManager>;
    let mockSubscriptionManager: jest.Mocked<SubscriptionManager>;
    const serviceId = 'test-service';
    const requestId = 'req-1';
    const mockDate = new Date('2023-01-01T00:00:00.000Z');

    beforeAll(() => {
        jest.useFakeTimers();
    });

    beforeEach(() => {
        mockConnectionManager = {
            sendMessage: jest.fn(),
            removeConnection: jest.fn(),
        } as unknown as jest.Mocked<ConnectionManager>;

        mockSubscriptionManager = {
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
            getAllSubscribedTopics: jest.fn(),
            getSubscribers: jest.fn(),
            getTopSubscribers: jest.fn(),
        } as unknown as jest.Mocked<SubscriptionManager>;

        // Mock topic functions
        (TopicUtils.isValid as jest.Mock).mockReturnValue(true);

        serviceRegistry = new ServiceRegistry(mockSubscriptionManager);
        serviceRegistry.assignConnectionManager(mockConnectionManager);

        jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.clearAllTimers();
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    describe('handleSystemMessage', () => {
        it('should handle heartbeat request', () => {
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.heartbeat',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            serviceRegistry.registerService(serviceId);
            serviceRegistry.handleSystemMessage(serviceId, message);

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

        it('should handle heartbeat request for unregistered service', () => {
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

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.heartbeat',
                    requestid: requestId,
                    version: '1.0.0',
                },
                {
                    error: {
                        code: 'SERVICE_UNAVAILABLE',
                        message: `Service ${serviceId} not found`,
                        timestamp: mockDate.toISOString(),
                        details: undefined,
                    },
                }
            );
        });

        it('should handle topic subscription failure', () => {
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.topic.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    topic: 'test.topic',
                },
            };

            mockSubscriptionManager.subscribe.mockReturnValue(false);
            (TopicUtils.isValid as jest.Mock).mockReturnValue(false);
            serviceRegistry.registerService(serviceId);

            serviceRegistry.handleSystemMessage(serviceId, message);

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                {
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Missing or invalid topic',
                        timestamp: mockDate.toISOString(),
                        details: { topic: 'test.topic' },
                    },
                }
            );
        });

        it('should handle topic unsubscription failure', () => {
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

            mockSubscriptionManager.unsubscribe.mockReturnValue(false);
            (TopicUtils.isValid as jest.Mock).mockReturnValue(false);
            serviceRegistry.registerService(serviceId);

            serviceRegistry.handleSystemMessage(serviceId, message);

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.unsubscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                {
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Missing or invalid topic',
                        timestamp: mockDate.toISOString(),
                        details: { topic: 'test.topic' },
                    },
                }
            );
        });

        it('should handle unknown system topic', () => {
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.unknown',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            serviceRegistry.handleSystemMessage(serviceId, message);

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.unknown',
                    requestid: requestId,
                    version: '1.0.0',
                },
                {
                    error: {
                        code: 'TOPIC_NOT_SUPPORTED',
                        message: 'Unknown system message topic: system.unknown',
                        timestamp: mockDate.toISOString(),
                        details: undefined,
                    },
                }
            );
        });

        it('should handle service registration with valid payload', () => {
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.service.register',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    name: 'test-service-name',
                    description: 'test service description',
                },
            };

            serviceRegistry.handleSystemMessage(serviceId, message);

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

        it('should handle service registration with invalid payload', () => {
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.service.register',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    name: 123, // Invalid type
                    description: null, // Invalid type
                },
            };

            serviceRegistry.handleSystemMessage(serviceId, message);

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.service.register',
                    requestid: requestId,
                    version: '1.0.0',
                },
                {
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Missing or invalid name or description',
                        timestamp: mockDate.toISOString(),
                        details: { name: 123, description: null },
                    },
                }
            );
        });

        it('should handle service list request', () => {
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.service.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Register a service first
            serviceRegistry.registerService(serviceId, 'test-service-name', 'test service description');
            serviceRegistry.handleSystemMessage(serviceId, message);

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
                        name: 'test-service-name',
                        description: 'test service description',
                        connectedAt: mockDate,
                    }],
                }
            );
        });

        it('should handle topic list request', () => {
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.topic.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            const mockTopics = ['topic1', 'topic2', 'topic3'];
            mockSubscriptionManager.getAllSubscribedTopics.mockReturnValue(mockTopics);

            serviceRegistry.handleSystemMessage(serviceId, message);

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                { topics: mockTopics }
            );
        });

        it('should handle log subscription with valid payload', () => {
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.log.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    level: 'error',
                    codes: ['ERR_001', 'ERR_002'],
                },
            };

            serviceRegistry.registerService(serviceId);
            serviceRegistry.handleSystemMessage(serviceId, message);

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
        });

        it('should handle log subscription with invalid level', () => {
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.log.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    level: 'invalid_level',
                    codes: ['ERR_001'],
                },
            };

            serviceRegistry.registerService(serviceId);
            serviceRegistry.handleSystemMessage(serviceId, message);

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.log.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                {
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Invalid log level',
                        timestamp: mockDate.toISOString(),
                        details: { level: 'invalid_level' },
                    },
                }
            );
        });

        it('should handle log subscription with invalid codes', () => {
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.log.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    level: 'error',
                    codes: 'not_an_array',
                },
            };

            serviceRegistry.registerService(serviceId);
            serviceRegistry.handleSystemMessage(serviceId, message);

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.log.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                {
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Invalid log codes',
                        timestamp: mockDate.toISOString(),
                        details: { codes: 'not_an_array' },
                    },
                }
            );
        });

        it('should handle log unsubscribe', () => {
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.log.unsubscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            serviceRegistry.registerService(serviceId);
            serviceRegistry.handleSystemMessage(serviceId, message);

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

        it('should handle metric request', () => {
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.metric',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            serviceRegistry.handleSystemMessage(serviceId, message);

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.metric',
                    requestid: requestId,
                    version: '1.0.0',
                },
                {
                    error: {
                        code: 'SERVICE_UNAVAILABLE',
                        message: 'Metric collection not implemented yet',
                        timestamp: mockDate.toISOString(),
                        details: undefined,
                    },
                }
            );
        });

        it('should handle service cleanup on heartbeat timeout', () => {
            serviceRegistry.registerService(serviceId, 'test-service', 'test description');

            // Fast forward time to trigger heartbeat timeout
            jest.advanceTimersByTime(60000); // 60 seconds

            expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith(serviceId);
        });

        it('should handle log subscription for unregistered service', () => {
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.log.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    level: 'error',
                    codes: ['ERR_001'],
                },
            };

            // Don't register the service
            serviceRegistry.handleSystemMessage(serviceId, message);

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.log.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                {
                    error: {
                        code: 'SERVICE_UNAVAILABLE',
                        message: `Service ${serviceId} not found`,
                        timestamp: mockDate.toISOString(),
                        details: undefined,
                    },
                }
            );
            expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith(serviceId);
        });

        it('should handle log unsubscription for unregistered service', () => {
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.log.unsubscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            // Don't register the service
            serviceRegistry.handleSystemMessage(serviceId, message);

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.log.unsubscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                {
                    error: {
                        code: 'SERVICE_UNAVAILABLE',
                        message: `Service ${serviceId} not found`,
                        timestamp: mockDate.toISOString(),
                        details: undefined,
                    },
                }
            );
            expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith(serviceId);
        });

        it('should handle topic subscription to restricted system topic', () => {
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

            (TopicUtils.isValid as jest.Mock).mockReturnValue(true);
            serviceRegistry.handleSystemMessage(serviceId, message);

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                {
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Unable to subscribe to restricted topic',
                        timestamp: mockDate.toISOString(),
                        details: { topic: 'system.heartbeat' },
                    },
                }
            );
        });

        it('should handle topic subscription with invalid priority', () => {
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

            (TopicUtils.isValid as jest.Mock).mockReturnValue(true);
            serviceRegistry.handleSystemMessage(serviceId, message);

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                {
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Invalid priority',
                        timestamp: mockDate.toISOString(),
                        details: { priority: NaN },
                    },
                }
            );
        });

        it('should handle invalid action type for heartbeat', () => {
            const message: Message = {
                header: {
                    action: ActionType.PUBLISH,  // Invalid action type
                    topic: 'system.heartbeat',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            expect(() => serviceRegistry.handleSystemMessage(serviceId, message)).toThrow(
                new InvalidRequestError(
                    'Invalid action, expected REQUEST or RESPONSE for system.heartbeat',
                    { action: ActionType.PUBLISH, topic: 'system.heartbeat' }
                )
            );
        });

        it('should handle invalid action type for non-heartbeat topics', () => {
            const message: Message = {
                header: {
                    action: ActionType.RESPONSE,  // Invalid action type
                    topic: 'system.service.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            expect(() => serviceRegistry.handleSystemMessage(serviceId, message)).toThrow(
                new InvalidRequestError(
                    'Invalid action, expected REQUEST for system.service.list',
                    { action: ActionType.RESPONSE, topic: 'system.service.list' }
                )
            );
        });

        it('should handle log subscription with default values', () => {
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.log.subscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},  // Empty payload to test both defaults
            };

            serviceRegistry.registerService(serviceId);
            serviceRegistry.handleSystemMessage(serviceId, message);

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
        });

        it('should handle failed topic subscription', () => {
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

            mockSubscriptionManager.subscribe.mockReturnValue(false);
            serviceRegistry.handleSystemMessage(serviceId, message);

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

        it('should handle failed topic unsubscription', () => {
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

            mockSubscriptionManager.unsubscribe.mockReturnValue(false);
            serviceRegistry.handleSystemMessage(serviceId, message);

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
    });

    describe('registerService', () => {
        it('should register a new service', () => {
            const name = 'test-service';
            const description = 'test description';

            serviceRegistry.registerService(serviceId, name, description);

            // Trigger a service list request to verify the service was registered
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

        it('should update existing service on re-registration', () => {
            const name1 = 'test-service-1';
            const description1 = 'test description 1';
            const name2 = 'test-service-2';
            const description2 = 'test description 2';

            serviceRegistry.registerService(serviceId, name1, description1);
            serviceRegistry.registerService(serviceId, name2, description2);

            // Trigger a service list request to verify the service was updated
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
                        name: name2,
                        description: description2,
                        connectedAt: mockDate,
                    }],
                }
            );
        });
    });

    describe('clearAllServices', () => {
        it('should clear all registered services', async () => {
            // Register multiple services
            serviceRegistry.registerService('service1', 'Service 1', 'Description 1');
            serviceRegistry.registerService('service2', 'Service 2', 'Description 2');

            // Clear all services
            await serviceRegistry.clearAllServices();

            // Verify services were cleared by checking service list
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.service.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            serviceRegistry.handleSystemMessage('service1', message);

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service1',
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.service.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                { services: [] }
            );
        });

        it('should remove connections for all cleared services', async () => {
            // Register multiple services
            serviceRegistry.registerService('service1', 'Service 1', 'Description 1');
            serviceRegistry.registerService('service2', 'Service 2', 'Description 2');

            // Clear all services
            await serviceRegistry.clearAllServices();

            // Verify connections were removed
            expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith('service1');
            expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith('service2');
        });
    });

    describe('heartbeat timeout', () => {
        it('should remove service after heartbeat timeout', () => {
            serviceRegistry.registerService(serviceId, 'Test Service', 'Description');

            // Fast forward time past the heartbeat timeout
            jest.advanceTimersByTime(60000); // 60 seconds

            // Verify service was removed
            expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith(serviceId);

            // Verify service is no longer in the registry
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

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.service.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                { services: [] }
            );
        });

        it('should not remove service if heartbeat is received before timeout', () => {
            serviceRegistry.registerService(serviceId, 'Test Service', 'Description');

            // Clear any initial calls
            jest.clearAllMocks();

            // Fast forward time but not past the timeout
            jest.advanceTimersByTime(30000); // 30 seconds

            // Send a heartbeat
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

            // Fast forward remaining time
            jest.advanceTimersByTime(30000); // Another 30 seconds

            // Verify service was not removed
            expect(mockConnectionManager.removeConnection).not.toHaveBeenCalled();

            // Verify service is still in the registry
            const listMessage: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.service.list',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {},
            };

            serviceRegistry.handleSystemMessage(serviceId, listMessage);

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
                        name: 'Test Service',
                        description: 'Description',
                        connectedAt: mockDate,
                    }],
                }
            );
        });
    });

    describe('resetHeartbeat', () => {
        it('should not reset heartbeat for non-existent service', () => {
            // Try to reset heartbeat for a service that doesn't exist
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
            serviceRegistry.resetHeartbeat('non-existent-service');

            // Verify no timeouts were set
            expect(setTimeoutSpy).not.toHaveBeenCalled();
            setTimeoutSpy.mockRestore();
        });
    });

    describe('handleTopicSubscribe', () => {
        it('should handle successful topic subscription', () => {
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

            mockSubscriptionManager.subscribe.mockReturnValue(true);
            serviceRegistry.handleSystemMessage(serviceId, message);

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
    });

    describe('handleTopicUnsubscribe', () => {
        it('should handle successful topic unsubscription', () => {
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

            mockSubscriptionManager.unsubscribe.mockReturnValue(true);
            serviceRegistry.handleSystemMessage(serviceId, message);

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

        it('should handle unsubscription from restricted system topic', () => {
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'system.topic.unsubscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                payload: {
                    topic: 'system.heartbeat',
                },
            };

            mockSubscriptionManager.unsubscribe.mockReturnValue(true);
            serviceRegistry.handleSystemMessage(serviceId, message);

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                {
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.unsubscribe',
                    requestid: requestId,
                    version: '1.0.0',
                },
                {
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Unable to unsubscribe from restricted topic',
                        timestamp: mockDate.toISOString(),
                        details: { topic: 'system.heartbeat' },
                    },
                }
            );
        });
    });
});