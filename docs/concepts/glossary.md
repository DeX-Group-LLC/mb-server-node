# Glossary

## Core Concepts

### MB Server Node
The main message broker server application that handles message routing, connection management, and protocol support.

### Message Broker
A middleware component that handles message routing between services, implementing publish-subscribe and request-response patterns.

### Service
A client application that connects to the message broker to send or receive messages. Each service is assigned a unique service ID.

### Connection
A network connection between a service and the message broker, using either WebSocket or TCP Socket protocol.

## Message Components

### Message
A complete unit of communication consisting of a header and payload, separated by a newline character.

### Header
The metadata portion of a message containing routing and control information, including action, topic, version, and optional fields.

### Payload
The data portion of a message containing the actual content being transmitted, formatted as JSON or binary data.

### Topic
A hierarchical address used for message routing, consisting of dot-separated segments (e.g., "service.events.europe").

## Actions

### Publish
A one-way message action where a service sends data to one or more subscribers via a topic.

### Request
A message action that initiates a request-response interaction, requiring a response from the target service.

### Response
A message action that completes a request-response interaction, containing either success data or error information.

## Protocol Terms

### WebSocket
A protocol providing full-duplex communication channels over a single TCP connection, ideal for web-based clients.

### TCP Socket
A raw TCP protocol implementation with custom message framing, optimized for high-performance service-to-service communication.

### TLS/SSL
Security protocols used to encrypt network traffic between services and the message broker.

## System Components

### Connection Manager
A component that manages service connections, handles connection lifecycle, and maintains connection state.

### Message Router
A component responsible for routing messages between services based on topics and actions.

### Service Registry
A component that maintains information about connected services and their subscriptions.

### Monitoring Manager
A component that tracks system metrics and performance statistics.

## Message Properties

### Service ID
A unique identifier assigned to each connected service by the Connection Manager.

### Request ID
A UUID used to correlate request and response messages in request-response interactions.

### Parent Request ID
A UUID linking related messages in a chain of requests, used for request tracing.

### Version
A semantic version number (MAJOR.MINOR.PATCH) indicating the message format version.