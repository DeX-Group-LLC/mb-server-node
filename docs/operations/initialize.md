# Initialize System Message (`system.initialize`)

The `system.initialize` message is a crucial part of the connection handshake process in MB Server Node. It's sent by the broker to a client immediately after a successful connection is established and the client has been assigned a unique Service ID.

## Overview

The primary purpose of the `system.initialize` message is:

- To signal to the client that the connection is fully established and recognized by the broker.
- To indicate that the client can now safely send other messages, such as service registration or topic subscriptions.
- To serve as an event trigger for client-side initialization logic.

## Message Flow

1.  **Client Connects**: A client establishes a WebSocket connection to the MB Server Node.
2.  **Broker Registers**: The broker accepts the connection, assigns a unique `serviceId` (UUID), and registers the connection internally.
3.  **Broker Sends Initialize**: The broker sends a `system.initialize` message to the newly connected client over the established WebSocket.
4.  **Client Receives Initialize**: The client receives the message, confirming the connection is ready.
5.  **Client Actions**: The client can now proceed with further actions like registering itself using `system.service.register` or subscribing to topics using `system.topic.subscribe`.

```javascript
// Broker sends to Client upon successful connection
publish:system.initialize:1.0.0
{}
```

## Client Implementation

Clients should listen for the `system.initialize` message after establishing a connection. Upon receiving this message, they can confidently:

1.  **Register the Service**: Send a `system.service.register` message to provide a name and description for the service associated with the connection.
2.  **Subscribe to Topics**: Send `system.topic.subscribe` messages for any topics the service needs to listen to.
3.  **Initiate Other Logic**: Trigger any other application-specific setup required after a successful connection.

It is recommended that clients wait for `system.initialize` before sending registration or subscription requests to ensure the broker has fully processed the new connection.

## Error Handling

- The `system.initialize` message itself doesn't typically involve errors from the client's perspective, as it's a one-way notification from the broker.
- If a client _doesn't_ receive `system.initialize` within a reasonable timeframe after connecting, it might indicate a problem during the broker's internal connection setup or a network issue. The client should handle this scenario, potentially by attempting to reconnect.

## Best Practices

1.  **Wait for Initialize**: Always wait for the `system.initialize` message before sending subsequent system requests like registration or subscription.
2.  **Idempotency**: Client initialization logic triggered by `system.initialize` should ideally be idempotent, in case of rare scenarios involving reconnections.
3.  **Timeout**: Implement a timeout on the client-side waiting for `system.initialize` to handle potential connection setup failures gracefully.

## Related Topics

- [System Messages](./system-messages.md)
- [Service Registration](./system-messages.md#service-registration-systemserviceregister)
- [Topic Subscription](./system-messages.md#subscribe-systemtopicsubscribe)
- [Connection Management](../concepts/connection-management.md) # Assuming a concept doc exists
