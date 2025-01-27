# WebSocket Protocol

This document details the WebSocket protocol implementation in MB Server Node.

## Connection Details

### URL Format
```
ws[s]://hostname:port/path
```

### Connection Flow
```
Client                    Server
  |                         |
  |  HTTP Upgrade Request   |
  |----------------------->|
  |                         |
  |  HTTP Upgrade Response  |
  |<-----------------------|
  |                         |
  |  WebSocket Connection   |
  |<======================>|
```

## Features

### Built-in Capabilities
- HTTP/HTTPS compatible
- Automatic reconnection
- Built-in ping/pong
- Sub-protocol support
- Standard frame format

### Message Format
```
[WebSocket Frame]
Header\n
JSON Payload
```

## Implementation

### Dependencies
```json
{
  "ws": "^8.0.0"
}
```

### Server Setup
```typescript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({
    port: 8080,
    path: '/ws',
    clientTracking: true,
    maxPayload: 1048576 // 1MB
});
```

### Connection Handling
```typescript
wss.on('connection', (ws, req) => {
    // Connection established
    ws.on('message', (data) => {
        // Handle incoming message
    });

    ws.on('close', () => {
        // Handle connection close
    });

    ws.on('error', (error) => {
        // Handle errors
    });
});
```

### Message Framing
- Uses native WebSocket framing
- Maximum frame size: 1MB (configurable)
- Automatic fragmentation for large messages
- Built-in binary message support

## Performance Considerations

### Advantages
- Built-in framing
- Automatic fragmentation
- Proxy compatibility
- Standard compression

### Overhead
- WebSocket frame headers
- Upgrade handshake
- Ping/pong frames
- Text encoding

## Security

### Transport Security
- WSS (WebSocket Secure)
- TLS 1.2+ support
- Certificate validation
- Origin checking

### Proxy Security
- HTTP authentication
- Proxy tunneling
- Header security
- CORS policies

## Configuration Options

### Server Configuration
```typescript
{
    port: 8080,
    path: '/ws',
    backlog: 1024,
    maxPayload: 1048576,
    perMessageDeflate: true,
    clientTracking: true,
    verifyClient: (info) => boolean
}
```

### SSL/TLS Options
```typescript
{
    cert: fs.readFileSync('server.crt'),
    key: fs.readFileSync('server.key'),
    ca: fs.readFileSync('ca.crt'),
    rejectUnauthorized: true
}
```

## Error Handling

### Common Errors
1. Connection Failed
   ```
   Error: ECONNREFUSED
   ```

2. SSL/TLS Error
   ```
   Error: CERT_HAS_EXPIRED
   ```

3. Frame Too Large
   ```
   Error: Frame size of 2097152 exceeds maximum of 1048576
   ```

### Error Recovery
```typescript
ws.on('close', (code, reason) => {
    if (code === 1006) {
        // Abnormal closure, attempt reconnect
    }
});

ws.on('error', (error) => {
    if (error.code === 'ECONNRESET') {
        // Connection reset, attempt reconnect
    }
});
```

## Best Practices

1. **Connection Management**
   - Implement heartbeat mechanism
   - Handle reconnection gracefully
   - Clean up resources on close
   - Monitor connection health

2. **Performance**
   - Enable compression for large payloads
   - Monitor message sizes
   - Track frame fragmentation
   - Use binary messages when possible

3. **Security**
   - Always use WSS in production
   - Validate client origins
   - Implement authentication
   - Set appropriate timeouts

4. **Error Handling**
   - Implement reconnection logic
   - Log connection issues
   - Monitor error rates
   - Handle edge cases