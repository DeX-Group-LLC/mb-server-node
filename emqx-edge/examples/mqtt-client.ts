/**
 * MQTT Client Example for EMQX Edge
 *
 * This example demonstrates connecting to EMQX Edge and performing
 * basic pub/sub operations using the MQTT protocol.
 *
 * Usage:
 *   npx ts-node examples/mqtt-client.ts
 *
 * Prerequisites:
 *   - EMQX Edge running (docker-compose up -d)
 *   - npm install mqtt
 */

import * as mqtt from 'mqtt';

/** Configuration for MQTT connection */
interface MqttConfig {
    /** MQTT broker URL */
    brokerUrl: string;
    /** Username for authentication */
    username: string;
    /** Password for authentication */
    password: string;
    /** Client identifier */
    clientId: string;
}

/** Default configuration matching EMQX Edge setup */
const defaultConfig: MqttConfig = {
    brokerUrl: 'mqtt://localhost:1883',
    username: 'client',
    password: 'client123',
    clientId: `mqtt-client-${Date.now()}`
};

/**
 * Creates and connects an MQTT client to EMQX Edge.
 *
 * @param config - MQTT connection configuration
 * @returns Connected MQTT client
 */
function createClient(config: MqttConfig = defaultConfig): mqtt.MqttClient {
    console.log(`Connecting to ${config.brokerUrl}...`);

    const client = mqtt.connect(config.brokerUrl, {
        protocolVersion: 5, // Use MQTT 5.0
        username: config.username,
        password: config.password,
        clientId: config.clientId,
        clean: true,
        reconnectPeriod: 1000,
        connectTimeout: 5000,
        // Last Will and Testament for automatic offline notification
        will: {
            topic: `services/${config.clientId}/status`,
            payload: JSON.stringify({ status: 'offline', timestamp: new Date().toISOString() }),
            retain: true,
            qos: 1,
            properties: {
                userProperties: { version: '1.0.0' }
            }
        }
    });

    // Connection event handlers
    client.on('connect', () => {
        console.log('Connected to EMQX Edge (MQTT 5.0)');

        // Publish online status with version metadata
        client.publish(
            `services/${config.clientId}/status`,
            JSON.stringify({ status: 'online', timestamp: new Date().toISOString() }),
            { 
                retain: true, 
                qos: 1,
                properties: {
                    userProperties: { version: '1.0.0' }
                }
            }
        );
    });

    client.on('error', (err: Error) => {
        console.error('Connection error:', err.message);
    });

    client.on('reconnect', () => {
        console.log('Reconnecting...');
    });

    client.on('close', () => {
        console.log('Connection closed');
    });

    return client;
}

/**
 * Demonstrates basic publish/subscribe functionality.
 */
async function demonstratePubSub(): Promise<void> {
    const client = createClient();

    return new Promise((resolve) => {
        client.on('connect', () => {
            // Subscribe to test topic (follows events/{domain}/{type} pattern)
            const testTopic = 'events/test/demo';

            client.subscribe(testTopic, { qos: 1 }, (err: Error | null) => {
                if (err) {
                    console.error('Subscribe error:', err);
                    return;
                }
                console.log(`Subscribed to: ${testTopic}`);

                // Publish a test message
                const message = {
                    source: 'mqtt-client-demo',
                    message: 'Hello from EMQX Edge!',
                    timestamp: new Date().toISOString()
                };

                client.publish(testTopic, JSON.stringify(message), { 
                    qos: 1,
                    properties: {
                        userProperties: { version: '1.0.0' }
                    }
                });
                console.log('Published test message');
            });
        });

        // Handle incoming messages
        client.on('message', (topic: string, payload: Buffer) => {
            console.log(`Received message on ${topic}:`);
            console.log(JSON.parse(payload.toString()));

            // Cleanup after receiving message
            setTimeout(() => {
                client.end();
                resolve();
            }, 1000);
        });
    });
}

/**
 * Demonstrates wildcard subscriptions.
 */
async function demonstrateWildcards(): Promise<void> {
    const client = createClient();

    return new Promise((resolve) => {
        let messageCount = 0;

        client.on('connect', () => {
            // Subscribe using wildcards
            // + matches single level, # matches multiple levels
            client.subscribe('events/+/status', { qos: 1 });
            client.subscribe('metrics/#', { qos: 1 });

            console.log('Subscribed to wildcard topics');

            // Publish to various topics that match the wildcards
            setTimeout(() => {
                const pubOpts = { properties: { userProperties: { version: '1.0.0' } } };
                client.publish('events/baggage/status', JSON.stringify({ event: 'baggage status' }), pubOpts);
                client.publish('events/conveyor/status', JSON.stringify({ event: 'conveyor status' }), pubOpts);
                client.publish('metrics/system/cpu', JSON.stringify({ value: 45.2 }), pubOpts);
                client.publish('metrics/system/memory', JSON.stringify({ value: 62.8 }), pubOpts);
                client.publish('metrics/service/requests', JSON.stringify({ count: 1523 }), pubOpts);
                console.log('Published 5 test messages');
            }, 500);
        });

        client.on('message', (topic: string, payload: Buffer) => {
            messageCount++;
            console.log(`[${messageCount}] ${topic}: ${payload.toString()}`);

            // Cleanup after receiving all messages
            if (messageCount >= 5) {
                setTimeout(() => {
                    client.end();
                    resolve();
                }, 1000);
            }
        });
    });
}

/**
 * Main entry point - runs demonstrations.
 */
async function main(): Promise<void> {
    console.log('=== MQTT Client Demo for EMQX Edge ===\n');

    console.log('--- Basic Pub/Sub Demo ---');
    await demonstratePubSub();
    console.log();

    console.log('--- Wildcard Subscription Demo ---');
    await demonstrateWildcards();
    console.log();

    console.log('=== Demo Complete ===');
}

// Run if executed directly
main().catch(console.error);
