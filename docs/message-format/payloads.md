# Message Payloads

Message payloads in MB Server Node contain the actual data being transmitted. They follow specific formats and rules depending on the message type.

## Payload Types

1. **JSON Payloads**
   - Default payload format
   - Must be valid JSON
   - Used for structured data
   - UTF-8 encoded

2. **Binary Payloads**
   - Raw binary data
   - Used for file transfers and binary protocols
   - Size limits apply

3. **Error Payloads**
   - Special format for error messages
   - Contains standardized error information
   - Always JSON formatted

## JSON Payload Format

Standard JSON payloads should be valid JSON objects or arrays:

```json
{
    "field1": "value1",
    "field2": 123,
    "field3": {
        "nested": true
    },
    "field4": ["array", "values"]
}
```

### JSON Rules
1. Must be valid JSON
2. UTF-8 encoded
3. No control characters
4. No trailing commas
5. Maximum depth limit enforced
6. Property names follow camelCase
7. Arrays should have consistent item types

## Error Payload Format

Error payloads follow a standard format:

```json
{
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "timestamp": "2024-01-27T12:34:56.789Z",
    "details": {
        "additional": "error specific information"
    }
}
```

### Required Error Fields
1. `code`: String error code
2. `message`: Human-readable message
3. `timestamp`: ISO 8601 timestamp with timezone

### Optional Error Fields
1. `details`: Additional error context
2. `stack`: Stack trace (development only)

## Size Limits

- Maximum payload size defined in configuration
- Header size counted separately from payload size
- Applies to both JSON and binary payloads

## Validation

1. **Message Format Validation**
   - Header and payload separated by single newline
   - Header format matches specification
   - UTF-8 encoding for all text

2. **JSON Payload Validation**
   - Well-formed JSON structure
   - No undefined or `NaN` values
   - No circular references
   - No duplicate keys

3. **Error Response Validation**
   - All required fields present
   - Valid error code from defined set
   - ISO 8601 timestamp with timezone
   - Optional fields properly typed

## Examples

1. **Standard JSON Payload**
```json
{
    "command": "start",
    "parameters": {
        "delay": 1000,
        "mode": "normal"
    }
}
```

2. **Error Payload**
```json
{
    "code": "INVALID_PARAMETERS",
    "message": "Invalid delay value: must be positive",
    "timestamp": "2024-01-27T12:34:56.789Z",
    "details": {
        "parameter": "delay",
        "value": -1000,
        "constraint": "positive integer"
    }
}
```

3. **System Message Example**
```json
{
    "name": "Service Name",
    "description": "Service Description",
    "version": "1.0.0",
    "capabilities": ["feature1", "feature2"]
}
```