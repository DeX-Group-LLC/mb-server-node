# Quick Start Guide

This guide will help you get started with using MB Server Node.

## Starting the Server

1. If you haven't already, follow the [Installation Guide](./installation.md)

2. Start the server:
```bash
# Development mode
npm run dev

# Production mode
npm start
```

3. Verify the server is running:
   - WebSocket endpoint: `ws://localhost:8080` (or `wss://` if SSL is enabled)
   - TCP Socket endpoint: `localhost:8081`

## Basic Usage Example

Here's a simple example using the JavaScript client:

```javascript
import { MessageBrokerClient } from '@mb/client';

async function main() {
    // Create client instance
    const client = new MessageBrokerClient({
        protocol: 'ws',
        reconnect: true
    });

    try {
        // Connect to broker
        await client.connect('ws://localhost:8080');

        // Subscribe to a topic
        await client.subscribe('example.topic');

        // Handle incoming messages
        client.on('message', (header, payload) => {
            console.log(`Received message on topic: ${header.topic}`);
            console.log('Payload:', payload);
        });

        // Publish a message
        await client.publish('example.topic', {
            message: 'Hello, World!',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error:', error);
    }
}

main();
```

## Basic Configuration

The server can be configured through environment variables or a configuration file:

```env
# Basic server configuration
WEBSOCKET_PORT=8080
TCP_PORT=8081
HOST=localhost

# SSL/TLS Configuration (optional)
SSL_KEY=./certs/server.key
SSL_CERT=./certs/server.crt
```

For more detailed configuration options, see the [Configuration Guide](./configuration.md).

## Next Steps

1. Learn about [Core Concepts](./concepts.md)
2. Explore the [API Documentation](../api/) for your preferred language
3. Read the [Protocol Documentation](../protocols/) for protocol details
4. Review [Security Best Practices](../security.md)
5. See [Examples](../examples/) for more usage scenarios