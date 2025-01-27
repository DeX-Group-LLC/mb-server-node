# Message Format Overview

This document provides an overview of the message format used in MB Server Node.

## Message Structure

Every message in MB Server Node consists of two parts:
1. Header (metadata)
2. Payload (data)

The header and payload are separated by a newline character (`\n`):

```
ACTION:TOPIC:VERSION:REQUEST_ID[:PARENT_ID][:TIMEOUT]
{"key": "value"}
```

## Header Format

### Structure

The header is a colon-separated string with the following fields:

```
Field1:Field2:Field3:Field4[:Field5][:Field6]
```

### Required Fields

1. **ACTION**
   - Type: Enum String
   - Values: `REQUEST`, `RESPONSE`, `PUBLISH`
   - Purpose: Defines message type and handling

2. **TOPIC**
   - Type: String
   - Format: Dot-separated path
   - Example: `user.profile.update`
   - Purpose: Message routing and filtering

3. **VERSION**
   - Type: String
   - Format: Semantic version
   - Example: `1.0.0`
   - Purpose: API versioning

4. **REQUEST_ID**
   - Type: UUID v4
   - Format: 32 hex chars with hyphens
   - Example: `123e4567-e89b-12d3-a456-426614174000`
   - Purpose: Message tracking and correlation

### Optional Fields

5. **PARENT_ID** (Optional)
   - Type: UUID v4
   - Format: Same as REQUEST_ID
   - Purpose: Links related messages
   - Example: `987fcdeb-51a2-43fe-ba98-765432198765`

6. **TIMEOUT** (Optional)
   - Type: Integer
   - Unit: Milliseconds
   - Range: 1-3600000
   - Purpose: Request timeout control
   - Example: `30000`

## Payload Format

### Structure

The payload must be a valid JSON object or array:

```json
{
    "key1": "value1",
    "key2": {
        "nested": "value2"
    },
    "key3": [1, 2, 3]
}
```

### Constraints

1. **Size Limits**
   - Maximum size: 1MB (configurable)
   - Minimum size: 2 bytes (`{}`)
   - Compression: Optional

2. **Format Requirements**
   - Valid JSON
   - UTF-8 encoding
   - No control characters
   - No trailing commas

3. **Value Types**
   - Strings
   - Numbers
   - Booleans
   - Objects
   - Arrays
   - null

## Message Types

### 1. Request Messages

```
REQUEST:service.action:1.0.0:req-uuid
{
    "param1": "value1",
    "param2": "value2"
}
```

### 2. Response Messages

```
RESPONSE:service.action:1.0.0:resp-uuid:req-uuid
{
    "result": "success",
    "data": {
        "key": "value"
    }
}
```

### 3. Publish Messages

```
PUBLISH:events.user.login:1.0.0:pub-uuid
{
    "userId": "123",
    "timestamp": "2024-01-20T12:00:00Z"
}
```

### 4. Error Messages

```
RESPONSE:service.action:1.0.0:err-uuid:req-uuid
{
    "error": {
        "code": "ERROR_CODE",
        "message": "Error description",
        "details": {}
    }
}
```

## Topic Format

### Structure

Topics are hierarchical paths separated by dots:

```
level1.level2.level3
```

### Rules

1. **Format**
   - Allowed characters: `a-z`, `A-Z`, `0-9`, `_`, `-`
   - Separator: `.` (dot)
   - Maximum length: 255 characters
   - Maximum levels: 16

2. **Wildcards**
   - Single level: `*`
   - Multi level: `#`
   - Examples:
     - `user.*.profile`
     - `events.#`

3. **Reserved Topics**
   - System topics start with `$SYS`
   - Example: `$SYS.stats.connections`

## Examples

### Service Registration

```
REQUEST:$SYS.register:1.0.0:123e4567-e89b-12d3-a456-426614174000
{
    "name": "user-service",
    "version": "1.0.0",
    "description": "User management service"
}
```

### Topic Subscription

```
REQUEST:$SYS.subscribe:1.0.0:987fcdeb-51a2-43fe-ba98-765432198765
{
    "topic": "events.user.*",
    "priority": 1
}
```

### Event Publication

```
PUBLISH:events.user.created:1.0.0:abc123def-4567-89ab-cdef-123456789abc
{
    "userId": "user123",
    "email": "user@example.com",
    "timestamp": "2024-01-20T12:00:00Z"
}
```

### Service Request

```
REQUEST:user.profile.get:1.0.0:def456ghi-7890-12ab-cdef-456789abcdef:30000
{
    "userId": "user123",
    "fields": ["email", "name", "avatar"]
}
```

### Service Response

```
RESPONSE:user.profile.get:1.0.0:jkl789mno-1234-56cd-efgh-789abcdef012:def456ghi-7890-12ab-cdef-456789abcdef
{
    "userId": "user123",
    "profile": {
        "email": "user@example.com",
        "name": "John Doe",
        "avatar": "https://example.com/avatar.jpg"
    }
}
```

## Best Practices

1. **Message Design**
   - Keep payloads concise
   - Use appropriate types
   - Include necessary metadata
   - Follow naming conventions

2. **Topic Design**
   - Use hierarchical structure
   - Keep topics descriptive
   - Plan for scalability
   - Consider access control

3. **Error Handling**
   - Use standard error codes
   - Provide clear messages
   - Include relevant details
   - Enable troubleshooting

4. **Performance**
   - Optimize payload size
   - Use compression when needed
   - Monitor message rates
   - Track latencies

## Validation

1. **Header Validation**
   - Check field presence
   - Validate field formats
   - Verify UUIDs
   - Check versions

2. **Payload Validation**
   - Verify JSON syntax
   - Check size limits
   - Validate data types
   - Ensure UTF-8 encoding

3. **Topic Validation**
   - Check format
   - Verify length
   - Validate characters
   - Check hierarchy