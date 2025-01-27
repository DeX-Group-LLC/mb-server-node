# Message Broker (MB) Server - Node.js Reference Implementation
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue?style=square)](https://opensource.org/licenses/Apache-2.0)
[![Tests Status](https://github.com/DeX-Group-LLC/message-broker-node/actions/workflows/tests.yml/badge.svg?style=square)](https://github.com/DeX-Group-LLC/message-broker-node/actions/workflows/tests.yml)
[![Coverage Status](https://coveralls.io/repos/github/DeX-Group-LLC/message-broker-node/badge.svg?branch=main&style=square)](https://coveralls.io/github/DeX-Group-LLC/message-broker-node?branch=main)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.x-brightgreen?style=square)](https://nodejs.org)
[![NPM Version](https://img.shields.io/badge/npm%20package-deadbeef-green?style=square)](https://www.npmjs.com/package/message-broker-node)
[![Dependencies](https://img.shields.io/librariesio/release/npm/message-broker-node?style=square)](https://libraries.io/npm/message-broker-node)
[![Install Size](https://packagephobia.com/badge?p=message-broker-node?style=square)](https://packagephobia.com/result?p=message-broker-node)

🚀 A Node.js reference implementation of the Message Broker for the North American Baggage Handling Architecture Standard (NABHAS), designed for demonstration and testing purposes. This WebSocket-based message broker enables real-time communication between baggage handling services.

## Table of Contents
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

## Features

- WebSocket-based real-time communication
- Service registry for dynamic service discovery
- Topic-based message routing
- Subscription management
- Connection monitoring and heartbeat
- Rate limiting and message size controls
- Graceful shutdown handling
- Comprehensive monitoring and metrics
- Configurable authentication and security

## Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- Windows/Linux/macOS

## Installation

```bash
# Clone the repository
git clone https://github.com/DeX-Group-LLC/mb-server.git

# Install dependencies
cd mb-server
npm install

# Start the broker
npm start
```

## Configuration

The broker can be configured through a YAML file. Below are all available configuration options:

```yaml
# Server Configuration
port: 3000                    # WebSocket server port
host: 'localhost'             # Host to bind to

# Logging Configuration
logging:
  level: 'info'              # Logging level (info, debug, warn, error)
  format: 'json'             # Log format (json, text)

# Authentication Configuration
auth:
  failure:
    lockout:
      threshold: 5           # Number of failed attempts before lockout
      duration: 60          # Lockout duration in seconds

# Rate Limiting Configuration
rate:
  limit:
    global:
      per:
        service: 0          # Global rate limit per service (0 = unlimited)
        topic: 0           # Global rate limit per topic (0 = unlimited)
    topic:
      per:
        service: {}        # Per-topic rate limits for services

# Connection Management
connection:
  max:
    concurrent: 100        # Maximum number of concurrent connections
  heartbeatRetryTimeout: 30000      # Time in ms before retrying heartbeat
  heartbeatDeregisterTimeout: 60000  # Time in ms before deregistering on heartbeat failure

# Request/Response Configuration
request:
  response:
    timeout:
      default: 5000       # Default timeout for requests in ms
      max: 3600000       # Maximum allowed timeout in ms (1 hour)

# Message Configuration
max:
  outstanding:
    requests: 10000      # Maximum number of pending requests
message:
  payload:
    maxLength: 16384    # Maximum message size in bytes (16KB)

# Monitoring Configuration
monitoring:
  interval: 60000       # Metrics collection interval in ms (1 minute)
```

These configuration options can be customized by creating a custom YAML file and setting the `CONFIG_PATH` environment variable to point to it.

## Usage

The Message Broker starts a WebSocket server that listens for incoming connections from baggage handling services. Services can:

- Register themselves with the broker
- Subscribe to topics
- Publish messages to topics
- Request-response communication
- Monitor their connection status

## Architecture

The broker consists of several core components:

- **ConnectionManager**: Handles WebSocket connections and client lifecycle
- **MessageRouter**: Routes messages between services based on topics
- **ServiceRegistry**: Maintains registry of available services
- **SubscriptionManager**: Manages topic subscriptions
- **Monitoring**: Collects metrics and monitors system health

## Contributing

We welcome contributions! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/improvement`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit your changes (`git commit -am 'Add new feature'`)
6. Push to the branch (`git push origin feature/improvement`)
7. Create a Pull Request

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
