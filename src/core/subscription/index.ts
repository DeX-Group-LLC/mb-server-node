import { TopicUtils } from '@core/utils';
import { SetupLogger } from '@utils/logger';

const logger = SetupLogger('SubscriptionManager');

interface Subscriber {
    serviceId: string;
    priority: number;
}

export class SubscriptionManager {
    private subscriptions: Map<string, Subscriber[]>;

    constructor() {
        this.subscriptions = new Map();
    }

    /**
     * Subscribes a service to a topic with an optional priority.
     *
     * @param serviceId The ID of the service subscribing.
     * @param topic The topic to subscribe to.
     * @param priority The priority of the subscriber (higher value = higher priority).
     * @returns True if the subscription was successful, false otherwise.
     */
    subscribe(serviceId: string, topic: string, priority: number = 0): boolean {
        const canonicalTopic = TopicUtils.getCanonical(topic);
        if (!TopicUtils.isValid(canonicalTopic)) {
            logger.warn(`Invalid topic name for subscription: ${topic}`);
            return false;
        }

        if (!this.subscriptions.has(canonicalTopic)) {
            this.subscriptions.set(canonicalTopic, []);
        }

        const subscribers = this.subscriptions.get(canonicalTopic)!;

        // Check if already subscribed
        if (subscribers.some(sub => sub.serviceId === serviceId)) {
            logger.warn(`Service ${serviceId} is already subscribed to topic: ${canonicalTopic}`);
            return false;
        }

        // Insert the new subscriber, maintaining priority order
        const newSubscriber = { serviceId, priority };
        let i = 0;
        // Iterate while priority is greater OR equal and we haven't reached the end
        while (i < subscribers.length && subscribers[i].priority >= priority) {
            i++;
        }
        subscribers.splice(i, 0, newSubscriber);

        logger.info(`Service ${serviceId} subscribed to topic: ${canonicalTopic} with priority ${priority}`);
        return true;
    }

    /**
     * Unsubscribes a service from a topic.
     *
     * @param serviceId The ID of the service unsubscribing.
     * @param topic The topic to unsubscribe from. If not provided, all subscriptions for the service will be removed.
     * @returns True if the unsubscription was successful, false otherwise.
     */
    unsubscribe(serviceId: string, topic?: string): boolean {
        if (topic != null) {
            const canonicalTopic = TopicUtils.getCanonical(topic);
            const subscribers = this.subscriptions.get(canonicalTopic);

            if (!subscribers) {
                logger.warn(`Cannot unsubscribe from a topic that does not exist: ${canonicalTopic}`);
                return false;
            }

            const index = subscribers.findIndex(sub => sub.serviceId === serviceId);
            if (index === -1) {
                logger.warn(`Service ${serviceId} is not subscribed to topic: ${canonicalTopic}`);
                return false;
            }

            subscribers.splice(index, 1);
            logger.info(`Service ${serviceId} unsubscribed from topic: ${canonicalTopic}`);

            // Clean up empty arrays
            if (subscribers.length === 0) {
                this.subscriptions.delete(canonicalTopic);
            }

            return true;
        } else {
            // Unsubscribe from all topics
            for (const topic of this.getSubscribedTopics(serviceId)) {
                this.unsubscribe(serviceId, topic);
            }
            return true;
        }
    }

    /**
     * Gets the ordered list of subscribers for a given topic.
     *
     * @param topic The topic to get subscribers for.
     * @returns An array of service IDs subscribed to the topic, ordered by priority (highest priority first),
     *          or an empty array if the topic doesn't exist.
     */
    getSubscribers(topic: string): string[] {
        const canonicalTopic = TopicUtils.getCanonical(topic);
        const subscribers = this.subscriptions.get(canonicalTopic);
        return subscribers ? subscribers.map(sub => sub.serviceId) : [];
    }

    /**
     * Gets the highest priority subscriber(s) for a given topic.
     *
     * @param topic The topic to get subscribers for.
     * @returns The service ID of the highest priority subscriber(s), or an empty array if the topic doesn't exist.
     */
    getTopSubscribers(topic: string): string[] {
        const canonicalTopic = TopicUtils.getCanonical(topic);
        const subscribers = this.subscriptions.get(canonicalTopic);
        if (!subscribers) return [];

        // Filter for the highest priority subscriber
        const findIndex = subscribers.findIndex(sub => sub.priority < subscribers[0].priority);
        return (findIndex >= 0 ? subscribers.slice(0, findIndex) : subscribers).map(sub => sub.serviceId);
    }

    /**
     * Gets the set of topics that a service is subscribed to.
     *
     * @param serviceId The ID of the service to get subscribed topics for.
     * @returns An array of topic names that the service is subscribed to.
     */
    getSubscribedTopics(serviceId: string): string[] {
        const subscribedTopics: string[] = [];
        for (const [topic, subscribers] of this.subscriptions) {
            if (subscribers.some(sub => sub.serviceId === serviceId)) {
                subscribedTopics.push(topic);
            }
        }
        return subscribedTopics.sort(); // Sort alphabetically
    }

    /**
     * Gets all the unique topics that have at least one subscriber.
     *
     * @returns An array of unique topic names that have subscribers.
     */
    getAllSubscribedTopics(): string[] {
        return Array.from(this.subscriptions.keys()).sort();
    }

    /**
     * Disposes of all subscriptions.
     */
    async dispose(): Promise<void> {
        this.subscriptions.clear();
        logger.info('Cleared all subscriptions');
    }
}
