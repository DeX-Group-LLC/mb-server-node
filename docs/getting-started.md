# Getting Started with MB Server Node

This guide will help you get started with MB Server Node, a high-performance message broker server built with Node.js.

## Prerequisites

- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- Basic understanding of message brokers and pub/sub patterns
- (Optional) Docker for containerized deployment

## Installation

### From Source

1. Clone the repository:
```bash
git clone https://github.com/your-org/mb-server-node.git
cd mb-server-node
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

### Using Docker

Pull and run the official Docker image:

```bash
docker pull your-org/mb-server-node:latest
docker run -p 8080:8080 -p 8081:8081 your-org/mb-server-node:latest
```

## Basic Configuration

The server can be configured through environment variables or a configuration file. Create a `.env` file in the root directory:

```env
# Server ports
MB_WS_PORT=8080
MB_TCP_PORT=8081

# SSL/TLS Configuration (optional)
MB_SSL_ENABLED=false
MB_SSL_CERT_PATH=./certs/server.crt
MB_SSL_KEY_PATH=./certs/server.key

# Logging
MB_LOG_LEVEL=info

# Performance tuning
MB_MAX_CONNECTIONS=1000
MB_MESSAGE_SIZE_LIMIT=1048576  # 1MB in bytes
```

For more detailed configuration options, see the [Configuration Guide](./configuration.md).

## Quick Start

1. **Start the Server**

   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm run start
   ```

2. **Verify the Server**

   The server should now be running and listening on:
   - WebSocket: `ws://localhost:8080` (or `wss://` if SSL is enabled)
   - TCP Socket: `localhost:8081`

3. **Basic Usage Example**

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

## Core Concepts

### Topics

Topics are hierarchical strings separated by dots (e.g., `"company.department.service"`). They are used to organize and route messages.

Example topic patterns:
- `"weather.updates"` - Weather update messages
- `"user.profile.changed"` - User profile change events
- `"orders.*.processed"` - All processed orders (wildcard)
- `"system.#"` - All system messages (multi-level wildcard)

### Message Types

1. **Publish/Subscribe (Pub/Sub)**
   - One-to-many communication
   - Publishers send messages to topics
   - Subscribers receive messages from topics they're interested in

2. **Request/Response**
   - One-to-one communication
   - Client sends a request to a specific service
   - Service processes the request and sends back a response

### Message Format

Messages consist of two parts:
1. **Header** - Contains metadata about the message
2. **Payload** - Contains the actual message data (JSON format)

Example message:
```
REQUEST:user.profile.get:1.0.0:123e4567-e89b-12d3-a456-426614174000
{"userId": "12345"}
```

## Best Practices

1. **Topic Design**
   - Use hierarchical structure
   - Keep topics descriptive but concise
   - Use consistent naming conventions
   - Plan for scalability

2. **Error Handling**
   - Implement proper error handling
   - Use timeouts for requests
   - Handle reconnection scenarios
   - Log errors appropriately

3. **Performance**
   - Monitor message sizes
   - Use appropriate protocol for your use case
   - Implement message batching when needed
   - Consider message compression for large payloads

4. **Security**
   - Use SSL/TLS in production
   - Implement authentication when needed
   - Validate message payloads
   - Monitor for unusual patterns

## Next Steps

1. Explore the [API Documentation](./api/) for your preferred programming language
2. Read the [Protocol Specification](./protocol.md) for detailed protocol information
3. Check the [Configuration Guide](./configuration.md) for advanced settings
4. Review [Security Best Practices](./security.md)
5. See [Examples](./examples/) for more usage scenarios

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check if the server is running
   - Verify port numbers
   - Check firewall settings

2. **SSL/TLS Errors**
   - Verify certificate paths
   - Check certificate validity
   - Ensure proper SSL configuration

3. **Message Not Received**
   - Verify topic subscription
   - Check message format
   - Ensure connection is active

### Getting Help

- Check the [FAQ](./faq.md)
- Search [existing issues](https://github.com/your-org/mb-server-node/issues)
- Join our [community chat](https://chat.your-org.com)
- Contact [support](mailto:support@your-org.com)

## Contributing

We welcome contributions! Please see our [Contributing Guide](../CONTRIBUTING.md) for details on:
- Code of Conduct
- Development setup
- Submission guidelines
- Testing requirements