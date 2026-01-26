/**
 * WebSocket Client Example for EMQX Edge
 *
 * This example demonstrates connecting to EMQX Edge via WebSocket,
 * suitable for browser-based applications.
 *
 * Usage (Node.js):
 *   npx ts-node examples/websocket-client.ts
 *
 * Usage (Browser):
 *   Include mqtt.js from CDN and adapt the connection code
 *
 * Prerequisites:
 *   - EMQX Edge running (docker-compose up -d)
 *   - npm install mqtt
 */

import * as mqtt from 'mqtt';

/** WebSocket client configuration */
interface WebSocketConfig {
    /** WebSocket URL (ws:// or wss://) */
    wsUrl: string;
    /** Authentication username */
    username: string;
    /** Authentication password */
    password: string;
    /** Client identifier */
    clientId: string;
}

/** Default configuration for EMQX Edge WebSocket */
const defaultConfig: WebSocketConfig = {
    wsUrl: 'ws://localhost:8083/mqtt',  // EMQX Edge WebSocket endpoint
    username: 'client',
    password: 'client123',
    clientId: `ws-client-${Date.now()}`
};

/**
 * WebSocket MQTT Client
 *
 * Provides MQTT connectivity over WebSocket for browser compatibility.
 */
class WebSocketMqttClient {
    /** MQTT client instance */
    private client: mqtt.MqttClient;

    /** Client configuration */
    private config: WebSocketConfig;

    /** Message handlers by topic pattern */
    private handlers: Map<string, ((topic: string, payload: any) => void)[]> = new Map();

    /**
     * Creates a new WebSocket MQTT client.
     *
     * @param config - Client configuration
     */
    constructor(config: WebSocketConfig = defaultConfig) {
        this.config = config;

        this.client = mqtt.connect(config.wsUrl, {
            username: config.username,
            password: config.password,
            clientId: config.clientId,
            clean: true,
            reconnectPeriod: 1000,
            connectTimeout: 5000,
            // WebSocket-specific options
            protocol: 'ws',
            protocolVersion: 5 // Use MQTT 5.0
        });

        this.setupEventHandlers();
    }

    /**
     * Sets up client event handlers.
     */
    private setupEventHandlers(): void {
        this.client.on('connect', () => {
            console.log(`[WebSocket] Connected: ${this.config.clientId}`);
        });

        this.client.on('reconnect', () => {
            console.log('[WebSocket] Reconnecting...');
        });

        this.client.on('error', (error: Error) => {
            console.error('[WebSocket] Error:', error.message);
        });

        this.client.on('close', () => {
            console.log('[WebSocket] Connection closed');
        });

        this.client.on('message', (topic: string, payload: Buffer) => {
            // Parse JSON payload
            let data: unknown;
            try {
                data = JSON.parse(payload.toString());
            } catch {
                data = payload.toString();
            }

            // Call matching handlers
            for (const [pattern, handlers] of this.handlers) {
                if (this.topicMatches(pattern, topic)) {
                    handlers.forEach(handler => handler(topic, data));
                }
            }
        });
    }

    /**
     * Checks if a topic matches a pattern.
     *
     * @param pattern - Topic pattern (may include + and # wildcards)
     * @param topic - Actual topic
     * @returns True if topic matches pattern
     */
    private topicMatches(pattern: string, topic: string): boolean {
        const patternParts = pattern.split('/');
        const topicParts = topic.split('/');

        for (let i = 0; i < patternParts.length; i++) {
            const patternPart = patternParts[i];

            if (patternPart === '#') {
                return true; // Multi-level wildcard matches rest
            }

            if (i >= topicParts.length) {
                return false; // Topic too short
            }

            if (patternPart !== '+' && patternPart !== topicParts[i]) {
                return false; // Doesn't match
            }
        }

        return patternParts.length === topicParts.length;
    }

    /**
     * Waits for connection to be established.
     *
     * @returns Promise that resolves when connected
     */
    async waitForConnection(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.client.connected) {
                resolve();
                return;
            }

