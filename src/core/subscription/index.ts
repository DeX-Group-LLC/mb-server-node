import { TopicUtils } from '@core/utils';
import { ActionType } from '@core/types';
import { SetupLogger } from '@utils/logger';
import { TopicTrie, SetLeafCollection, SortedSetLeafCollection } from './trie';

const logger = SetupLogger('SubscriptionManager');

/**
 * Represents a subscription to a topic with an action type.
 */
export interface Subscription {
    /** The type of action (publish or request) */
    action: ActionType;
    /** The topic pattern subscribed to */
    topic: string;
    /** The priority of the subscription (only present for request subscriptions) */
    priority?: number;
}

/**
 * Represents a subscriber with a service ID and priority.
 */
interface Subscriber {
    /** The unique identifier of the service */
    serviceId: string;
    /** The priority of the subscriber (higher value = higher priority) */
    priority: number;
}

export interface TopicSubscriptions {
    /** The type of action (publish or request) */
    action: ActionType;
    /** The topic pattern subscribed to */
    topic: string;
    /** The subscribers for the topic */
    subscribers: {
        /** The unique identifier of the service */
        serviceId: string;
        /** The priority of the subscriber (higher value = higher priority) */
        priority?: number;
    }[];
}

/**
 * Manages service subscriptions to topics, supporting both PUBLISH and REQUEST patterns.
 * - PUBLISH subscriptions are unordered and unique per topic
 * - REQUEST subscriptions are ordered by priority (higher priority first) and unique per topic
 */
export class SubscriptionManager {
    /**
     * Trie for storing PUBLISH subscriptions.
     * Uses SetLeafCollection for unordered, unique storage.
     * @private
     */
    private publishTrie: TopicTrie<string, SetLeafCollection<string>>;

    /**
     * Trie for storing REQUEST subscriptions.
     * Uses SortedSetLeafCollection for priority-ordered, unique storage.
     * @private
     */
    private requestTrie: TopicTrie<Subscriber, SortedSetLeafCollection<Subscriber, 'priority'>>;

    constructor() {
        // Initialize PUBLISH trie with SetLeafCollection
        this.publishTrie = new TopicTrie(() => new SetLeafCollection());

        // Initialize REQUEST trie with SortedSetLeafCollection
        // Sort by priority (higher first) and compare subscribers by serviceId
        this.requestTrie = new TopicTrie(() =>
            new SortedSetLeafCollection('priority', (a, b) => a.serviceId === b.serviceId)
        );
    }

    /**
     * Subscribes a service to a topic for PUBLISH events.
     *
     * @param serviceId The ID of the service subscribing.
     * @param topic The topic to subscribe to.
     * @returns True if the subscription was successful, false otherwise.
     */
    subscribePublish(serviceId: string, topic: string): boolean {
        const canonicalTopic = TopicUtils.getCanonical(topic);
        if (!TopicUtils.isValidSubscription(canonicalTopic)) {
            logger.warn(`Invalid topic name for PUBLISH subscription: ${topic}`);
            return false;
        }

        this.publishTrie.set(canonicalTopic, serviceId);

        logger.info(`Service subscribed to PUBLISH topic: ${canonicalTopic}`, { serviceId, topic: canonicalTopic });
        return true;
    }

    /**
     * Subscribes a service to a topic for REQUEST events with a priority.
     *
     * @param serviceId The ID of the service subscribing.
     * @param topic The topic to subscribe to.
     * @param priority The priority of the subscriber (higher value = higher priority).
     * @returns True if the subscription was successful, false otherwise.
     */
    subscribeRequest(serviceId: string, topic: string, priority: number = 0): boolean {
        const canonicalTopic = TopicUtils.getCanonical(topic);
        if (!TopicUtils.isValidSubscription(canonicalTopic)) {
            logger.warn(`Invalid topic name for REQUEST subscription: ${topic}`);
            return false;
        }

        this.requestTrie.set(canonicalTopic, { serviceId, priority });

        logger.info(`Service subscribed to REQUEST topic: ${canonicalTopic} with priority: ${priority}`, { serviceId, topic: canonicalTopic, priority });
        return true;
    }

    /**
     * Unsubscribes a service from a PUBLISH topic.
     *
     * @param serviceId The ID of the service unsubscribing.
     * @param topic The topic to unsubscribe from.
     * @returns True if the unsubscription was successful, false otherwise.
     */
    unsubscribePublish(serviceId: string, topic: string): boolean {
        const canonicalTopic = TopicUtils.getCanonical(topic);
        if (!TopicUtils.isValidSubscription(canonicalTopic)) {
            logger.warn(`Invalid topic name for PUBLISH unsubscription: ${topic}`);
            return false;
        }

        const success = this.publishTrie.delete(canonicalTopic, serviceId);
        if (success) {
            logger.info(`Service unsubscribed from PUBLISH topic: ${canonicalTopic}`, { serviceId, topic: canonicalTopic });
        }
        return success;
    }

    /**
     * Unsubscribes a service from a REQUEST topic.
     *
     * @param serviceId The ID of the service unsubscribing.
     * @param topic The topic to unsubscribe from.
     * @returns True if the unsubscription was successful, false otherwise.
     */
    unsubscribeRequest(serviceId: string, topic: string): boolean {
        const canonicalTopic = TopicUtils.getCanonical(topic);
        if (!TopicUtils.isValidSubscription(canonicalTopic)) {
            logger.warn(`Invalid topic name for REQUEST unsubscription: ${topic}`);
            return false;
        }

        // Create a dummy subscriber with the serviceId to match against
        const success = this.requestTrie.delete(canonicalTopic, { serviceId, priority: 0 });
        if (success) {
            logger.info(`Service unsubscribed from REQUEST topic: ${canonicalTopic}`, { serviceId, topic: canonicalTopic });
        }
        return success;
    }

