/**
 * Request-Response Pattern Example for EMQX Edge
 *
 * This example demonstrates implementing the request-response pattern
 * using MQTT 5.0 features (Response Topic and Correlation Data).
 *
 * Usage:
 *   npx ts-node examples/request-response.ts
 *
 * Prerequisites:
 *   - EMQX Edge running (docker-compose up -d)
 *   - npm install mqtt uuid
 */

import * as mqtt from 'mqtt';
import { v4 as uuid } from 'uuid';

/** Request options */
interface RequestOptions {
    /** Request timeout in milliseconds */
    timeout?: number;
    /** Quality of Service level */
    qos?: 0 | 1 | 2;
}

/** Response wrapper */
interface Response<T> {
    /** Response data */
    data: T;
    /** Correlation ID */
    correlationId: string;
    /** Response timestamp */
    timestamp: string;
}

/**
 * MQTT Request-Response Client
 *
 * Provides a request-response pattern over MQTT 5.0.
 */
class MqttRequestClient {
    /** MQTT client instance */
    private client: mqtt.MqttClient;

    /** Client identifier */
    private clientId: string;

    /** Pending request handlers */
    private pendingRequests: Map<string, {
        resolve: (value: any) => void;
        reject: (reason: any) => void;
        timer: NodeJS.Timeout;
    }> = new Map();

    /**
     * Creates a new request-response client.
     *
     * @param brokerUrl - MQTT broker URL
     * @param username - Authentication username
     * @param password - Authentication password
     */
    constructor(brokerUrl: string, username: string, password: string) {
        this.clientId = `req-client-${Date.now()}`;

        this.client = mqtt.connect(brokerUrl, {
            username,
            password,
            clientId: this.clientId,
            clean: true,
            reconnectPeriod: 1000,
            protocolVersion: 5 // Enable MQTT 5.0 features
        });

        this.setupMessageHandler();
    }

    /**
     * Waits for client to connect.
     *
     * @returns Promise that resolves when connected
     */
    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client.on('connect', () => {
                console.log(`[${this.clientId}] Connected`);

                // Subscribe to response topic
                const responseTopic = `response/${this.clientId}/#`;
                this.client.subscribe(responseTopic, { qos: 1 }, (err: Error | null) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log(`[${this.clientId}] Subscribed to: ${responseTopic}`);
                        resolve();
                    }
                });
            });

            this.client.on('error', reject);
        });
    }

    /**
     * Sets up the message handler for responses.
     */
    private setupMessageHandler(): void {
        this.client.on('message', (topic: string, payload: Buffer, packet: mqtt.IPublishPacket) => {
            // Extract correlation ID from topic or properties
            const correlationId = packet.properties?.correlationData?.toString()
                || topic.split('/').pop();

            const pending = this.pendingRequests.get(correlationId || '');
            if (!pending) {
                console.log(`[${this.clientId}] Received message for unknown request:`, topic);
                return;
            }

            // Clear timeout and remove from pending
            clearTimeout(pending.timer);
            this.pendingRequests.delete(correlationId!);

            try {
                const response: Response<any> = {
                    data: JSON.parse(payload.toString()),
                    correlationId: correlationId!,
                    timestamp: new Date().toISOString()
                };
                pending.resolve(response);
            } catch (error) {
                pending.reject(error);
            }
        });
    }

    /**
     * Sends a request and waits for response.
     *
     * @param topic - Request topic (without 'request/' prefix)
     * @param payload - Request payload
     * @param options - Request options
     * @returns Response promise
     */
    async request<T = any>(
        topic: string,
        payload: any,
        options: RequestOptions = {}
    ): Promise<Response<T>> {
        const { timeout = 5000, qos = 1 } = options;
        const correlationId = uuid();
        const responseTopic = `response/${this.clientId}/${correlationId}`;

        return new Promise((resolve, reject) => {
            // Set up timeout
            const timer = setTimeout(() => {
                this.pendingRequests.delete(correlationId);
                reject(new Error(`Request timeout: ${topic}`));
            }, timeout);

            // Store pending request
            this.pendingRequests.set(correlationId, { resolve, reject, timer });

            // Send request with MQTT 5.0 properties
            this.client.publish(
                `request/${topic}`,
                JSON.stringify(payload),
                {
                    qos,
                    properties: {
                        responseTopic,
                        correlationData: Buffer.from(correlationId),
                        messageExpiryInterval: Math.ceil(timeout / 1000),
                        userProperties: { version: '1.0.0' }
                    }
                }
            );

            console.log(`[${this.clientId}] Sent request to: request/${topic}`);
        });
    }

    /**
     * Disconnects the client.
     */
    disconnect(): void {
        // Clear all pending requests
        for (const [, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(new Error('Client disconnected'));
        }
        this.pendingRequests.clear();

        this.client.end();
        console.log(`[${this.clientId}] Disconnected`);
    }
}

/**
 * MQTT Request Handler Service
 *
 * Handles incoming requests and sends responses.
 */
class MqttRequestHandler {
    /** MQTT client instance */
    private client: mqtt.MqttClient;

    /** Service identifier */
    private serviceId: string;

    /** Request handlers by action */
    private handlers: Map<string, (payload: any) => Promise<any>> = new Map();

    /**
     * Creates a new request handler service.
     *
     * @param brokerUrl - MQTT broker URL
     * @param username - Authentication username
     * @param password - Authentication password
     * @param serviceName - Service name for topic subscription
     */
    constructor(
        brokerUrl: string,
        username: string,
        password: string,
        private serviceName: string
    ) {
        this.serviceId = `${serviceName}-handler-${Date.now()}`;

        this.client = mqtt.connect(brokerUrl, {
            username,
            password,
            clientId: this.serviceId,
            clean: true,
            reconnectPeriod: 1000,
            protocolVersion: 5
        });

        this.setupMessageHandler();
    }

