# Architecture Overview

## System Architecture

The MB Server Node is built with a modular architecture that separates concerns into distinct components while maintaining clear communication paths between them. Here's a detailed overview of the system:

### Core Components

1. **MessageBroker**
   - The main entry point and coordinator
   - Initializes and manages all core components
   - Sets up TCP and WebSocket servers
   - Handles system startup and shutdown

2. **ConnectionManager**
   - Manages service connections (both WebSocket and TCP)
   - Handles message sending and receiving
   - Maintains connection state
   - Provides connection cleanup
   - Integrates with MessageRouter for message routing
   - Works with ServiceRegistry for service management

3. **MessageRouter**
   - Routes messages between services
   - Handles request-response patterns
   - Manages message timeouts
   - Integrates with SubscriptionManager for pub/sub
   - Works with ServiceRegistry for service resolution

4. **ServiceRegistry**
   - Tracks active services
   - Manages service registration/deregistration
   - Handles service heartbeats
   - Processes system messages
   - Maintains service metadata

5. **SubscriptionManager**
   - Manages topic subscriptions
   - Handles pub/sub message routing
   - Maintains subscription priorities
   - Provides subscription cleanup

6. **MonitoringManager**
   - Manages system metrics
   - Tracks performance statistics
   - Provides monitoring interfaces
   - Handles metric registration

7. **SystemManager**
   - Manages system-level operations
   - Handles system monitoring
   - Provides system control interfaces

### Protocol Support

The system supports two primary connection protocols:

1. **WebSocket Protocol**
   - Native WebSocket framing
   - Browser-compatible
   - Automatic connection management
   - Built-in ping/pong for keepalive
   - WSS (WebSocket Secure) support
   - Ideal for web clients

2. **TCP Socket Protocol**
   - Custom binary framing (4-byte length prefix)
   - High performance
   - Manual buffer management
   - Custom keepalive implementation
   - TLS support
   - Ideal for service-to-service communication

### Message Flow

1. **Connection Establishment**
   ```
   Client -> ConnectionManager -> ServiceRegistry
   ```

2. **Message Publishing**
   ```
   Client -> ConnectionManager -> MessageRouter -> SubscriptionManager -> ConnectionManager -> Subscribers
   ```

3. **Request-Response**
   ```
   Client -> ConnectionManager -> MessageRouter -> Target Service -> MessageRouter -> ConnectionManager -> Original Client
   ```

4. **System Messages**
   ```
   Client -> ConnectionManager -> MessageRouter -> ServiceRegistry -> System Response -> MessageRouter -> ConnectionManager -> Client
   ```

### Security Features

1. **Connection Security**
   - SSL/TLS support for both protocols
   - Certificate-based authentication
   - Secure WebSocket (WSS) support
   - TLS 1.2+ enforcement

2. **Message Security**
   - Maximum message size enforcement
   - Message validation
   - Buffer overflow protection
   - Memory usage protection

3. **Service Security**
   - Service authentication
   - Heartbeat monitoring
   - Automatic inactive service cleanup
   - Connection state validation

### Monitoring and Metrics

1. **Connection Metrics**
   - Active connections
   - Connection rates
   - Message throughput
   - Error rates

2. **Router Metrics**
   - Message routing latency
   - Request timeouts
   - Routing errors
   - Queue sizes

3. **Service Metrics**
   - Active services
   - Service health
   - Response times
   - Error rates

### Error Handling

1. **Connection Errors**
   - Connection timeouts
   - Network errors
   - Protocol errors
   - Cleanup on failure

2. **Message Errors**
   - Malformed messages
   - Size violations
   - Timeout errors
   - Routing errors

3. **Service Errors**
   - Registration failures
   - Heartbeat failures
   - System message errors
   - Subscription errors

## Implementation Notes

1. **Component Initialization Order**
   ```
   MonitoringManager
   -> SystemManager
   -> SubscriptionManager
   -> MessageRouter
   -> ServiceRegistry
   -> ConnectionManager
   -> Protocol Servers
   ```

2. **Message Processing Pipeline**
   - Message reception
   - Protocol-specific framing
   - Message parsing
   - Header validation
   - Routing determination
   - Delivery execution
   - Response handling

3. **Service Lifecycle**
   - Connection establishment
   - Service registration
   - Topic subscription
   - Active message handling
   - Heartbeat monitoring
   - Graceful shutdown

4. **Error Recovery**
   - Automatic reconnection support
   - Message retry mechanisms
   - Service re-registration
   - Connection cleanup
   - Resource release

## Configuration

The system is highly configurable through the `config` module, allowing customization of:
- Protocol ports and hosts
- SSL/TLS settings
- Message size limits
- Timeout values
- Heartbeat intervals
- Monitoring options