    /**
     * Gets all subscribers for a PUBLISH topic.
     *
     * @param topic The topic to get subscribers for.
     * @returns An array of service IDs subscribed to the topic.
     */
    getPublishSubscribers(topic: string): string[] {
        const canonicalTopic = TopicUtils.getCanonical(topic);
        return Array.from(this.publishTrie.get(canonicalTopic));
    }

    /**
     * Gets all subscribers for a REQUEST topic, ordered by priority (highest first).
     *
     * @param topic The topic to get subscribers for.
     * @returns An array of service IDs subscribed to the topic, ordered by priority.
     */
    getRequestSubscribers(topic: string): string[] {
        const canonicalTopic = TopicUtils.getCanonical(topic);
        return Array.from(this.requestTrie.get(canonicalTopic)).map(sub => sub.serviceId);
    }

    /**
     * Gets the highest priority subscribers for a REQUEST topic.
     *
     * @param topic The topic to get subscribers for.
     * @returns An array of service IDs with the highest priority for the topic.
     */
    getTopRequestSubscribers(topic: string): string[] {
        const canonicalTopic = TopicUtils.getCanonical(topic);
        const subscribers = Array.from(this.requestTrie.get(canonicalTopic));
        if (subscribers.length === 0) return [];

        // Get all subscribers with the highest priority
        const topPriority = subscribers[0].priority;
        return subscribers
            .filter(sub => sub.priority === topPriority)
            .map(sub => sub.serviceId);
    }

    /**
     * Gets all topics that a service is subscribed to, for both PUBLISH and REQUEST events.
     *
     * @param serviceId The ID of the service to get subscribed topics for.
     * @returns An array of subscriptions, sorted by topic name and then action type.
     */
    getSubscribedTopics(serviceId: string): Subscription[] {
        const subscriptions: Subscription[] = [];

        // Get PUBLISH subscriptions
        for (const [topic, subscriber] of this.publishTrie.entries()) {
            if (subscriber === serviceId) {
                subscriptions.push({
                    action: ActionType.PUBLISH,
                    topic
                });
            }
        }

        // Get REQUEST subscriptions
        for (const [topic, subscriber] of this.requestTrie.entries()) {
            if (subscriber.serviceId === serviceId) {
                subscriptions.push({
                    action: ActionType.REQUEST,
                    topic,
                    priority: subscriber.priority
                });
            }
        }

        // Sort by topic first, then action type
        return subscriptions.sort((a, b) => {
            const topicCompare = a.topic.localeCompare(b.topic);
            if (topicCompare !== 0) return topicCompare;
            return a.action.localeCompare(b.action);
        });
    }

    /**
     * Gets all topics, for both PUBLISH and REQUEST events.
     *
     * @returns An array of subscriptions, sorted by topic name and then action type.
     */
    getAllSubscribedTopics(): TopicSubscriptions[] {
        const subscriptions: TopicSubscriptions[] = [];
        const publishTopics = new Map<string, TopicSubscriptions>();
        const requestTopics = new Map<string, TopicSubscriptions>();
        // Get PUBLISH subscriptions
        for (const [topic, subscriber] of this.publishTrie.entries()) {
            const existingTopic = publishTopics.get(topic);
            if (existingTopic) {
                existingTopic.subscribers.push({ serviceId: subscriber });
            } else {
                publishTopics.set(topic, {
                    action: ActionType.PUBLISH,
                    topic,
                    subscribers: [{ serviceId: subscriber }]
                });
            }
        }

        // Get REQUEST subscriptions
        for (const [topic, subscriber] of this.requestTrie.entries()) {
            const existingTopic = requestTopics.get(topic);
            if (existingTopic) {
                existingTopic.subscribers.push({ serviceId: subscriber.serviceId, priority: subscriber.priority });
            } else {
                requestTopics.set(topic, {
                    action: ActionType.REQUEST,
                    topic,
                    subscribers: [{ serviceId: subscriber.serviceId, priority: subscriber.priority }]
                });
            }
        }

        // Combine publish and request topics
        subscriptions.push(...publishTopics.values());
        subscriptions.push(...requestTopics.values());

        // Sort by topic first, then action type
        return subscriptions.sort((a, b) => {
            const topicCompare = a.topic.localeCompare(b.topic);
            if (topicCompare !== 0) return topicCompare;
            return a.action.localeCompare(b.action);
        });
    }

    /**
     * Unsubscribes a service from all topics.
     *
     * @param serviceId The ID of the service to unsubscribe.
     * @returns True if any unsubscriptions were successful, false if the service had no subscriptions.
     */
    unsubscribe(serviceId: string): boolean {
        const subscriptions = this.getSubscribedTopics(serviceId);
        if (subscriptions.length === 0) return false;

        let success = false;
        for (const subscription of subscriptions) {
            const unsubscribed = subscription.action === ActionType.PUBLISH
                ? this.unsubscribePublish(serviceId, subscription.topic)
                : this.unsubscribeRequest(serviceId, subscription.topic);
            success = success || unsubscribed;
        }

        if (success) {
            logger.info(`Service unsubscribed from all topics`, { serviceId });
        }
        return success;
    }

    /**
     * Disposes of all subscriptions.
     */
    async dispose(): Promise<void> {
        this.publishTrie.clear();
        this.requestTrie.clear();
        logger.info('Cleared all subscriptions');
    }
}