            const onConnect = () => {
                this.client.removeListener('error', onError);
                resolve();
            };

            const onError = (err: Error) => {
                this.client.removeListener('connect', onConnect);
                reject(err);
            };

            this.client.once('connect', onConnect);
            this.client.once('error', onError);
        });
    }

    /**
     * Subscribes to a topic and registers a message handler.
     *
     * @param topic - Topic pattern to subscribe to
     * @param handler - Message handler function
     * @param qos - Quality of Service level
     */
    async subscribe(
        topic: string,
        handler: (topic: string, payload: any) => void,
        qos: 0 | 1 | 2 = 1
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client.subscribe(topic, { qos }, (err: Error | null) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Register handler
                const handlers = this.handlers.get(topic) || [];
                handlers.push(handler);
                this.handlers.set(topic, handlers);

                console.log(`[WebSocket] Subscribed to: ${topic}`);
                resolve();
            });
        });
    }

    /**
     * Publishes a message to a topic.
     *
     * @param topic - Topic to publish to
     * @param payload - Message payload
     * @param options - Publish options
     */
    publish(
        topic: string,
        payload: any,
        options: { qos?: 0 | 1 | 2; retain?: boolean } = {}
    ): void {
        const { qos = 1, retain = false } = options;
        const message = typeof payload === 'string' ? payload : JSON.stringify(payload);

        this.client.publish(topic, message, { 
            qos, 
            retain,
            properties: {
                userProperties: { version: '1.0.0' }
            }
        });
    }

    /**
     * Disconnects from the broker.
     */
    disconnect(): void {
        this.client.end();
        console.log('[WebSocket] Disconnected');
    }
}

/**
 * Browser-compatible code example (for documentation).
 */
function browserExample(): string {
    return `
<!-- Include MQTT.js from CDN -->
<script src="https://unpkg.com/mqtt/dist/mqtt.min.js"></script>

<script>
    // Connect to EMQX Edge via WebSocket (MQTT 5.0)
    const client = mqtt.connect('ws://localhost:8083/mqtt', {
        protocolVersion: 5, // Use MQTT 5.0
        username: 'client',
        password: 'client123',
        clientId: 'browser-client-' + Date.now()
    });

    client.on('connect', function() {
        console.log('Connected to EMQX Edge');

        // Subscribe to a topic
        client.subscribe('events/#', function(err) {
            if (!err) {
                // Publish a message with version metadata
                client.publish('events/test', JSON.stringify({
                    message: 'Hello from browser!',
                    timestamp: new Date().toISOString()
                }), {
                    properties: {
                        userProperties: { version: '1.0.0' }
                    }
                });
            }
        });
    });

    client.on('message', function(topic, message) {
        console.log('Received:', topic, message.toString());
    });
</script>
`;
}

/**
 * Demonstrates WebSocket connectivity.
 */
async function demonstrateWebSocket(): Promise<void> {
    console.log('=== WebSocket Client Demo for EMQX Edge ===\n');

    const client = new WebSocketMqttClient();

    await client.waitForConnection();
    console.log();

    // Subscribe to multiple topics
    await client.subscribe('events/#', (topic, payload) => {
        console.log(`[Event] ${topic}:`, payload);
    });

    await client.subscribe('services/+/status', (topic, payload) => {
        console.log(`[Status] ${topic}:`, payload);
    });

    console.log();

    // Publish some messages
    console.log('--- Publishing Messages ---\n');

    client.publish('events/user/login', {
        userId: 'user-123',
        timestamp: new Date().toISOString()
    });

    client.publish('events/system/startup', {
        component: 'websocket-demo',
        version: '1.0.0'
    });

    client.publish('services/websocket-client/status', {
        status: 'online',
        connections: 1
    });

    // Wait for messages to be received
    await new Promise(r => setTimeout(r, 2000));

    // Disconnect
    client.disconnect();

    console.log('\n--- Browser Example Code ---');
    console.log(browserExample());

    console.log('\n=== Demo Complete ===');
}

// Run if executed directly
demonstrateWebSocket().catch(console.error);
