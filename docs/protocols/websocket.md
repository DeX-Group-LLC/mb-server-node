# WebSocket Protocol

## Overview

The WebSocket protocol implementation supports both secure (WSS) and unsecure connections. By default, only secure connections are allowed, but unsecure connections can be enabled for development or testing purposes.

## Configuration

### Ports
- Unsecure WebSocket: 8080 (default)
- Secure WebSocket (WSS): 8443 (default)

### Security Settings
- `allowUnsecure`: Whether to allow unsecure WebSocket connections (default: false)
- `ssl`: TLS configuration
  - `key`: Path to SSL private key file
  - `cert`: Path to SSL certificate file

## Server Types

### Secure WebSocket Server (WSS)
- Enabled when SSL configuration is provided
- Uses HTTPS server as base
- Requires valid SSL certificate and private key
- Handles TLS handshake errors gracefully
- Logs connection attempts with IP addresses

### Unsecure WebSocket Server
- Only enabled when `allowUnsecure` is true
- Uses HTTP server as base
- Not recommended for production use
- Useful for development and testing
- Logs warning when started

## Connection Handling

Both secure and unsecure servers:
1. Accept incoming connections
2. Log connection details (IP address)
3. Handle connection errors
4. Clean up resources on close

## Message Format

Messages are handled natively by the WebSocket protocol:
- Binary messages are passed as Buffer objects
- Text messages are passed as strings
- Maximum message size is configurable
- Messages exceeding size limit trigger connection closure

## Error Handling

### Server Errors
- Server-level errors are logged with appropriate context
- Connection errors include service ID and IP
- Resources are properly cleaned up

### Connection Errors
- WebSocket errors trigger connection closure
- Connection manager is notified of closures
- Resources are properly cleaned up

## Best Practices

1. **Production Use**
   - Always use WSS (disable unsecure connections)
   - Configure proper certificate chain
   - Set appropriate message size limits
   - Monitor connection health

2. **Development**
   - Enable unsecure connections if needed
   - Use self-signed certificates for WSS testing
   - Monitor debug logs for connection issues

3. **Security**
   - Keep TLS certificates up to date
   - Use secure WebSocket configuration
   - Monitor for connection attempts
   - Log all security-related events

## Example Implementation

```javascript
// Client-side example
const ws = new WebSocket('wss://localhost:8443');

ws.onopen = () => {
    console.log('Connected to secure WebSocket server');
};

ws.onmessage = (event) => {
    console.log('Received:', event.data);
};

ws.onerror = (error) => {
    console.error('WebSocket error:', error);
};

ws.onclose = () => {
    console.log('Connection closed');
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