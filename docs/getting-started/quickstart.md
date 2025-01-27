# Quick Start Guide

This guide helps you get started with MB Server Node quickly.

## Basic Usage

### 1. Start the Server

If installed from source:
```bash
npm start
```

The server will start with default configuration:
- WebSocket port: 8080
- TCP Socket port: 8081
- Monitoring port: 9090

### 2. Basic JavaScript Client Example

```javascript
const WebSocket = require('ws');

// Connect to MB Server
const ws = new WebSocket('ws://localhost:8080');

// Handle connection
ws.on('open', () => {
  console.log('Connected to MB Server');

  // Subscribe to a topic
  const subscribeMsg = 'SUBSCRIBE:example.topic:1.0:req1\n{}';
  ws.send(subscribeMsg);

  // Publish a message
  const publishMsg = 'PUBLISH:example.topic:1.0:req2\n{"message": "Hello World"}';
  ws.send(publishMsg);
});

// Handle messages
ws.on('message', (data) => {
  console.log('Received:', data.toString());
});

// Handle errors
ws.on('error', console.error);
```

### 3. Basic TCP Socket Example

```javascript
const net = require('net');

// Connect to MB Server
const client = new net.Socket();
client.connect(8081, 'localhost', () => {
  console.log('Connected to MB Server');

  // Subscribe to a topic
  const subscribeMsg = 'SUBSCRIBE:example.topic:1.0:req1\n{}';
  client.write(subscribeMsg);

  // Publish a message
  const publishMsg = 'PUBLISH:example.topic:1.0:req2\n{"message": "Hello World"}';
  client.write(publishMsg);
});

// Handle data
client.on('data', (data) => {
  console.log('Received:', data.toString());
});

// Handle errors
client.on('error', console.error);
```

## Message Types

### 1. Publish/Subscribe
```javascript
// Subscribe
'SUBSCRIBE:my.topic:1.0:req1\n{}'

// Publish
'PUBLISH:my.topic:1.0:req2\n{"data": "value"}'
```

### 2. Request/Response
```javascript
// Request
'REQUEST:service.name:1.0:req3\n{"action": "getData"}'

// Response
'RESPONSE:service.name:1.0:req3\n{"result": "success"}'
```

## Next Steps

1. Learn about [Message Format](../message-format/structure.md)
2. Explore [Protocol Options](../protocols/README.md)
3. Configure [Security Settings](../operations/security.md)
4. Set up [Monitoring](../operations/monitoring.md)