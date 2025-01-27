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
WS_PORT=8080              # Unsecure WebSocket server port
WSS_PORT=8443             # Secure WebSocket server port (TLS)
TCP_PORT=8081             # Unsecure TCP server port
TLS_PORT=8444             # Secure TCP server port (TLS)
HOST=localhost            # Host to bind to
ALLOW_UNSECURE=false     # Whether to allow unsecure connections
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
  ws: 8080      # Unsecure WebSocket port
  wss: 8443     # Secure WebSocket port (TLS)
  tcp: 8081     # Unsecure TCP port
  tls: 8444     # Secure TCP port (TLS)
host: 'localhost'
allowUnsecure: false  # Whether to allow unsecure connections
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
  --ws-port <port>       Unsecure WebSocket port (default: 8080)
  --wss-port <port>      Secure WebSocket port (default: 8443)
  --tcp-port <port>      Unsecure TCP port (default: 8081)
  --tls-port <port>      Secure TCP port (default: 8444)
  -h, --host <host>      Host to bind to (default: localhost)
  --allow-unsecure      Allow unsecure connections (default: false)
  --ssl-key <path>      Path to SSL private key
  --ssl-cert <path>     Path to SSL certificate
  -v, --version         Show version information
  --help               Show this help message
```

## Environment Variables Reference

### Server Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WS_PORT` | number | `8080` | Unsecure WebSocket server port |
| `WSS_PORT` | number | `8443` | Secure WebSocket server port (TLS) |
| `TCP_PORT` | number | `8081` | Unsecure TCP server port |
| `TLS_PORT` | number | `8444` | Secure TCP server port (TLS) |
| `HOST` | string | `localhost` | Server host |
| `ALLOW_UNSECURE` | boolean | `false` | Whether to allow unsecure connections |

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
export WS_PORT=8080
export WSS_PORT=8443
export TCP_PORT=8081
export TLS_PORT=8444
export HOST=0.0.0.0
export ALLOW_UNSECURE=false

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
   - Use SSL/TLS in production (disable unsecure connections)
   - Set appropriate rate limits
   - Configure proper logging
   - Enable monitoring

2. **Development Settings**
   - Enable unsecure connections for easier testing
   - Use debug logging
   - Disable rate limits
   - Use pretty log format
   - Enable shorter timeouts

3. **Security Settings**
   - Disable unsecure connections in production
   - Configure SSL/TLS with strong certificates
   - Set reasonable rate limits
   - Set proper timeouts

4. **Performance Tuning**
   - Adjust concurrent connections
   - Configure message size limits
   - Set appropriate timeouts
   - Monitor metrics