    /**
     * Starts the request handler.
     *
     * @returns Promise that resolves when ready
     */
    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client.on('connect', () => {
                console.log(`[${this.serviceId}] Connected`);

                // Subscribe to service requests
                const requestTopic = `request/${this.serviceName}/#`;
                this.client.subscribe(requestTopic, { qos: 1 }, (err: Error | null) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log(`[${this.serviceId}] Listening on: ${requestTopic}`);
                        resolve();
                    }
                });
            });

            this.client.on('error', reject);
        });
    }

    /**
     * Registers a request handler for an action.
     *
     * @param action - Action name
     * @param handler - Handler function
     */
    handle(action: string, handler: (payload: any) => Promise<any>): void {
        this.handlers.set(action, handler);
        console.log(`[${this.serviceId}] Registered handler for: ${action}`);
    }

    /**
     * Sets up the message handler for incoming requests.
     */
    private setupMessageHandler(): void {
        this.client.on('message', async (topic: string, payload: Buffer, packet: mqtt.IPublishPacket) => {
            // Extract action from topic: request/{serviceName}/{action}
            const parts = topic.split('/');
            const action = parts[parts.length - 1];

            const handler = this.handlers.get(action);
            if (!handler) {
                console.warn(`[${this.serviceId}] No handler for action: ${action}`);
                return;
            }

            console.log(`[${this.serviceId}] Received request: ${action}`);

            try {
                const requestPayload = JSON.parse(payload.toString());
                const result = await handler(requestPayload);

                // Send response if response topic is provided
                const responseTopic = packet.properties?.responseTopic;
                if (responseTopic) {
                    this.client.publish(
                        responseTopic,
                        JSON.stringify(result),
                        {
                            qos: 1,
                            properties: {
                                correlationData: packet.properties?.correlationData,
                                userProperties: { version: '1.0.0' }
                            }
                        }
                    );
                    console.log(`[${this.serviceId}] Sent response to: ${responseTopic}`);
                }
            } catch (error) {
                console.error(`[${this.serviceId}] Handler error:`, error);

                // Send error response
                const responseTopic = packet.properties?.responseTopic;
                if (responseTopic) {
                    this.client.publish(
                        responseTopic,
                        JSON.stringify({
                            error: true,
                            message: (error as Error).message
                        }),
                        {
                            qos: 1,
                            properties: {
                                correlationData: packet.properties?.correlationData,
                                userProperties: { version: '1.0.0' }
                            }
                        }
                    );
                }
            }
        });
    }

    /**
     * Stops the handler.
     */
    stop(): void {
        this.client.end();
        console.log(`[${this.serviceId}] Stopped`);
    }
}

/**
 * Simulated baggage database for demo purposes.
 */
const baggageDatabase: Record<string, { id: string; status: string; location: string }> = {
    'ABC123': { id: 'ABC123', status: 'in-transit', location: 'conveyor-1' },
    'DEF456': { id: 'DEF456', status: 'arrived', location: 'carousel-3' },
    'GHI789': { id: 'GHI789', status: 'loaded', location: 'aircraft-A320' }
};

/**
 * Main demo function.
 */
async function main(): Promise<void> {
    console.log('=== Request-Response Pattern Demo ===\n');

    const brokerUrl = 'mqtt://localhost:1883';
    const username = 'service';
    const password = 'service123';

    // Create and start the request handler (service)
    const handler = new MqttRequestHandler(brokerUrl, username, password, 'baggage');

    // Register handlers for different actions
    handler.handle('lookup', async (payload) => {
        const baggage = baggageDatabase[payload.baggageId];
        if (baggage) {
            return { found: true, baggage };
        }
        return { found: false, baggageId: payload.baggageId };
    });

    handler.handle('status', async (payload) => {
        const baggage = baggageDatabase[payload.baggageId];
        if (baggage) {
            return { status: baggage.status, location: baggage.location };
        }
        throw new Error(`Baggage not found: ${payload.baggageId}`);
    });

    handler.handle('list', async () => {
        return { items: Object.values(baggageDatabase) };
    });

    await handler.start();
    console.log();

    // Create the request client
    const client = new MqttRequestClient(brokerUrl, username, password);
    await client.connect();
    console.log();

    // Make some requests
    try {
        console.log('--- Making Requests ---\n');

        // Lookup request
        const lookupResponse = await client.request('baggage/lookup', { baggageId: 'ABC123' });
        console.log('Lookup Response:', JSON.stringify(lookupResponse.data, null, 2));
        console.log();

        // Status request
        const statusResponse = await client.request('baggage/status', { baggageId: 'DEF456' });
        console.log('Status Response:', JSON.stringify(statusResponse.data, null, 2));
        console.log();

        // List request
        const listResponse = await client.request('baggage/list', {});
        console.log('List Response:', JSON.stringify(listResponse.data, null, 2));
        console.log();

        // Request for non-existent baggage
        const notFoundResponse = await client.request('baggage/lookup', { baggageId: 'NOTFOUND' });
        console.log('Not Found Response:', JSON.stringify(notFoundResponse.data, null, 2));
        console.log();

        // Error response
        try {
            await client.request('baggage/status', { baggageId: 'NOTFOUND' });
        } catch (error) {
            console.log('Error Response (expected):', (error as Error).message);
        }
        console.log();

    } finally {
        // Cleanup
        client.disconnect();
        handler.stop();
    }

    console.log('=== Demo Complete ===');
}

// Run if executed directly
main().catch(console.error);
