/**
 * Quick Connection Test for EMQX Edge
 *
 * Verifies that EMQX Edge is running and accepts connections.
 * Run this after starting the broker to confirm everything works.
 *
 * Usage:
 *   npm run test-connection
 */

import * as mqtt from 'mqtt';

/** Test configuration */
const config = {
    broker: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
    username: process.env.MQTT_USER || 'client',
    password: process.env.MQTT_PASS || 'client123',
    timeout: 10000
};

/** Test results */
interface TestResult {
    name: string;
    passed: boolean;
    message: string;
}

const results: TestResult[] = [];

/**
 * Runs all connection tests.
 */
async function runTests(): Promise<void> {
    console.log('\n========================================');
    console.log('  EMQX Edge Connection Test');
    console.log('========================================\n');
    console.log(`Broker: ${config.broker}`);
    console.log(`User:   ${config.username}\n`);

    // Test 1: Basic connection
    await testConnection();

    // Test 2: Pub/sub
    await testPubSub();

    // Test 3: Retained messages
    await testRetained();

    // Print results
    printResults();
}

/**
 * Test 1: Can we connect?
 */
async function testConnection(): Promise<void> {
    const testName = 'Connection';

    try {
        const client = await connect();
        client.end();

        results.push({
            name: testName,
            passed: true,
            message: 'Connected successfully'
        });
    } catch (error) {
        results.push({
            name: testName,
            passed: false,
            message: (error as Error).message
        });
    }
}

/**
 * Test 2: Can we publish and receive messages?
 */
async function testPubSub(): Promise<void> {
    const testName = 'Pub/Sub';
    const testTopic = `events/test/connection-${Date.now()}`;
    const testMessage = 'Hello EMQX Edge!';

    try {
        const client = await connect();

        const received = await new Promise<boolean>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Message not received within timeout'));
            }, 5000);

            client.subscribe(testTopic, { qos: 1 }, (err: Error | null) => {
                if (err) {
                    clearTimeout(timer);
                    reject(err);
                    return;
                }

                client.on('message', (topic: string, payload: Buffer) => {
                    if (topic === testTopic && payload.toString() === testMessage) {
                        clearTimeout(timer);
                        resolve(true);
                    }
                });

                client.publish(testTopic, testMessage, { 
                    qos: 1,
                    properties: { userProperties: { version: '1.0.0' } }
                });
            });
        });

        client.end();

        results.push({
            name: testName,
            passed: received,
            message: 'Published and received message'
        });
    } catch (error) {
        results.push({
            name: testName,
            passed: false,
            message: (error as Error).message
        });
    }
}

/**
 * Test 3: Do retained messages work?
 */
async function testRetained(): Promise<void> {
    const testName = 'Retained Messages';
    const testTopic = `events/test/retained-${Date.now()}`;
    const testMessage = JSON.stringify({ test: true, time: Date.now() });

    try {
        // Publish retained message
        const publisher = await connect();
        await new Promise<void>((resolve, reject) => {
            publisher.publish(testTopic, testMessage, { 
                qos: 1, 
                retain: true,
                properties: { userProperties: { version: '1.0.0' } }
            }, (err?: Error) => {
                if (err) reject(err);
                else resolve();
            });
        });
        publisher.end();

        // New client should receive it immediately
        const subscriber = await connect();
        const received = await new Promise<boolean>((resolve, reject) => {
            const timer = setTimeout(() => {
                resolve(false);
            }, 3000);

            subscriber.subscribe(testTopic, { qos: 1 }, (err: Error | null) => {
                if (err) {
                    clearTimeout(timer);
                    reject(err);
                    return;
                }
            });

            subscriber.on('message', (topic: string, payload: Buffer) => {
                if (topic === testTopic) {
                    clearTimeout(timer);
                    resolve(true);
                }
            });
        });

        // Clean up retained message
        subscriber.publish(testTopic, '', { 
            retain: true,
            properties: { userProperties: { version: '1.0.0' } }
        });
        subscriber.end();

        results.push({
            name: testName,
            passed: received,
            message: received ? 'Retained message received' : 'Retained message not received'
        });
    } catch (error) {
        results.push({
            name: testName,
            passed: false,
            message: (error as Error).message
        });
    }
}

/**
 * Creates a connected MQTT client.
 */
function connect(): Promise<mqtt.MqttClient> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Connection timeout'));
        }, config.timeout);

        const client = mqtt.connect(config.broker, {
            username: config.username,
            password: config.password,
            clientId: `test-${Date.now()}`,
            connectTimeout: config.timeout,
            protocolVersion: 5 // Use MQTT 5.0
        });

        client.on('connect', () => {
            clearTimeout(timer);
            resolve(client);
        });

        client.on('error', (err: Error) => {
            clearTimeout(timer);
            client.end();
            reject(err);
        });
    });
}

/**
 * Prints test results.
 */
function printResults(): void {
    console.log('\n----------------------------------------');
    console.log('  Results');
    console.log('----------------------------------------\n');

    let passed = 0;
    let failed = 0;

    for (const result of results) {
        const status = result.passed ? '[PASS]' : '[FAIL]';
        console.log(`${status} ${result.name}: ${result.message}`);

        if (result.passed) passed++;
        else failed++;
    }

    console.log('\n----------------------------------------');
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log('----------------------------------------\n');

    if (failed > 0) {
        console.log('Some tests failed. Check that:');
        console.log('  1. EMQX Edge is running (docker-compose up -d)');
        console.log('  2. Credentials are correct in config/nanomq_pwd.conf');
        console.log('  3. No firewall is blocking ports 1883, 8081, 8083\n');
        process.exit(1);
    }
}

// Run tests
runTests().catch((err) => {
    console.error('Test failed:', err.message);
    process.exit(1);
});
