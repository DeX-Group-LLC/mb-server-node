# WebSocket Protocol

This document describes the WebSocket protocol implementation in MB Server Node.

## Overview

The WebSocket protocol provides browser-compatible real-time communication. MB Server Node uses a simple text-only WebSocket implementation without sub-protocols or binary support.

## Connection

Default port: 8080 (configurable via `WEBSOCKET_PORT`)

```javascript
const ws = new WebSocket('ws://localhost:8080');
```

## Message Format

Messages are sent as plain text using the standard MB Server Node format:

```
action:topic:version:requestId[:parentId][:timeout]\n{"key": "value"}
```

Example messages:

```javascript
// Subscribe
'subscribe:events.user.*:1.0:123e4567-e89b-12d3-a456-426614174000\n{}'

// Publish
'publish:events.user.created:1.0:987fcdeb-51a2-43fe-ba98-765432198765\n{"data": "value"}'

// Request
'request:user.profile.get:1.0:def456ghi-7890-12ab-cdef-456789abcdef\n{"action": "getData"}'

// Response
'response:user.profile.get:1.0:abc123def-4567-89ab-cdef-123456789abc:def456ghi-7890-12ab-cdef-456789abcdef\n{"result": "success"}'
```

## Limitations

1. **Text Only**
   - Only supports UTF-8 encoded text messages
   - No binary frame support
   - No binary payload support

2. **No Sub-Protocols**
   - No WebSocket sub-protocol negotiation
   - Uses basic WebSocket connection only

3. **Size Limits**
   - Messages limited to maximum payload length (configurable via `MAX_MESSAGE_PAYLOAD_LENGTH`)
   - Must be valid UTF-8 text

## Browser Example

```javascript
const ws = new WebSocket('ws://localhost:8080');

ws.onopen = () => {
    console.log('Connected to MB Server');

    // Subscribe to a topic
    ws.send('subscribe:events.user.*:1.0:123e4567-e89b-12d3-a456-426614174000\n{}');

    // Publish a message
    ws.send('publish:events.user.created:1.0:987fcdeb-51a2-43fe-ba98-765432198765\n{"message": "Hello"}');
};

ws.onmessage = (event) => {
    console.log('Received:', event.data);
};

ws.onerror = (error) => {
    console.error('WebSocket error:', error);
};

ws.onclose = () => {
    console.log('Disconnected from MB Server');
};
```

## Node.js Example

```javascript
const WebSocket = require('ws');

class WSClient {
    constructor(host = 'localhost', port = 8080) {
        this.url = `ws://${host}:${port}`;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.url);

            this.ws.on('open', () => {
                resolve();
            });

            this.ws.on('error', reject);
        });
    }

    send(message) {
        this.ws.send(message);
    }

    subscribe(topic) {
        const message = `subscribe:${topic}:1.0:${this.generateUUID()}\n{}`;
        this.send(message);
    }

    publish(topic, data) {
        const message = `publish:${topic}:1.0:${this.generateUUID()}\n${JSON.stringify(data)}`;
        this.send(message);
    }

    generateUUID() {
        // Implementation of UUID generation
    }
}
```

## Error Handling

1. **Connection Errors**
   - Handle connection failures
   - Implement reconnection logic
   - Monitor connection state

2. **Message Validation**
   - Verify UTF-8 encoding
   - Validate message format
   - Check message size

3. **WebSocket Events**
   - Handle close events
   - Process error events
   - Monitor connection state

## Best Practices

1. **Connection Management**
   - Implement connection timeouts
   - Handle reconnection gracefully
   - Monitor connection health

2. **Message Handling**
   - Validate message format
   - Handle connection drops
   - Implement message queuing

3. **Error Handling**
   - Handle WebSocket errors
   - Validate message format
   - Implement retry logic

4. **Performance**
   - Monitor message rates
   - Handle backpressure
   - Implement rate limiting