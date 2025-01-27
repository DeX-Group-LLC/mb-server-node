# C++ API Documentation

> ⚠️ **IMPORTANT: This API Is Not Yet Implemented**
> This documentation is a specification for a future C++ client library that will be developed in a separate repository.
> The interfaces and examples shown here are placeholders and subject to change.
> Please check back later or watch the repository for updates on the actual implementation.

## Overview

This document provides a placeholder for the C++ client library implementation. The C++ client library will be implemented in a separate repository and will follow the protocol specifications defined in the MB Server Node.

## Protocol Support

The C++ client library will support both available protocols:

1. **WebSocket Protocol**
   - Uses a WebSocket client library (e.g., `libwebsockets` or `Boost.Beast`)
   - Supports WSS (WebSocket Secure)
   - Automatic message framing
   - Browser-compatible protocol

2. **TCP Socket Protocol**
   - Uses native TCP sockets
   - Custom binary framing (4-byte length prefix)
   - TLS support
   - High-performance implementation

## Message Format

### Header Format
```cpp
// Message header structure
struct MessageHeader {
    std::string action;      // REQUEST, RESPONSE, or PUBLISH
    std::string topic;       // Dot-separated topic path
    std::string version;     // Semantic version (e.g., "1.0.0")
    std::string requestId;   // UUID for request tracking
    std::string parentId;    // Optional parent request ID
    int timeout;            // Optional timeout in milliseconds
};
```

### Message Creation
```cpp
// Example message creation
std::string createMessage(const MessageHeader& header, const json& payload) {
    std::stringstream ss;

    // Format header
    ss << header.action << ":" << header.topic << ":" << header.version;
    if (!header.requestId.empty()) ss << ":" << header.requestId;
    if (!header.parentId.empty()) ss << ":" << header.parentId;
    if (header.timeout > 0) ss << ":" << header.timeout;

    // Add payload
    ss << "\n" << payload.dump();

    return ss.str();
}
```

## Connection Management

### WebSocket Connection
```cpp
class WebSocketClient {
public:
    // Connect to the broker
    void connect(const std::string& host, int port, bool useTLS = false);

    // Send a message
    void send(const std::string& message);

    // Register message handler
    void onMessage(std::function<void(const std::string&)> handler);

    // Register connection handlers
    void onConnect(std::function<void()> handler);
    void onDisconnect(std::function<void()> handler);
    void onError(std::function<void(const std::string&)> handler);
};
```

### TCP Socket Connection
```cpp
class TCPSocketClient {
public:
    // Connect to the broker
    void connect(const std::string& host, int port, bool useTLS = false);

    // Send a message with length prefix
    void send(const std::string& message);

    // Register message handler
    void onMessage(std::function<void(const std::string&)> handler);

    // Register connection handlers
    void onConnect(std::function<void()> handler);
    void onDisconnect(std::function<void()> handler);
    void onError(std::function<void(const std::string&)> handler);

private:
    // Frame message with 4-byte length prefix
    std::vector<uint8_t> frameMessage(const std::string& message);

    // Process incoming data with length-based framing
    void processIncomingData(const std::vector<uint8_t>& data);
};
```

## Service Registration

```cpp
class MessageBrokerClient {
public:
    // Register service with the broker
    void registerService(const std::string& name, const std::string& description);

    // Subscribe to topics
    void subscribe(const std::string& topic, int priority = 1);

    // Unsubscribe from topics
    void unsubscribe(const std::string& topic);

    // Send request and handle response
    void request(const std::string& topic,
                const json& payload,
                std::function<void(const json&)> responseHandler,
                int timeout = 30000);

    // Publish message to topic
    void publish(const std::string& topic, const json& payload);

    // Handle incoming messages
    void onMessage(std::function<void(const MessageHeader&, const json&)> handler);
};
```

## Example Usage

```cpp
#include "mb_client.hpp"

int main() {
    // Create client instance
    MessageBrokerClient client;

    // Connect to broker
    client.connect("localhost", 8080);

    // Register service
    client.registerService("TestService", "C++ test service");

    // Subscribe to topic
    client.subscribe("test.messages");

    // Handle incoming messages
    client.onMessage([](const MessageHeader& header, const json& payload) {
        std::cout << "Received message on topic: " << header.topic << std::endl;
        std::cout << "Payload: " << payload.dump(2) << std::endl;
    });

    // Send request
    client.request("test.service",
        {{"data", "test"}},
        [](const json& response) {
            std::cout << "Got response: " << response.dump(2) << std::endl;
        }
    );

    // Publish message
    client.publish("test.events", {
        {"event", "test"},
        {"timestamp", std::time(nullptr)}
    });

    // Run event loop
    client.run();

    return 0;
}
```

## Implementation Notes

The C++ client library will be implemented in a separate repository and will include:

1. **Core Features**
   - Both WebSocket and TCP Socket protocol support
   - SSL/TLS encryption support
   - Automatic reconnection handling
   - Message framing and parsing
   - Error handling and recovery
   - Thread safety

2. **Dependencies**
   - Modern C++ (C++17 or later)
   - JSON library (e.g., `nlohmann::json`)
   - WebSocket client library
   - SSL/TLS library
   - UUID generation library

3. **Build System**
   - CMake-based build system
   - Package manager integration
   - Cross-platform support

4. **Documentation**
   - API documentation
   - Example code
   - Protocol specifications
   - Security considerations

## Security Considerations

The C++ implementation will follow the same security practices as the server:

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
   - Memory error protection
   - Exception safety

## Future Development

The actual C++ client library will be developed in a separate repository. This documentation serves as a specification for that implementation.