# Java API Documentation

> ⚠️ **IMPORTANT: This API Is Not Yet Implemented**
> This documentation is a specification for a future Java client library that will be developed in a separate repository.
> The interfaces and examples shown here are placeholders and subject to change.
> Please check back later or watch the repository for updates on the actual implementation.

## Overview

This document provides a placeholder for the Java client library implementation. The Java client library will be implemented in a separate repository and will follow the protocol specifications defined in the MB Server Node.

## Protocol Support

The Java client library will support both available protocols:

1. **WebSocket Protocol**
   - Uses Java WebSocket API (JSR 356)
   - Supports WSS (WebSocket Secure)
   - Automatic message framing
   - Browser-compatible protocol
   - Non-blocking I/O

2. **TCP Socket Protocol**
   - Uses Java NIO for non-blocking operations
   - Custom binary framing (4-byte length prefix)
   - TLS support
   - High-performance implementation
   - Non-blocking I/O

## Message Format

### Header Format
```java
public class MessageHeader {
    private final String action;      // REQUEST, RESPONSE, or PUBLISH
    private final String topic;       // Dot-separated topic path
    private final String version;     // Semantic version (e.g., "1.0.0")
    private final String requestId;   // UUID for request tracking
    private final String parentId;    // Optional parent request ID
    private final Integer timeout;    // Optional timeout in milliseconds

    // Builder pattern for optional fields
    public static class Builder {
        private final String action;
        private final String topic;
        private final String version;
        private final String requestId;
        private String parentId;
        private Integer timeout;

        public Builder(String action, String topic, String version, String requestId) {
            this.action = action;
            this.topic = topic;
            this.version = version;
            this.requestId = requestId;
        }

        public Builder parentId(String parentId) {
            this.parentId = parentId;
            return this;
        }

        public Builder timeout(Integer timeout) {
            this.timeout = timeout;
            return this;
        }

        public MessageHeader build() {
            return new MessageHeader(this);
        }
    }
}
```

### Message Creation
```java
public class MessageUtils {
    public static String createMessage(MessageHeader header, JsonObject payload) {
        StringBuilder sb = new StringBuilder();

        // Format header
        sb.append(header.getAction())
          .append(':')
          .append(header.getTopic())
          .append(':')
          .append(header.getVersion());

        if (header.getRequestId() != null) {
            sb.append(':').append(header.getRequestId());
        }
        if (header.getParentId() != null) {
            sb.append(':').append(header.getParentId());
        }
        if (header.getTimeout() != null) {
            sb.append(':').append(header.getTimeout());
        }

        // Add payload
        sb.append('\n')
          .append(payload.toString());

        return sb.toString();
    }
}
```

## Connection Management

### WebSocket Connection
```java
public class WebSocketClient implements AutoCloseable {
    private final URI uri;
    private final boolean useTls;
    private WebSocket webSocket;
    private final List<MessageHandler> messageHandlers = new CopyOnWriteArrayList<>();
    private final List<ConnectionHandler> connectionHandlers = new CopyOnWriteArrayList<>();
    private final List<ErrorHandler> errorHandlers = new CopyOnWriteArrayList<>();

    public CompletableFuture<Void> connect(String host, int port) {
        // Implementation
    }

    public CompletableFuture<Void> send(String message) {
        // Implementation
    }

    public void onMessage(MessageHandler handler) {
        messageHandlers.add(handler);
    }

    public void onConnect(ConnectionHandler handler) {
        connectionHandlers.add(handler);
    }

    public void onDisconnect(ConnectionHandler handler) {
        connectionHandlers.add(handler);
    }

    public void onError(ErrorHandler handler) {
        errorHandlers.add(handler);
    }

    @Override
    public void close() {
        // Implementation
    }
}
```

