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
jest.mock('@core/monitoring/manager');

describe('MessageRouter', () => {
    let messageRouter: MessageRouter;
    let mockConnectionManager: jest.Mocked<ConnectionManager>;
    let mockServiceRegistry: jest.Mocked<ServiceRegistry>;
    let mockSubscriptionManager: jest.Mocked<SubscriptionManager>;
    let mockMonitoringManager: jest.Mocked<MonitoringManager>;

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

        // Create mock MonitoringManager with basic implementations
        mockMonitoringManager = {
            registerMetric: jest.fn().mockReturnValue({
                slot: {
                    value: 0,
                    lastModified: new Date(),
                    dispose: jest.fn(),
                    add: jest.fn()
                },
                dispose: jest.fn(),
            }),
            registerParameterized: jest.fn()
        } as unknown as jest.Mocked<MonitoringManager>;

        // Create MessageRouter with mock managers
        messageRouter = new MessageRouter(mockSubscriptionManager, mockMonitoringManager);

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
    });
});