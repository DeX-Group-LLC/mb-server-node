import { SubscriptionManager } from '@core/subscription';
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
 * - Topic subscription and unsubscription
 * - Subscriber priority management
 * - Topic and subscriber querying
 * - FIFO ordering within priority levels
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
    afterEach(() => {
        // Clean up subscriptions after each test to ensure isolation
        subscriptionManager.dispose();
    });

    /**
     * Tests for checking subscription status of services to topics
     */
    describe('isSubscribed', () => {
        it('should return true if service is subscribed to topic', () => {
            subscriptionManager.subscribe('service1', 'test.topic');
            expect(subscriptionManager.isSubscribed('service1', 'test.topic')).toBe(true);
        });

        it('should return false if service is not subscribed to topic', () => {
            subscriptionManager.subscribe('service2', 'test.topic');
            expect(subscriptionManager.isSubscribed('service1', 'test.topic')).toBe(false);
        });

        it('should return false if topic does not exist', () => {
            expect(subscriptionManager.isSubscribed('service1', 'nonexistent.topic')).toBe(false);
        });

        it('should handle canonical topic names', () => {
            subscriptionManager.subscribe('service1', 'Test.Topic');
            expect(subscriptionManager.isSubscribed('service1', 'test.topic')).toBe(true);
        });
    });

    /**
     * Tests for subscribing services to topics.
     * Verifies subscription behavior including:
     * - Basic subscription functionality
     * - Priority handling
     * - FIFO ordering
     * - Duplicate subscription handling
     * - Invalid topic handling
     */
    describe('subscribe', () => {
        it('should allow a service to subscribe to a valid topic', () => {
            // Test basic subscription functionality
            const result = subscriptionManager.subscribe('service1', 'baggage.events');
            expect(result).toBe(true);
            expect(subscriptionManager.getSubscribers('baggage.events')).toEqual(['service1']);
        });

        it('should return false if a service subscribes to the same topic twice', () => {
            // Test duplicate subscription handling
            subscriptionManager.subscribe('service1', 'baggage.events');
            const result = subscriptionManager.subscribe('service1', 'baggage.events');
            expect(result).toBe(false);
        });

        it('should return false for an invalid topic name', () => {
            const result = subscriptionManager.subscribe('service1', '/invalid.topic');
            expect(result).toBe(false);
        });

        it('should allow multiple services to subscribe to the same topic (maintaining FIFO order)', () => {
            // Test multiple subscriptions and order preservation
            subscriptionManager.subscribe('service1', 'baggage.events');
            subscriptionManager.subscribe('service2', 'baggage.events');
            const subscribers = subscriptionManager.getSubscribers('baggage.events');
            expect(subscribers).toEqual(['service1', 'service2']); // Order matters - FIFO
        });

        it('should use the canonical topic name for subscriptions', () => {
            // Subscribe using non-canonical name (different case)
            subscriptionManager.subscribe('service1', 'Baggage.Events');

            // Verify we can get subscribers using canonical name
            const subscribers = subscriptionManager.getSubscribers('baggage.events');
            expect(subscribers).toEqual(['service1']);
        });

        it('should maintain priority order of subscribers', () => {
            // Test subscription ordering with different priorities
            // Higher priority (2) should come before lower priority (1) and default priority (0)
            subscriptionManager.subscribe('service1', 'baggage.events', 1);  // Medium priority
            subscriptionManager.subscribe('service2', 'baggage.events', 2);  // High priority
            subscriptionManager.subscribe('service3', 'baggage.events', 0);  // Low priority

            const subscribers = subscriptionManager.getSubscribers('baggage.events');
            expect(subscribers).toEqual(['service2', 'service1', 'service3']);
        });

        it('should maintain subscription order for same priority (FIFO)', () => {
            // Test FIFO ordering when all subscribers have the same priority
            // All subscribers have default priority (0)
            subscriptionManager.subscribe('service1', 'baggage.events');
            subscriptionManager.subscribe('service2', 'baggage.events');
            subscriptionManager.subscribe('service3', 'baggage.events');

            const subscribers = subscriptionManager.getSubscribers('baggage.events');
            expect(subscribers).toEqual(['service1', 'service2', 'service3']);
        });

        it('should maintain priority order with FIFO within same priority', () => {
            // Test ordering with multiple services at same priority levels
            subscriptionManager.subscribe('service1', 'baggage.events', 1);  // First medium priority
            subscriptionManager.subscribe('service2', 'baggage.events', 2);  // First high priority
            subscriptionManager.subscribe('service3', 'baggage.events', 2);  // Second high priority
            subscriptionManager.subscribe('service4', 'baggage.events', 1);  // Second medium priority
            subscriptionManager.subscribe('service5', 'baggage.events', 0);  // Low priority

            const subscribers = subscriptionManager.getSubscribers('baggage.events');
            expect(subscribers).toEqual(['service2', 'service3', 'service1', 'service4', 'service5']); // Priority groups with FIFO within each
        });

        it('should maintain FIFO order for getTopSubscribers with same priority', () => {
            // Test that getTopSubscribers preserves FIFO order for equal priorities
            subscriptionManager.subscribe('service1', 'baggage.events', 2);  // First high priority
            subscriptionManager.subscribe('service2', 'baggage.events', 2);  // Second high priority
            subscriptionManager.subscribe('service3', 'baggage.events', 2);  // Third high priority
            subscriptionManager.subscribe('service4', 'baggage.events', 1);  // Lower priority, shouldn't appear

            const subscribers = subscriptionManager.getTopSubscribers('baggage.events');
            expect(subscribers).toEqual(['service1', 'service2', 'service3']); // FIFO order within top priority
        });

        it('should order subscribers by priority, then FIFO within same priority', () => {
            // Test combined priority and FIFO ordering
            subscriptionManager.subscribe('service1', 'baggage.events', 1);  // First medium priority
            subscriptionManager.subscribe('service2', 'baggage.events', 2);  // High priority
            subscriptionManager.subscribe('service3', 'baggage.events', 1);  // Second medium priority

            const subscribers = subscriptionManager.getSubscribers('baggage.events');
            expect(subscribers).toEqual(['service2', 'service1', 'service3']); // Higher priority first, then FIFO
        });

        it('should maintain FIFO order when no priorities are specified', () => {
            // Test pure FIFO ordering when no priorities are set
            subscriptionManager.subscribe('service1', 'baggage.events');  // First to subscribe
            subscriptionManager.subscribe('service2', 'baggage.events');  // Second to subscribe
            subscriptionManager.subscribe('service3', 'baggage.events');  // Third to subscribe

            const subscribers = subscriptionManager.getSubscribers('baggage.events');
            expect(subscribers).toEqual(['service1', 'service2', 'service3']); // Pure FIFO order
        });

        it('should handle mixed priority and non-priority subscriptions', () => {
            // Test mixing of explicit and default priorities
            subscriptionManager.subscribe('service1', 'baggage.events');      // Default priority (0)
            subscriptionManager.subscribe('service2', 'baggage.events', 2);   // High priority
            subscriptionManager.subscribe('service3', 'baggage.events');      // Default priority (0)

            const subscribers = subscriptionManager.getSubscribers('baggage.events');
            expect(subscribers).toEqual(['service2', 'service1', 'service3']); // Priority first, then FIFO
        });

        it('should update priority and reorder when service resubscribes with different priority', () => {
            // Initial subscription with lower priority
            subscriptionManager.subscribe('service1', 'test.topic', 1);
            subscriptionManager.subscribe('service2', 'test.topic', 1);

            // Update service1's priority to higher
            const result = subscriptionManager.subscribe('service1', 'test.topic', 2);

            expect(result).toBe(true);
            expect(logger.debug).toHaveBeenCalledWith(
                'Service service1 is already subscribed to topic: test.topic with priority: 1, updating to 2'
            );

            // Get subscribers to verify order
            const subscribers = subscriptionManager.getSubscribers('test.topic');
            expect(subscribers).toEqual(['service1', 'service2']);

            // Verify the priorities through getSubscribedInfo
            const info = subscriptionManager.getSubscribedInfo('service1');
            expect(info).toEqual([{ topic: 'test.topic', priority: 2 }]);
        });
    });

    /**
     * Tests for unsubscribing services from topics.
     * Verifies unsubscription behavior including:
     * - Basic unsubscription functionality
     * - Error handling for non-existent subscriptions
     * - Canonical topic name handling
     */
    describe('unsubscribe', () => {
        it('should allow a service to unsubscribe from a topic', () => {
            // Test basic unsubscribe functionality
            subscriptionManager.subscribe('service1', 'baggage.events');
            const result = subscriptionManager.unsubscribe('service1', 'baggage.events');
            expect(result).toBe(true);
            expect(subscriptionManager.getSubscribers('baggage.events')).toEqual([]);
        });

        it('should return false if a service tries to unsubscribe from a topic it is not subscribed to', () => {
            // First create the topic by subscribing a different service
            subscriptionManager.subscribe('service2', 'baggage.events');

            // Test unsubscribe when service is not subscribed
            const result = subscriptionManager.unsubscribe('service1', 'baggage.events');
            expect(result).toBe(false);

            // Verify warning was logged
            expect(logger.warn).toHaveBeenCalledWith(
                'Service service1 is not subscribed to topic: baggage.events'
            );
        });

        it('should return false if a service tries to unsubscribe from a non-existent topic', () => {
            // Test unsubscribe with non-existent topic
            const result = subscriptionManager.unsubscribe('service1', 'nonexistent.topic');
            expect(result).toBe(false);
        });

        it('should handle unsubscription using the canonical topic name', () => {
            // Test that unsubscribe works with different case variations of the same topic
            subscriptionManager.subscribe('service1', 'Baggage.Events');
            const result = subscriptionManager.unsubscribe('service1', 'baggage.events');
            expect(result).toBe(true);
            expect(subscriptionManager.getSubscribers('baggage.events')).toEqual([]);
        });

        it('should unsubscribe from a specific topic', () => {
            // Subscribe first
            subscriptionManager.subscribe('service1', 'test.topic');

            // Unsubscribe
            const result = subscriptionManager.unsubscribe('service1', 'test.topic');

            // Verify unsubscription
            expect(result).toBe(true);
            expect(subscriptionManager.getSubscribers('test.topic')).not.toContain('service1');
        });

        it('should unsubscribe from all topics when no topic is specified', () => {
            // Subscribe to multiple topics
            subscriptionManager.subscribe('service1', 'test.topic1');
            subscriptionManager.subscribe('service1', 'test.topic2');
            subscriptionManager.subscribe('service1', 'test.topic3');

            // Verify initial subscriptions
            expect(subscriptionManager.getSubscribedTopics('service1')).toEqual(
                expect.arrayContaining(['test.topic1', 'test.topic2', 'test.topic3'])
            );

            // Unsubscribe from all topics
            const result = subscriptionManager.unsubscribe('service1');

            // Verify all subscriptions were removed
            expect(result).toBe(true);
            expect(subscriptionManager.getSubscribedTopics('service1')).toHaveLength(0);
        });
    });

    /**
     * Tests for retrieving subscribers for a topic.
     * Verifies subscriber retrieval behavior including:
     * - Basic subscriber retrieval
     * - Empty topic handling
     * - Priority and FIFO ordering
     */
    describe('getSubscribers', () => {
        it('should return empty array if no service is subscribed to a topic', () => {
            // Test getting subscribers for topic with no subscriptions
            const subscribers = subscriptionManager.getSubscribers('baggage.events');
            expect(subscribers).toEqual([]);
        });

        it('should return an array of subscribers for a valid topic', () => {
            // Test getting multiple subscribers
            subscriptionManager.subscribe('service1', 'baggage.events');
            subscriptionManager.subscribe('service2', 'baggage.events');
            const subscribers = subscriptionManager.getSubscribers('baggage.events');
            expect(subscribers).toEqual(['service1', 'service2']);
        });

        it('should return empty array for an invalid topic name', () => {
            const subscribers = subscriptionManager.getSubscribers('/invalid.topic');
            expect(subscribers).toEqual([]);
        });

        it('should use the canonical topic name to get subscribers', () => {
            // Test that subscribers can be retrieved using different case variations
            subscriptionManager.subscribe('service1', 'Baggage.Events');
            const subscribers = subscriptionManager.getSubscribers('baggage.events');
            expect(subscribers).toEqual(['service1']);
        });

        it('should maintain FIFO order and not sort alphabetically', () => {
            // Test that order is preserved and not alphabetically sorted
            // Using service names that would be different if sorted alphabetically
            subscriptionManager.subscribe('serviceZ', 'topic1');
            subscriptionManager.subscribe('serviceA', 'topic1');
            subscriptionManager.subscribe('serviceM', 'topic1');

            const subscribers = subscriptionManager.getSubscribers('topic1');
            expect(subscribers).toEqual(['serviceZ', 'serviceA', 'serviceM']); // FIFO order, not alphabetical
        });

        it('should maintain priority and FIFO order, not alphabetical order', () => {
            // Using service names that would be different if sorted alphabetically
            subscriptionManager.subscribe('serviceZ', 'topic1', 1);
            subscriptionManager.subscribe('serviceA', 'topic1', 2);
            subscriptionManager.subscribe('serviceM', 'topic1', 1);

            const subscribers = subscriptionManager.getSubscribers('topic1');
            expect(subscribers).toEqual(['serviceA', 'serviceZ', 'serviceM']); // Priority then FIFO, not alphabetical
        });
    });

    /**
     * Tests for retrieving highest priority subscribers for a topic.
     * Verifies behavior including:
     * - Empty topic handling
     * - Priority-based filtering
     * - FIFO ordering within priority levels
     */
    describe('getTopSubscribers', () => {
        it('should return empty array if no service is subscribed to a topic', () => {
            // Test getting top subscribers for topic with no subscriptions
            const subscribers = subscriptionManager.getTopSubscribers('baggage.events');
            expect(subscribers).toEqual([]);
        });

        it('should return all subscribers when they all have the same priority', () => {
            // Test when all subscribers have the same priority
            subscriptionManager.subscribe('service1', 'baggage.events', 2);  // All have priority 2
            subscriptionManager.subscribe('service2', 'baggage.events', 2);
            subscriptionManager.subscribe('service3', 'baggage.events', 2);

            const subscribers = subscriptionManager.getTopSubscribers('baggage.events');
            expect(subscribers).toEqual(['service1', 'service2', 'service3']); // All subscribers returned in FIFO order
        });

        it('should return only the highest priority subscribers', () => {
            // Test that only subscribers with highest priority are returned
            subscriptionManager.subscribe('service1', 'baggage.events', 1);  // Medium priority
            subscriptionManager.subscribe('service2', 'baggage.events', 2);  // High priority
            subscriptionManager.subscribe('service3', 'baggage.events', 2);  // High priority
            subscriptionManager.subscribe('service4', 'baggage.events', 0);  // Low priority

            const subscribers = subscriptionManager.getTopSubscribers('baggage.events');
            expect(subscribers).toEqual(['service2', 'service3']); // Only priority 2 subscribers
        });

        it('should maintain FIFO order and not sort alphabetically for same priority', () => {
            // Test that order is preserved within same priority level
            subscriptionManager.subscribe('serviceZ', 'topic1', 2);  // First high priority
            subscriptionManager.subscribe('serviceA', 'topic1', 2);  // Second high priority
            subscriptionManager.subscribe('serviceM', 'topic1', 2);  // Third high priority
            subscriptionManager.subscribe('serviceB', 'topic1', 1);  // Lower priority, shouldn't appear

            const subscribers = subscriptionManager.getTopSubscribers('topic1');
            expect(subscribers).toEqual(['serviceZ', 'serviceA', 'serviceM']); // FIFO order within top priority
        });

        it('should maintain priority and FIFO order, not alphabetical order', () => {
            // Using service names that would be different if sorted alphabetically
            subscriptionManager.subscribe('serviceZ', 'topic1', 1);
            subscriptionManager.subscribe('serviceA', 'topic1', 2);
            subscriptionManager.subscribe('serviceM', 'topic1', 2);

            const subscribers = subscriptionManager.getTopSubscribers('topic1');
            expect(subscribers).toEqual(['serviceA', 'serviceM']); // Only highest priority, maintaining FIFO
        });
    });

    /**
     * Tests for retrieving topics a service is subscribed to.
     * Verifies behavior including:
     * - Empty subscription handling
     * - Alphabetical ordering of topics
     * - Service-specific topic filtering
     */
    describe('getSubscribedTopics', () => {
        it('should return an empty array if the service is not subscribed to any topics', () => {
            // Test getting topics for service with no subscriptions
            const topics = subscriptionManager.getSubscribedTopics('service1');
            expect(topics).toEqual([]);
        });

        it('should return an array of topics in alphabetical order', () => {
            // Test that topics are returned in alphabetical order
            subscriptionManager.subscribe('service1', 'zebra.events');    // Would be last alphabetically
            subscriptionManager.subscribe('service1', 'alpha.updates');   // Would be first alphabetically
            subscriptionManager.subscribe('service1', 'baggage.events');  // Would be in middle alphabetically

            const topics = subscriptionManager.getSubscribedTopics('service1');
            expect(topics).toEqual(['alpha.updates', 'baggage.events', 'zebra.events']); // Alphabetical order
        });

        it('should only return topics subscribed by the specified service', () => {
            // Setup subscriptions for multiple services
            subscriptionManager.subscribe('service1', 'alpha.updates');
            subscriptionManager.subscribe('service1', 'baggage.events');
            subscriptionManager.subscribe('service2', 'zebra.events');
            subscriptionManager.subscribe('service2', 'baggage.events');
            subscriptionManager.subscribe('service3', 'delta.events');

            // Check service1's topics
            const service1Topics = subscriptionManager.getSubscribedTopics('service1');
            expect(service1Topics).toEqual(['alpha.updates', 'baggage.events']);

            // Check service2's topics
            const service2Topics = subscriptionManager.getSubscribedTopics('service2');
            expect(service2Topics).toEqual(['baggage.events', 'zebra.events']);

            // Check service3's topics
            const service3Topics = subscriptionManager.getSubscribedTopics('service3');
            expect(service3Topics).toEqual(['delta.events']);
        });
    });

    /**
     * Tests for retrieving all subscribed topics across all services.
     * Verifies behavior including:
     * - Empty subscription handling
     * - Unique topic list generation
     * - Alphabetical ordering
     */
    describe('getAllSubscribedTopics', () => {
        it('should return an empty array if no topics are subscribed to', () => {
            // Test getting all topics when none exist
            const topics = subscriptionManager.getAllSubscribedTopics();
            expect(topics).toEqual([]);
        });

        it('should return an array of unique subscribed topics in alphabetical order', () => {
            // Test that duplicate topics are removed and order is alphabetical
            subscriptionManager.subscribe('service1', 'zebra.events');     // Would be last alphabetically
            subscriptionManager.subscribe('service2', 'alpha.updates');    // Would be first alphabetically
            subscriptionManager.subscribe('service3', 'baggage.events');   // Would be in middle alphabetically
            subscriptionManager.subscribe('service4', 'alpha.updates');    // Duplicate topic, should not appear twice

            const topics = subscriptionManager.getAllSubscribedTopics();
            expect(topics).toEqual(['alpha.updates', 'baggage.events', 'zebra.events']); // Unique and alphabetical
        });
    });

    /**
     * Tests for retrieving detailed subscription information for a service.
     * Verifies behavior including:
     * - Empty subscription handling
     * - Topic and priority information retrieval
     * - Alphabetical ordering
     */
    describe('getSubscribedInfo', () => {
        it('should return empty array for service with no subscriptions', () => {
            expect(subscriptionManager.getSubscribedInfo('service1')).toEqual([]);
        });

        it('should return topic and priority information for all subscribed topics', () => {
            subscriptionManager.subscribe('service1', 'topic1', 2);
            subscriptionManager.subscribe('service1', 'topic2', 1);
            subscriptionManager.subscribe('service2', 'topic3', 3); // Different service

            const info = subscriptionManager.getSubscribedInfo('service1');
            expect(info).toEqual([
                { topic: 'topic1', priority: 2 },
                { topic: 'topic2', priority: 1 }
            ]);
        });

        it('should return topics in alphabetical order', () => {
            subscriptionManager.subscribe('service1', 'zebra.topic', 1);
            subscriptionManager.subscribe('service1', 'alpha.topic', 2);
            subscriptionManager.subscribe('service1', 'beta.topic', 3);

            const info = subscriptionManager.getSubscribedInfo('service1');
            expect(info).toEqual([
                { topic: 'alpha.topic', priority: 2 },
                { topic: 'beta.topic', priority: 3 },
                { topic: 'zebra.topic', priority: 1 }
            ]);
        });
    });

    /**
     * Tests for retrieving complete subscription information for all topics.
     * Verifies behavior including:
     * - Empty subscription handling
     * - Complete subscriber information retrieval
     * - Priority ordering
     */
    describe('getAllSubscribedTopicWithSubscribers', () => {
        it('should return empty object when no subscriptions exist', () => {
            expect(subscriptionManager.getAllSubscribedTopicWithSubscribers()).toEqual({});
        });

        it('should return all topics with their complete subscriber information', () => {
            subscriptionManager.subscribe('service1', 'topic1', 2);
            subscriptionManager.subscribe('service2', 'topic1', 1);
            subscriptionManager.subscribe('service3', 'topic2', 3);

            const result = subscriptionManager.getAllSubscribedTopicWithSubscribers();
            expect(result).toEqual({
                'topic1': [
                    { serviceId: 'service1', priority: 2 },
                    { serviceId: 'service2', priority: 1 }
                ],
                'topic2': [
                    { serviceId: 'service3', priority: 3 }
                ]
            });
        });

        it('should maintain priority order in subscriber arrays', () => {
            subscriptionManager.subscribe('service1', 'topic1', 1);
            subscriptionManager.subscribe('service2', 'topic1', 3);
            subscriptionManager.subscribe('service3', 'topic1', 2);

            const result = subscriptionManager.getAllSubscribedTopicWithSubscribers();
            expect(result['topic1']).toEqual([
                { serviceId: 'service2', priority: 3 },
                { serviceId: 'service3', priority: 2 },
                { serviceId: 'service1', priority: 1 }
            ]);
        });
    });
});