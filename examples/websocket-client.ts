import { WebSocket } from 'ws';
import { config } from '../src/config';
import { randomUUID } from 'crypto';

/**
 * A simple WebSocket client for testing the Message Broker.
 */
const ws = new WebSocket(`ws://${config.host}:${config.ports.ws}`);

ws.on('open', () => {
    console.log('Connected to Message Broker');

    // Subscribe to a topic
    const subscribeMessage = {
        action: "publish",
        topic: "test.messages"
    };
    ws.send(`request:system.topic.subscribe:1.0:${randomUUID()}\n${JSON.stringify(subscribeMessage)}`);

    // Publish a test message
    const publishMessage = {
        message: "Hello from client!"
    };
    ws.send(`publish:test.messages:1.0:${randomUUID()}\n${JSON.stringify(publishMessage)}`);
});

ws.on('message', (message: Buffer) => {
    console.log('Received:', message.toString());
    ws.close();
});

ws.on('close', () => {
    console.log('Disconnected from Message Broker');
});

ws.on('error', (err: Error) => {
    console.error('WebSocket error:', err);
    if (err.message.includes('ECONNREFUSED')) {
        console.error('Could not connect to the Message Broker. Make sure it is running and the host/port are correct.');
    }
});