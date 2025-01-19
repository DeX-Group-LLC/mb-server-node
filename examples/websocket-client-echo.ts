import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { config } from '../src/config';
import { ActionType } from '../src/core/types';

// Configuration flags to enable/disable different roles
const ENABLE_REQUESTER = true;
const ENABLE_RESPONDER = true;
const ENABLE_LISTENER = true;

// Helper function to create message headers
function createHeader(action: ActionType, topic: string, requestId?: string, parentRequestId?: string, timeout?: number) {
    let header = `${action}:${topic}:1.0.0`;

    // Add the requestId, parentRequestId, and timeout to the header line if present
    if (timeout) header += `:${requestId ?? ''}:${parentRequestId ?? ''}:${timeout}`;
    else if (parentRequestId && parentRequestId !== requestId) header += `:${requestId ?? ''}:${parentRequestId}`;
    else if (requestId) header += `:${requestId}`;

    return header;
}

// Helper function to create full message with payload
function createMessage(action: ActionType, topic: string, payload: any = {}, requestId?: string, parentRequestId?: string, timeout?: number) {
    return createHeader(action, topic, requestId, parentRequestId, timeout) + '\n' + JSON.stringify(payload);
}

// Create WebSocket connections based on configuration
const requester = ENABLE_REQUESTER ? new WebSocket(`${process.env.WS_PROTOCOL ?? 'ws'}://${config.host}:${config.port}`) : null;
const responder = ENABLE_RESPONDER ? new WebSocket(`${process.env.WS_PROTOCOL ?? 'ws'}://${config.host}:${config.port}`) : null;
const listener = ENABLE_LISTENER ? new WebSocket(`${process.env.WS_PROTOCOL ?? 'ws'}://${config.host}:${config.port}`) : null;

// Requester setup
if (requester) {
    requester.on('open', () => {
        console.log('Requester connected');
        // Register as Test Requester
        requester.send(createMessage(ActionType.REQUEST, 'system.service.register', {
            name: 'Test Requester',
            description: 'Sends test requests periodically'
        }, randomUUID()));

        // Send test messages every 2 seconds
        setInterval(() => {
            const requestId = randomUUID();
            requester.send(createMessage(ActionType.REQUEST, 'test.message', {
                timestamp: new Date().toISOString(),
                message: 'Hello from requester!'
            }, requestId));
        }, 2000);
    });
}

// Responder setup
if (responder) {
    responder.on('open', () => {
        console.log('Responder connected');
        // Register as Test Responder
        responder.send(createMessage(ActionType.REQUEST, 'system.service.register', {
            name: 'Test Responder',
            description: 'Responds to test messages and triggers additional events'
        }, randomUUID()));

        // Subscribe to test.message
        responder.send(createMessage(ActionType.REQUEST, 'system.topic.subscribe', {
            topic: 'test.message',
            priority: 1
        }, randomUUID()));
    });

    responder.on('message', (data: Buffer) => {
        const message = data.toString();
        if (message.includes('test.message')) {
            // Echo back the original message
            const [header, payloadStr] = message.split('\n');
            const payload = JSON.parse(payloadStr);
            const [action, topic, version, requestId] = header.split(':'); // Extract original requestId

            // Send response to the original request
            responder.send(createMessage(ActionType.RESPONSE, 'test.message', payload, requestId, requestId));

            // Send additional trigger messages with the original request as parent
            responder.send(createMessage(ActionType.PUBLISH, 'test.trigger.publish', {
                timestamp: new Date().toISOString(),
                triggeredBy: 'responder'
            }, randomUUID(), requestId));

            responder.send(createMessage(ActionType.REQUEST, 'test.trigger.request', {
                timestamp: new Date().toISOString(),
                triggeredBy: 'responder'
            }, randomUUID(), requestId));
        }
    });
}

// Listener setup
if (listener) {
    listener.on('open', () => {
        console.log('Listener connected');
        // Register as Test Listener
        listener.send(createMessage(ActionType.REQUEST, 'system.service.register', {
            name: 'Test Listener',
            description: 'Listens for trigger messages and sends end signal'
        }, randomUUID()));

        // Subscribe to both trigger topics
        listener.send(createMessage(ActionType.REQUEST, 'system.topic.subscribe', {
            topic: 'test.trigger.publish',
            priority: 1
        }, randomUUID()));
        listener.send(createMessage(ActionType.REQUEST, 'system.topic.subscribe', {
            topic: 'test.trigger.request',
            priority: 1
        }, randomUUID()));
    });

    listener.on('message', (data: Buffer) => {
        const message = data.toString();
        if (message.includes('test.trigger.request')) {
            const [header, payloadStr] = message.split('\n');
            const payload = JSON.parse(payloadStr);
            const [action, topic, version, requestId] = header.split(':'); // Extract original requestId

            // Send test.trigger.response message with the trigger request as parent
            listener.send(createMessage(ActionType.RESPONSE, 'test.trigger.request', payload, requestId));

            // Send test.no_route publish message with the trigger request as parent
            listener.send(createMessage(ActionType.PUBLISH, 'test.noroute', {
                timestamp: new Date().toISOString(),
                triggeredBy: 'listener'
            }, randomUUID(), requestId));

            // Send test.end publish message with the trigger request as parent
            listener.send(createMessage(ActionType.REQUEST, 'test.end', {
                timestamp: new Date().toISOString(),
                triggeredBy: 'listener'
            }, randomUUID(), requestId, 500));
        }
    });
}

// Error handling for all connections
const activeConnections = [
    { ws: requester, name: 'Requester' },
    { ws: responder, name: 'Responder' },
    { ws: listener, name: 'Listener' }
].filter(conn => conn.ws !== null);

activeConnections.forEach(({ ws, name }) => {
    (ws as WebSocket).on('error', (err: Error) => {
        console.error(`${name} error:`, err);
        if (err.message.includes('ECONNREFUSED')) {
            console.error(`Could not connect to the Message Broker. Make sure it is running and the host/port are correct.`);
        }
    });

    (ws as WebSocket).on('close', () => {
        console.log(`${name} disconnected`);
    });
});