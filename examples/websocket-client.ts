import { WebSocket } from 'ws';
import { config } from '../src/config';

/**
 * A simple WebSocket client for testing the Message Broker.
 */
const ws = new WebSocket(`ws://${config.host}:${config.ports.ws}`);

ws.on('open', () => {
    console.log('Connected to Message Broker');
    ws.send('Hello from client!');
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