import { jest } from '@jest/globals';
import { randomUUID } from 'crypto';
import { config } from '@config';
import { ConnectionManager } from '@core/connection';
import { MessageRouter } from '@core/router';
import { ServiceRegistry } from '@core/registry';
import { SubscriptionManager } from '@core/subscription';
import { ActionType } from '@core/types';
import { BrokerHeader, ClientHeader, Message } from '@core/utils/types';
import { Parser, serialize } from '@core/utils/message';
import logger, { SetupLogger } from '@utils/logger';
import { MonitoringManager } from '@core/monitoring/manager';
import { InvalidRequestIdError } from '@core/errors';
import { RouterMetrics } from '@core/router/metrics';
import { GaugeSlot, RateSlot, AverageSlot, MaximumSlot } from '@core/monitoring/metrics/slots';

// Mock external dependencies to isolate MessageRouter tests
jest.mock('@core/connection/manager');
jest.mock('@core/registry');
jest.mock('@core/subscription');
jest.mock('@utils/logger', () => {
    const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    };
    return {
        __esModule: true,
        default: mockLogger,
        SetupLogger: jest.fn().mockReturnValue(mockLogger)
    };
});

describe('MessageRouter', () => {
    let messageRouter: MessageRouter;
    let mockConnectionManager: jest.Mocked<ConnectionManager>;
    let mockServiceRegistry: jest.Mocked<ServiceRegistry>;
    let mockSubscriptionManager: jest.Mocked<SubscriptionManager>;
    let monitoringManager: MonitoringManager;

    beforeEach(() => {
        // Reset all mock implementations and call history before each test
        jest.resetAllMocks();

        // Create mock SubscriptionManager with basic implementations
        mockSubscriptionManager = {
            // Mock subscriber retrieval methods
            getSubscribers: jest.fn().mockReturnValue([]),
            getTopSubscribers: jest.fn().mockReturnValue([]),
            subscribe: jest.fn(),
            unsubscribe: jest.fn()
        } as unknown as jest.Mocked<SubscriptionManager>;

        // Create mock ServiceRegistry with basic implementations
        mockServiceRegistry = {
            resetHeartbeat: jest.fn(),
            handleSystemMessage: jest.fn(),
        } as unknown as jest.Mocked<ServiceRegistry>;

        // Create real MonitoringManager
        monitoringManager = new MonitoringManager();

        // Create MessageRouter with mock managers and real monitoring
        messageRouter = new MessageRouter(mockSubscriptionManager, monitoringManager);

        // Create mock ConnectionManager with basic implementations
        mockConnectionManager = {
            // Mock message sending functionality
            sendMessage: jest.fn(),
        } as unknown as jest.Mocked<ConnectionManager>;

        // Assign managers to router
        messageRouter.assignConnectionManager(mockConnectionManager);
        messageRouter.assignServiceRegistry(mockServiceRegistry);
    });

    afterEach(() => {
        // Clean up any outstanding requests after each test to ensure isolation
        messageRouter.dispose();
    });

    describe('routeMessage', () => {
        it('should handle system messages by delegating to ServiceRegistry', () => {
            // Setup test message with system topic
            const header: ClientHeader = {
                action: ActionType.PUBLISH,
                topic: 'system.heartbeat',
                version: '1.0.0',
            };
            const payload = { data: 'test' };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            // Route the message
            messageRouter.routeMessage('service1', parser);

            // Verify heartbeat was reset
            expect(mockServiceRegistry.resetHeartbeat).toHaveBeenCalledWith('service1');

            // Verify message was delegated to ServiceRegistry
            expect(mockServiceRegistry.handleSystemMessage).toHaveBeenCalledWith('service1', parser);

            // Verify no other handlers were called
            expect(mockSubscriptionManager.getSubscribers).not.toHaveBeenCalled();
            expect(mockConnectionManager.sendMessage).not.toHaveBeenCalled();
        });

        it('should handle PUBLISH action', () => {
            // Setup test message with PUBLISH action
            const header: ClientHeader = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0',
            };
            const payload = { data: 'test' };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            // Mock subscribers for the topic
            mockSubscriptionManager.getSubscribers.mockReturnValueOnce(['service2']);

            // Route the message
            messageRouter.routeMessage('service1', parser);

            // Verify message was forwarded to subscribers
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service2',
                expect.objectContaining({
                    action: ActionType.PUBLISH,
                    topic: 'test.topic',
                }),
                expect.any(Object),
                undefined
            );
        });

        it('should handle REQUEST action', () => {
            // Setup test message with REQUEST action
            const requestId = randomUUID();
            const header: ClientHeader = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0',
                requestId
            };
            const payload = {};
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            // Mock subscribers for the topic
            mockSubscriptionManager.getTopSubscribers.mockReturnValueOnce(['service2']);

            // Route the message
            messageRouter.routeMessage('service1', parser);

            // Verify request was forwarded to top subscriber
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service2',
                expect.objectContaining({
                    action: ActionType.REQUEST,
                    topic: 'test.topic',
                    requestId: expect.any(String)
                }),
                expect.any(Object),
                requestId
            );
        });

        it('should handle RESPONSE action', () => {
            // Create a request first
            const originServiceId = 'service1';
            const targetServiceId = 'service2';
            const requestId = randomUUID();
            const targetRequestId = randomUUID();
            const originalHeader: ClientHeader = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0',
                requestId
            };

            // Add the request to the router's request map
            const request = {
                originServiceId,
                targetServiceId,
                targetRequestId,
                originalHeader,
                createdAt: new Date()
            };
            (messageRouter as any).requests.set(`${targetServiceId}:${targetRequestId}`, request);

            // Now test the response
            const header: BrokerHeader = {
                action: ActionType.RESPONSE,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: targetRequestId,
                parentRequestId: requestId
            };
            const payload = { data: 'test' };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            messageRouter.routeMessage(targetServiceId, parser);

            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                originServiceId,
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    requestId: requestId,
                    topic: 'test.topic',
                    version: '1.0.0'
                }),
                expect.any(Object),
                undefined
            );
        });

        it('should handle errors in PUBLISH action and increment error metrics', () => {
            // Setup test message with PUBLISH action
            const header: ClientHeader = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0',
            };
            const payload = { data: 'test' };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            // Mock getSubscribers to throw an error
            mockSubscriptionManager.getSubscribers.mockImplementationOnce(() => {
                throw new Error('Test error');
            });

            // Get initial error metric values
            const metrics = (messageRouter as any).metrics;
            const initialPublishErrors = metrics.publishCountError.slot.value;
            const initialMessageErrors = metrics.messageCountError.slot.value;

            // Route the message and expect error
            expect(() => messageRouter.routeMessage('service1', parser)).toThrow('Test error');

            // Verify error metrics were incremented
            expect(metrics.publishCountError.slot.value).toBe(initialPublishErrors + 1);
            expect(metrics.messageCountError.slot.value).toBe(initialMessageErrors + 1);
        });

        it('should handle errors in REQUEST action and increment error metrics', () => {
            // Setup test message with REQUEST action
            const header: ClientHeader = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: randomUUID()
            };
            const payload = { data: 'test' };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            // Mock getTopSubscribers to throw an error
            mockSubscriptionManager.getTopSubscribers.mockImplementationOnce(() => {
                throw new Error('Test error');
            });

            // Get initial error metric values
            const metrics = (messageRouter as any).metrics;
            const initialRequestErrors = metrics.requestCountError.slot.value;
            const initialMessageErrors = metrics.messageCountError.slot.value;

            // Route the message and expect error
            expect(() => messageRouter.routeMessage('service1', parser)).toThrow('Test error');

            // Verify error metrics were incremented
            expect(metrics.requestCountError.slot.value).toBe(initialRequestErrors + 1);
            expect(metrics.messageCountError.slot.value).toBe(initialMessageErrors + 1);
        });

        it('should handle errors in RESPONSE action and increment error metrics', () => {
            // Setup test message with RESPONSE action
            const header: BrokerHeader = {
                action: ActionType.RESPONSE,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: randomUUID()
            };
            const payload = { data: 'test' };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            // Get initial error metric values
            const metrics = (messageRouter as any).metrics;
            const initialResponseErrors = metrics.responseCountError.slot.value;
            const initialMessageErrors = metrics.messageCountError.slot.value;

            // Route the message and expect error (since no request exists)
            expect(() => messageRouter.routeMessage('service1', parser)).toThrow(InvalidRequestIdError);

            // Verify error metrics were incremented
            expect(metrics.responseCountError.slot.value).toBe(initialResponseErrors + 1);
            expect(metrics.messageCountError.slot.value).toBe(initialMessageErrors + 1);
        });

        it('should handle unknown action types with error response', () => {
            // Create a parser with an unknown action type by bypassing validation
            const parser = new Parser(Buffer.from('publish:test.topic:1.0.0\n{"data":"test"}'));
            // Override the header after parsing
            parser.header = {
                action: 'UNKNOWN_ACTION' as ActionType,
                topic: 'test.topic',
                version: '1.0.0'
            };

            // Get initial error metric values
            const metrics = (messageRouter as any).metrics;
            const initialMessageErrors = metrics.messageCountError.slot.value;

            // Route the message
            messageRouter.routeMessage('service1', parser);

            // Verify error metrics were incremented
            expect(metrics.messageCountError.slot.value).toBe(initialMessageErrors + 1);

            // Verify error response was sent
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service1',
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                }),
                expect.objectContaining({
                    error: expect.objectContaining({
                        message: expect.stringContaining('Unknown action type')
                    })
                }),
                undefined
            );
        });

        it('should handle PUBLISH with no subscribers by sending error response', () => {
            // Setup test message with PUBLISH action
            const header: ClientHeader = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: randomUUID()
            };
            const payload = { data: 'test' };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            // Mock getSubscribers to return empty array
            mockSubscriptionManager.getSubscribers.mockReturnValueOnce([]);

            // Get initial metric values
            const metrics = (messageRouter as any).metrics;
            const initialDropped = metrics.publishCountDropped.slot.value;

            // Route the message
            messageRouter.routeMessage('service1', parser);

            // Verify dropped metrics were incremented
            expect(metrics.publishCountDropped.slot.value).toBe(initialDropped + 1);

            // Verify error response was sent
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service1',
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    requestId: header.requestId
                }),
                expect.objectContaining({
                    error: expect.objectContaining({
                        message: expect.stringContaining('No subscribers for topic')
                    })
                }),
                undefined
            );
        });

        it('should handle PUBLISH with requestId by sending success response', () => {
            // Setup test message with PUBLISH action and requestId
            const header: ClientHeader = {
                action: ActionType.PUBLISH,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: randomUUID()
            };
            const payload = { data: 'test' };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            // Mock subscribers for the topic
            mockSubscriptionManager.getSubscribers.mockReturnValueOnce(['service2']);

            // Route the message
            messageRouter.routeMessage('service1', parser);

            // Verify message was forwarded to subscribers
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service2',
                expect.objectContaining({
                    action: ActionType.PUBLISH,
                    topic: 'test.topic',
                }),
                expect.any(Object),
                header.requestId
            );

            // Verify success response was sent back to publisher
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service1',
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    requestId: header.requestId
                }),
                { status: 'success' },
                undefined
            );
        });

        it('should handle REQUEST with no subscribers by throwing NoRouteFoundError', () => {
            // Setup test message with REQUEST action
            const header: ClientHeader = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: randomUUID()
            };
            const payload = { data: 'test' };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            // Mock getTopSubscribers to return empty array
            mockSubscriptionManager.getTopSubscribers.mockReturnValueOnce([]);

            // Get initial metric values
            const metrics = (messageRouter as any).metrics;
            const initialRequestErrors = metrics.requestCountError.slot.value;
            const initialMessageErrors = metrics.messageCountError.slot.value;

            // Route the message and expect error
            expect(() => messageRouter.routeMessage('service1', parser)).toThrow('No subscribers for topic');

            // Verify error metrics were incremented
            expect(metrics.requestCountError.slot.value).toBe(initialRequestErrors + 1);
            expect(metrics.messageCountError.slot.value).toBe(initialMessageErrors + 1);
        });

        it('should handle system messages in REQUEST action by delegating to ServiceRegistry', () => {
            // Setup test message with REQUEST action and system topic
            const header: ClientHeader = {
                action: ActionType.REQUEST,
                topic: 'system.test',
                version: '1.0.0',
                requestId: randomUUID()
            };
            const payload = { data: 'test' };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            // Route the message
            messageRouter.routeMessage('service1', parser);

            // Verify heartbeat was reset
            expect(mockServiceRegistry.resetHeartbeat).toHaveBeenCalledWith('service1');

            // Verify message was delegated to ServiceRegistry
            expect(mockServiceRegistry.handleSystemMessage).toHaveBeenCalledWith('service1', parser);

            // Verify no other handlers were called
            expect(mockSubscriptionManager.getTopSubscribers).not.toHaveBeenCalled();
            expect(mockConnectionManager.sendMessage).not.toHaveBeenCalled();
        });

        it('should handle maximum outstanding requests by sending error response', () => {
            // Mock the config to have a lower max outstanding requests value for testing
            const originalMaxRequests = config.max.outstanding.requests;
            config.max.outstanding.requests = 2;

            // Setup test message with REQUEST action
            const header: ClientHeader = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: randomUUID()
            };
            const payload = { data: 'test' };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            // Mock subscribers for the topic
            mockSubscriptionManager.getTopSubscribers.mockReturnValueOnce(['service2']);

            // Fill up the requests map to max capacity
            const requests = (messageRouter as any).requests;
            for (let i = 0; i < config.max.outstanding.requests; i++) {
                const requestId = randomUUID();
                requests.set(`service${i}:${requestId}`, {
                    originServiceId: `service${i}`,
                    targetServiceId: 'service2',
                    targetRequestId: requestId,
                    originalHeader: {
                        action: ActionType.REQUEST,
                        requestId: requestId,
                        topic: 'test.topic',
                        version: '1.0.0'
                    },
                    createdAt: new Date()
                });
            }

            // Get initial metric values
            const metrics = (messageRouter as any).metrics;
            const initialDropped = metrics.requestCountDropped.slot.value;

            // Route the message
            messageRouter.routeMessage('service1', parser);

            // Verify dropped metrics were incremented
            expect(metrics.requestCountDropped.slot.value).toBe(initialDropped + 1);

            // Verify error response was sent to the owner of the oldest request
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service0',
                expect.objectContaining({
                    action: ActionType.RESPONSE
                }),
                expect.objectContaining({
                    error: expect.objectContaining({
                        message: expect.stringContaining('Message broker is busy')
                    })
                }),
                undefined
            );

            // Verify the new request was added
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service2',
                expect.objectContaining({
                    action: ActionType.REQUEST,
                    topic: 'test.topic'
                }),
                expect.any(Object),
                header.requestId
            );

            // Restore the original config
            config.max.outstanding.requests = originalMaxRequests;
        });

        it('should handle system message responses by delegating to ServiceRegistry', () => {
            // Setup test message with RESPONSE action and system topic
            const header: BrokerHeader = {
                action: ActionType.RESPONSE,
                topic: 'system.test',
                version: '1.0.0',
                requestId: randomUUID()
            };
            const payload = { data: 'test' };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            // Route the message
            messageRouter.routeMessage('service1', parser);

            // Verify heartbeat was reset
            expect(mockServiceRegistry.resetHeartbeat).toHaveBeenCalledWith('service1');

            // Verify message was delegated to ServiceRegistry
            expect(mockServiceRegistry.handleSystemMessage).toHaveBeenCalledWith('service1', parser);

            // Verify no other handlers were called
            expect(mockConnectionManager.sendMessage).not.toHaveBeenCalled();
        });

        it('should throw error when RESPONSE has no requestId', () => {
            // Setup test message with RESPONSE action but no requestId
            const header: BrokerHeader = {
                action: ActionType.RESPONSE,
                topic: 'test.topic',
                version: '1.0.0'
            };
            const payload = { data: 'test' };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            // Get initial error metric values
            const metrics = (messageRouter as any).metrics;
            const initialResponseErrors = metrics.responseCountError.slot.value;
            const initialMessageErrors = metrics.messageCountError.slot.value;

            // Route the message and expect error
            expect(() => messageRouter.routeMessage('service1', parser)).toThrow('Received response message without requestId');

            // Verify error metrics were incremented
            expect(metrics.responseCountError.slot.value).toBe(initialResponseErrors + 1);
            expect(metrics.messageCountError.slot.value).toBe(initialMessageErrors + 1);
        });

        it('should handle error responses and increment error metrics', () => {
            // Create a request first
            const originServiceId = 'service1';
            const targetServiceId = 'service2';
            const requestId = randomUUID();
            const targetRequestId = randomUUID();
            const originalHeader: ClientHeader = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0',
                requestId
            };

            // Add the request to the router's request map
            const request = {
                originServiceId,
                targetServiceId,
                targetRequestId,
                originalHeader,
                createdAt: new Date()
            };
            (messageRouter as any).requests.set(`${targetServiceId}:${targetRequestId}`, request);

            // Now test the error response
            const header: BrokerHeader = {
                action: ActionType.RESPONSE,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: targetRequestId
            };
            const payload = { error: { code: 'TEST_ERROR', message: 'Test error', timestamp: new Date().toISOString() } };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));
            // Force error flag
            (parser as any).error = true;

            // Get initial error metrics
            const metrics = (messageRouter as any).metrics;
            const initialResponseErrors = metrics.responseCountError.slot.value;

            // Route the message
            messageRouter.routeMessage(targetServiceId, parser);

            // Verify error metrics were incremented
            expect(metrics.responseCountError.slot.value).toBe(initialResponseErrors + 1);
        });

        it('should handle responses without original requestId by logging appropriately', () => {
            // Create a request first
            const originServiceId = 'service1';
            const targetServiceId = 'service2';
            const targetRequestId = randomUUID();
            const originalHeader: ClientHeader = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0'
                // No requestId
            };

            // Add the request to the router's request map
            const request = {
                originServiceId,
                targetServiceId,
                targetRequestId,
                originalHeader,
                createdAt: new Date()
            };
            (messageRouter as any).requests.set(`${targetServiceId}:${targetRequestId}`, request);

            // Now test the response with an error
            const header: BrokerHeader = {
                action: ActionType.RESPONSE,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: targetRequestId
            };
            const payload = { error: { code: 'TEST_ERROR', message: 'Test error', timestamp: new Date().toISOString() } };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));
            // Force error flag
            (parser as any).error = true;

            // Route the message
            messageRouter.routeMessage(targetServiceId, parser);

            // Verify appropriate logging
            expect(logger.debug).toHaveBeenCalledWith(
                `Sent request response to service: ${originServiceId}`
            );
            expect(logger.debug).not.toHaveBeenCalledWith(
                expect.stringContaining(`for request:`)
            );
        });

        it('should handle request timeouts by sending error response', () => {
            // Mock timers
            jest.useFakeTimers();

            // Setup test message with REQUEST action
            const header: ClientHeader = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: randomUUID(),
                timeout: 1000 // 1 second timeout
            };
            const payload = { data: 'test' };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            // Mock subscribers for the topic
            mockSubscriptionManager.getTopSubscribers.mockReturnValueOnce(['service2']);

            // Get initial metric values
            const metrics = (messageRouter as any).metrics;
            const initialTimeouts = metrics.requestCountTimeout.slot.value;

            // Route the message
            messageRouter.routeMessage('service1', parser);

            // Fast forward past the timeout
            jest.advanceTimersByTime(1001);

            // Verify timeout metrics were incremented
            expect(metrics.requestCountTimeout.slot.value).toBe(initialTimeouts + 1);

            // Verify timeout error was sent
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service1',
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    requestId: header.requestId
                }),
                expect.objectContaining({
                    error: expect.objectContaining({
                        message: expect.stringContaining('Request timed out')
                    })
                }),
                undefined
            );

            // Cleanup
            jest.useRealTimers();
        });

        it('should evict oldest request when max outstanding requests is reached during request generation', () => {
            // Mock the config to have a lower max outstanding requests value for testing
            const originalMaxRequests = config.max.outstanding.requests;
            config.max.outstanding.requests = 2;

            // Set up the oldest request
            const oldRequestId = randomUUID();
            const oldRequest = {
                originServiceId: 'service0',
                targetServiceId: 'service2',
                targetRequestId: oldRequestId,
                originalHeader: {
                    action: ActionType.REQUEST,
                    requestId: oldRequestId,
                    topic: 'test.topic',
                    version: '1.0.0'
                },
                createdAt: new Date(Date.now() - 1000) // 1 second ago
            };

            // Set up the requests map
            const requests = (messageRouter as any).requests;
            requests.set(`service2:${oldRequestId}`, oldRequest);

            // Add one more recent request
            const recentRequestId = randomUUID();
            requests.set(`service3:${recentRequestId}`, {
                originServiceId: 'service3',
                targetServiceId: 'service2',
                targetRequestId: recentRequestId,
                originalHeader: {
                    action: ActionType.REQUEST,
                    requestId: recentRequestId,
                    topic: 'test.topic',
                    version: '1.0.0'
                },
                createdAt: new Date()
            });

            // Get initial metric values
            const metrics = (messageRouter as any).metrics;
            const initialDropped = metrics.requestCountDropped.slot.value;

            // Set up the new request that will trigger eviction
            const header: ClientHeader = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0',
                requestId: randomUUID()
            };
            const payload = { data: 'test' };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            // Mock subscribers for the topic
            mockSubscriptionManager.getTopSubscribers.mockReturnValueOnce(['service2']);

            // Route the message
            messageRouter.routeMessage('service1', parser);

            // Verify dropped metrics were incremented
            expect(metrics.requestCountDropped.slot.value).toBe(initialDropped + 1);

            // Verify error response was sent to the owner of the evicted request
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service0',
                expect.objectContaining({
                    action: ActionType.RESPONSE
                }),
                expect.objectContaining({
                    error: expect.objectContaining({
                        message: expect.stringContaining('Message broker is busy')
                    })
                }),
                undefined
            );

            // Verify the old request was removed
            expect(requests.has(`service2:${oldRequestId}`)).toBe(false);

            // Verify the new request was added
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service2',
                expect.objectContaining({
                    action: ActionType.REQUEST,
                    topic: 'test.topic'
                }),
                expect.any(Object),
                header.requestId
            );

            // Restore the original config
            config.max.outstanding.requests = originalMaxRequests;
        });

        it('should handle request generation without requestId in original header', () => {
            // Setup test message with REQUEST action but no requestId
            const header: ClientHeader = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0'
                // No requestId
            };
            const payload = { data: 'test' };
            const message = serialize(header, payload);
            const parser = new Parser(Buffer.from(message));

            // Mock subscribers for the topic
            mockSubscriptionManager.getTopSubscribers.mockReturnValueOnce(['service2']);

            // Route the message
            messageRouter.routeMessage('service1', parser);

            // Get the request from the map
            const requests = (messageRouter as any).requests;
            const request = Array.from(requests.values())[0] as {
                originServiceId: string;
                targetServiceId: string;
                targetRequestId: string;
                originalHeader: ClientHeader;
                timeout?: NodeJS.Timeout;
                createdAt: Date;
            };

            // Verify request was created without a timeout
            expect(request.timeout).toBeUndefined();

            // Verify message was forwarded
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service2',
                expect.objectContaining({
                    action: ActionType.REQUEST,
                    topic: 'test.topic'
                }),
                expect.any(Object),
                undefined
            );
        });
    });
});