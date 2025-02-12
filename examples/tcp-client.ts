import { Socket } from 'net';
import { randomUUID } from 'crypto';
import { config } from '../src/config';
import { ActionType } from '../src/core/types';

/**
 * Helper function to create message headers
 * @param action - The action type for the message
 * @param topic - The topic for the message
 * @param requestId - Optional request ID
 * @param parentRequestId - Optional parent request ID
 * @param timeout - Optional timeout in milliseconds
 * @returns Formatted header string
 */
function createHeader(action: ActionType, topic: string, requestId?: string, parentRequestId?: string, timeout?: number) {
    let header = `${action}:${topic}:1.0.0`;

    if (timeout) header += `:${requestId ?? ''}:${parentRequestId ?? ''}:${timeout}`;
    else if (parentRequestId && parentRequestId !== requestId) header += `:${requestId ?? ''}:${parentRequestId}`;
    else if (requestId) header += `:${requestId}`;

    return header;
}

/**
 * Helper function to create full message with payload
 * @param action - The action type for the message
 * @param topic - The topic for the message
 * @param payload - The message payload
 * @param requestId - Optional request ID
 * @param parentRequestId - Optional parent request ID
 * @param timeout - Optional timeout in milliseconds
 * @returns Formatted message string
 */
function createMessage(action: ActionType, topic: string, payload: any = {}, requestId?: string, parentRequestId?: string, timeout?: number) {
    return createHeader(action, topic, requestId, parentRequestId, timeout) + '\n' + JSON.stringify(payload);
}

/**
 * Helper function for TCP framing
 * @param message - The message to frame
 * @returns Framed message buffer
 */
function frameTcpMessage(message: string): Buffer {
    const messageBuffer = Buffer.from(message);
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32BE(messageBuffer.length);
    return Buffer.concat([lengthBuffer, messageBuffer]);
}

// Create TCP client
const client = new Socket();

// Set up connection handling
client.on('connect', () => {
    console.log('Connected to server');

    // Register the service
    client.write(frameTcpMessage(createMessage(ActionType.REQUEST, 'system.service.register', {
        name: 'TCP Test Client',
        description: '[TCP] Simple TCP client for testing'
    }, randomUUID())));

    // Subscribe to test messages
    client.write(frameTcpMessage(createMessage(ActionType.REQUEST, 'system.topic.subscribe', {
        action: "publish",
        topic: 'test.message',
        priority: 1
    }, randomUUID())));

    // Send test messages every 5 seconds
    setInterval(() => {
        const requestId = randomUUID();
        const message = createMessage(ActionType.PUBLISH, 'test.message', {
            timestamp: new Date().toISOString(),
            message: 'Hello from TCP client!'
        }, requestId);
        console.log('\nSending message:', message);
        client.write(frameTcpMessage(message));
    }, 5000);
});

// Set up message handling
let buffer = Buffer.alloc(0);
let expectedLength = -1;

client.on('data', (data: Buffer) => {
    buffer = Buffer.concat([buffer, data]);

    while (true) {
        // If we don't have a length yet, try to read it
        if (expectedLength === -1) {
            if (buffer.length < 4) return; // Need more data
            expectedLength = buffer.readUInt32BE(0);
            buffer = buffer.subarray(4);
        }

        // Check if we have enough data for the complete message
        if (buffer.length < expectedLength) return; // Need more data

        // Extract and process the message
        const messageBuffer = buffer.subarray(0, expectedLength);
        const message = messageBuffer.toString();
        buffer = buffer.subarray(expectedLength);
        expectedLength = -1;

        // Log received messages
        console.log('\nReceived message:', message);

        // If no more data to process, break
        if (buffer.length < 4) break;
    }
});

// Error handling
client.on('error', (err: Error) => {
    console.error('Client error:', err);
    if (err.message.includes('ECONNREFUSED')) {
        console.error('Could not connect to the Message Broker. Make sure it is running and the host/port are correct.');
    }
    process.exit(1);
});

client.on('close', () => {
    console.log('Connection closed');
    process.exit(0);
});

// Connect to the server
client.connect(config.ports.tcp, config.host);