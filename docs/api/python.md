# Python API Documentation

> ⚠️ **IMPORTANT: This API Is Not Yet Implemented**
> This documentation is a specification for a future Python client library that will be developed in a separate repository.
> The interfaces and examples shown here are placeholders and subject to change.
> Please check back later or watch the repository for updates on the actual implementation.

## Overview

This document provides a placeholder for the Python client library implementation. The Python client library will be implemented in a separate repository and will follow the protocol specifications defined in the MB Server Node.

## Protocol Support

The Python client library will support both available protocols:

1. **WebSocket Protocol**
   - Uses `websockets` or `aiohttp` library
   - Supports WSS (WebSocket Secure)
   - Automatic message framing
   - Browser-compatible protocol
   - Async/await support

2. **TCP Socket Protocol**
   - Uses Python's `asyncio` for async socket operations
   - Custom binary framing (4-byte length prefix)
   - TLS support
   - High-performance implementation
   - Async/await support

## Message Format

### Header Format
```python
from dataclasses import dataclass
from typing import Optional

@dataclass
class MessageHeader:
    action: str          # REQUEST, RESPONSE, or PUBLISH
    topic: str          # Dot-separated topic path
    version: str        # Semantic version (e.g., "1.0.0")
    request_id: str     # UUID for request tracking
    parent_id: Optional[str] = None  # Optional parent request ID
    timeout: Optional[int] = None    # Optional timeout in milliseconds
```

### Message Creation
```python
import json
from uuid import uuid4

def create_message(header: MessageHeader, payload: dict) -> str:
    # Format header
    header_str = f"{header.action}:{header.topic}:{header.version}"
    if header.request_id:
        header_str += f":{header.request_id}"
    if header.parent_id:
        header_str += f":{header.parent_id}"
    if header.timeout:
        header_str += f":{header.timeout}"

    # Add payload
    return f"{header_str}\n{json.dumps(payload)}"
```

## Connection Management

### WebSocket Connection
```python
import asyncio
from typing import Callable, Any

class WebSocketClient:
    async def connect(self, host: str, port: int, use_tls: bool = False) -> None:
        """Connect to the broker"""
        pass

    async def send(self, message: str) -> None:
        """Send a message"""
        pass

    def on_message(self, handler: Callable[[str], None]) -> None:
        """Register message handler"""
        pass

    def on_connect(self, handler: Callable[[], None]) -> None:
        """Register connect handler"""
        pass

    def on_disconnect(self, handler: Callable[[], None]) -> None:
        """Register disconnect handler"""
        pass

    def on_error(self, handler: Callable[[Exception], None]) -> None:
        """Register error handler"""
        pass
```

### TCP Socket Connection
```python
class TCPSocketClient:
    async def connect(self, host: str, port: int, use_tls: bool = False) -> None:
        """Connect to the broker"""
        pass

    async def send(self, message: str) -> None:
        """Send a message with length prefix"""
        pass

    def on_message(self, handler: Callable[[str], None]) -> None:
        """Register message handler"""
        pass

    def on_connect(self, handler: Callable[[], None]) -> None:
        """Register connect handler"""
        pass

    def on_disconnect(self, handler: Callable[[], None]) -> None:
        """Register disconnect handler"""
        pass

    def on_error(self, handler: Callable[[Exception], None]) -> None:
        """Register error handler"""
        pass

    def _frame_message(self, message: str) -> bytes:
        """Frame message with 4-byte length prefix"""
        pass

    async def _process_incoming_data(self, data: bytes) -> None:
        """Process incoming data with length-based framing"""
        pass
```

## Service Registration

```python
from typing import Optional, Dict, Any

class MessageBrokerClient:
    async def register_service(self, name: str, description: str) -> None:
        """Register service with the broker"""
        pass

    async def subscribe(self, topic: str, priority: int = 1) -> None:
        """Subscribe to topics"""
        pass

    async def unsubscribe(self, topic: str) -> None:
        """Unsubscribe from topics"""
        pass

    async def request(self, topic: str,
                     payload: Dict[str, Any],
                     response_handler: Callable[[Dict[str, Any]], None],
                     timeout: int = 30000) -> None:
        """Send request and handle response"""
        pass

    async def publish(self, topic: str, payload: Dict[str, Any]) -> None:
        """Publish message to topic"""
        pass

    def on_message(self, handler: Callable[[MessageHeader, Dict[str, Any]], None]) -> None:
        """Handle incoming messages"""
        pass
```

## Example Usage

```python
import asyncio
from mb_client import MessageBrokerClient
from datetime import datetime

async def main():
    # Create client instance
    client = MessageBrokerClient()

    # Connect to broker
    await client.connect("localhost", 8080)

    # Register service
    await client.register_service("TestService", "Python test service")

    # Subscribe to topic
    await client.subscribe("test.messages")

    # Handle incoming messages
    def handle_message(header: MessageHeader, payload: Dict[str, Any]):
        print(f"Received message on topic: {header.topic}")
        print(f"Payload: {json.dumps(payload, indent=2)}")

    client.on_message(handle_message)

    # Send request
    async def handle_response(response: Dict[str, Any]):
        print(f"Got response: {json.dumps(response, indent=2)}")

    await client.request(
        "test.service",
        {"data": "test"},
        handle_response
    )

    # Publish message
    await client.publish("test.events", {
        "event": "test",
        "timestamp": datetime.now().isoformat()
    })

    # Run event loop
    try:
        await client.run()
    except KeyboardInterrupt:
        await client.close()

if __name__ == "__main__":
    asyncio.run(main())
```

## Implementation Notes

The Python client library will be implemented in a separate repository and will include:

1. **Core Features**
   - Both WebSocket and TCP Socket protocol support
   - SSL/TLS encryption support
   - Automatic reconnection handling
   - Message framing and parsing
   - Error handling and recovery
   - Async/await support throughout

2. **Dependencies**
   - Python 3.8+
   - `websockets` or `aiohttp` for WebSocket support
   - `asyncio` for async operations
   - `dataclasses` for message structures
   - `uuid` for request ID generation
   - `ssl` for TLS support

3. **Build System**
   - Poetry for dependency management
   - PyPI package distribution
   - Cross-platform support

4. **Documentation**
   - API documentation with docstrings
   - Example code
   - Protocol specifications
   - Security considerations

## Security Considerations

The Python implementation will follow the same security practices as the server:

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
   - Resource cleanup

## Future Development

The actual Python client library will be developed in a separate repository. This documentation serves as a specification for that implementation.