# Connection Protocols

MB Server Node supports two primary connection protocols, each optimized for different use cases.

## Protocol Comparison

| Feature | WebSocket | TCP Socket |
|---------|-----------|------------|
| **Use Case** | Web clients, browsers | Service-to-service |
| **Performance** | Good | Excellent |
| **Message Framing** | Built-in | Custom (4-byte length prefix) |
| **Browser Support** | Yes | No |
| **SSL/TLS** | WSS support | TLS support |
| **Binary Data** | Native support | Native support |
| **Fragmentation** | Automatic | Manual (length-based) |
| **Header Format** | Same | Same |
| **Payload Format** | Same | Same |
| **Max Message Size** | Configurable | Configurable |
| **Connection Management** | Automatic | Manual |
| **Error Handling** | Protocol-level | Application-level |

## Protocol Selection Guide

### Choose WebSocket When:
- Building web applications
- Requiring browser compatibility
- Working with existing WebSocket clients
- Need automatic connection management
- Want simpler client implementation

### Choose TCP Socket When:
- Building service-to-service communication
- Requiring maximum performance
- Working with binary protocols
- Need custom framing control
- Want full control over connection lifecycle

## Common Features

Both protocols support:
- SSL/TLS encryption
- Binary and JSON payloads
- Request-response pattern
- Publish-subscribe pattern
- Service registration
- Topic subscription
- Heartbeat monitoring
- Error handling

## Implementation Notes

For detailed protocol-specific information, see:
- [WebSocket Protocol](./websocket.md)
- [TCP Socket Protocol](./tcp.md)

## Security Considerations

Both protocols:
- Support SSL/TLS encryption
- Enforce message size limits
- Implement connection timeouts
- Monitor connection health
- Validate message format
- Handle connection errors

See individual protocol documentation for protocol-specific security details.

# Protocol Comparison Guide

This guide helps you choose between the WebSocket and TCP Socket protocols supported by MB Server Node.

## Protocol Overview

MB Server Node supports two primary protocols:
1. WebSocket Protocol (Default port: 8080)
2. TCP Socket Protocol (Default port: 8081)

## Feature Comparison

| Feature | WebSocket | TCP Socket |
|---------|-----------|------------|
| Browser Support | ✅ Yes | ❌ No |
| Node.js Support | ✅ Yes | ✅ Yes |
| SSL/TLS Support | ✅ Yes (WSS) | ✅ Yes |
| Binary Messages | ✅ Yes | ✅ Yes |
| Message Framing | Built-in | Custom (4-byte length) |
| Header Format | Text | Text |
| Payload Format | JSON | JSON |
| Max Message Size | Configurable | Configurable |
| Compression | ✅ Yes | ✅ Yes |
| Keep-Alive | Ping/Pong | Custom Frame |
| Proxy Support | ✅ Excellent | ⚠️ Limited |
| Performance | Good | Better |
| Overhead | Higher | Lower |

## Protocol Selection Guide

### Choose WebSocket When:

1. **Browser Support Required**
   - Web applications
   - Browser-based clients
   - Cross-origin connections

2. **Proxy Traversal Needed**
   - Corporate networks
   - Cloud environments
   - Load balancers

3. **Standardization Important**
   - Public APIs
   - Third-party integration
   - Wide client support

### Choose TCP Socket When:

1. **Performance Critical**
   - High-frequency trading
   - Real-time data processing
   - Low-latency requirements

2. **Resource Optimization Needed**
   - High message volumes
   - Limited bandwidth
   - Server-to-server communication

3. **Custom Protocol Control**
   - Custom framing
   - Binary protocols
   - Protocol extensions

## Protocol Details

### WebSocket Protocol

```
ws[s]://hostname:port/path
```

1. **Connection Flow**
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

2. **Features**
   - HTTP/HTTPS compatible
   - Automatic reconnection
   - Built-in ping/pong
   - Sub-protocol support
   - Standard frame format

3. **Message Format**
   ```
   [WebSocket Frame]
   Header\n
   JSON Payload
   ```

### TCP Socket Protocol

```
hostname:port
```

1. **Connection Flow**
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

2. **Features**
   - Custom framing
   - Lower overhead
   - Direct socket access
   - Binary optimization
   - Custom keep-alive

3. **Message Format**
   ```
   [Length: 4 bytes][Flags: 4 bytes]
   Header\n
   JSON Payload
   ```

## Performance Considerations

### WebSocket Performance

1. **Advantages**
   - Built-in framing
   - Automatic fragmentation
   - Proxy compatibility
   - Standard compression

2. **Overhead**
   - WebSocket frame headers
   - Upgrade handshake
   - Ping/pong frames
   - Text encoding

### TCP Socket Performance

1. **Advantages**
   - Minimal framing
   - Direct transmission
   - Binary efficiency
   - Custom optimization

2. **Overhead**
   - Custom frame headers
   - Manual fragmentation
   - Keep-alive frames
   - Protocol handling

## Implementation Examples

### WebSocket Example

```javascript
const client = new MessageBrokerClient({
    protocol: 'ws',
    url: 'ws://localhost:8080',
    options: {
        reconnect: true,
        compression: true
    }
});
```

### TCP Socket Example

```javascript
const client = new MessageBrokerClient({
    protocol: 'tcp',
    host: 'localhost',
    port: 8081,
    options: {
        reconnect: true,
        noDelay: true
    }
});
```

## Security Considerations

### WebSocket Security

1. **Transport Security**
   - WSS (WebSocket Secure)
   - TLS 1.2+ support
   - Certificate validation
   - Origin checking

2. **Proxy Security**
   - HTTP authentication
   - Proxy tunneling
   - Header security
   - CORS policies

### TCP Socket Security

1. **Transport Security**
   - TLS encryption
   - Certificate validation
   - Custom protocols
   - Direct control

2. **Network Security**
   - Firewall rules
   - Port restrictions
   - Network isolation
   - Access control

## Best Practices

1. **Protocol Selection**
   - Evaluate requirements
   - Consider environment
   - Test performance
   - Plan for scaling

2. **Security Setup**
   - Enable encryption
   - Configure authentication
   - Implement authorization
   - Monitor connections

3. **Performance Tuning**
   - Optimize settings
   - Monitor metrics
   - Adjust parameters
   - Test throughput

4. **Error Handling**
   - Implement reconnection
   - Handle timeouts
   - Log errors
   - Monitor health