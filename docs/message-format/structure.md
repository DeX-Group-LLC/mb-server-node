# Message Structure

MB Server Node messages follow a strict structure that enables efficient parsing and validation while maintaining human readability.

## Basic Structure

Every message consists of two parts, separated by a newline character:
1. Header
2. Payload

```
{header}\n{payload}
```

## Header Format

The header consists of required and optional fields, separated by colons:

```
{action}:{topic}:{version}[:{requestId}[:{parentRequestId}[:{timeout}]]]
```

### Field Descriptions

1. **Required Fields**
   - `action`: The message type/action (e.g., "publish", "subscribe")
   - `topic`: The message topic/route
   - `version`: Semantic version of the message format

2. **Optional Fields**
   - `requestId`: UUID4 for request tracking
   - `parentRequestId`: UUID4 of the parent request
   - `timeout`: Timeout in milliseconds for requests

### Field Order

The order of fields is strictly enforced:
1. Action (required)
2. Topic (required)
3. Version (required)
4. Request ID (optional)
5. Parent Request ID (optional)
6. Timeout (optional)

## Size Limits

1. **Header Limits**
   - Maximum header length: Defined by `MAX_HEADER_LENGTH`
   - Individual field limits:
     - Action: Length of longest action name
     - Topic: Defined by `Topic.MAX_TOPIC_LENGTH`
     - Version: 20 characters (semver format)
     - Request IDs: 36 characters (UUID4)
     - Timeout: Length of `config.request.response.timeout.max`

2. **Payload Limits**
   - Maximum payload size: Defined by `config.message.payload.maxLength`
   - Enforced at protocol level

## Validation Rules

1. **Header Validation**
   - No empty required fields
   - No spaces in fields
   - Valid action types only
   - Valid topic format
   - Valid semver version
   - Valid UUID4 for IDs
   - Valid timeout range

2. **Structure Validation**
   - Single newline separator
   - Complete header fields
   - Valid JSON payload (when applicable)

## Error Handling

1. **Malformed Headers**
   - Missing required fields
   - Invalid field values
   - Invalid separators

2. **Size Violations**
   - Header too long
   - Payload too large
   - Missing newline

3. **Error Responses**
   - Error details in payload
   - Original request ID preserved
   - Error timestamp included