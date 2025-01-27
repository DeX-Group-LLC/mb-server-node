# Message Format

This directory contains documentation about the message format used in MB Server Node.

## Overview

MB Server Node uses a text-based message format that consists of two parts:
1. A header containing metadata (action, topic, etc.)
2. A JSON payload containing the message data

Basic example:
```
publish:events.notification:1.0:123e4567-e89b-12d3-a456-426614174000
{"message": "Hello World"}
```

## Documentation Structure

- [Message Structure](structure.md) - Basic message structure and validation rules
- [Headers](headers.md) - Detailed header format and field specifications
- [Payloads](payloads.md) - JSON payload format and constraints

## Quick Reference

### Common Message Types

1. **Publish**
```
publish:events.user.created:1.0:123e4567-e89b-12d3-a456-426614174000
{"data": "value"}
```

2. **Subscribe**
```
subscribe:events.user.*:1.0:987fcdeb-51a2-43fe-ba98-765432198765
{}
```

3. **Request**
```
request:user.profile.get:1.0:def456ghi-7890-12ab-cdef-456789abcdef
{"action": "getData"}
```

4. **Response**
```
response:user.profile.get:1.0:abc123def-4567-89ab-cdef-123456789abc:def456ghi-7890-12ab-cdef-456789abcdef
{"result": "success"}
```

## See Also

- [Protocol Documentation](../protocols/README.md)
- [Quick Start Guide](../getting-started/quickstart.md)
- [API Documentation](../api/README.md)