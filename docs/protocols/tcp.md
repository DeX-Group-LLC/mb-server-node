# TCP Socket Protocol

This document details the TCP Socket protocol implementation in MB Server Node.

## Connection Details

### Connection Format
```
hostname:port
```

### Connection Flow
```
Client                    Server
  |                         |
  |  TCP SYN               |
  |----------------------->|
  |                         |
  |  TCP SYN-ACK           |
  |<-----------------------|
  |                         |
  |  Protocol Handshake     |
  |<======================>|
```

## Features

### Core Capabilities
- Direct TCP communication
- Custom binary framing
- Manual connection management
- High performance
- Low overhead

### Message Format
```
[Length: 4 bytes][Flags: 4 bytes]
Header\n
JSON Payload
```

## Implementation

### Dependencies
```typescript
import { createServer, Socket } from 'net';
```

### Server Setup
```typescript
const server = createServer((socket) => {
    // Handle new connection
});

server.listen(8081, '0.0.0.0', () => {
    console.log('TCP server listening on port 8081');
});
```

### Connection Handling
```typescript
class TCPConnection {
    private socket: Socket;
    private buffer: Buffer;
    private expectedLength: number;

    constructor(socket: Socket) {
        this.socket = socket;
        this.buffer = Buffer.alloc(0);
        this.expectedLength = 0;

        socket.on('data', this.handleData.bind(this));
        socket.on('close', this.handleClose.bind(this));
        socket.on('error', this.handleError.bind(this));
    }

    private handleData(data: Buffer): void {
        this.buffer = Buffer.concat([this.buffer, data]);
        this.processBuffer();
    }

    private processBuffer(): void {
        // Process complete messages
        while (this.buffer.length >= 8) {
            if (this.expectedLength === 0) {
                // Read message length
                this.expectedLength = this.buffer.readUInt32BE(0);

                // Validate length
                if (this.expectedLength > MAX_MESSAGE_SIZE) {
                    this.socket.destroy(new Error('Message too large'));
                    return;
                }
            }

            // Check if complete message received
            if (this.buffer.length >= this.expectedLength + 8) {
                const message = this.buffer.slice(8, this.expectedLength + 8);
                this.handleMessage(message);

                // Remove processed message from buffer
                this.buffer = this.buffer.slice(this.expectedLength + 8);
                this.expectedLength = 0;
            } else {
                break;
            }
        }
    }
}
```

### Message Framing
- 4-byte length prefix (big-endian)
- 4-byte flags field
- Maximum message size: 1MB (configurable)
- Manual fragmentation handling
- Binary message support

## Performance Considerations

### Advantages
- Minimal protocol overhead
- Direct socket access
- Custom optimization
- Binary efficiency

### Overhead
- Custom frame headers (8 bytes)
- Manual fragmentation
- Keep-alive frames
- Protocol handling

## Security

### Transport Security
- TLS encryption
- Certificate validation
- Custom protocols
- Direct control

### Network Security
- Firewall rules
- Port restrictions
- Network isolation
- Access control

## Configuration Options

### Server Configuration
```typescript
{
    port: 8081,
    host: '0.0.0.0',
    backlog: 1024,
    keepAlive: true,
    keepAliveInitialDelay: 60000,
    noDelay: true
}
```

### SSL/TLS Options
```typescript
{
    cert: fs.readFileSync('server.crt'),
    key: fs.readFileSync('server.key'),
    ca: fs.readFileSync('ca.crt'),
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2'
}
```

## Error Handling

### Common Errors
1. Connection Failed
   ```
   Error: ECONNREFUSED
   ```

2. Connection Reset
   ```
   Error: ECONNRESET
   ```

3. Invalid Frame
   ```
   Error: Invalid message frame
   ```

### Error Recovery
```typescript
socket.on('error', (error) => {
    if (error.code === 'ECONNRESET') {
        // Handle connection reset
    } else if (error.code === 'ETIMEDOUT') {
        // Handle timeout
    }
});

socket.on('close', (hadError) => {
    if (hadError) {
        // Handle error closure
    }
    // Attempt reconnection
});
```

## Best Practices

1. **Connection Management**
   - Implement keep-alive mechanism
   - Handle reconnection manually
   - Clean up resources properly
   - Monitor socket state

2. **Performance**
   - Enable TCP_NODELAY
   - Use appropriate buffer sizes
   - Batch small messages
   - Monitor throughput

3. **Security**
   - Always use TLS in production
   - Validate certificates
   - Implement authentication
   - Set appropriate timeouts

4. **Error Handling**
   - Implement reconnection logic
   - Handle partial messages
   - Monitor error rates
   - Log connection issues

## Message Examples

### Request Message
```typescript
// Frame structure
const frame = Buffer.alloc(messageLength + 8);
frame.writeUInt32BE(messageLength, 0);  // Length
frame.writeUInt32BE(0, 4);              // Flags

// Message content
const message = Buffer.from('REQUEST:service.action:1.0.0:req-uuid\n{"data":"test"}');
message.copy(frame, 8);
```

### Keep-Alive Message
```typescript
// Keep-alive frame (8 bytes)
const keepAlive = Buffer.alloc(8);
keepAlive.writeUInt32BE(0, 0);     // Length = 0
keepAlive.writeUInt32BE(1, 4);     // Flags = KEEPALIVE
```