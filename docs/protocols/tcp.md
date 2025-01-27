# TCP Socket Protocol

This document describes the TCP Socket protocol implementation in MB Server Node.

## Overview

The TCP Socket protocol provides a simple, efficient connection for services that don't require browser support. It uses a basic message framing format with a 4-byte length prefix.

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
// Subscribe
'subscribe:events.user.*:1.0:123e4567-e89b-12d3-a456-426614174000\n{}'

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

## Error Handling

1. **Invalid Length**
   - Length prefix must be a valid 32-bit unsigned integer
   - Must match actual message length
   - Must not exceed maximum message size

2. **Invalid Message**
   - Must be valid UTF-8 text
   - Must follow MB Server Node message format
   - Must contain valid JSON payload

3. **Connection Errors**
   - Handle connection drops
   - Implement reconnection logic
   - Monitor connection state

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