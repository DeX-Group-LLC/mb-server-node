import { jest } from '@jest/globals';
import { config } from '@config';
import { ConnectionManager } from '@core/connection';
import { MessageRouter, Request } from '@core/router';
import { ServiceRegistry } from '@core/registry';
import { SubscriptionManager } from '@core/subscription';
import { ActionType } from '@core/types';
import { Header, Message } from '@core/utils';
import logger from '@utils/logger';

// Mock external dependencies to isolate MessageRouter tests
jest.mock('@core/connection/manager');
jest.mock('@core/registry');
jest.mock('@core/subscription');
jest.mock('@utils/logger');

describe('MessageRouter', () => {
    let messageRouter: MessageRouter;
    let mockConnectionManager: jest.Mocked<ConnectionManager>;
    let mockServiceRegistry: jest.Mocked<ServiceRegistry>;
    let mockSubscriptionManager: jest.Mocked<SubscriptionManager>;

    beforeEach(() => {
        // Reset all mock implementations and call history before each test
        jest.resetAllMocks();

        // Create mock SubscriptionManager with basic implementations
        mockSubscriptionManager = {
            // Mock subscriber retrieval methods
            getSubscribers: jest.fn().mockReturnValue([]),
            getTopSubscribers: jest.fn().mockReturnValue([]),
        } as unknown as jest.Mocked<SubscriptionManager>;

        // Create mock ServiceRegistry with basic implementations
        mockServiceRegistry = {
            resetHeartbeat: jest.fn(),
            handleSystemMessage: jest.fn(),
        } as unknown as jest.Mocked<ServiceRegistry>;

        // Create MessageRouter with mock subscription manager
        messageRouter = new MessageRouter(mockSubscriptionManager);

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
            const message: Message = {
                header: {
                    action: ActionType.PUBLISH,
                    topic: 'system.heartbeat',
                    version: '1.0.0',
                },
                payload: { data: 'test' },
            };

            // Route the message
            messageRouter.routeMessage('service1', message);

            // Verify heartbeat was reset
            expect(mockServiceRegistry.resetHeartbeat).toHaveBeenCalledWith('service1');

            // Verify message was delegated to ServiceRegistry
            expect(mockServiceRegistry.handleSystemMessage).toHaveBeenCalledWith('service1', message);

            // Verify no other handlers were called
            expect(mockSubscriptionManager.getSubscribers).not.toHaveBeenCalled();
            expect(mockConnectionManager.sendMessage).not.toHaveBeenCalled();
        });

        it('should call handlePublish when action is PUBLISH', () => {
            // Setup test message with PUBLISH action
            const message: Message = {
                header: {
                    action: ActionType.PUBLISH,
                    topic: 'test.topic',
                    version: '1.0.0',
                },
                payload: { data: 'test' },
            };

            // Mock subscribers for the topic
            mockSubscriptionManager.getSubscribers.mockReturnValueOnce(['service2']);

            // Spy on the handlePublish method
            const handlePublishSpy = jest.spyOn(messageRouter as any, 'handlePublish');

            // Route the message
            messageRouter.routeMessage('service1', message);

            // Verify handlePublish was called with correct parameters
            expect(handlePublishSpy).toHaveBeenCalledWith('service1', message);
        });

        it('should call handleRequest when action is REQUEST', () => {
            // Setup test message with REQUEST action
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: 'req-1'
                },
                payload: {}
            };

            // Spy on the handleRequest method
            const handleRequestSpy = jest.spyOn(messageRouter as any, 'handleRequest');

            // Route the message
            messageRouter.routeMessage('service1', message);

            // Verify handleRequest was called with correct parameters
            expect(handleRequestSpy).toHaveBeenCalledWith('service1', message);
        });

        it('should call handleResponse when action is RESPONSE', () => {
            // Setup test message with RESPONSE action
            const message: Message = {
                header: {
                    action: ActionType.RESPONSE,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: 'req-1'
                },
                payload: {}
            };

            // Spy on the handleResponse method
            const handleResponseSpy = jest.spyOn(messageRouter as any, 'handleResponse');

            // Route the message
            messageRouter.routeMessage('service1', message);

            // Verify handleResponse was called with correct parameters
            expect(handleResponseSpy).toHaveBeenCalledWith('service1', message);
        });

        it('should send an error response for unknown action type', () => {
            // Setup test message with unknown action
            const message: Message = {
                header: {
                    action: 'unknown' as ActionType,
                    topic: 'test.topic',
                    version: '1.0.0',
                },
                payload: {},
            };

            // Route the message
            messageRouter.routeMessage('service1', message);

            // Verify error response was sent
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service1',
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    topic: 'test.topic',
                }),
                expect.objectContaining({
                    error: expect.objectContaining({
                        code: 'MALFORMED_MESSAGE',
                        message: 'Unknown action type: unknown'
                    })
                })
            );
        });
    });

    describe('handlePublish', () => {
        it('should publish a message to all subscribers', () => {
            // Setup test publish message
            const message: Message = {
                header: {
                    action: ActionType.PUBLISH,
                    topic: 'test.topic',
                    version: '1.0.0',
                },
                payload: { data: 'test' },
            };

            // Mock multiple subscribers for the topic
            mockSubscriptionManager.getSubscribers.mockReturnValue(['service2', 'service3']);

            // Publish the message
            messageRouter.routeMessage('service1', message);

            // Verify subscribers were retrieved for the correct topic
            expect(mockSubscriptionManager.getSubscribers).toHaveBeenCalledWith('test.topic');

            // Verify message was forwarded to each subscriber
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith('service2', expect.objectContaining({
                topic: 'test.topic',
                requestid: undefined
            }), { data: 'test' });
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith('service3', expect.objectContaining({
                topic: 'test.topic',
                requestid: undefined
            }), { data: 'test' });

            // Verify logging
            expect(logger.info).toHaveBeenCalledWith(`Publishing message to topic: test.topic for service: service1`);
        });

        it('should send an error response if no subscribers are found', () => {
            // Setup test publish message with request ID
            const message: Message = {
                header: {
                    action: ActionType.PUBLISH,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: 'req-1'
                },
                payload: { data: 'test' },
            };

            // Mock no subscribers for the topic
            mockSubscriptionManager.getSubscribers.mockReturnValue([]);

            // Publish the message
            messageRouter.routeMessage('service1', message);

            // Verify error response was sent back to publisher
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service1',
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    requestid: 'req-1'
                }),
                expect.objectContaining({
                    error: expect.objectContaining({
                        code: 'NO_ROUTE_FOUND',
                        message: 'No subscribers for topic test.topic'
                    })
                })
            );
        });

        it('should send a success response to the publisher if requestid is present', () => {
            // Setup test publish message with request ID
            const message: Message = {
                header: {
                    action: ActionType.PUBLISH,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: 'req-1'
                },
                payload: { data: 'test' },
            };

            // Mock subscribers for the topic
            mockSubscriptionManager.getSubscribers.mockReturnValue(['service2']);

            // Publish the message
            messageRouter.routeMessage('service1', message);

            // Verify success response was sent back to publisher
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service1',
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    requestid: 'req-1'
                }),
                { status: 'success' }
            );

            // Verify logging
            expect(logger.info).toHaveBeenCalledWith(`Sent publish response to service: service1 for request: req-1`);
        });
    });

    describe('handleRequest', () => {
        it('should forward a request to the chosen subscriber and add the request to the requests map', () => {
            // Setup test request message
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: 'req-1'
                },
                payload: { data: 'test' }
            };

            // Mock single subscriber for the topic
            mockSubscriptionManager.getTopSubscribers.mockReturnValueOnce(['service2']);

            // Send the request
            messageRouter.routeMessage('service1', message);

            // Verify request was forwarded to subscriber
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service2',
                expect.objectContaining({
                    action: ActionType.REQUEST,
                    topic: 'test.topic'
                }),
                { data: 'test' }
            );

            // Get the generated request ID from the forwarded message
            const sentMessage = (mockConnectionManager.sendMessage as jest.Mock).mock.calls[0][1] as Header;
            const sentRequestId = sentMessage.requestid;

            // Verify request was stored in the requests map
            const request = (messageRouter as any).getRequest('service2', sentRequestId);
            expect(request).toBeDefined();
            expect(request.originServiceId).toBe('service1');
            expect(request.originalHeader.requestid).toBe('req-1');
        });

        it('should remove the oldest request and send a SERVICE_UNAVAILABLE error if the maximum number of outstanding requests is reached', () => {
            // Set maximum number of outstanding requests
            const maxRequests = 5;
            config.max.outstanding.requests = maxRequests;
            const topic = 'test.topic';

            // Mock subscriber for all requests
            mockSubscriptionManager.getTopSubscribers.mockReturnValue(['service2']);

            // Create more requests than the maximum allowed
            for (let i = 0; i < maxRequests + 1; i++) {
                const message: Message = {
                    header: {
                        action: ActionType.REQUEST,
                        topic: topic,
                        version: '1.0.0',
                        requestid: `req-${i}`
                    },
                    payload: {}
                };
                messageRouter.routeMessage(`service${i}`, message);
            }

            // Verify SERVICE_UNAVAILABLE error was sent for the oldest request
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service0',
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    requestid: undefined
                }),
                expect.objectContaining({
                    error: expect.objectContaining({
                        code: 'SERVICE_UNAVAILABLE',
                        message: expect.any(String)
                    })
                })
            );
        });

        it('should send an error response if no subscribers are found', () => {
            // Setup test request message
            const message: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: 'req-1'
                },
                payload: {}
            };

            // Mock no subscribers for the topic
            mockSubscriptionManager.getTopSubscribers.mockReturnValue([]);

            // Send the request
            messageRouter.routeMessage('service1', message);

            // Verify error response was sent back to requester
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service1',
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    requestid: 'req-1'
                }),
                expect.objectContaining({
                    error: expect.objectContaining({
                        code: 'NO_ROUTE_FOUND',
                        message: 'No subscribers for topic test.topic'
                    })
                })
            );
        });

        it('should randomly select a subscriber when multiple subscribers have the same priority', () => {
            // Mock Math.random to return a predictable value
            const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);

            // Mock multiple subscribers
            mockSubscriptionManager.getTopSubscribers.mockReturnValue(['service1', 'service2', 'service3']);

            // Create request message
            const requestMessage: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: 'req-123'
                },
                payload: { data: 'test' }
            };

            // Route message
            messageRouter.routeMessage('origin-service', requestMessage);

            // Verify message was sent to the "randomly" selected service (index 1 with Math.random = 0.5)
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service2',  // Second service in the array
                expect.any(Object),
                expect.any(Object)
            );

            // Clean up
            mockRandom.mockRestore();
        });

        it('should remove timeout from payload before forwarding request', () => {
            // Mock a target service
            mockSubscriptionManager.getTopSubscribers.mockReturnValue(['target-service']);

            // Create request message with timeout
            const requestMessage: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: 'req-123'
                },
                payload: {
                    data: 'test',
                    timeout: 5000
                }
            };

            // Route message
            messageRouter.routeMessage('origin-service', requestMessage);

            // Verify forwarded message doesn't include timeout
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'target-service',
                expect.any(Object),
                expect.not.objectContaining({
                    timeout: expect.any(Number)
                })
            );
        });

        it('should generate request with timeout when requestid is present', () => {
            jest.useFakeTimers();

            // Mock a target service
            mockSubscriptionManager.getTopSubscribers.mockReturnValue(['target-service']);

            // Create request message with requestid and custom timeout
            const requestMessage: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: 'req-123'
                },
                payload: {
                    data: 'test',
                    timeout: 5000
                }
            };

            // Route message
            messageRouter.routeMessage('origin-service', requestMessage);

            // Fast forward past the timeout
            jest.advanceTimersByTime(5000);

            // Verify timeout error was sent
            expect(mockConnectionManager.sendMessage).toHaveBeenLastCalledWith(
                'origin-service',
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    requestid: 'req-123'
                }),
                expect.objectContaining({
                    error: expect.objectContaining({
                        code: 'TIMEOUT'
                    })
                })
            );

            jest.useRealTimers();
        });

        it('should generate request without timeout when requestid is not present', () => {
            jest.useFakeTimers();

            // Mock a target service
            mockSubscriptionManager.getTopSubscribers.mockReturnValue(['target-service']);

            // Create request message without requestid
            const requestMessage: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'test.topic',
                    version: '1.0.0'
                },
                payload: {
                    data: 'test',
                    timeout: 5000
                }
            };

            // Route message
            messageRouter.routeMessage('origin-service', requestMessage);

            // Verify message was forwarded without setting up a timeout
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'target-service',
                expect.objectContaining({
                    action: ActionType.REQUEST
                }),
                expect.objectContaining({
                    data: 'test'
                })
            );

            // Fast forward to verify no timeout was set
            jest.advanceTimersByTime(5000);
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledTimes(1);

            jest.useRealTimers();
        });
    });

    describe('handleResponse', () => {
        it('should forward a response to the original requester and remove the request from the map', () => {
            // Setup initial request tracking
            const originalRequestId = 'req-1';
            const targetRequestId = 'req-2';
            const request: Request = {
                originServiceId: 'service1',
                targetServiceId: 'service2',
                originalRequestId: originalRequestId,
                targetRequestId: targetRequestId,
                originalHeader: {
                    action: ActionType.REQUEST,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: originalRequestId
                },
                createdAt: new Date()
            };

            // Store the request in the requests map
            (messageRouter as any).requests.set('service2:req-2', request);

            // Setup response message
            const responseMessage: Message = {
                header: {
                    action: ActionType.RESPONSE,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: targetRequestId
                },
                payload: { result: 'success' }
            };

            // Send the response
            messageRouter.routeMessage('service2', responseMessage);

            // Verify response was forwarded to original requester
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service1',
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    requestid: originalRequestId
                }),
                { result: 'success' }
            );

            // Verify request was removed from the map
            expect((messageRouter as any).getRequest('service2', targetRequestId)).toBeUndefined();
        });

        it('should send an error response if no matching request is found', () => {
            // Setup response message with unknown request ID
            const responseMessage: Message = {
                header: {
                    action: ActionType.RESPONSE,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: 'unknown-req'
                },
                payload: {}
            };

            // Send the response
            messageRouter.routeMessage('service2', responseMessage);

            // Verify error response was sent back
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service2',
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    requestid: 'unknown-req'
                }),
                expect.objectContaining({
                    error: expect.objectContaining({
                        code: 'INVALID_REQUEST_ID',
                        message: expect.stringContaining('No matching request found')
                    })
                })
            );
        });

        it('should send an error response if the response is missing a request ID', () => {
            // Setup response message without request ID
            const responseMessage: Message = {
                header: {
                    action: ActionType.RESPONSE,
                    topic: 'test.topic',
                    version: '1.0.0',
                    // Missing requestid
                },
                payload: {}
            };

            // Send the response
            messageRouter.routeMessage('service2', responseMessage);

            // Verify error response was sent back
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service2',
                expect.objectContaining({
                    action: ActionType.RESPONSE
                }),
                expect.objectContaining({
                    error: expect.objectContaining({
                        code: 'INVALID_REQUEST_ID',
                        message: expect.stringContaining('without requestId')
                    })
                })
            );
        });
    });

    describe('generateRequest', () => {
        it('should add a new request to the requests map with a timeout', () => {
            // Setup test parameters
            jest.useFakeTimers();
            const originServiceId = 'service1';
            const targetServiceId = 'service2';
            const originalHeader: Header = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0',
                requestid: 'req-1'
            };
            const timeout = 1000;

            // Generate the request
            const request = (messageRouter as any).generateRequest(originServiceId, targetServiceId, originalHeader, timeout);

            // Verify request was stored correctly
            const storedRequest = (messageRouter as any).getRequest(targetServiceId, request.targetRequestId);
            expect(storedRequest).toBeDefined();
            expect(storedRequest.originServiceId).toBe(originServiceId);
            expect(storedRequest.targetServiceId).toBe(targetServiceId);
            expect(storedRequest.originalHeader).toEqual(originalHeader);
            expect(storedRequest.timeout).toBeDefined();

            jest.useRealTimers();
        });

        it('should set a default timeout if no timeout is provided', () => {
            // Setup test parameters
            jest.useFakeTimers();
            const originServiceId = 'service1';
            const targetServiceId = 'service2';
            const originalHeader: Header = {
                action: ActionType.REQUEST,
                topic: 'test.topic',
                version: '1.0.0',
                requestid: 'req-1'
            };

            // Generate the request without explicit timeout
            const request = (messageRouter as any).generateRequest(originServiceId, targetServiceId, originalHeader);

            // Verify request was stored with default timeout
            const storedRequest = (messageRouter as any).getRequest(targetServiceId, request.targetRequestId);
            expect(storedRequest).toBeDefined();
            expect(storedRequest.timeout).toBeDefined();

            jest.useRealTimers();
        });
    });

    describe('getRequest', () => {
        it('should return the request if it exists', () => {
            // Setup test request
            const request: Request = {
                originServiceId: 'service1',
                targetServiceId: 'service2',
                originalRequestId: 'req-1',
                targetRequestId: 'req-2',
                originalHeader: {
                    action: ActionType.REQUEST,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: 'req-1'
                },
                createdAt: new Date()
            };

            // Store the request
            (messageRouter as any).requests.set('service2:req-2', request);

            // Verify request can be retrieved
            const retrievedRequest = (messageRouter as any).getRequest('service2', 'req-2');
            expect(retrievedRequest).toBe(request);
        });

        it('should return undefined if the request does not exist', () => {
            // Attempt to retrieve non-existent request
            const retrievedRequest = (messageRouter as any).getRequest('service2', 'req-2');
            expect(retrievedRequest).toBeUndefined();
        });
    });

    describe('removeRequest', () => {
        it('should remove the request from the map and clear the timeout', () => {
            // Setup test request with timeout
            jest.useFakeTimers();
            const request: Request = {
                originServiceId: 'service1',
                targetServiceId: 'service2',
                originalRequestId: 'req-1',
                targetRequestId: 'req-2',
                originalHeader: {
                    action: ActionType.REQUEST,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: 'req-1'
                },
                timeout: setTimeout(() => {}, 1000),
                createdAt: new Date()
            };

            // Store the request
            (messageRouter as any).requests.set('service2:req-2', request);

            // Remove the request
            const result = (messageRouter as any).removeRequest('service2', 'req-2');
            expect(result).toBe(true);

            // Verify request was removed
            const retrievedRequest = (messageRouter as any).getRequest('service2', 'req-2');
            expect(retrievedRequest).toBeUndefined();

            jest.useRealTimers();
        });

        it('should return false if the request does not exist', () => {
            // Attempt to remove non-existent request
            const result = (messageRouter as any).removeRequest('service2', 'req-2');
            expect(result).toBe(false);
        });
    });

    describe('generateRequestId', () => {
        it('should generate a unique request ID', () => {
            // Generate two request IDs
            const requestId1 = (messageRouter as any).generateRequestId();
            const requestId2 = (messageRouter as any).generateRequestId();

            // Verify they are different
            expect(requestId1).not.toBe(requestId2);
        });
    });

    describe('clearRequests', () => {
        it('should remove all requests from the map and clear timeouts', () => {
            // Setup test requests with timeouts
            jest.useFakeTimers();
            const request1: Request = {
                originServiceId: 'service1',
                targetServiceId: 'service2',
                originalRequestId: 'req-1',
                targetRequestId: 'req-2',
                originalHeader: {
                    action: ActionType.REQUEST,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: 'req-1'
                },
                timeout: setTimeout(() => {}, 1000),
                createdAt: new Date()
            };
            const request2: Request = {
                originServiceId: 'service3',
                targetServiceId: 'service4',
                originalRequestId: 'req-3',
                targetRequestId: 'req-4',
                originalHeader: {
                    action: ActionType.REQUEST,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: 'req-3'
                },
                timeout: setTimeout(() => {}, 1000),
                createdAt: new Date()
            };

            // Store the requests
            (messageRouter as any).requests.set('service2:req-2', request1);
            (messageRouter as any).requests.set('service4:req-4', request2);

            // Clear all requests
            messageRouter.dispose();

            // Verify all requests were removed
            expect((messageRouter as any).getRequest('service2', 'req-2')).toBeUndefined();
            expect((messageRouter as any).getRequest('service4', 'req-4')).toBeUndefined();

            jest.useRealTimers();
        });
    });

    describe('handleError', () => {
        it('should handle error response without originalRequestId', () => {
            // Create a request without originalRequestId
            const request: Request = {
                originServiceId: 'service1',
                targetServiceId: 'service2',
                targetRequestId: 'req-123',
                originalHeader: {
                    action: ActionType.REQUEST,
                    topic: 'test.topic',
                    version: '1.0.0'
                },
                createdAt: new Date()
            };

            // Add request to router
            (messageRouter as any).requests.set('service2:req-123', request);

            // Create error response message
            const errorResponse: Message = {
                header: {
                    action: ActionType.RESPONSE,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: 'req-123'
                },
                payload: {
                    error: {
                        code: 'TEST_ERROR',
                        message: 'Test error',
                        timestamp: new Date().toISOString()
                    }
                }
            };

            // Route error response
            messageRouter.routeMessage('service2', errorResponse);

            // Verify error response was sent
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'service1',
                expect.objectContaining({ action: ActionType.RESPONSE }),
                expect.objectContaining({ error: expect.any(Object) })
            );

            // Verify warning was logged
            expect(logger.warn).toHaveBeenCalledWith(
                'Error received from service: service2 for request: req-123',
                expect.any(Object)
            );
        });

        it('should handle request timeout', async () => {
            // Mock Date.now for consistent testing
            const now = new Date();
            jest.useFakeTimers();

            // Create request message
            const requestMessage: Message = {
                header: {
                    action: ActionType.REQUEST,
                    topic: 'test.topic',
                    version: '1.0.0',
                    requestid: 'origin-req-123'
                },
                payload: { data: 'test' }
            };

            // Mock getTopSubscribers to return a target service
            mockSubscriptionManager.getTopSubscribers.mockReturnValue(['target-service']);

            // Route request message
            messageRouter.routeMessage('origin-service', requestMessage);

            // Fast forward past the timeout
            jest.advanceTimersByTime(config.request.response.timeout.default + 100);

            // Verify timeout error response was sent
            expect(mockConnectionManager.sendMessage).toHaveBeenCalledWith(
                'origin-service',
                expect.objectContaining({
                    action: ActionType.RESPONSE,
                    requestid: 'origin-req-123'
                }),
                expect.objectContaining({
                    error: expect.objectContaining({
                        code: 'TIMEOUT',
                        message: 'Request timed out'
                    })
                })
            );

            // Verify warning was logged
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringMatching(/^Request origin-service:origin-req-123 to target-service:.* timed out$/)
            );

            // Clean up
            jest.useRealTimers();
        });
    });
});