# TCP Protocol

## Overview

The TCP protocol implementation supports both secure (TLS) and unsecure connections. By default, only secure connections are allowed, but unsecure connections can be enabled for development or testing purposes.

## Configuration

### Ports
- Unsecure TCP: 8081 (default)
- Secure TCP (TLS): 8444 (default)

### Security Settings
- `allowUnsecure`: Whether to allow unsecure TCP connections (default: false)
- `ssl`: TLS configuration
  - `key`: Path to SSL private key file
  - `cert`: Path to SSL certificate file

## Server Types

### Secure TCP Server (TLS)
- Enabled when SSL configuration is provided
- Uses TLS v1.2 or higher
- Requires valid SSL certificate and private key
- Handles TLS handshake errors gracefully
- Logs connection attempts with IP addresses

### Unsecure TCP Server
- Only enabled when `allowUnsecure` is true
- Not recommended for production use
- Useful for development and testing
- Logs warning when started

## Connection Handling

Both secure and unsecure servers:
1. Accept incoming connections
2. Log connection details (IP address)
3. Set connection timeout
4. Handle connection errors
5. Clean up resources on close

## Message Format

Messages use a simple framing protocol:
```
[4 bytes length][payload]
```
- Length is in network byte order (big endian)
- Maximum message size is configurable
- Messages exceeding size limit trigger connection closure

## Error Handling

### Server Errors
- TLS handshake failures are logged at debug level
- Connection errors are logged with service ID and IP
- Server errors include TLS/TCP prefix in logs

### Connection Errors
- Socket errors trigger connection closure
- Connection manager is notified of closures
- Resources are properly cleaned up

## Best Practices

1. **Production Use**
   - Always use TLS (disable unsecure connections)
   - Configure proper certificate chain
   - Monitor TLS handshake failures
   - Set appropriate timeouts

2. **Development**
   - Enable unsecure connections if needed
   - Use self-signed certificates for TLS testing
   - Monitor debug logs for connection issues

3. **Security**
   - Keep TLS certificates up to date
   - Use strong TLS configuration
   - Monitor for connection attempts
   - Log all security-related events

## Connection

Default port: 8081 (configurable via `TCP_PORT`)

```javascript
const net = require('net');
const client = new net.Socket();
client.connect(8081, 'localhost');
```

## Message Framing

Each message is framed with a 4-byte length prefix:

```
[Length (4 bytes)][Message]
```

- **Length**: 32-bit unsigned integer in network byte order (big-endian)
- **Message**: UTF-8 encoded text in MB Server Node message format

### Example Frame

```javascript
// Message: "publish:topic:1.0:123\n{}"
// Length: 24 bytes

const message = 'publish:topic:1.0:123\n{}';
const length = Buffer.alloc(4);
length.writeUInt32BE(message.length);

socket.write(Buffer.concat([
    length,
    Buffer.from(message)
]));
```

## Message Format

Messages use the standard MB Server Node format:

```
action:topic:version:requestId[:parentId][:timeout]\n{"key": "value"}
```

Example messages:

```javascript
// Subscribe to a topic
'request:system.topic.subscribe:1.0:123e4567-e89b-12d3-a456-426614174000\n{
    "action": "publish",
    "topic": "events.user.+"
}'

// Subscribe with multi-level wildcard
'request:system.topic.subscribe:1.0:123e4567-e89b-12d3-a456-426614174000\n{
    "action": "both",
    "topic": "events.#",
    "priority": 0
}'

// Publish
'publish:events.user.created:1.0:987fcdeb-51a2-43fe-ba98-765432198765\n{"data": "value"}'

// Request
'request:user.profile.get:1.0:def456ghi-7890-12ab-cdef-456789abcdef\n{"action": "getData"}'

// Response
'response:user.profile.get:1.0:abc123def-4567-89ab-cdef-123456789abc:def456ghi-7890-12ab-cdef-456789abcdef\n{"result": "success"}'
```

## Reading Messages

To read messages:

1. Read 4 bytes for length
2. Read that many bytes for message
3. Parse message as UTF-8 text

```javascript
let lengthBuffer = Buffer.alloc(4);
socket.read(4, (err, bytes) => {
    if (err) throw err;
    const length = lengthBuffer.readUInt32BE();

    socket.read(length, (err, messageBuffer) => {
        if (err) throw err;
        const message = messageBuffer.toString('utf8');
        // Process message
    });
});
```

## Limitations

1. **Text Only**: Only supports UTF-8 encoded text messages. No binary payload support.
2. **Simple Framing**: Uses only message length, no additional framing flags or options.
3. **Maximum Size**: Messages limited to maximum payload length (configurable via `MAX_MESSAGE_PAYLOAD_LENGTH`).

## Example Implementation

```javascript
const net = require('net');

class TCPClient {
    constructor(host = 'localhost', port = 8081) {
        this.socket = new net.Socket();
        this.host = host;
        this.port = port;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.socket.connect(this.port, this.host, () => {
                resolve();
            });
            this.socket.on('error', reject);
        });
    }

    send(message) {
        const length = Buffer.alloc(4);
        length.writeUInt32BE(message.length);

        this.socket.write(Buffer.concat([
            length,
            Buffer.from(message)
        ]));
    }

    subscribe(topic) {
        const message = `request:system.topic.subscribe:1.0:${this.generateUUID()}\n{
            "action": "publish",
            "topic": "${topic}"
        }`;
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

## Best Practices

1. **Connection Management**
   - Implement connection timeouts
   - Handle reconnection gracefully
   - Monitor connection health

2. **Message Handling**
   - Validate message length
   - Handle partial reads
   - Implement message queuing

3. **Error Handling**
   - Handle network errors
   - Validate message format
   - Implement retry logic

4. **Performance**
   - Buffer messages when appropriate
   - Monitor message rates
   - Handle backpressure