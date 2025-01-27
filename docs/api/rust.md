# Rust API Documentation

> ⚠️ **IMPORTANT: This API Is Not Yet Implemented**
> This documentation is a specification for a future Rust client library that will be developed in a separate repository.
> The interfaces and examples shown here are placeholders and subject to change.
> Please check back later or watch the repository for updates on the actual implementation.

## Overview

This document provides a placeholder for the Rust client library implementation. The Rust client library will be implemented in a separate repository and will follow the protocol specifications defined in the MB Server Node.

## Protocol Support

The Rust client library will support both available protocols:

1. **WebSocket Protocol**
   - Uses `tokio-tungstenite` for async WebSocket
   - Supports WSS (WebSocket Secure)
   - Automatic message framing
   - Browser-compatible protocol
   - Async/await support

2. **TCP Socket Protocol**
   - Uses `tokio` for async networking
   - Custom binary framing (4-byte length prefix)
   - TLS support via `tokio-rustls`
   - High-performance implementation
   - Zero-copy buffer management

## Message Format

### Header Format
```rust
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Action {
    Request,
    Response,
    Publish,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageHeader {
    pub action: Action,           // Message action type
    pub topic: String,           // Dot-separated topic path
    pub version: String,         // Semantic version (e.g., "1.0.0")
    pub request_id: Uuid,        // UUID for request tracking
    pub parent_id: Option<Uuid>, // Optional parent request ID
    pub timeout: Option<u32>,    // Optional timeout in milliseconds
}
```

### Message Creation
```rust
use serde_json::Value;
use std::fmt::Write;

impl MessageHeader {
    pub fn format(&self) -> String {
        let mut header = format!(
            "{}:{}:{}:{}",
            self.action,
            self.topic,
            self.version,
            self.request_id
        );

        if let Some(parent_id) = &self.parent_id {
            write!(header, ":{}", parent_id).unwrap();
        }

        if let Some(timeout) = self.timeout {
            write!(header, ":{}", timeout).unwrap();
        }

        header
    }
}

pub fn create_message(header: &MessageHeader, payload: &Value) -> String {
    format!("{}\n{}", header.format(), payload.to_string())
}
```

## Connection Management

### WebSocket Connection
```rust
use tokio_tungstenite::WebSocketStream;
use futures::{SinkExt, StreamExt};

#[derive(Debug)]
pub struct WebSocketClient {
    config: WebSocketConfig,
    sender: mpsc::Sender<Message>,
    handlers: Arc<Handlers>,
}

impl WebSocketClient {
    pub async fn connect(url: &str, config: WebSocketConfig) -> Result<Self> {
        // Implementation
    }

    pub async fn send(&self, message: String) -> Result<()> {
        // Implementation
    }

    pub fn on_message<F>(&self, handler: F)
    where
        F: Fn(String) + Send + Sync + 'static,
    {
        // Implementation
    }

    pub fn on_connect<F>(&self, handler: F)
    where
        F: Fn() + Send + Sync + 'static,
    {
        // Implementation
    }

    pub fn on_disconnect<F>(&self, handler: F)
    where
        F: Fn() + Send + Sync + 'static,
    {
        // Implementation
    }

    pub fn on_error<F>(&self, handler: F)
    where
        F: Fn(Error) + Send + Sync + 'static,
    {
        // Implementation
    }
}
```

### TCP Socket Connection
```rust
use tokio::net::TcpStream;
use tokio_rustls::client::TlsStream;

#[derive(Debug)]
pub struct TCPSocketClient {
    config: TcpConfig,
    sender: mpsc::Sender<Message>,
    handlers: Arc<Handlers>,
}

impl TCPSocketClient {
    pub async fn connect(host: &str, port: u16, config: TcpConfig) -> Result<Self> {
        // Implementation
    }

    pub async fn send(&self, message: String) -> Result<()> {
        // Implementation
    }

    pub fn on_message<F>(&self, handler: F)
    where
        F: Fn(String) + Send + Sync + 'static,
    {
        // Implementation
    }

    pub fn on_connect<F>(&self, handler: F)
    where
        F: Fn() + Send + Sync + 'static,
    {
        // Implementation
    }

    pub fn on_disconnect<F>(&self, handler: F)
    where
        F: Fn() + Send + Sync + 'static,
    {
        // Implementation
    }

    pub fn on_error<F>(&self, handler: F)
    where
        F: Fn(Error) + Send + Sync + 'static,
    {
        // Implementation
    }

    fn frame_message(&self, message: &str) -> Vec<u8> {
        // Implementation
    }

    async fn process_incoming_data(&self, data: &[u8]) -> Result<()> {
        // Implementation
    }
}
```

