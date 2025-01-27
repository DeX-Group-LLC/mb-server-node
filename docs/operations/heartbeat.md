# Heartbeat System

The heartbeat system in MB Server Node ensures service availability and maintains connection health between services and the message broker.

## Overview

The heartbeat system uses periodic messages to:
- Verify service availability
- Maintain service registration
- Detect service failures
- Trigger automatic cleanup

## Timing Configuration

The heartbeat system uses two key timeouts:

1. **Retry Timeout** (`connection.heartbeatRetryTimeout`): 30 seconds
   - Period before broker sends next heartbeat request
   - Starts when a service registers or responds to a heartbeat
   - Resets when service responds to a heartbeat
   - Used to detect potential service issues early

2. **Deregister Timeout** (`connection.heartbeatDeregisterTimeout`): 60 seconds
   - Period before broker deregisters an unresponsive service
   - Starts when a service registers or responds to a heartbeat
   - Resets when service responds to a heartbeat
   - Used to cleanup inactive services

## Message Flow

### 1. Broker-Initiated Heartbeat
The broker sends heartbeat requests to services in these cases:
- After the retry timeout expires (30s)
- When manually triggered by system operations

```javascript
// Broker heartbeat request
request:system.heartbeat:1.0.0:123e4567-e89b-12d3-a456-426614174000
{}

// Service response
response:system.heartbeat:1.0.0:abc123def-4567-89ab-cdef-123456789abc:123e4567-e89b-12d3-a456-426614174000
{"status": "success"}
```

### 2. Service-Initiated Heartbeat
Services can also send heartbeat requests to the broker:
- To proactively update their status
- To verify broker availability
- When required by service logic

```javascript
// Service heartbeat request
request:system.heartbeat:1.0.0:123e4567-e89b-12d3-a456-426614174000
{}

// Broker response
response:system.heartbeat:1.0.0:abc123def-4567-89ab-cdef-123456789abc:123e4567-e89b-12d3-a456-426614174000
{"status": "success"}
```

## Service States

1. **Active**
   - Service is responding to heartbeats
   - Both timeouts are reset on each response
   - Service remains registered and operational

2. **Retry**
   - Service missed a heartbeat
   - Retry timeout triggered (30s)
   - Broker sends another heartbeat request
   - Service still registered but potentially problematic

3. **Deregistered**
   - Service unresponsive for deregister timeout (60s)
   - Service automatically deregistered
   - All subscriptions removed
   - Connection terminated
   - Resources cleaned up

## Error Handling

1. **Connection Issues**
   - Network problems detected via missed heartbeats
   - Retry mechanism activated automatically
   - Multiple retry attempts before deregistration
   - Graceful degradation of service

2. **Timeout Scenarios**
   - Response timeouts tracked
   - Multiple retry attempts made
   - Eventual deregistration if unresponsive
   - Resources properly cleaned up

## Best Practices

1. **Client Implementation**
   - Handle heartbeat requests promptly
   - Implement retry logic for failed requests
   - Monitor heartbeat status locally
   - Log heartbeat failures for debugging

2. **Configuration**
   - Adjust timeouts based on network conditions:
     ```yaml
     connection:
       heartbeatRetryTimeout: 30000    # 30 seconds
       heartbeatDeregisterTimeout: 60000 # 60 seconds
     ```
   - Consider service requirements
   - Balance responsiveness vs overhead
   - Monitor impact on system resources

3. **Monitoring**
   - Track heartbeat success rates
   - Monitor service health status
   - Alert on repeated failures
   - Log deregistration events
   - Watch for patterns in failures

## Related Topics
- [Service Registry](./service-registry.md)
- [Connection Management](./connection-management.md)
- [System Messages](./system-messages.md)