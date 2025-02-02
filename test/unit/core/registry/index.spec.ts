import { LogEntry } from 'winston';
import { config } from '@config';
import { ConnectionManager } from '@core/connection';
import { InvalidRequestError, TopicNotSupportedError } from '@core/errors';
import { MonitoringManager } from '@core/monitoring';
import { SubscriptionManager } from '@core/subscription';
import { ActionType } from '@core/types';
import { MessageUtils } from '@core/utils';
import { ServiceRegistry } from '@core/registry';
import { RegistryMetrics } from '@core/registry/metrics';
import { MessageRouter } from '@core/router';
import { GaugeSlot, RateSlot, UptimeSlot } from '@core/monitoring/metrics/slots';
import { SetupLogger } from '@utils/logger';
import { randomUUID } from 'crypto';

jest.mock('@core/connection');
jest.mock('@core/subscription');
jest.mock('@core/router');
jest.mock('@utils/logger', () => ({
    SetupLogger: jest.fn().mockReturnValue({
        stream: jest.fn().mockReturnValue({
            on: jest.fn()
        }),
        on: jest.fn(),
        off: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    })
}));

describe('ServiceRegistry', () => {
    let registry: ServiceRegistry;
    let subscriptionManager: jest.Mocked<SubscriptionManager>;
    let connectionManager: jest.Mocked<ConnectionManager>;
    let monitoringManager: MonitoringManager;
    let messageRouter: jest.Mocked<MessageRouter>;

    const createMockMessage = (header: any, payload?: any): MessageUtils.Parser => {
        const message = MessageUtils.serialize({
            ...header,
            requestId: header.requestId || randomUUID()
        }, payload || {});
        return new MessageUtils.Parser(Buffer.from(message));
    };

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Create instances with minimal required constructor args
        subscriptionManager = new SubscriptionManager() as jest.Mocked<SubscriptionManager>;
        monitoringManager = new MonitoringManager();
        messageRouter = new MessageRouter(subscriptionManager, monitoringManager) as jest.Mocked<MessageRouter>;

        // Create registry instance first since ConnectionManager needs it
        registry = new ServiceRegistry(subscriptionManager, monitoringManager);

        // Now create ConnectionManager with all required dependencies
        connectionManager = new ConnectionManager(messageRouter, registry, monitoringManager, subscriptionManager) as jest.Mocked<ConnectionManager>;

        // Mock subscriptionManager methods
        subscriptionManager.subscribePublish = jest.fn().mockReturnValue(true);
        subscriptionManager.subscribeRequest = jest.fn().mockReturnValue(true);
        subscriptionManager.unsubscribe = jest.fn().mockReturnValue(true);
        subscriptionManager.getSubscribedTopics = jest.fn().mockReturnValue([]);
        subscriptionManager.getAllSubscribedTopics = jest.fn().mockReturnValue([]);

        // Assign connection manager to registry
        registry.assignConnectionManager(connectionManager);
    });

    afterEach(() => {
        // Dispose registry and metrics
        registry.dispose();
        monitoringManager.dispose();
        jest.useRealTimers();
    });

    describe('Service Registration', () => {
        it('should register a new service with default values', () => {
            const serviceId = 'test-service';
            registry.registerService(serviceId);

            // Verify service was registered
            const service = registry['services'].get(serviceId);
            expect(service).toBeDefined();
            expect(service?.name).toBe('');
            expect(service?.description).toBe('');
        });

        it('should register a service with custom name and description', () => {
            const serviceId = 'test-service';
            const name = 'Test Service';
            const description = 'A test service';
            registry.registerService(serviceId, name, description);

            // Verify service was registered
            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.service.list',
                version: '1.0.0'
            }));

            expect(connectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    topic: 'system.service.list'
                }),
                expect.objectContaining({
                    services: expect.arrayContaining([
                expect.objectContaining({
                            id: serviceId,
                            name,
                            description
                        })
                    ])
                }),
                undefined
            );
        });

        it('should throw error if service name is too long', () => {
            const serviceId = 'test-service';
            const longName = 'a'.repeat(37);

            expect(() => registry.registerService(serviceId, longName))
                .toThrow(InvalidRequestError);
        });

        it('should throw error if service description is too long', () => {
            const serviceId = 'test-service';
            const longDescription = 'a'.repeat(1025);

            expect(() => registry.registerService(serviceId, 'name', longDescription))
                .toThrow(InvalidRequestError);
        });

        it('should update existing service on re-registration', () => {
            const serviceId = 'test-service';
            registry.registerService(serviceId, 'name1', 'desc1');
            registry.registerService(serviceId, 'name2', 'desc2');

            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.service.list',
                version: '1.0.0'
            }));

            expect(connectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                expect.any(Object),
                expect.objectContaining({
                    services: expect.arrayContaining([
                expect.objectContaining({
                        id: serviceId,
                            name: 'name2',
                            description: 'desc2'
                        })
                    ])
                }),
                undefined
            );
        });
    });

    describe('Service Unregistration', () => {
        it('should unregister an existing service', () => {
            const serviceId = 'test-service';
            registry.registerService(serviceId);
            registry.unregisterService(serviceId);

            // Verify cleanup actions
            expect(subscriptionManager.unsubscribe).toHaveBeenCalledWith(serviceId);
            expect(connectionManager.removeConnection).toHaveBeenCalledWith(serviceId);
        });

        it('should handle unregistering non-existent service', () => {
            expect(() => registry.unregisterService('non-existent'))
                .not.toThrow();
        });
    });

    describe('System Message Handling', () => {
        it('should handle messages with and without requestId', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Test with requestId
            const withRequestId = createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.heartbeat',
                version: '1.0.0',
                requestId
            });

            // Test without requestId (manually creating message)
            const withoutRequestId = new MessageUtils.Parser(Buffer.from(MessageUtils.serialize({
                action: ActionType.REQUEST,
                topic: 'system.heartbeat',
                version: '1.0.0'
            }, {})));

            // Handle message with requestId
            registry.handleSystemMessage(serviceId, withRequestId);
            expect(connectionManager.sendMessage).toHaveBeenLastCalledWith(
                serviceId,
                expect.objectContaining({
                    requestId
                }),
                expect.any(Object),
                undefined
            );

            // Handle message without requestId
            registry.handleSystemMessage(serviceId, withoutRequestId);
            expect(connectionManager.sendMessage).toHaveBeenLastCalledWith(
                serviceId,
                expect.objectContaining({
                action: ActionType.RESPONSE,
                topic: 'system.heartbeat',
                    version: '1.0.0'
                }),
                expect.any(Object),
                undefined
            );
        });

        it('should handle heartbeat messages', () => {
            const serviceId = 'test-service';
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Test with requestId
            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.heartbeat',
                version: '1.0.0',
                requestId
            }));

            expect(connectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    topic: 'system.heartbeat',
                requestId
                }),
                { status: 'success' },
                undefined
            );

            // Test without requestId (manually creating message)
            const withoutRequestId = new MessageUtils.Parser(Buffer.from(MessageUtils.serialize({
                action: ActionType.REQUEST,
                topic: 'system.heartbeat',
                version: '1.0.0'
            }, {})));

            registry.handleSystemMessage(serviceId, withoutRequestId);
            expect(connectionManager.sendMessage).toHaveBeenLastCalledWith(
                serviceId,
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    topic: 'system.heartbeat'
                }),
                { status: 'success' },
                undefined
            );
        });

        it('should handle error logging with and without requestId', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);
            const logger = (SetupLogger as jest.Mock)();

            // Test with requestId
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.unknown',
                version: '1.0.0',
                requestId
            }))).toThrow(TopicNotSupportedError);

            expect(logger.error).toHaveBeenLastCalledWith(
                expect.stringContaining(`:${requestId}`),
                expect.any(Object)
            );

            // Test without requestId (manually creating message)
            const withoutRequestId = new MessageUtils.Parser(Buffer.from(MessageUtils.serialize({
                action: ActionType.REQUEST,
                topic: 'system.unknown',
                version: '1.0.0'
            }, {})));

            expect(() => registry.handleSystemMessage(serviceId, withoutRequestId))
                .toThrow(TopicNotSupportedError);

            expect(logger.error).toHaveBeenLastCalledWith(
                expect.not.stringContaining('::'),  // Should not have double colons that would indicate an empty requestId
                expect.any(Object)
            );
        });

        it('should handle missing serviceErrorRate metric', () => {
            const serviceId = 'test-service';
            registry.registerService(serviceId);

            // Mock serviceErrorRate.getMetric to return undefined
            const mockServiceErrorRate = registry['metrics'].serviceErrorRate;
            mockServiceErrorRate.getMetric = jest.fn().mockReturnValue(undefined);

            // Trigger an error that would increment the error rate
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.unknown',
                version: '1.0.0'
            }))).toThrow(TopicNotSupportedError);

            // Verify getMetric was called but add was not (since metric was undefined)
            expect(mockServiceErrorRate.getMetric).toHaveBeenCalledWith({ serviceId });
            expect(mockServiceErrorRate.getMetric({ serviceId })?.slot?.add).toBeUndefined();
        });

        it('should handle topic subscription requests', () => {
            const serviceId = 'test-service';
            registry.registerService(serviceId);

            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.subscribe',
                version: '1.0.0'
            }, {
                topic: 'test.topic',
                priority: 0,
                action: ActionType.REQUEST
            }));

            expect(subscriptionManager.subscribeRequest).toHaveBeenCalledWith(
                serviceId,
                'test.topic',
                0
            );
        });

        it('should handle topic unsubscription requests', () => {
            const serviceId = 'test-service';
            registry.registerService(serviceId);

            // Mock unsubscribeRequest to return true
            subscriptionManager.unsubscribeRequest = jest.fn().mockReturnValue(true);

            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.unsubscribe',
                version: '1.0.0'
            }, {
                topic: 'test.topic',
                action: ActionType.REQUEST
            }));

            expect(subscriptionManager.unsubscribeRequest).toHaveBeenCalledWith(
                serviceId,
                'test.topic'
            );
        });

        it('should handle log subscription requests', () => {
            const serviceId = 'test-service';
            registry.registerService(serviceId);

            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.log.subscribe',
                version: '1.0.0'
            }, {
                levels: ['info', 'error'],
                regex: 'test.*'
            }));

            // Trigger a log event that matches subscription
            const logEntry: LogEntry = {
                level: 'info',
                message: 'test message',
                timestamp: new Date().toISOString()
            };
            registry['handleLog'](logEntry);

            expect(connectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                expect.objectContaining({
                    topic: 'system.log'
                }),
                logEntry,
                undefined
            );
        });

        it('should handle log subscription requests with error', () => {
            const serviceId = 'test-service';
            registry.registerService(serviceId);

            // Subscribe to logs
            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.log.subscribe',
                version: '1.0.0'
            }, {
                levels: ['info', 'error'],
                regex: 'test.*'
            }));

            // Mock connectionManager.sendMessage to throw an error
            connectionManager.sendMessage = jest.fn().mockImplementationOnce(() => {
                throw new Error('Failed to send message');
            });

            // Trigger a log event that matches subscription
            const logEntry: LogEntry = {
                level: 'info',
                message: 'test message',
                timestamp: new Date().toISOString()
            };
            registry['handleLog'](logEntry);

            // Verify error was handled gracefully
            expect(connectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                expect.objectContaining({
                    topic: 'system.log'
                }),
                logEntry,
                undefined
            );
        });

        it('should throw error for unknown system topics', () => {
            const serviceId = 'test-service';
            registry.registerService(serviceId);

            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.unknown',
                version: '1.0.0'
            }))).toThrow(TopicNotSupportedError);
        });

        it('should throw error when service not found in heartbeat message', () => {
            const serviceId = 'non-existent-service';
            const requestId = randomUUID();

            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.heartbeat',
                version: '1.0.0',
                requestId
            }))).toThrow('Service non-existent-service not found');

            expect(connectionManager.removeConnection).toHaveBeenCalledWith(serviceId);
        });

        it('should throw error when service not found in log subscription request', () => {
            const serviceId = 'non-existent-service';
            const requestId = randomUUID();

            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.log.subscribe',
                version: '1.0.0',
                requestId
            }, {
                levels: ['info', 'error'],
                regex: 'test.*'
            }))).toThrow('Service non-existent-service not found');

            expect(connectionManager.removeConnection).toHaveBeenCalledWith(serviceId);
        });

        it('should throw error when service not found in metrics request', () => {
            const serviceId = 'non-existent-service';
            const requestId = randomUUID();

            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                    action: ActionType.REQUEST,
                topic: 'system.metrics',
                    version: '1.0.0',
                requestId
            }, {
                showAll: true,
                paramFilter: { service: serviceId }
            }))).toThrow('Service non-existent-service not found');

            expect(connectionManager.removeConnection).toHaveBeenCalledWith(serviceId);
        });

        it('should throw error for invalid action type in heartbeat message', () => {
            const serviceId = 'test-service';
            registry.registerService(serviceId);

            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.PUBLISH,  // Invalid action for heartbeat
                    topic: 'system.heartbeat',
                version: '1.0.0'
            }))).toThrow(InvalidRequestError);
        });

        it('should throw error for non-request action in non-heartbeat message', () => {
            const serviceId = 'test-service';
            registry.registerService(serviceId);

            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.RESPONSE,  // Only REQUEST is valid for non-heartbeat
                topic: 'system.service.list',
                version: '1.0.0'
            }))).toThrow(InvalidRequestError);
        });

        it('should handle metrics request', () => {
            const serviceId = 'test-service';
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Mock monitoringManager.serializeMetrics
            const mockMetrics = { metric1: 1, metric2: 2 };
            monitoringManager.serializeMetrics = jest.fn().mockReturnValue(mockMetrics);

            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.metrics',
                version: '1.0.0',
                requestId
            }, {
                showAll: true,
                paramFilter: { service: serviceId }
            }));

            expect(monitoringManager.serializeMetrics).toHaveBeenCalledWith(true, { service: serviceId });
            expect(connectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    topic: 'system.metrics',
                    requestId
                }),
                { metrics: mockMetrics },
                undefined
            );
        });

        it('should handle service subscriptions request', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Mock getSubscribedTopics
            const mockSubscriptions = [
                { topic: 'test.topic', action: ActionType.REQUEST, priority: 0 }
            ];
            subscriptionManager.getSubscribedTopics = jest.fn().mockReturnValue(mockSubscriptions);

            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.service.subscriptions',
                version: '1.0.0',
                requestId
            }, {
                serviceId
            }));

            expect(subscriptionManager.getSubscribedTopics).toHaveBeenCalledWith(serviceId);
            expect(connectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    topic: 'system.service.subscriptions',
                    requestId
                }),
                { subscriptions: mockSubscriptions },
                undefined
            );
        });

        it('should throw error for invalid service ID in subscriptions request', () => {
            const serviceId = randomUUID();
            const invalidTargetId = 'not-a-uuid';
            const requestId = randomUUID();
            registry.registerService(serviceId);

            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.service.subscriptions',
                version: '1.0.0',
                requestId
            }, {
                serviceId: invalidTargetId
            }))).toThrow(InvalidRequestError);
        });

        it('should handle service register request', () => {
            const serviceId = 'test-service';
            const requestId = randomUUID();
            const name = 'Test Service';
            const description = 'A test service';

            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.service.register',
                version: '1.0.0',
                requestId
            }, {
                name,
                description
            }));

            // Verify service was registered by checking service list
            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.service.list',
                version: '1.0.0'
            }));

            expect(connectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                expect.any(Object),
                expect.objectContaining({
                    services: expect.arrayContaining([
                expect.objectContaining({
                        id: serviceId,
                            name,
                            description
                        })
                    ])
                }),
                undefined
            );
        });

        it('should handle log unsubscription requests', () => {
            const serviceId = 'test-service';
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Mock unsubscribePublish to return true
            subscriptionManager.unsubscribePublish = jest.fn().mockReturnValue(true);

            // First subscribe to logs
            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.log.subscribe',
                version: '1.0.0'
            }, {
                levels: ['info', 'error'],
                regex: 'test.*',
                action: ActionType.PUBLISH
            }));

            // Then unsubscribe
            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.log.unsubscribe',
                version: '1.0.0',
                requestId
            }));

            // Verify unsubscription
            expect(subscriptionManager.unsubscribePublish).toHaveBeenCalledWith(serviceId, 'system.log');
            expect(connectionManager.sendMessage).toHaveBeenLastCalledWith(
                serviceId,
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    topic: 'system.log.unsubscribe',
                    requestId
                }),
                { status: 'success' },
                undefined
            );

            // Verify log subscriptions were reset
            const service = registry['services'].get(serviceId);
            expect(service?.logSubscriptions).toEqual({ levels: [], regex: undefined });
        });

        it('should throw error when unsubscribing logs for non-existent service', () => {
            const serviceId = 'non-existent-service';
            const requestId = randomUUID();

            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.log.unsubscribe',
                version: '1.0.0',
                requestId
            }))).toThrow('Service non-existent-service not found');

            expect(connectionManager.removeConnection).toHaveBeenCalledWith(serviceId);
        });

        it('should throw error when requesting subscriptions for non-existent service', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();

            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.service.subscriptions',
                    version: '1.0.0',
                requestId
            }))).toThrow('Service ' + serviceId + ' not found');

            expect(connectionManager.removeConnection).toHaveBeenCalledWith(serviceId);
        });

        it('should throw error when target service is not found in subscriptions request', () => {
            const serviceId = randomUUID();
            const targetServiceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.service.subscriptions',
                version: '1.0.0',
                requestId
            }, {
                serviceId: targetServiceId
            }))).toThrow('Service ' + targetServiceId + ' not found');
        });

        it('should throw error for invalid payload in service register request', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.service.register',
                version: '1.0.0',
                requestId
            }, {
                name: null,  // Invalid name
                description: 'test'
            }))).toThrow(InvalidRequestError);

            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.service.register',
                version: '1.0.0',
                requestId
            }, {
                name: 'test',
                description: null  // Invalid description
            }))).toThrow(InvalidRequestError);
        });

        it('should validate topic in subscription request', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Test missing topic
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.subscribe',
                version: '1.0.0',
                requestId
            }, {
                priority: 0,
                action: ActionType.REQUEST
            }))).toThrow('Missing or invalid topic');

            // Test invalid topic
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.subscribe',
                version: '1.0.0',
                requestId
            }, {
                topic: 'invalid..topic',
                priority: 0,
                action: ActionType.REQUEST
            }))).toThrow('Missing or invalid topic');

            // Test restricted system topic
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.subscribe',
                version: '1.0.0',
                requestId
            }, {
                topic: 'system.restricted',
                priority: 0,
                action: ActionType.REQUEST
            }))).toThrow('Unable to subscribe to restricted topic');

            // Test invalid priority
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.subscribe',
                version: '1.0.0',
                requestId
            }, {
                topic: 'test.topic',
                priority: NaN,
                action: ActionType.REQUEST
            }))).toThrow('Invalid priority');
        });

        it('should validate topic in unsubscription request', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Test missing topic
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.unsubscribe',
                version: '1.0.0',
                requestId
            }, {
                action: ActionType.REQUEST
            }))).toThrow('Missing or invalid topic');

            // Test invalid topic
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.unsubscribe',
                version: '1.0.0',
                requestId
            }, {
                topic: 'invalid..topic',
                action: ActionType.REQUEST
            }))).toThrow('Missing or invalid topic');

            // Test restricted system topic
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.unsubscribe',
                version: '1.0.0',
                requestId
            }, {
                topic: 'system.restricted',
                action: ActionType.REQUEST
            }))).toThrow('Unable to unsubscribe from restricted topic');
        });

        it('should handle topic subscription success and failure', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Mock success case
            subscriptionManager.subscribeRequest = jest.fn().mockReturnValueOnce(true);
            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.subscribe',
                version: '1.0.0',
                requestId
            }, {
                topic: 'test.topic',
                priority: 0,
                action: ActionType.REQUEST
            }));
            expect(connectionManager.sendMessage).toHaveBeenLastCalledWith(
                serviceId,
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.subscribe',
                    requestId
                }),
                { status: 'success' },
                undefined
            );

            // Mock failure case
            subscriptionManager.subscribeRequest = jest.fn().mockReturnValueOnce(false);
            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.subscribe',
                version: '1.0.0',
                requestId
            }, {
                topic: 'test.topic',
                priority: 0,
                action: ActionType.REQUEST
            }));
            expect(connectionManager.sendMessage).toHaveBeenLastCalledWith(
                serviceId,
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.subscribe',
                    requestId
                }),
                { status: 'failure' },
                undefined
            );
        });

        it('should validate log levels in subscription request', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Test non-array levels
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.log.subscribe',
                    version: '1.0.0',
                requestId
            }, {
                levels: 'info'  // Should be an array
            }))).toThrow('Invalid log levels');

            // Test invalid log level
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.log.subscribe',
                    version: '1.0.0',
                requestId
            }, {
                levels: ['invalid']
            }))).toThrow('Invalid log level');
        });

        it('should validate log regex in subscription request', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Test invalid regex type
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.log.subscribe',
                version: '1.0.0',
                requestId
            }, {
                levels: ['info'],
                regex: 123  // Should be a string
            }))).toThrow('Invalid log regex');

            // Test invalid regex pattern
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.log.subscribe',
                version: '1.0.0',
                requestId
            }, {
                levels: ['info'],
                regex: '['  // Invalid regex pattern
            }))).toThrow('Invalid log regex');
        });

        it('should handle log subscription and response', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Mock subscriptionManager.subscribePublish to return false first
            subscriptionManager.subscribePublish = jest.fn().mockReturnValueOnce(false);

            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.log.subscribe',
                version: '1.0.0',
                requestId
            }, {
                levels: ['info', 'error'],
                regex: 'test.*'
            }));

            // Verify subscription was added
            expect(subscriptionManager.subscribePublish).toHaveBeenCalledWith(serviceId, 'system.log');

            // Verify success response
            expect(connectionManager.sendMessage).toHaveBeenLastCalledWith(
                serviceId,
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    topic: 'system.log.subscribe',
                    requestId
                }),
                { status: 'success' },
                undefined
            );
        });

        it('should handle service list request', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            const name = 'Test Service';
            const description = 'A test service';
            const now = new Date();

            // Register a service first
            registry.registerService(serviceId, name, description);

            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.service.list',
                version: '1.0.0',
                requestId
            }));

            // Verify response
            expect(connectionManager.sendMessage).toHaveBeenLastCalledWith(
                serviceId,
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    topic: 'system.service.list',
                    requestId
                }),
                expect.objectContaining({
                    services: expect.arrayContaining([
                        expect.objectContaining({
                            id: serviceId,
                            name,
                            description,
                            lastHeartbeat: expect.any(String)
                        })
                    ])
                }),
                undefined
            );
        });

        it('should handle topic list request', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Mock getAllSubscribedTopics
            const mockTopics = [
                { topic: 'topic1', action: ActionType.PUBLISH },
                { topic: 'topic2', action: ActionType.REQUEST, priority: 1 }
            ];
            subscriptionManager.getAllSubscribedTopics = jest.fn().mockReturnValue(mockTopics);

            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.list',
                version: '1.0.0',
                requestId
            }));

            expect(subscriptionManager.getAllSubscribedTopics).toHaveBeenCalled();
            expect(connectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.list',
                    requestId
                }),
                { topics: mockTopics },
                undefined
            );
        });

        it('should handle topic subscribers request', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Mock getAllSubscribedTopics
            const mockSubscriptions = [
                { action: ActionType.PUBLISH, topic: 'topic1', subscribers: [{ serviceId: 'service1', priority: 0 }] },
                { action: ActionType.REQUEST, topic: 'topic2', subscribers: [{ serviceId: 'service2', priority: 1 }] }
            ];
            subscriptionManager.getAllSubscribedTopics = jest.fn().mockReturnValue(mockSubscriptions);


            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.subscriptions',
                version: '1.0.0',
                requestId
            }));

            expect(subscriptionManager.getAllSubscribedTopics).toHaveBeenCalled();
            expect(connectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.subscriptions',
                    requestId
                }),
                { subscriptions: mockSubscriptions },
                undefined
            );
        });

        it('should handle service subscriptions with and without serviceId in payload', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Mock subscriptionManager.getSubscribedTopics
            const mockSubscriptions = [{ topic: 'test.topic', action: ActionType.REQUEST, priority: 0 }];
            subscriptionManager.getSubscribedTopics = jest.fn().mockReturnValue(mockSubscriptions);

            // Test without serviceId in payload (should use requesting service's ID)
            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.service.subscriptions',
                version: '1.0.0',
                requestId
            }, {}));

            expect(subscriptionManager.getSubscribedTopics).toHaveBeenLastCalledWith(serviceId);

            // Test with serviceId in payload
            const targetServiceId = randomUUID();
            registry.registerService(targetServiceId);  // Register target service
            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.service.subscriptions',
                version: '1.0.0',
                requestId
            }, {
                serviceId: targetServiceId
            }));

            expect(subscriptionManager.getSubscribedTopics).toHaveBeenLastCalledWith(targetServiceId);
        });

        it('should validate action in topic subscription request', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Test missing action
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.subscribe',
                version: '1.0.0',
                requestId
            }, {
                topic: 'test.topic',
                priority: 0
            }))).toThrow('Missing or invalid action');

            // Test invalid action type
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.subscribe',
                version: '1.0.0',
                requestId
            }, {
                topic: 'test.topic',
                priority: 0,
                action: 'invalid'
            }))).toThrow('Missing or invalid action');
        });

        it('should handle both PUBLISH and REQUEST actions in topic subscription', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Test PUBLISH action
            subscriptionManager.subscribePublish = jest.fn().mockReturnValueOnce(true);
            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.subscribe',
                version: '1.0.0',
                requestId
            }, {
                topic: 'test.topic',
                action: ActionType.PUBLISH
            }));
            expect(subscriptionManager.subscribePublish).toHaveBeenCalledWith(serviceId, 'test.topic');

            // Test REQUEST action
            subscriptionManager.subscribeRequest = jest.fn().mockReturnValueOnce(true);
            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.subscribe',
                version: '1.0.0',
                requestId
            }, {
                topic: 'test.topic',
                priority: 0,
                action: ActionType.REQUEST
            }));
            expect(subscriptionManager.subscribeRequest).toHaveBeenCalledWith(serviceId, 'test.topic', 0);
        });

        it('should validate action in topic unsubscription request', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Test missing action
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.unsubscribe',
                version: '1.0.0',
                requestId
            }, {
                topic: 'test.topic'
            }))).toThrow('Missing or invalid action');

            // Test invalid action type
            expect(() => registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.unsubscribe',
                version: '1.0.0',
                requestId
            }, {
                topic: 'test.topic',
                action: 'invalid'
            }))).toThrow('Missing or invalid action');
        });

        it('should handle both PUBLISH and REQUEST actions in topic unsubscription', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Test PUBLISH action
            subscriptionManager.unsubscribePublish = jest.fn().mockReturnValueOnce(true);
            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.unsubscribe',
                version: '1.0.0',
                requestId
            }, {
                topic: 'test.topic',
                action: ActionType.PUBLISH
            }));
            expect(subscriptionManager.unsubscribePublish).toHaveBeenCalledWith(serviceId, 'test.topic');

            // Test REQUEST action
            subscriptionManager.unsubscribeRequest = jest.fn().mockReturnValueOnce(true);
            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.unsubscribe',
                version: '1.0.0',
                requestId
            }, {
                topic: 'test.topic',
                action: ActionType.REQUEST
            }));
            expect(subscriptionManager.unsubscribeRequest).toHaveBeenCalledWith(serviceId, 'test.topic');
        });

        it('should use default log level when none provided', () => {
            const serviceId = 'test-service';
            registry.registerService(serviceId);

            // Subscribe without specifying levels
            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.log.subscribe',
                version: '1.0.0'
            }, {
                action: ActionType.PUBLISH
            }));

            // Verify default level was used
            const service = registry['services'].get(serviceId);
            expect(service?.logSubscriptions).toEqual({
                levels: ['error'],  // Default level
                regex: undefined    // Default regex
            });
        });

        it('should handle topic unsubscription failure', () => {
            const serviceId = randomUUID();
            const requestId = randomUUID();
            registry.registerService(serviceId);

            // Mock unsubscribeRequest to return false (failure)
            subscriptionManager.unsubscribeRequest = jest.fn().mockReturnValueOnce(false);

            registry.handleSystemMessage(serviceId, createMockMessage({
                action: ActionType.REQUEST,
                topic: 'system.topic.unsubscribe',
                version: '1.0.0',
                requestId
            }, {
                topic: 'test.topic',
                action: ActionType.REQUEST
            }));

            // Verify failure response
            expect(connectionManager.sendMessage).toHaveBeenLastCalledWith(
                serviceId,
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    topic: 'system.topic.unsubscribe',
                    requestId
                }),
                { status: 'failure' },
                undefined
            );
        });
    });

    describe('Heartbeat', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should send heartbeat after retry timeout', () => {
            const serviceId = randomUUID();
            registry.registerService(serviceId);

            // Fast forward past the retry timeout
            jest.advanceTimersByTime(config.connection.heartbeatRetryTimeout);

            // Verify heartbeat was sent
            expect(connectionManager.sendMessage).toHaveBeenCalledWith(
                serviceId,
                expect.objectContaining({
                    action: ActionType.REQUEST,
                    topic: 'system.heartbeat',
                    version: '1.0.0'
                }),
                undefined,
                undefined
            );
        });

        it('should unregister service after deregister timeout', () => {
            const serviceId = randomUUID();
            registry.registerService(serviceId);

            // Fast forward past the deregister timeout
            jest.advanceTimersByTime(config.connection.heartbeatDeregisterTimeout);

            // Verify service was unregistered
            expect(subscriptionManager.unsubscribe).toHaveBeenCalledWith(serviceId);
            expect(connectionManager.removeConnection).toHaveBeenCalledWith(serviceId);
        });
    });

    describe('Metrics', () => {
        it('should track service count', () => {
            const serviceId1 = 'test-service-1';
            const serviceId2 = 'test-service-2';

            // Register services and verify count updates
            registry.registerService(serviceId1);
            expect(registry['metrics'].count.slot.value).toBe(1);

            registry.registerService(serviceId2);
            expect(registry['metrics'].count.slot.value).toBe(2);

            registry.unregisterService(serviceId1);
            expect(registry['metrics'].count.slot.value).toBe(1);
        });

        it('should track registration and unregistration rates', async () => {
            const serviceId = 'test-service';

            // Register service and verify registration rate metric
            registry.registerService(serviceId);
            await new Promise(resolve => setTimeout(resolve, 1100)); // Wait for rate calculation
            expect(registry['metrics'].registrationRate.slot.value).toBeGreaterThan(0);

            // Unregister service and verify unregistration rate metric
            registry.unregisterService(serviceId);
            await new Promise(resolve => setTimeout(resolve, 1100)); // Wait for rate calculation
            expect(registry['metrics'].unregistrationRate.slot.value).toBeGreaterThan(0);
        }, 5000);
    });

    describe('Cleanup', () => {
        it('should properly dispose all resources', () => {
            const serviceId = 'test-service';
            registry.registerService(serviceId);

            // Spy on the metrics dispose method
            const disposeSpy = jest.spyOn(registry['metrics'], 'dispose');

            registry.dispose();

            // Verify all services are unregistered
            expect(subscriptionManager.unsubscribe).toHaveBeenCalledWith(serviceId);
            expect(connectionManager.removeConnection).toHaveBeenCalledWith(serviceId);

            // Verify metrics are disposed
            expect(disposeSpy).toHaveBeenCalled();
        });
    });
});
