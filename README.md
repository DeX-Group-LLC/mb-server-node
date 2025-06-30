# Message Broker (MB) Server - Node.js Reference Implementation
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue?style=square)](https://opensource.org/licenses/Apache-2.0)
[![Tests Status](https://github.com/DeX-Group-LLC/mb-server-node/actions/workflows/tests.yml/badge.svg?style=square)](https://github.com/DeX-Group-LLC/mb-server-node/actions/workflows/tests.yml)
[![Coverage Status](https://coveralls.io/repos/github/DeX-Group-LLC/mb-server-node/badge.svg?branch=main&style=square)](https://coveralls.io/github/DeX-Group-LLC/mb-server-node?branch=main)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.x-brightgreen?style=square)](https://nodejs.org)
[![NPM Version](https://img.shields.io/badge/npm%20package-deadbeef-green?style=square)](https://www.npmjs.com/package/mb-server-node)
[![Dependencies](https://img.shields.io/librariesio/release/npm/mb-server-node?style=square)](https://libraries.io/npm/mb-server-node)
[![Install Size](https://packagephobia.com/badge?p=mb-server-node?style=square)](https://packagephobia.com/result?p=mb-server-node)

🚀 A Node.js reference implementation of the Message Broker for the North American Baggage Handling Architecture Standard (NABHAS), designed for demonstration and testing purposes. This WebSocket-based message broker enables real-time communication between baggage handling services.

## Table of Contents
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Environment Variables](#environment-variables)
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

The broker can be configured through environment variables or a YAML file. The configuration is loaded in the following order of precedence:

1. Environment variables (highest priority)
2. Custom YAML file specified by `CONFIG_PATH` environment variable
3. Default configuration (lowest priority)

### YAML Configuration

Below are all available configuration options with their default values and descriptions:

```yaml
# Server Configuration
ports:                       # Server ports configuration
  websocket: 3000           # Port number for the WebSocket server
  tcp: 3001                 # Port number for the TCP server
host: 'localhost'             # Host address to bind the server to
ssl:                         # Optional SSL/TLS configuration
  key: ''                    # Path to SSL private key file
  cert: ''                   # Path to SSL certificate file

# Logging Configuration
logging:
  level: 'info'              # Log level (debug, info, warn, error)
  format: 'json'             # Log format (json, text)

# Authentication Configuration
auth:
  failure:
    lockout:
      threshold: 5           # Number of failed authentication attempts before lockout
      duration: 60          # Duration of lockout in seconds

# Rate Limiting Configuration
rate:
  limit:
    global:
      per:
        service: 0          # Global rate limit per service (0 = unlimited)
        topic: 0           # Global rate limit per topic (0 = unlimited)
    topic:
      per:
        service: {}        # Per-topic rate limits for services (key-value pairs)

# Connection Management
connection:
  max:
    concurrent: 100        # Maximum number of concurrent WebSocket connections
  heartbeatRetryTimeout: 30000      # Milliseconds to wait before retrying failed heartbeat
  heartbeatDeregisterTimeout: 60000  # Milliseconds to wait before deregistering service on heartbeat failure

# Request/Response Configuration
request:
  response:
    timeout:
      default: 5000       # Default request timeout in milliseconds
      max: 3600000       # Maximum allowed request timeout in milliseconds (1 hour)

# Resource Limits
max:
  outstanding:
    requests: 10000      # Maximum number of concurrent pending requests

# Message Configuration
message:
  payload:
    maxLength: 16384    # Maximum message payload size in bytes (16KB)

# Monitoring Configuration
monitoring:
  interval: 60000       # Metrics collection interval in milliseconds
```

## Environment Variables

Environment variables can be loaded in two ways:
1. Through a `.env` file in the project root
2. Directly from the system environment

Here's a comprehensive list of all supported environment variables:

### Server Configuration
| Name | Description | Default |
|------|-------------|---------|
| `WS_PORT` | WebSocket server port | 3000 |
| `WSS_PORT` | WebSocket Secure server port | |
| `TCP_PORT` | TCP server port | 3001 |
| `TLS_PORT` | TLS server port | |
| `HOST` | Host address to bind to | 'localhost' |
| `ALLOW_UNSECURE` | Allow unsecure connections | |
| `SSL_KEY` | Path to SSL private key file | |
| `SSL_CERT` | Path to SSL certificate file | |

### Authentication Configuration
| Name | Description | Default |
|------|-------------|---------|
| `AUTH_FAILURE_LOCKOUT_THRESHOLD` | Failed auth attempts before lockout | 5 |
| `AUTH_FAILURE_LOCKOUT_DURATION` | Lockout duration in seconds | 60 |

### Rate Limiting Configuration
| Name | Description | Default |
|------|-------------|---------|
| `RATE_LIMIT_GLOBAL_PER_SERVICE` | Global rate limit per service | 0 (unlimited) |
| `RATE_LIMIT_GLOBAL_PER_TOPIC` | Global rate limit per topic | 0 (unlimited) |

### Connection Management
| Name | Description | Default |
|------|-------------|---------|
| `CONNECTION_MAX_CONCURRENT` | Max concurrent WebSocket connections | 100 |

### Request/Response Configuration
| Name | Description | Default |
|------|-------------|---------|
| `REQUEST_RESPONSE_TIMEOUT_DEFAULT` | Default request timeout in milliseconds | 5000 |
| `REQUEST_RESPONSE_TIMEOUT_MAX` | Maximum request timeout in milliseconds | 3600000 |

### Resource Limits
| Name | Description | Default |
|------|-------------|---------|
| `MAX_OUTSTANDING_REQUESTS` | Max concurrent pending requests | 10000 |

### Special Configuration
| Name | Description | Default |
|------|-------------|---------|
| `CONFIG_PATH` | Path to custom YAML configuration file | src/config/default.yaml |

Note: The environment variables shown above reflect the actual implementation. While the YAML configuration supports additional options, they can only be set through the YAML configuration file or by modifying the source code to support additional environment variables.

### Custom Configuration File

To use a custom configuration file:

```bash
# Set the path to your custom config file
export CONFIG_PATH=/path/to/your/config.yaml

# Start the broker
npm start
```

The custom configuration will be merged with the default configuration, with custom values taking precedence.

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
