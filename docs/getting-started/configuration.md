# Configuration Guide

This document details all configuration options available in MB Server Node.

## Configuration Methods

MB Server Node can be configured through:
1. Environment variables
2. Configuration file (`.env` or `config.yaml`)
3. Command-line arguments

Priority order (highest to lowest):
1. Command-line arguments
2. Environment variables
3. Configuration file
4. Default values

## Server Configuration

### Network Settings

```env
# WebSocket server configuration
WEBSOCKET_PORT=8080        # WebSocket server port
TCP_PORT=8081             # TCP server port
HOST=localhost             # Host to bind to
```

### SSL/TLS Configuration

```env
# SSL/TLS settings
SSL_KEY=./certs/key.pem    # Path to SSL key file
SSL_CERT=./certs/cert.pem  # Path to SSL certificate file
```

### Authentication & Authorization

```env
# Authentication configuration
AUTH_FAILURE_LOCKOUT_THRESHOLD=5   # Failed attempts before lockout
AUTH_FAILURE_LOCKOUT_DURATION=60   # Lockout duration in seconds
```

### Rate Limiting

```env
# Rate limiting configuration
RATE_LIMIT_GLOBAL_PER_SERVICE=1000    # Global rate limit per service
RATE_LIMIT_GLOBAL_PER_TOPIC=1000      # Global rate limit per topic
```

### Connection Management

```env
# Connection configuration
CONNECTION_MAX_CONCURRENT=1000       # Maximum concurrent connections
```

### Request Configuration

```env
# Request configuration
REQUEST_RESPONSE_TIMEOUT_DEFAULT=5000    # Default request timeout (ms)
REQUEST_RESPONSE_TIMEOUT_MAX=3600000     # Maximum request timeout (ms)
MAX_OUTSTANDING_REQUESTS=10000           # Maximum pending requests
```

## Configuration File Format

### YAML Configuration

```yaml
ports:
  websocket: 8080
  tcp: 8081
host: 'localhost'
ssl:
  key: './certs/key.pem'
  cert: './certs/cert.pem'
auth:
  failure:
    lockout:
      threshold: 5
      duration: 60
rate:
  limit:
    global:
      per:
        service: 1000
        topic: 1000
connection:
  max:
    concurrent: 1000
request:
  response:
    timeout:
      default: 5000
      max: 3600000
max:
  outstanding:
    requests: 10000
```

## Command-line Arguments

```bash
mb-server [options]

Options:
  -c, --config <path>     Path to configuration file
  -p, --ws-port <port>    WebSocket port (default: 8080)
  -t, --tcp-port <port>   TCP port (default: 8081)
  -h, --host <host>       Host to bind to (default: 0.0.0.0)
  --ssl-key <path>        Path to SSL private key
  --ssl-cert <path>       Path to SSL certificate
  -v, --version          Show version information
  --help                 Show this help message
```

## Environment Variables Reference

### Server Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WEBSOCKET_PORT` | number | `8080` | WebSocket server port |
| `TCP_PORT` | number | `8081` | TCP server port |
| `HOST` | string | `0.0.0.0` | Server host |

### SSL/TLS Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SSL_KEY` | string | - | Path to SSL private key |
| `SSL_CERT` | string | - | Path to SSL certificate |

### Authentication Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `AUTH_FAILURE_LOCKOUT_THRESHOLD` | number | `5` | Failed attempts before lockout |
| `AUTH_FAILURE_LOCKOUT_DURATION` | number | `60` | Lockout duration in seconds |

### Rate Limiting Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RATE_LIMIT_GLOBAL_PER_SERVICE` | number | `1000` | Global rate limit per service |
| `RATE_LIMIT_GLOBAL_PER_TOPIC` | number | `1000` | Global rate limit per topic |

### Connection Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CONNECTION_MAX_CONCURRENT` | number | `1000` | Maximum concurrent connections |

### Request Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `REQUEST_RESPONSE_TIMEOUT_DEFAULT` | number | `5000` | Default request timeout (ms) |
| `REQUEST_RESPONSE_TIMEOUT_MAX` | number | `3600000` | Maximum request timeout (ms) |
| `MAX_OUTSTANDING_REQUESTS` | number | `10000` | Maximum pending requests |

## Usage Examples

### Using Environment Variables

```bash
# Basic setup
export WEBSOCKET_PORT=8080
export TCP_PORT=8081
export HOST=0.0.0.0

# Start the server
npm start
```

### Using Configuration File

```bash
# Start with custom config
CONFIG_PATH=/path/to/config.yaml npm start
```

## Best Practices

1. **Production Settings**
   - Use SSL/TLS in production
   - Set appropriate rate limits
   - Configure proper logging
   - Enable monitoring

2. **Development Settings**
   - Use debug logging
   - Disable rate limits
   - Use pretty log format
   - Enable shorter timeouts

3. **Security Settings**
   - Configure authentication
   - Set reasonable rate limits
   - Enable SSL/TLS
   - Set proper timeouts

4. **Performance Tuning**
   - Adjust concurrent connections
   - Configure message size limits
   - Set appropriate timeouts
   - Monitor metrics