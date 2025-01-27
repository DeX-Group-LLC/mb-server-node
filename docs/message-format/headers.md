# Message Headers

Message headers in MB Server Node contain routing and control information for message processing.

## Action Types

The `action` field defines the type of message:

1. **publish**
   - One-way message publication
   - No response expected
   - No timeout needed

2. **request**
   - Request-response pattern
   - Requires response
   - Can specify timeout
   - Requires request ID

3. **response**
   - Response to a request
   - Must include parent request ID
   - Contains success/error data
   - No timeout needed

## Topic Format

Topics follow a hierarchical structure using dots (.) as separators. A valid topic must:
- Start with a letter (a-z or A-Z)
- Contain only letters (a-z, A-Z) and numbers (0-9)
- Use dots (.) as level separators
- Have a maximum of 5 levels deep
- Not exceed 255 characters in total length

Examples:
```
baggage.events
flight.updates.europe
system.heartbeat
service.status.region.zone.node
```

### Topic Validation Rules
1. Must start with a letter
2. Each segment must start with a letter
3. Only letters and numbers allowed in segments
4. Maximum 5 levels deep
5. No consecutive dots
6. No leading or trailing dots
7. Case-insensitive (automatically converted to lowercase)

### Topic Patterns
The system supports wildcard patterns for topic matching:
- `*`: Matches any sequence of characters within a single level
- `>`: Matches any sequence of characters across multiple levels (must be at end)

Examples:
```
baggage.events.*      # Matches: baggage.events.europe, baggage.events.asia
baggage.*            # Matches: baggage.events, baggage.updates
baggage.>           # Matches: baggage.events.europe, baggage.updates.status
```

## Version Format

Versions follow Semantic Versioning (semver):
- Format: `MAJOR.MINOR.PATCH`
- Examples: `1.0.0`, `2.3.1`
- Maximum length: 20 characters

### Version Rules
1. Must be valid semver
2. No leading 'v'
3. No build metadata
4. No pre-release tags

## Request IDs

Request IDs are used for tracking and correlation:
- Format: UUID version 4
- Length: 36 characters
- Required for request/response patterns

### Request ID Rules
1. Must be valid UUID4
2. Case-insensitive
3. Required for 'request' action
4. Preserved in error responses

## Parent Request IDs

Parent Request IDs enable request chaining:
- Format: UUID version 4
- Length: 36 characters
- Optional field

### Parent Request ID Rules
1. Must be valid UUID4
2. Case-insensitive
3. Optional for all actions
4. Used for request tracing

## Timeouts

Timeout values for request-response patterns:
- Unit: Milliseconds
- Integer values only
- Optional for 'request' action

### Timeout Rules
1. Minimum: 0
2. Maximum: `config.request.response.timeout.max`
3. Only valid for 'request' action
4. Defaults to configuration value if not specified

## Header Examples

1. Simple Publish:
```
publish:service.event:1.0.0:550e8400-e29b-41d4-a716-446655440000
```

2. Subscribe:
```
subscribe:market.prices:2.0.0:550e8400-e29b-41d4-a716-446655440001
```

3. Request with Timeout:
```
request:service.action:1.0.0:550e8400-e29b-41d4-a716-446655440002::5000
```

4. Response:
```
response:service.action:1.0.0:550e8400-e29b-41d4-a716-446655440003:550e8400-e29b-41d4-a716-446655440002
```

5. Chained Request:
```
request:service.action:1.0.0:550e8400-e29b-41d4-a716-446655440004:123e4567-e89b-12d3-a456-426614174000:3000
```