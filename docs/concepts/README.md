# Core Concepts

This guide explains the core concepts and terminology used in MB Server Node.

## Topics

Topics are hierarchical strings separated by dots (e.g., `"company.department.service"`). They are used to organize and route messages.

Example topic patterns:
- `"weather.updates"` - Weather update messages
- `"user.profile.changed"` - User profile change events
- `"orders.*.processed"` - All processed orders (wildcard)
- `"system.#"` - All system messages (multi-level wildcard)

### Topic Design Best Practices

1. Use hierarchical structure
2. Keep topics descriptive but concise
3. Use consistent naming conventions
4. Plan for scalability

## Message Types

### 1. Publish/Subscribe (Pub/Sub)
- One-to-many communication
- Publishers send messages to topics
- Subscribers receive messages from topics they're interested in

Example:
```javascript
// Subscribe to a topic
'subscribe:events.user.*:1.0:123e4567-e89b-12d3-a456-426614174000\n{}'

// Publish to a topic
'publish:events.user.created:1.0:987fcdeb-51a2-43fe-ba98-765432198765\n{"data": "value"}'
```

### 2. Request/Response
- One-to-one communication
- Client sends a request to a specific service
- Service processes the request and sends back a response

Example:
```javascript
// Send a request
'request:user.profile.get:1.0:def456ghi-7890-12ab-cdef-456789abcdef\n{"userId": "12345"}'

// Send a response
'response:user.profile.get:1.0:abc123def-4567-89ab-cdef-123456789abc:def456ghi-7890-12ab-cdef-456789abcdef\n{"result": "success"}'
```

## Message Format

Messages consist of two parts:

### 1. Header
Contains metadata about the message in the format:
```
action:topic:version:requestId[:parentId][:timeout]
```

Components:
- `action`: The type of message (publish, subscribe, request, response)
- `topic`: The topic for routing the message
- `version`: Message format version
- `requestId`: Unique identifier for the message
- `parentId`: (Optional) ID of the related request for responses
- `timeout`: (Optional) Request timeout in milliseconds

### 2. Payload
- Contains the actual message data
- Must be valid JSON format
- Separated from header by a newline character

Example complete message:
```
request:user.profile.get:1.0:123e4567-e89b-12d3-a456-426614174000
{"userId": "12345"}
```

## Best Practices

### Error Handling
- Implement proper error handling
- Use timeouts for requests
- Handle reconnection scenarios
- Log errors appropriately

### Performance
- Monitor message sizes
- Use appropriate protocol for your use case
- Implement message batching when needed
- Consider message compression for large payloads

### Security
- Use SSL/TLS in production
- Implement authentication when needed
- Validate message payloads
- Monitor for unusual patterns

## Related Documentation

1. [Message Flow](./message-flow.md)
2. [Architecture Overview](./architecture.md)
3. [Glossary](./glossary.md)