### TCP Socket Connection
```java
public class TCPSocketClient implements AutoCloseable {
    private final String host;
    private final int port;
    private final boolean useTls;
    private AsynchronousSocketChannel channel;
    private final List<MessageHandler> messageHandlers = new CopyOnWriteArrayList<>();
    private final List<ConnectionHandler> connectionHandlers = new CopyOnWriteArrayList<>();
    private final List<ErrorHandler> errorHandlers = new CopyOnWriteArrayList<>();

    public CompletableFuture<Void> connect() {
        // Implementation
    }

    public CompletableFuture<Void> send(String message) {
        // Implementation
    }

    public void onMessage(MessageHandler handler) {
        messageHandlers.add(handler);
    }

    public void onConnect(ConnectionHandler handler) {
        connectionHandlers.add(handler);
    }

    public void onDisconnect(ConnectionHandler handler) {
        connectionHandlers.add(handler);
    }

    public void onError(ErrorHandler handler) {
        errorHandlers.add(handler);
    }

    private ByteBuffer frameMessage(String message) {
        // Implementation
    }

    private void processIncomingData(ByteBuffer data) {
        // Implementation
    }

    @Override
    public void close() {
        // Implementation
    }
}
```

## Service Registration

```java
public class MessageBrokerClient implements AutoCloseable {
    private final WebSocketClient wsClient;
    private final TCPSocketClient tcpClient;
    private final ObjectMapper objectMapper;
    private final Map<String, CompletableFuture<JsonObject>> pendingRequests = new ConcurrentHashMap<>();
    private final List<MessageHandler> messageHandlers = new CopyOnWriteArrayList<>();

    public CompletableFuture<Void> registerService(String name, String description) {
        // Implementation
    }

    public CompletableFuture<Void> subscribe(String topic, int priority) {
        // Implementation
    }

    public CompletableFuture<Void> unsubscribe(String topic) {
        // Implementation
    }

    public CompletableFuture<JsonObject> request(String topic, JsonObject payload, Duration timeout) {
        // Implementation
    }

    public CompletableFuture<Void> publish(String topic, JsonObject payload) {
        // Implementation
    }

    public void onMessage(MessageHandler handler) {
        messageHandlers.add(handler);
    }

    @Override
    public void close() {
        // Implementation
    }
}
```

## Example Usage

```java
public class Example {
    public static void main(String[] args) {
        try (MessageBrokerClient client = new MessageBrokerClient()) {
            // Connect to broker
            client.connect("localhost", 8080)
                .thenCompose(v -> {
                    // Register service
                    return client.registerService("TestService", "Java test service");
                })
                .thenCompose(v -> {
                    // Subscribe to topic
                    return client.subscribe("test.messages", 1);
                })
                .thenAccept(v -> {
                    // Handle incoming messages
                    client.onMessage((header, payload) -> {
                        System.out.println("Received message on topic: " + header.getTopic());
                        System.out.println("Payload: " + payload.toString());
                    });

                    // Send request
                    JsonObject requestPayload = Json.createObjectBuilder()
                        .add("data", "test")
                        .build();

                    client.request("test.service", requestPayload, Duration.ofSeconds(30))
                        .thenAccept(response -> {
                            System.out.println("Got response: " + response.toString());
                        });

                    // Publish message
                    JsonObject publishPayload = Json.createObjectBuilder()
                        .add("event", "test")
                        .add("timestamp", Instant.now().toString())
                        .build();

                    client.publish("test.events", publishPayload);
                })
                .join();

            // Keep the application running
            Thread.currentThread().join();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

## Implementation Notes

The Java client library will be implemented in a separate repository and will include:

1. **Core Features**
   - Both WebSocket and TCP Socket protocol support
   - SSL/TLS encryption support
   - Automatic reconnection handling
   - Message framing and parsing
   - Error handling and recovery
   - Non-blocking I/O throughout

2. **Dependencies**
   - Java 11+
   - Jakarta WebSocket API
   - Jackson for JSON handling
   - SLF4J for logging
   - JUnit 5 for testing

3. **Build System**
   - Maven/Gradle build system
   - Maven Central distribution
   - Cross-platform support

4. **Documentation**
   - Javadoc documentation
   - Example code
   - Protocol specifications
   - Security considerations

## Security Considerations

The Java implementation will follow the same security practices as the server:

1. **Connection Security**
   - SSL/TLS support for both protocols
   - Certificate validation
   - Secure WebSocket (WSS) support
   - TLS 1.2+ enforcement

2. **Message Security**
   - Maximum message size enforcement
   - Message validation
   - Buffer overflow protection
   - Memory safety

3. **Error Handling**
   - Connection error recovery
   - Protocol error handling
   - Exception safety
   - Resource cleanup with try-with-resources

## Future Development

The actual Java client library will be developed in a separate repository. This documentation serves as a specification for that implementation.