## Service Registration

```rust
use std::time::Duration;

#[derive(Debug)]
pub struct MessageBrokerClient {
    inner: Arc<Inner>,
    config: Config,
}

impl MessageBrokerClient {
    pub async fn connect(url: &str, config: Config) -> Result<Self> {
        // Implementation
    }

    pub async fn register_service(&self, name: &str, description: &str) -> Result<()> {
        // Implementation
    }

    pub async fn subscribe(&self, topic: &str, priority: Option<i32>) -> Result<()> {
        // Implementation
    }

    pub async fn unsubscribe(&self, topic: &str) -> Result<()> {
        // Implementation
    }

    pub async fn request<T>(&self, topic: &str, payload: Value, timeout: Duration) -> Result<T>
    where
        T: DeserializeOwned,
    {
        // Implementation
    }

    pub async fn publish(&self, topic: &str, payload: Value) -> Result<()> {
        // Implementation
    }

    pub fn on_message<F>(&self, handler: F)
    where
        F: Fn(MessageHeader, Value) + Send + Sync + 'static,
    {
        // Implementation
    }
}
```

## Example Usage

```rust
use mb_client::{MessageBrokerClient, Config};
use serde_json::json;
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<()> {
    // Create client instance
    let client = MessageBrokerClient::connect(
        "ws://localhost:8080",
        Config {
            protocol: Protocol::WebSocket,
            reconnect: true,
            ..Default::default()
        },
    ).await?;

    // Register service
    client.register_service("TestService", "Rust test service").await?;

    // Subscribe to topic
    client.subscribe("test.messages", Some(1)).await?;

    // Handle incoming messages
    client.on_message(|header, payload| {
        println!("Received message on topic: {}", header.topic);
        println!("Payload: {}", payload);
    });

    // Send request
    let response: Value = client
        .request(
            "test.service",
            json!({
                "data": "test"
            }),
            Duration::from_secs(30),
        )
        .await?;
    println!("Got response: {}", response);

    // Publish message
    client
        .publish(
            "test.events",
            json!({
                "event": "test",
                "timestamp": chrono::Utc::now().to_rfc3339()
            }),
        )
        .await?;

    // Keep the application running
    tokio::signal::ctrl_c().await?;
    Ok(())
}
```

## Implementation Notes

The Rust client library will be implemented in a separate repository and will include:

1. **Core Features**
   - Both WebSocket and TCP Socket protocol support
   - SSL/TLS encryption support
   - Automatic reconnection handling
   - Message framing and parsing
   - Error handling and recovery
   - Async/await support throughout
   - Zero-copy optimizations

2. **Dependencies**
   - Rust 1.65+
   - `tokio` for async runtime
   - `tokio-tungstenite` for WebSocket
   - `tokio-rustls` for TLS
   - `serde` for serialization
   - `uuid` for request IDs

3. **Build System**
   - Cargo build system
   - crates.io distribution
   - Cross-platform support
   - WASM target support

4. **Documentation**
   - Rustdoc documentation
   - Example code
   - Protocol specifications
   - Security considerations

## Security Considerations

The Rust implementation will follow the same security practices as the server:

1. **Connection Security**
   - SSL/TLS support for both protocols
   - Certificate validation
   - Secure WebSocket (WSS) support
   - TLS 1.2+ enforcement

2. **Message Security**
   - Maximum message size enforcement
   - Message validation
   - Buffer overflow protection
   - Memory safety (leveraging Rust's guarantees)

3. **Error Handling**
   - Connection error recovery
   - Protocol error handling
   - Exception safety via Result types
   - Resource cleanup via Drop trait

## Future Development

The actual Rust client library will be developed in a separate repository. This documentation serves as a specification for that implementation.