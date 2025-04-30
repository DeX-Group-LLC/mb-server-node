# System Messages

System messages in MB Server Node are special messages used for internal communication and management operations. They use the `system` topic prefix and follow specific formats for each operation.

## Topic Summary

| Topic                                                                               | Supported Actions | Description                                                       |
| ----------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------- |
| [`system.heartbeat`](#heartbeat-systemheartbeat)                                    | REQUEST, RESPONSE | Service health monitoring and status updates                      |
| [`system.initialize`](#initialize-systeminitialize)                                 | PUBLISH           | Sent by broker to client upon successful connection establishment |
| [`system.log.subscribe`](#log-subscribe-systemlogsubscribe)                         | REQUEST           | Subscribe to broker log messages with level and regex filters     |
| [`system.log.unsubscribe`](#log-unsubscribe-systemlogunsubscribe)                   | REQUEST           | Unsubscribe from broker log messages                              |
| [`system.metrics`](#metrics-systemmetrics)                                          | REQUEST           | Retrieve broker metrics with optional filters                     |
| [`system.service.list`](#list-services-systemservicelist)                           | REQUEST           | List all registered services and their status                     |
| [`system.service.register`](#service-registration-systemserviceregister)            | REQUEST           | Register or update a service with the broker                      |
| [`system.service.subscriptions`](#service-subscriptions-systemservicesubscriptions) | REQUEST           | Get subscription information for a service                        |
| [`system.topic.list`](#list-topics-systemtopiclist)                                 | REQUEST           | List all subscribed topics in the broker                          |
| [`system.topic.subscribe`](#subscribe-systemtopicsubscribe)                         | REQUEST           | Subscribe to a topic with a priority level                        |
| [`system.topic.unsubscribe`](#unsubscribe-systemtopicunsubscribe)                   | REQUEST           | Unsubscribe from a topic                                          |
| [`system.topic.subscriptions`](#topic-subscriptions-systemtopicsubscriptions)       | REQUEST           | Get detailed topic subscriptions                                  |

## Overview

System messages are used for:

- Service management
- Health monitoring
- System configuration
- Resource management
- Status reporting

## Supported System Topics

### 1. Service Management

#### Heartbeat (`system.heartbeat`)

The heartbeat system message is used to maintain and verify the health of service connections. Unlike other system messages, it supports both REQUEST and RESPONSE actions, allowing bi-directional health checks between services and the broker.

**Use Cases:**

- Broker checking service health
- Services proactively confirming their status
- Detecting network issues
- Triggering service deregistration on failure

**Implementation Notes:**

- Broker sends heartbeat requests every 30 seconds (configurable)
- Services must respond within the deregister timeout (60 seconds by default)
- Services can initiate heartbeats to reset their timeouts
- Each successful heartbeat resets both retry and deregister timers

**Possible Errors:**
| Error Type | Description | Cause | Recovery |
|------------|-------------|-------|----------|
| ServiceUnavailableError | Service not found | Service ID unknown or already deregistered | Re-register service |
| InvalidRequestError | Invalid action type | Using action other than REQUEST/RESPONSE | Use correct action type |
| TimeoutError | Response not received | Network issues or service unresponsive | Automatic retry, then deregister |

**Request Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| N/A | object | Yes | Empty object required |

**Response Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | Yes | "success" or "failure" |

Example:

```javascript
// Request
request:system.heartbeat:1.0.0:123e4567-e89b-12d3-a456-426614174000
{}

// Response
response:system.heartbeat:1.0.0:abc123def-4567-89ab-cdef-123456789abc:123e4567-e89b-12d3-a456-426614174000
{"status": "success"}
```

#### Service Registration (`system.service.register`)

The service registration message is used to register new services or update existing service information in the broker. This is typically the first system message a service sends after establishing a connection.

**Use Cases:**

- Initial service registration
- Updating service metadata
- Re-registering after connection loss
- Modifying service description

**Implementation Notes:**

- Service names must be unique and max 36 characters
- Descriptions limited to 1024 characters
- Registration automatically sets up heartbeat monitoring
- Re-registration with same ID updates existing service
- Registration creates service-specific metrics

**Possible Errors:**
| Error Type | Description | Cause | Recovery |
|------------|-------------|-------|----------|
| InvalidRequestError | Invalid name length | Name exceeds 36 characters | Use shorter name |
| InvalidRequestError | Invalid description length | Description exceeds 1024 characters | Shorten description |
| InvalidRequestError | Missing required fields | Name or description not provided | Include all required fields |
| InvalidRequestError | Invalid field types | Non-string values for name/description | Use correct data types |

**Request Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Service name (max 36 chars) |
| description | string | Yes | Service description (max 1024 chars) |

**Response Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | Yes | "success" or "failure" |

Example:

```javascript
// Request
request:system.service.register:1.0.0:123e4567-e89b-12d3-a456-426614174000
{
    "name": "MyService",
    "description": "Service description"
}

// Response
response:system.service.register:1.0.0:abc123def-4567-89ab-cdef-123456789abc:123e4567-e89b-12d3-a456-426614174000
{"status": "success"}
```

#### List Services (`system.service.list`)

The service list message provides a snapshot of all currently registered services and their status. This is useful for service discovery and system monitoring.

**Use Cases:**

- Service discovery
- Health monitoring
- System diagnostics
- Load balancing decisions
- Debugging connection issues

**Implementation Notes:**

- Returns all registered services regardless of state
- Timestamps are in ISO-8601 format
- Last heartbeat time helps identify stale services
- Connection time useful for uptime monitoring
- Increments discovery rate metric when called

**Possible Errors:**
| Error Type | Description | Cause | Recovery |
|------------|-------------|-------|----------|
| ServiceUnavailableError | Requesting service not found | Service not registered | Register service first |
| InvalidRequestError | Invalid payload | Non-empty payload provided | Send empty object |
| TimeoutError | Response timeout | System under heavy load | Retry with backoff |

**Request Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| N/A | object | Yes | Empty object required |

**Response Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| services | array | Yes | Array of service objects |
| services[].id | string | Yes | Service unique identifier |
| services[].name | string | Yes | Service name |
| services[].description | string | Yes | Service description |
| services[].connectedAt | string | Yes | ISO timestamp of initial connection |
| services[].lastHeartbeat | string | Yes | ISO timestamp of last heartbeat |
| status | string | Yes | "success" or "failure" |

Example:

```javascript
// Request
request:system.service.list:1.0.0:123e4567-e89b-12d3-a456-426614174000
{}

// Response
response:system.service.list:1.0.0:abc123def-4567-89ab-cdef-123456789abc:123e4567-e89b-12d3-a456-426614174000
{
    "services": [
        {
            "id": "service-id",
            "name": "Service Name",
            "description": "Service Description",
            "connectedAt": "2024-01-01T00:00:00.000Z",
            "lastHeartbeat": "2024-01-01T00:00:00.000Z"
        }
    ],
    "status": "success"
}
```

#### Service Subscriptions (`system.service.subscriptions`)

The service subscriptions message allows querying the current topic subscriptions for any registered service. This is particularly useful for debugging message routing and managing service configurations.

**Use Cases:**

- Debugging message routing
- Auditing service configurations
- System monitoring
- Load balancing
- Migration planning

**Implementation Notes:**

- Can query own subscriptions or other services'
- Returns empty array if no subscriptions
- Includes subscription priorities
- ServiceId parameter is validated as UUID4
- Requires service to be registered

**Possible Errors:**
| Error Type | Description | Cause | Recovery |
|------------|-------------|-------|----------|
| ServiceUnavailableError | Target service not found | Service ID doesn't exist | Verify service ID |
| ServiceUnavailableError | Requesting service not found | Requester not registered | Register service first |
| InvalidRequestError | Invalid service ID | Non-UUID4 service ID provided | Use valid UUID4 |
| TimeoutError | Response timeout | System under heavy load | Retry with backoff |

**Request Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| serviceId | string | No | Target service ID (defaults to requesting service) |

**Response Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| subscriptions | array | Yes | Array of subscription objects |
| subscriptions[].topic | string | Yes | Topic name |
| subscriptions[].priority | number | Yes | Subscription priority |
| status | string | Yes | "success" or "failure" |

Example:

```javascript
// Request
request:system.service.subscriptions:1.0.0:123e4567-e89b-12d3-a456-426614174000
{
    "serviceId": "target-service-id"  // Optional, defaults to requesting service
}

// Response
response:system.service.subscriptions:1.0.0:abc123def-4567-89ab-cdef-123456789abc:123e4567-e89b-12d3-a456-426614174000
{
    "subscriptions": [
        {
            "topic": "topic.name",
            "priority": 0
        }
    ],
    "status": "success"
}
```

### 2. Topic Management

#### Subscribe (`system.topic.subscribe`)

The topic subscribe message allows services to subscribe to specific topics for receiving messages. It supports priority levels for request/response patterns to control message delivery order when multiple services are subscribed to the same topic.

**Use Cases:**

- Setting up message routing
- Implementing pub/sub patterns
- Load balancing across services
- Creating message pipelines
- Setting up monitoring points

**Implementation Notes:**

- Topics must follow valid format (letters, numbers, dots)
- Maximum 5 levels in topic hierarchy
- Priority only applies to request/response subscriptions
- Publish subscriptions don't use priority (messages sent to all subscribers)
- Action type must be specified (publish, request, or both)
- Some system topics are restricted
- Duplicate subscriptions update existing subscription
- Supports wildcard patterns (+ and #)
- Uses efficient trie-based matching
- Wildcards only valid in subscription patterns

**Possible Errors:**
| Error Type | Description | Cause | Recovery |
|------------|-------------|-------|----------|
| ServiceUnavailableError | Service not found | Service not registered | Register service first |
| InvalidRequestError | Invalid topic format | Topic doesn't match pattern | Fix topic format |
| InvalidRequestError | Invalid priority | Non-numeric priority value or used with publish action | Use valid number for request actions only |
| InvalidRequestError | Restricted topic | Attempting to subscribe to protected system topic | Use allowed topic |
| InvalidRequestError | Missing fields | Required fields not provided | Include all fields |
| InvalidRequestError | Invalid wildcard | Wildcard in wrong position | Fix wildcard placement |
| InvalidRequestError | Missing action | Action type not specified | Specify publish, request, or both |

**Request Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| action | string | Yes | Subscription action type: "publish", "request", or "both" |
| topic | string | Yes | Topic name or pattern with optional wildcards (+, #) |
| priority | number | Only for request/both | Numeric priority for request message delivery order |

**Response Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | Yes | "success" or "failure" |

Example:

```javascript
// Request - Publish subscription (no priority needed)
request:system.topic.subscribe:1.0.0:123e4567-e89b-12d3-a456-426614174000
{
    "action": "publish",
    "topic": "my.topic"
}

// Request - Request subscription with priority
request:system.topic.subscribe:1.0.0:123e4567-e89b-12d3-a456-426614174000
{
    "action": "request",
    "topic": "my.service.action",
    "priority": 0
}

// Request - Both actions with wildcards
request:system.topic.subscribe:1.0.0:123e4567-e89b-12d3-a456-426614174000
{
    "action": "both",
    "topic": "events.+.alerts",  // Single-level wildcard
    "priority": 1               // Priority for request handling
}

// Response
response:system.topic.subscribe:1.0.0:abc123def-4567-89ab-cdef-123456789abc:123e4567-e89b-12d3-a456-426614174000
{"status": "success"}
```

#### Unsubscribe (`system.topic.unsubscribe`)

The topic unsubscribe message allows services to remove their subscriptions to specific topics. This is important for resource cleanup and managing message routing.

**Use Cases:**

- Cleaning up unused subscriptions
- Changing service responsibilities
- Resource optimization
- Service shutdown preparation
- Debugging message flow

**Implementation Notes:**

- Unsubscribing from non-existent subscription succeeds silently
- Some system topics cannot be unsubscribed from
- All subscriptions automatically removed on service deregistration
- Topic format must still be valid
- Success response doesn't guarantee messages were being received

**Possible Errors:**
| Error Type | Description | Cause | Recovery |
|------------|-------------|-------|----------|
| ServiceUnavailableError | Service not found | Service not registered | Register service first |
| InvalidRequestError | Invalid topic format | Topic doesn't match pattern | Fix topic format |
| InvalidRequestError | Protected topic | Attempting to unsubscribe from protected system topic | Use allowed topic |
| InvalidRequestError | Missing topic | Topic not provided in payload | Include topic field |
| InvalidRequestError | Invalid wildcard | Wildcard in wrong position | Fix wildcard placement |
| InvalidRequestError | Missing action | Action type not specified | Specify publish, request, or both |

**Request Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| action | string | Yes | Subscription action type: "publish", "request", or "both" |
| topic | string | Yes | Topic name |

**Response Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | Yes | "success" or "failure" |

Example:

```javascript
// Request
request:system.topic.unsubscribe:1.0.0:123e4567-e89b-12d3-a456-426614174000
{
    "topic": "my.topic"    // Required, valid topic name
}

// Response
response:system.topic.unsubscribe:1.0.0:abc123def-4567-89ab-cdef-123456789abc:123e4567-e89b-12d3-a456-426614174000
{"status": "success"}
```

#### List Topics (`system.topic.list`)

The topic list message provides a complete list of all topics currently subscribed to by any service. This is useful for system monitoring and debugging message routing.

**Use Cases:**

- System monitoring
- Service discovery
- Debugging message routing
- Auditing subscriptions
- Load analysis

**Implementation Notes:**

- Returns all topics with at least one subscriber
- Includes system topics if subscribed
- Topics returned in no particular order
- Empty array if no subscriptions exist
- Doesn't show subscription details (use topic.subscribers for that)

**Possible Errors:**
| Error Type | Description | Cause | Recovery |
|------------|-------------|-------|----------|
| ServiceUnavailableError | Service not found | Service not registered | Register service first |
| InvalidRequestError | Invalid payload | Non-empty payload provided | Send empty object |
| TimeoutError | Response timeout | System under heavy load | Retry with backoff |

**Request Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| N/A | object | Yes | Empty object required |

**Response Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| topics | array | Yes | Array of topic names |
| status | string | Yes | "success" or "failure" |

Example:

```javascript
// Request
request:system.topic.list:1.0.0:123e4567-e89b-12d3-a456-426614174000
{}

// Response
response:system.topic.list:1.0.0:abc123def-4567-89ab-cdef-123456789abc:123e4567-e89b-12d3-a456-426614174000
{"topics": ["topic1", "topic2"], "status": "success"}
```

#### Topic Subscriptions (`system.topic.subscriptions`)

The topic subscriptions message provides a detailed view of all topics and their subscribers in the system, including the action type (PUBLISH/REQUEST) and priority information for each subscription. This gives a complete picture of the message routing configuration.

**Use Cases:**

- Debugging message routing
- Load balancing analysis
- System monitoring
- Subscription verification
- Service dependency mapping
- Priority configuration auditing

**Implementation Notes:**

- Returns an array of topic subscription objects
- Each topic includes its action type (PUBLISH/REQUEST)
- Lists all subscribers for each topic with their priorities
- PUBLISH subscribers have no priority
- REQUEST subscribers maintain their configured priority
- Topics are sorted alphabetically
- Only includes topics with active subscribers
- Service IDs are in UUID4 format

**Possible Errors:**
| Error Type | Description | Cause | Recovery |
|------------|-------------|-------|----------|
| ServiceUnavailableError | Service not found | Service not registered | Register service first |
| InvalidRequestError | Invalid payload | Non-empty payload provided | Send empty object |
| TimeoutError | Response timeout | System under heavy load | Retry with backoff |

**Request Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| N/A | object | Yes | Empty object required |

**Response Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| subscriptions | array | Yes | Array of topic subscription objects |
| subscriptions[].action | string | Yes | "publish" or "request" |
| subscriptions[].topic | string | Yes | Topic name |
| subscriptions[].subscribers | array | Yes | Array of subscriber objects |
| subscriptions[].subscribers[].serviceId | string | Yes | UUID of subscribed service |
| subscriptions[].subscribers[].priority | number | No | Priority level (not included for publish) |
| status | string | Yes | "success" or "failure" |

Example:

```javascript
// Request
request:system.topic.subscriptions:1.0.0:123e4567-e89b-12d3-a456-426614174000
{}

// Response
response:system.topic.subscriptions:1.0.0:abc123def-4567-89ab-cdef-123456789abc:123e4567-e89b-12d3-a456-426614174000
{
    "subscriptions": [
        {
            "action": "publish",
            "topic": "events.alerts",
            "subscribers": [
                { "serviceId": "service1-uuid" },
                { "serviceId": "service2-uuid" }
            ]
        },
        {
            "action": "request",
            "topic": "system.status",
            "subscribers": [
                { "serviceId": "service3-uuid", "priority": 2 },
                { "serviceId": "service4-uuid", "priority": 1 }
            ]
        }
    ],
    "status": "success"
}
```

### 3. Logging and Metrics

#### Log Subscribe (`system.log.subscribe`)

The log subscribe message allows services to receive broker log messages filtered by level and content. This is essential for system monitoring and debugging.

**Use Cases:**

- System monitoring
- Error tracking
- Debugging
- Audit logging
- Performance monitoring

**Implementation Notes:**

- Default log level is "error" if not specified
- Valid levels: debug, info, warn, error
- Regex pattern is optional for content filtering
- Multiple log levels can be subscribed to
- Previous subscription is replaced on resubscribe

**Possible Errors:**
| Error Type | Description | Cause | Recovery |
|------------|-------------|-------|----------|
| ServiceUnavailableError | Service not found | Service not registered | Register service first |
| InvalidRequestError | Invalid log level | Unsupported log level provided | Use valid level |
| InvalidRequestError | Invalid regex | Malformed regex pattern | Fix regex pattern |
| InvalidRequestError | Invalid levels format | Levels not provided as array | Use array format |
| TimeoutError | Response timeout | System under heavy load | Retry with backoff |

**Request Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| levels | array | No | Array of log levels to filter by (defaults to ["error"]) |
| regex | string | No | Filter by regex |

**Response Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | Yes | "success" or "failure" |

Example:

```javascript
// Request
request:system.log.subscribe:1.0.0:123e4567-e89b-12d3-a456-426614174000
{
    "levels": ["error", "info", "warn", "debug"],  // Optional, defaults to ["error"]
    "regex": ".*error.*"                          // Optional, filter by regex
}

// Response
response:system.log.subscribe:1.0.0:abc123def-4567-89ab-cdef-123456789abc:123e4567-e89b-12d3-a456-426614174000
{"status": "success"}
```

#### Log Unsubscribe (`system.log.unsubscribe`)

The log unsubscribe message allows services to stop receiving broker log messages. This is useful for managing resource usage and controlling message flow.

**Use Cases:**

- Stopping log monitoring
- Resource cleanup
- Changing monitoring configuration
- Service shutdown preparation
- Debugging message flow

**Implementation Notes:**

- Removes all log level subscriptions
- Clears regex filter if set
- Automatically unsubscribed on service deregistration
- Success response even if not subscribed
- Stops receiving logs immediately

**Possible Errors:**
| Error Type | Description | Cause | Recovery |
|------------|-------------|-------|----------|
| ServiceUnavailableError | Service not found | Service not registered | Register service first |
| InvalidRequestError | Invalid payload | Non-empty payload provided | Send empty object |
| TimeoutError | Response timeout | System under heavy load | Retry with backoff |

**Request Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| N/A | object | Yes | Empty object required |

**Response Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | Yes | "success" or "failure" |

Example:

```javascript
// Request
request:system.log.unsubscribe:1.0.0:123e4567-e89b-12d3-a456-426614174000
{}

// Response
response:system.log.unsubscribe:1.0.0:abc123def-4567-89ab-cdef-123456789abc:123e4567-e89b-12d3-a456-426614174000
{"status": "success"}
```

#### Metrics (`system.metrics`)

The metrics message provides access to broker performance metrics and statistics. It supports filtering to retrieve specific metrics of interest.

**Use Cases:**

- Performance monitoring
- Resource utilization tracking
- Capacity planning
- Anomaly detection
- SLA compliance monitoring

**Implementation Notes:**

- Returns all metrics by default if no filter provided
- Supports regex pattern matching for metric names
- Metric values are point-in-time snapshots
- Rate metrics are calculated per second
- Gauge metrics show current values
- Uptime metrics show duration in seconds
- Metrics are cached briefly for performance

**Possible Errors:**
| Error Type | Description | Cause | Recovery |
|------------|-------------|-------|----------|
| ServiceUnavailableError | Service not found | Service not registered | Register service first |
| InvalidRequestError | Invalid filter pattern | Malformed regex pattern | Fix regex pattern |
| TimeoutError | Response timeout | System under heavy load | Retry with backoff |

**Request Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| showAll | boolean | No | Show all metrics (defaults to true) |
| paramFilter | object | No | Filter metrics by parameters |

**Response Payload:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| metrics | object | Yes | Metric data based on filters |
| status | string | Yes | "success" or "failure" |

Example:

```javascript
// Request
request:system.metrics:1.0.0:123e4567-e89b-12d3-a456-426614174000
{
    "showAll": true,                    // Optional, show all metrics
    "paramFilter": {                    // Optional, filter metrics by parameters
        "serviceId": "service-id"
    }
}

// Response
response:system.metrics:1.0.0:abc123def-4567-89ab-cdef-123456789abc:123e4567-e89b-12d3-a456-426614174000
{
    "metrics": {
        // Metric data based on filters
    },
    "status": "success"
}
```

### 4. Connection Management

#### Initialize (`system.initialize`)

The `system.initialize` message is sent by the broker to a client immediately after a connection is successfully established and registered internally. It serves as a confirmation to the client that the connection is ready for use.

**Use Cases:**

- Client confirmation that the connection is active.
- Trigger for the client to perform initial actions like service registration (`system.service.register`) or topic subscriptions (`system.topic.subscribe`).

**Implementation Notes:**

- This is a PUBLISH message sent _from_ the broker _to_ the newly connected client.
- Clients do not send requests for this topic.
- The message payload is currently empty but reserved for future use.
- Receipt of this message indicates the broker has assigned a `serviceId` and is ready to process further messages from the client.

**Message Header:**
| Field | Type | Value | Description |
|---------|--------|--------------------|-------------------------------------|
| action | string | "publish" | Indicates a publish message |
| topic | string | "system.initialize"| The specific system topic |
| version | string | "1.0.0" | Message version |

**Payload:**
| Field | Type | Required | Description |
|-------|--------|----------|-----------------------|
| N/A | object | Yes | Empty object required |

Example (Broker to Client):

```javascript
publish:system.initialize:1.0.0
{}
```

## Message Handling

1. **Action Types**

    - Most system topics only accept `REQUEST` actions
    - `system.heartbeat` accepts both `REQUEST` and `RESPONSE`
    - Invalid actions throw `InvalidRequestError`

2. **Topic Restrictions**

    - Only certain system topics can be subscribed to:
        - `system.log`
        - `system.message`
        - `system.service.register`
        - `system.topic.subscribe`
        - `system.topic.unsubscribe`
    - Other system topics are protected
    - Wildcards (+, #) only valid in subscription patterns
    - Hash wildcard (#) must be the last character
    - Plus wildcard (+) matches exactly one level

3. **Error Handling**

    - Service not found: `ServiceUnavailableError`
    - Invalid request format: `InvalidRequestError`
    - Unknown topic: `TopicNotSupportedError`
    - Invalid wildcard: `InvalidRequestError`
    - All errors increment service error rate metric

4. **Response Format**
    - All responses include a status
    - Success responses may include additional data
    - Error responses include error details
    - All responses preserve the original requestId

## Best Practices

1. **Service Implementation**

    - Handle all system messages asynchronously
    - Implement proper error handling
    - Validate message payloads
    - Log important events
    - Use appropriate wildcards sparingly

2. **Security**

    - Validate service permissions
    - Check topic restrictions
    - Implement rate limiting
    - Monitor system usage
    - Validate wildcard patterns

3. **Performance**

    - Process messages efficiently
    - Implement timeouts
    - Handle backpressure
    - Monitor metrics
    - Consider wildcard impact

4. **Topic Design**
    - Use clear hierarchical structure
    - Follow naming conventions
    - Plan for scalability
    - Use wildcards judiciously
    - Consider message routing patterns

## Related Topics

- [Heartbeat System](./heartbeat.md)
- [Service Registry](./service-registry.md)
- [Message Format](../message-format/README.md)
