import { SubscriptionManager } from '@core/subscription';
import { ActionType } from '@core/types';
import logger, { SetupLogger } from '@utils/logger';

/**
 * Mock setup for the logger to prevent actual logging during tests.
 * Provides mock implementations for all logging levels.
 */
jest.mock('@utils/logger', () => {
    const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn()
    };
    return {
        __esModule: true,
        default: mockLogger,
        SetupLogger: jest.fn(() => mockLogger)
    };
});

/**
 * Test suite for the SubscriptionManager class.
 * Verifies the functionality of managing service subscriptions to topics, including:
 * - PUBLISH subscriptions (unordered set of subscribers)
 * - REQUEST subscriptions (priority-ordered set of subscribers)
 * - Topic and subscriber management
 * - Error handling and edge cases
 */
describe('SubscriptionManager', () => {
    let subscriptionManager: SubscriptionManager;

    /**
     * Test setup before each test case:
     * - Resets all mocks
     * - Creates a fresh SubscriptionManager instance
     */
    beforeEach(() => {
        // Reset all mock implementations and call history before each test
        jest.resetAllMocks();

        // Create a new SubscriptionManager instance for each test
        subscriptionManager = new SubscriptionManager();
    });

    /**
     * Test cleanup after each test case:
     * Disposes of the subscription manager to ensure test isolation
     */
    afterEach(async () => {
        // Clean up subscriptions after each test to ensure isolation
        await subscriptionManager.dispose();
    });

    /**
     * Test suite for PUBLISH subscription functionality.
     * Tests the management of unordered topic subscriptions where multiple services
     * can subscribe to receive published messages.
     */
    describe('PUBLISH Subscriptions', () => {
        /**
         * Test suite for subscribePublish method.
         * Verifies the functionality of subscribing services to receive published messages,
         * including validation and duplicate handling.
         */
        describe('subscribePublish', () => {
            /**
             * Tests basic subscription functionality.
             * Verifies that a service can successfully subscribe to a topic
             * and appear in the list of subscribers.
             */
            it('should subscribe a service to a topic', () => {
                const result = subscriptionManager.subscribePublish('service1', 'baggage.events');
                expect(result).toBe(true);
                expect(subscriptionManager.getPublishSubscribers('baggage.events')).toEqual(['service1']);
            });

            /**
             * Tests multiple service subscription handling.
             * Verifies that multiple services can subscribe to the same topic
             * and all appear in the subscribers list.
             */
            it('should handle multiple services subscribing to the same topic', () => {
                subscriptionManager.subscribePublish('service1', 'baggage.events');
                subscriptionManager.subscribePublish('service2', 'baggage.events');
                const subscribers = subscriptionManager.getPublishSubscribers('baggage.events');
                expect(subscribers).toContain('service1');
                expect(subscribers).toContain('service2');
                expect(subscribers).toHaveLength(2);
            });

            /**
             * Tests duplicate subscription handling.
             * Verifies that attempting to subscribe the same service to the same topic
             * multiple times is handled idempotently.
             */
            it('should prevent duplicate subscriptions from the same service', () => {
                subscriptionManager.subscribePublish('service1', 'baggage.events');
                const result = subscriptionManager.subscribePublish('service1', 'baggage.events');
                expect(result).toBe(true); // Still returns true as it's idempotent
                expect(subscriptionManager.getPublishSubscribers('baggage.events')).toEqual(['service1']);
            });

            /**
             * Tests case-insensitive topic name handling.
             * Verifies that topic names are handled case-insensitively
             * while maintaining the original case in responses.
             */
            it('should handle case-insensitive topic names', () => {
                subscriptionManager.subscribePublish('service1', 'Baggage.Events');
                expect(subscriptionManager.getPublishSubscribers('baggage.events')).toEqual(['service1']);
            });

            /**
             * Tests topic name validation.
             * Verifies that invalid topic names are rejected according to
             * the topic naming rules.
             */
            it('should reject invalid topic names', () => {
                expect(subscriptionManager.subscribePublish('service1', 'invalid..topic')).toBe(false);
                expect(subscriptionManager.subscribePublish('service1', '.invalid')).toBe(false);
                expect(subscriptionManager.subscribePublish('service1', 'invalid.')).toBe(false);
                expect(subscriptionManager.subscribePublish('service1', '123.invalid')).toBe(false);
            });
        });

        /**
         * Test suite for unsubscribePublish method.
         * Verifies the functionality of removing services from topic subscriptions,
         * including error handling and edge cases.
         */
        describe('unsubscribePublish', () => {
            /**
             * Tests basic unsubscription functionality.
             * Verifies that a service can be successfully unsubscribed from a topic
             * and is removed from the subscribers list.
             */
            it('should unsubscribe a service from a topic', () => {
                subscriptionManager.subscribePublish('service1', 'baggage.events');
                const result = subscriptionManager.unsubscribePublish('service1', 'baggage.events');
                expect(result).toBe(true);
                expect(subscriptionManager.getPublishSubscribers('baggage.events')).toEqual([]);
            });

            /**
             * Tests unsubscription from non-existent topic.
             * Verifies that attempting to unsubscribe from a topic that doesn't exist
             * returns false and doesn't cause errors.
             */
            it('should return false when unsubscribing from a non-existent topic', () => {
                const result = subscriptionManager.unsubscribePublish('service1', 'nonexistent.topic');
                expect(result).toBe(false);
            });

            /**
             * Tests unsubscription of non-subscribed service.
             * Verifies that attempting to unsubscribe a service that isn't subscribed
             * returns false and doesn't affect other subscribers.
             */
            it('should return false when unsubscribing a non-subscribed service', () => {
                subscriptionManager.subscribePublish('service1', 'baggage.events');
                const result = subscriptionManager.unsubscribePublish('service2', 'baggage.events');
                expect(result).toBe(false);
            });

            /**
             * Tests case-insensitive topic name handling during unsubscription.
             * Verifies that topic names are handled case-insensitively when unsubscribing.
             */
            it('should handle case-insensitive topic names', () => {
                subscriptionManager.subscribePublish('service1', 'Baggage.Events');
                const result = subscriptionManager.unsubscribePublish('service1', 'baggage.events');
                expect(result).toBe(true);
                expect(subscriptionManager.getPublishSubscribers('baggage.events')).toEqual([]);
            });

            /**
             * Tests topic name validation during unsubscription.
             * Verifies that invalid topic names are rejected during unsubscription
             * according to the topic naming rules.
             */
            it('should reject invalid topic names', () => {
                expect(subscriptionManager.unsubscribePublish('service1', 'invalid..topic')).toBe(false);
                expect(subscriptionManager.unsubscribePublish('service1', '.invalid')).toBe(false);
                expect(subscriptionManager.unsubscribePublish('service1', 'invalid.')).toBe(false);
                expect(subscriptionManager.unsubscribePublish('service1', '123.invalid')).toBe(false);
            });
        });

        /**
         * Test suite for getPublishSubscribers method.
         * Verifies the functionality of retrieving subscribers for PUBLISH topics.
         */
        describe('getPublishSubscribers', () => {
            /**
             * Tests retrieval of subscribers for non-existent topics.
             * Verifies that an empty array is returned for topics with no subscribers.
             */
            it('should return an empty array for non-existent topics', () => {
                expect(subscriptionManager.getPublishSubscribers('nonexistent.topic')).toEqual([]);
            });

            /**
             * Tests retrieval of all subscribers for a topic.
             * Verifies that all subscribed services are returned correctly.
             */
            it('should return all subscribers for a topic', () => {
                subscriptionManager.subscribePublish('service1', 'baggage.events');
                subscriptionManager.subscribePublish('service2', 'baggage.events');
                const subscribers = subscriptionManager.getPublishSubscribers('baggage.events');
                expect(subscribers).toContain('service1');
                expect(subscribers).toContain('service2');
                expect(subscribers).toHaveLength(2);
            });

            /**
             * Tests case-insensitive topic name handling in subscriber retrieval.
             * Verifies that subscribers can be retrieved regardless of topic name case.
             */
            it('should handle case-insensitive topic names', () => {
                subscriptionManager.subscribePublish('service1', 'Baggage.Events');
                expect(subscriptionManager.getPublishSubscribers('baggage.events')).toEqual(['service1']);
            });
        });
    });

    /**
     * Test suite for REQUEST subscription functionality.
     * Tests the management of priority-ordered topic subscriptions where services
     * can subscribe to handle requests with different priority levels.
     */
    describe('REQUEST Subscriptions', () => {
        /**
         * Test suite for subscribeRequest method.
         * Verifies the functionality of subscribing services to handle requests,
         * including priority ordering and validation.
         */
        describe('subscribeRequest', () => {
            /**
             * Tests basic subscription functionality with priority.
             * Verifies that a service can successfully subscribe to a topic
             * with a specified priority level.
             */
            it('should subscribe a service to a topic with priority', () => {
                const result = subscriptionManager.subscribeRequest('service1', 'baggage.events', 2);
                expect(result).toBe(true);
                expect(subscriptionManager.getRequestSubscribers('baggage.events')).toEqual(['service1']);
            });

            /**
             * Tests priority-based ordering of subscribers.
             * Verifies that subscribers are ordered by priority (highest first)
             * when multiple services subscribe with different priorities.
             */
            it('should order subscribers by priority (highest first)', () => {
                subscriptionManager.subscribeRequest('service1', 'baggage.events', 1);  // Medium priority
                subscriptionManager.subscribeRequest('service2', 'baggage.events', 2);  // High priority
                subscriptionManager.subscribeRequest('service3', 'baggage.events', 0);  // Low priority

                const subscribers = subscriptionManager.getRequestSubscribers('baggage.events');
                expect(subscribers).toEqual(['service2', 'service1', 'service3']);
            });

            /**
             * Tests priority update for existing subscriptions.
             * Verifies that re-subscribing a service updates its priority
             * and maintains correct ordering.
             */
            it('should update priority of existing subscription', () => {
                subscriptionManager.subscribeRequest('service1', 'baggage.events', 1);
                subscriptionManager.subscribeRequest('service1', 'baggage.events', 2);
                const subscribers = subscriptionManager.getRequestSubscribers('baggage.events');
                expect(subscribers).toEqual(['service1']);
                expect(subscriptionManager.getTopRequestSubscribers('baggage.events')).toEqual(['service1']);
            });

            /**
             * Tests topic name validation.
             * Verifies that invalid topic names are rejected according to
             * the topic naming rules.
             */
            it('should reject invalid topic names', () => {
                expect(subscriptionManager.subscribeRequest('service1', 'invalid..topic', 1)).toBe(false);
                expect(subscriptionManager.subscribeRequest('service1', '.invalid', 1)).toBe(false);
                expect(subscriptionManager.subscribeRequest('service1', 'invalid.', 1)).toBe(false);
                expect(subscriptionManager.subscribeRequest('service1', '123.invalid', 1)).toBe(false);
            });

            /**
             * Tests default priority handling.
             * Verifies that when no priority is specified, the default priority (0)
             * is assigned to the subscription.
             */
            it('should use default priority when not specified', () => {
                const result = subscriptionManager.subscribeRequest('service1', 'baggage.events');
                expect(result).toBe(true);
                expect(subscriptionManager.getSubscribedTopics('service1')).toEqual([
                    { action: ActionType.REQUEST, topic: 'baggage.events', priority: 0 }
                ]);
            });
        });

        /**
         * Test suite for unsubscribeRequest method.
         * Verifies the functionality of removing services from request subscriptions,
         * including maintaining priority order and error handling.
         */
        describe('unsubscribeRequest', () => {
            /**
             * Tests basic unsubscription functionality.
             * Verifies that a service can be successfully unsubscribed from a topic
             * and is removed from the subscribers list.
             */
            it('should unsubscribe a service from a topic', () => {
                subscriptionManager.subscribeRequest('service1', 'baggage.events', 1);
                const result = subscriptionManager.unsubscribeRequest('service1', 'baggage.events');
                expect(result).toBe(true);
                expect(subscriptionManager.getRequestSubscribers('baggage.events')).toEqual([]);
            });

            /**
             * Tests priority order maintenance after unsubscription.
             * Verifies that remaining subscribers maintain their correct priority order
             * after a service is unsubscribed.
             */
            it('should maintain priority order after unsubscription', () => {
                subscriptionManager.subscribeRequest('service1', 'baggage.events', 1);
                subscriptionManager.subscribeRequest('service2', 'baggage.events', 2);
                subscriptionManager.subscribeRequest('service3', 'baggage.events', 0);

                subscriptionManager.unsubscribeRequest('service2', 'baggage.events');
                expect(subscriptionManager.getRequestSubscribers('baggage.events')).toEqual(['service1', 'service3']);
            });

            /**
             * Tests unsubscription from non-existent topic.
             * Verifies that attempting to unsubscribe from a topic that doesn't exist
             * returns false and doesn't cause errors.
             */
            it('should return false when unsubscribing from a non-existent topic', () => {
                const result = subscriptionManager.unsubscribeRequest('service1', 'nonexistent.topic');
                expect(result).toBe(false);
            });

            /**
             * Tests topic name validation during unsubscription.
             * Verifies that invalid topic names are rejected during unsubscription
             * according to the topic naming rules.
             */
            it('should reject invalid topic names', () => {
                expect(subscriptionManager.unsubscribeRequest('service1', 'invalid..topic')).toBe(false);
                expect(subscriptionManager.unsubscribeRequest('service1', '.invalid')).toBe(false);
                expect(subscriptionManager.unsubscribeRequest('service1', 'invalid.')).toBe(false);
                expect(subscriptionManager.unsubscribeRequest('service1', '123.invalid')).toBe(false);
            });
        });

        /**
         * Test suite for getRequestSubscribers method.
         * Verifies the functionality of retrieving subscribers for REQUEST topics
         * in priority order.
         */
        describe('getRequestSubscribers', () => {
            /**
             * Tests priority-based subscriber ordering.
             * Verifies that subscribers are returned in correct priority order
             * (highest to lowest).
             */
            it('should return subscribers in priority order', () => {
                subscriptionManager.subscribeRequest('service1', 'baggage.events', 1);
                subscriptionManager.subscribeRequest('service2', 'baggage.events', 2);
                subscriptionManager.subscribeRequest('service3', 'baggage.events', 0);

                expect(subscriptionManager.getRequestSubscribers('baggage.events'))
                    .toEqual(['service2', 'service1', 'service3']);
            });

            /**
             * Tests retrieval for non-existent topics.
             * Verifies that an empty array is returned for topics with no subscribers.
             */
            it('should return an empty array for non-existent topics', () => {
                expect(subscriptionManager.getRequestSubscribers('nonexistent.topic')).toEqual([]);
            });
        });

        /**
         * Test suite for getTopRequestSubscribers method.
         * Verifies the functionality of retrieving only the highest-priority
         * subscribers for REQUEST topics.
         */
        describe('getTopRequestSubscribers', () => {
            /**
             * Tests highest priority subscriber selection.
             * Verifies that only subscribers with the highest priority are returned,
             * even when multiple services share the same priority.
             */
            it('should return only subscribers with the highest priority', () => {
                subscriptionManager.subscribeRequest('service1', 'baggage.events', 1);
                subscriptionManager.subscribeRequest('service2', 'baggage.events', 2);
                subscriptionManager.subscribeRequest('service3', 'baggage.events', 2);
                subscriptionManager.subscribeRequest('service4', 'baggage.events', 0);

                expect(subscriptionManager.getTopRequestSubscribers('baggage.events'))
                    .toEqual(['service2', 'service3']);
            });

            /**
             * Tests retrieval for non-existent topics.
             * Verifies that an empty array is returned for topics with no subscribers.
             */
            it('should return an empty array for non-existent topics', () => {
                expect(subscriptionManager.getTopRequestSubscribers('nonexistent.topic')).toEqual([]);
            });

            /**
             * Tests single subscriber case.
             * Verifies correct behavior when only one service is subscribed,
             * ensuring it's returned as the top subscriber regardless of priority.
             */
            it('should handle single subscriber case', () => {
                subscriptionManager.subscribeRequest('service1', 'baggage.events', 1);
                expect(subscriptionManager.getTopRequestSubscribers('baggage.events'))
                    .toEqual(['service1']);
            });
        });
    });

    /**
     * Test suite for Topic Subscription management functionality.
     * Tests methods that deal with retrieving and managing topic subscriptions
     * across both PUBLISH and REQUEST actions.
     */
    describe('Topic Subscriptions', () => {
        /**
         * Test suite for getSubscribedTopics method.
         * Verifies the functionality of retrieving all topics a service is subscribed to,
         * including both PUBLISH and REQUEST subscriptions.
         */
        describe('getSubscribedTopics', () => {
            /**
             * Tests retrieval for non-subscribed service.
             * Verifies that an empty array is returned when a service
             * has no topic subscriptions.
             */
            it('should return an empty array if the service is not subscribed to any topics', () => {
                expect(subscriptionManager.getSubscribedTopics('service1')).toEqual([]);
            });

            /**
             * Tests retrieval of all subscribed topics with their action types.
             * Verifies:
             * - Both PUBLISH and REQUEST subscriptions are included
             * - Topics are returned in alphabetical order
             * - Priority information is included for REQUEST subscriptions
             */
            it('should return all subscribed topics with their action types', () => {
                // Subscribe to various topics
                subscriptionManager.subscribePublish('service1', 'zebra.events');
                subscriptionManager.subscribePublish('service1', 'alpha.updates');
                subscriptionManager.subscribeRequest('service1', 'baggage.events', 2);
                subscriptionManager.subscribeRequest('service1', 'system.status', 1);

                const subscriptions = subscriptionManager.getSubscribedTopics('service1');
                expect(subscriptions).toEqual([
                    { action: ActionType.PUBLISH, topic: 'alpha.updates' },
                    { action: ActionType.REQUEST, topic: 'baggage.events', priority: 2 },
                    { action: ActionType.REQUEST, topic: 'system.status', priority: 1 },
                    { action: ActionType.PUBLISH, topic: 'zebra.events' }
                ]);
            });

            /**
             * Tests handling of PUBLISH-only subscriptions.
             * Verifies correct behavior when a service only has PUBLISH subscriptions,
             * ensuring topics are returned in alphabetical order.
             */
            it('should handle services with only PUBLISH subscriptions', () => {
                subscriptionManager.subscribePublish('service1', 'zebra.events');
                subscriptionManager.subscribePublish('service1', 'alpha.updates');

                expect(subscriptionManager.getSubscribedTopics('service1')).toEqual([
                    { action: ActionType.PUBLISH, topic: 'alpha.updates' },
                    { action: ActionType.PUBLISH, topic: 'zebra.events' }
                ]);
            });

            /**
             * Tests handling of REQUEST-only subscriptions.
             * Verifies correct behavior when a service only has REQUEST subscriptions,
             * ensuring topics are returned in alphabetical order with priorities.
             */
            it('should handle services with only REQUEST subscriptions', () => {
                subscriptionManager.subscribeRequest('service1', 'zebra.events', 2);
                subscriptionManager.subscribeRequest('service1', 'alpha.updates', 1);

                expect(subscriptionManager.getSubscribedTopics('service1')).toEqual([
                    { action: ActionType.REQUEST, topic: 'alpha.updates', priority: 1 },
                    { action: ActionType.REQUEST, topic: 'zebra.events', priority: 2 }
                ]);
            });

            /**
             * Tests subscription removal handling.
             * Verifies that unsubscribed topics are not included in the results,
             * while remaining subscriptions are still returned correctly.
             */
            it('should not include topics after unsubscribing', () => {
                // Subscribe to various topics
                subscriptionManager.subscribePublish('service1', 'alpha.updates');
                subscriptionManager.subscribeRequest('service1', 'baggage.events', 2);
                subscriptionManager.subscribePublish('service1', 'zebra.events');

                // Unsubscribe from some topics
                subscriptionManager.unsubscribePublish('service1', 'alpha.updates');
                subscriptionManager.unsubscribeRequest('service1', 'baggage.events');

                expect(subscriptionManager.getSubscribedTopics('service1')).toEqual([
                    { action: ActionType.PUBLISH, topic: 'zebra.events' }
                ]);
            });

            /**
             * Tests handling of wildcard topic patterns.
             * Verifies that topic subscriptions using wildcards (+, #) are
             * handled correctly and returned in the expected format.
             */
            it('should handle wildcard topics', () => {
                subscriptionManager.subscribePublish('service1', 'events.+.status');
                subscriptionManager.subscribeRequest('service1', 'baggage.europe.#', 1);

                expect(subscriptionManager.getSubscribedTopics('service1')).toEqual([
                    { action: ActionType.REQUEST, topic: 'baggage.europe.#', priority: 1 },
                    { action: ActionType.PUBLISH, topic: 'events.+.status' }
                ]);
            });

            /**
             * Tests action type sorting for equal topics.
             * Verifies that when a service is subscribed to the same topic with different
             * action types, PUBLISH comes before REQUEST in the results.
             */
            it('should sort by action type when topics are equal', () => {
                // Subscribe to the same topic with different actions
                subscriptionManager.subscribeRequest('service1', 'same.topic', 1);
                subscriptionManager.subscribePublish('service1', 'same.topic');

                expect(subscriptionManager.getSubscribedTopics('service1')).toEqual([
                    { action: ActionType.PUBLISH, topic: 'same.topic' },
                    { action: ActionType.REQUEST, topic: 'same.topic', priority: 1 }
                ]);
            });
        });

        /**
         * Test suite for getAllSubscribedTopics method.
         * Verifies the functionality of retrieving and sorting all topic subscriptions,
         * including both PUBLISH and REQUEST actions, with proper subscriber information
         * and priorities.
         */
        describe('getAllSubscribedTopics', () => {
            /**
             * Tests that the method returns all topics with their subscribers correctly.
             * Verifies:
             * - Multiple services can subscribe to the same topic
             * - Both PUBLISH and REQUEST subscriptions are included
             * - Subscribers are listed with correct priorities
             * - Results are sorted by topic name
             */
            it('should return all topics with their subscribers', () => {
                // Subscribe multiple services to various topics
                subscriptionManager.subscribePublish('service1', 'alpha.updates');
                subscriptionManager.subscribePublish('service2', 'alpha.updates');
                subscriptionManager.subscribePublish('service3', 'zebra.events');

                subscriptionManager.subscribeRequest('service1', 'baggage.events', 2);
                subscriptionManager.subscribeRequest('service2', 'baggage.events', 1);
                subscriptionManager.subscribeRequest('service3', 'system.status', 0);

                const allTopics = subscriptionManager.getAllSubscribedTopics();

                // Sort the results for consistent testing
                allTopics.sort((a, b) => a.topic.localeCompare(b.topic));

                expect(allTopics).toEqual([
                    {
                        action: ActionType.PUBLISH,
                        topic: 'alpha.updates',
                        subscribers: [
                            { serviceId: 'service1' },
                            { serviceId: 'service2' }
                        ]
                    },
                    {
                        action: ActionType.REQUEST,
                        topic: 'baggage.events',
                        subscribers: [
                            { serviceId: 'service1', priority: 2 },
                            { serviceId: 'service2', priority: 1 }
                        ]
                    },
                    {
                        action: ActionType.REQUEST,
                        topic: 'system.status',
                        subscribers: [
                            { serviceId: 'service3', priority: 0 }
                        ]
                    },
                    {
                        action: ActionType.PUBLISH,
                        topic: 'zebra.events',
                        subscribers: [
                            { serviceId: 'service3' }
                        ]
                    }
                ]);
            });

            /**
             * Tests the edge case of no subscriptions.
             * Verifies that an empty array is returned when no services
             * have subscribed to any topics.
             */
            it('should handle empty subscription lists', () => {
                expect(subscriptionManager.getAllSubscribedTopics()).toEqual([]);
            });

            /**
             * Tests handling of PUBLISH-only subscriptions.
             * Verifies:
             * - Multiple services can subscribe to the same PUBLISH topic
             * - All subscribers have priority 0 for PUBLISH actions
             * - Correct format of returned subscription data
             */
            it('should handle only publish subscriptions', () => {
                subscriptionManager.subscribePublish('service1', 'alpha.updates');
                subscriptionManager.subscribePublish('service2', 'alpha.updates');

                const allTopics = subscriptionManager.getAllSubscribedTopics();
                expect(allTopics).toEqual([
                    {
                        action: ActionType.PUBLISH,
                        topic: 'alpha.updates',
                        subscribers: [
                            { serviceId: 'service1' },
                            { serviceId: 'service2' }
                        ]
                    }
                ]);
            });

            /**
             * Tests handling of REQUEST-only subscriptions.
             * Verifies:
             * - Multiple services can subscribe to the same REQUEST topic
             * - Subscribers maintain their specified priorities
             * - Correct format of returned subscription data
             */
            it('should handle only request subscriptions', () => {
                subscriptionManager.subscribeRequest('service1', 'baggage.events', 2);
                subscriptionManager.subscribeRequest('service2', 'baggage.events', 1);

                const allTopics = subscriptionManager.getAllSubscribedTopics();
                expect(allTopics).toEqual([
                    {
                        action: ActionType.REQUEST,
                        topic: 'baggage.events',
                        subscribers: [
                            { serviceId: 'service1', priority: 2 },
                            { serviceId: 'service2', priority: 1 }
                        ]
                    }
                ]);
            });

            /**
             * Tests the sorting behavior when topics are equal but actions differ.
             * Verifies:
             * - Topics are sorted by name first
             * - When topic names are equal, PUBLISH actions come before REQUEST actions
             * - Subscribers and priorities are maintained correctly
             */
            it('should sort by action type when topics are equal', () => {
                // Subscribe to the same topic with different actions
                subscriptionManager.subscribePublish('service1', 'same.topic');
                subscriptionManager.subscribeRequest('service2', 'same.topic', 1);

                const allTopics = subscriptionManager.getAllSubscribedTopics();
                expect(allTopics).toEqual([
                    {
                        action: ActionType.PUBLISH,
                        topic: 'same.topic',
                        subscribers: [
                            { serviceId: 'service1' }
                        ]
                    },
                    {
                        action: ActionType.REQUEST,
                        topic: 'same.topic',
                        subscribers: [
                            { serviceId: 'service2', priority: 1 }
                        ]
                    }
                ]);
            });
        });

        /**
         * Test suite for unsubscribe method.
         * Verifies the functionality of unsubscribing a service from all its topic subscriptions,
         * handling both PUBLISH and REQUEST actions, and various edge cases.
         */
        describe('unsubscribe', () => {
            /**
             * Tests the edge case of unsubscribing a non-existent service.
             * Verifies that attempting to unsubscribe a service with no subscriptions
             * returns false.
             */
            it('should return false when service has no subscriptions', () => {
                const result = subscriptionManager.unsubscribe('non-existent');
                expect(result).toBe(false);
            });

            /**
             * Tests complete unsubscription of a service from all topics.
             * Verifies:
             * - Service can be unsubscribed from multiple topics
             * - Both PUBLISH and REQUEST subscriptions are removed
             * - All subscriptions are successfully cleared
             * - Method returns true on successful unsubscription
             */
            it('should unsubscribe from all topics and return true', () => {
                const serviceId = 'test-service';

                // Subscribe to multiple topics with different actions
                subscriptionManager.subscribePublish(serviceId, 'test.topic1');
                subscriptionManager.subscribePublish(serviceId, 'test.topic2');
                subscriptionManager.subscribeRequest(serviceId, 'test.topic3', 5);
                subscriptionManager.subscribeRequest(serviceId, 'test.topic4', 10);

                // Verify initial subscriptions
                expect(subscriptionManager.getSubscribedTopics(serviceId)).toHaveLength(4);

                // Unsubscribe from all
                const result = subscriptionManager.unsubscribe(serviceId);
                expect(result).toBe(true);

                // Verify all subscriptions are removed
                expect(subscriptionManager.getSubscribedTopics(serviceId)).toHaveLength(0);
            });

            /**
             * Tests partial success scenario in unsubscription.
             * Verifies:
             * - Method returns true if at least one unsubscription succeeds
             * - Handles case where some unsubscriptions fail
             * Uses mocking to simulate partial failure
             */
            it('should handle mixed success in unsubscriptions', () => {
                const serviceId = 'test-service';

                // Subscribe to topics
                subscriptionManager.subscribePublish(serviceId, 'test.topic1');
                subscriptionManager.subscribeRequest(serviceId, 'test.topic2', 5);

                // Mock one unsubscribe to fail
                jest.spyOn(subscriptionManager as any, 'unsubscribePublish')
                    .mockReturnValueOnce(false);

                // Unsubscribe from all
                const result = subscriptionManager.unsubscribe(serviceId);

                // Should still return true as at least one unsubscribe succeeded
                expect(result).toBe(true);
            });
        });
    });

    /**
     * Test suite for subscription manager disposal functionality.
     * Tests the cleanup of all subscriptions when the manager is disposed.
     */
    describe('Disposal', () => {
        /**
         * Tests complete cleanup of all subscriptions.
         * Verifies that after disposal:
         * - All PUBLISH subscriptions are removed
         * - All REQUEST subscriptions are removed
         * - Subscriber lists are empty for all topics
         */
        it('should clear all subscriptions', async () => {
            subscriptionManager.subscribePublish('service1', 'topic1');
            subscriptionManager.subscribeRequest('service2', 'topic2', 1);

            await subscriptionManager.dispose();

            expect(subscriptionManager.getPublishSubscribers('topic1')).toEqual([]);
            expect(subscriptionManager.getRequestSubscribers('topic2')).toEqual([]);
        });
    });
});
