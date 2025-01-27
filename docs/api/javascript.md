# JavaScript API Documentation

> ⚠️ **IMPORTANT: This API Is Not Yet Implemented**
> This documentation is a specification for a future JavaScript client library that will be developed in a separate repository.
> The interfaces and examples shown here are placeholders and subject to change.
> Please check back later or watch the repository for updates on the actual implementation.

## Overview

This document provides a placeholder for the JavaScript client library implementation. The JavaScript client library will be implemented in a separate repository and will follow the protocol specifications defined in the MB Server Node.

## Protocol Support

The JavaScript client library will support both available protocols:

1. **WebSocket Protocol**
   - Uses native WebSocket API in browsers
   - Uses `ws` package in Node.js
   - Supports WSS (WebSocket Secure)
   - Automatic message framing
   - Browser-compatible protocol
   - Promise-based async operations

2. **TCP Socket Protocol**
   - Uses Node.js `net` module (Node.js only)
   - Custom binary framing (4-byte length prefix)
   - TLS support
   - High-performance implementation
   - Promise-based async operations

## Message Format

### Header Format
```typescript
interface MessageHeader {
    action: 'REQUEST' | 'RESPONSE' | 'PUBLISH';  // Message action type
    topic: string;                               // Dot-separated topic path
    version: string;                             // Semantic version (e.g., "1.0.0")
    requestId: string;                           // UUID for request tracking
    parentId?: string;                          // Optional parent request ID
    timeout?: number;                           // Optional timeout in milliseconds
}
```

### Message Creation
```typescript
function createMessage(header: MessageHeader, payload: Record<string, any>): string {
    // Format header
    let headerStr = `${header.action}:${header.topic}:${header.version}`;
    if (header.requestId) headerStr += `:${header.requestId}`;
    if (header.parentId) headerStr += `:${header.parentId}`;
    if (header.timeout) headerStr += `:${header.timeout}`;

    // Add payload
    return `${headerStr}\n${JSON.stringify(payload)}`;
}
```

## Connection Management

### WebSocket Connection
```typescript
class WebSocketClient extends EventEmitter {
    constructor(options?: {
        reconnect?: boolean;
        reconnectInterval?: number;
        maxReconnectAttempts?: number;
    });

    // Connect to the broker
    connect(url: string, options?: {
        tls?: boolean;
        headers?: Record<string, string>;
        protocols?: string[];
    }): Promise<void>;

    // Send a message
    send(message: string): Promise<void>;

    // Event listeners
    on(event: 'message', handler: (message: string) => void): this;
    on(event: 'connect', handler: () => void): this;
    on(event: 'disconnect', handler: () => void): this;
    on(event: 'error', handler: (error: Error) => void): this;

    // Close the connection
    close(): Promise<void>;
}
```

### TCP Socket Connection (Node.js only)
```typescript
class TCPSocketClient extends EventEmitter {
    constructor(options?: {
        reconnect?: boolean;
        reconnectInterval?: number;
        maxReconnectAttempts?: number;
    });

    // Connect to the broker
    connect(host: string, port: number, options?: {
        tls?: boolean;
        cert?: Buffer;
        key?: Buffer;
        ca?: Buffer;
    }): Promise<void>;

    // Send a message
    send(message: string): Promise<void>;

    // Event listeners
    on(event: 'message', handler: (message: string) => void): this;
    on(event: 'connect', handler: () => void): this;
    on(event: 'disconnect', handler: () => void): this;
    on(event: 'error', handler: (error: Error) => void): this;

    // Close the connection
    close(): Promise<void>;

    private frameMessage(message: string): Buffer;
    private processIncomingData(data: Buffer): void;
}
```

## Service Registration

```typescript
class MessageBrokerClient extends EventEmitter {
    constructor(options?: {
        protocol: 'ws' | 'tcp';
        reconnect?: boolean;
        reconnectInterval?: number;
        maxReconnectAttempts?: number;
    });

    // Connect to the broker
    connect(url: string, options?: {
        tls?: boolean;
        headers?: Record<string, string>;
        protocols?: string[];
    }): Promise<void>;

    // Register service
    registerService(name: string, description: string): Promise<void>;

    // Subscribe to topics
    subscribe(topic: string, priority?: number): Promise<void>;

    // Unsubscribe from topics
    unsubscribe(topic: string): Promise<void>;

    // Send request and handle response
    request<T = any>(
        topic: string,
        payload: Record<string, any>,
        options?: {
            timeout?: number;
            parentId?: string;
        }
    ): Promise<T>;

    // Publish message
    publish(
        topic: string,
        payload: Record<string, any>,
        options?: {
            parentId?: string;
        }
    ): Promise<void>;

    // Event listeners
    on(event: 'message', handler: (header: MessageHeader, payload: any) => void): this;
    on(event: 'connect', handler: () => void): this;
    on(event: 'disconnect', handler: () => void): this;
    on(event: 'error', handler: (error: Error) => void): this;

    // Close the connection
    close(): Promise<void>;
}
```

## Example Usage

### Browser Usage
```typescript
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

        // Register service
        await client.registerService('TestService', 'Browser test service');

        // Subscribe to topic
        await client.subscribe('test.messages');

        // Handle incoming messages
        client.on('message', (header, payload) => {
            console.log(`Received message on topic: ${header.topic}`);
            console.log('Payload:', payload);
        });

        // Send request
        const response = await client.request('test.service', {
            data: 'test'
        }, {
            timeout: 30000
        });
        console.log('Got response:', response);

        // Publish message
        await client.publish('test.events', {
            event: 'test',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error:', error);
    }
}

main();
```

### Node.js Usage
```typescript
import { MessageBrokerClient } from '@mb/client';

async function main() {
    // Create client instance with TCP protocol
    const client = new MessageBrokerClient({
        protocol: 'tcp',
        reconnect: true
    });

    try {
        // Connect to broker
        await client.connect('localhost:8081', {
            tls: true,
            cert: fs.readFileSync('client-cert.pem'),
            key: fs.readFileSync('client-key.pem'),
            ca: fs.readFileSync('ca.pem')
        });

        // Rest of the code is the same as browser usage
        // ...

    } catch (error) {
        console.error('Error:', error);
    }
}

main();
```

## Implementation Notes

The JavaScript client library will be implemented in a separate repository and will include:

1. **Core Features**
   - Both WebSocket and TCP Socket protocol support
   - SSL/TLS encryption support
   - Automatic reconnection handling
   - Message framing and parsing
   - Error handling and recovery
   - Promise-based async operations
   - TypeScript type definitions

2. **Dependencies**
   - Node.js 18+ (for Node.js features)
   - Modern browser support
   - `ws` package (for Node.js WebSocket)
   - `uuid` package
   - Event emitter

3. **Build System**
   - TypeScript compilation
   - Webpack/Rollup bundling
   - NPM package distribution
   - Cross-platform support

4. **Documentation**
   - TypeDoc documentation
   - Example code
   - Protocol specifications
   - Security considerations

## Security Considerations

The JavaScript implementation will follow the same security practices as the server:

1. **Connection Security**
   - SSL/TLS support for both protocols
   - Certificate validation
   - Secure WebSocket (WSS) support
   - TLS 1.2+ enforcement

2. **Message Security**
   - Maximum message size enforcement
   - Message validation
   - Buffer overflow protection
   - Input sanitization

3. **Error Handling**
   - Connection error recovery
   - Protocol error handling
   - Exception safety
   - Resource cleanup

## Future Development

The actual JavaScript client library will be developed in a separate repository. This documentation serves as a specification for that implementation.