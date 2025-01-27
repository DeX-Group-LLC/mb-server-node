# Configuration Guide

This document details all configuration options available in MB Server Node.

## Configuration Methods

MB Server Node can be configured through:
1. Environment variables
2. Configuration file (`.env` or `config.json`)
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
MB_WS_ENABLED=true
MB_WS_PORT=8080
MB_WS_HOST=0.0.0.0
MB_WS_PATH=/ws

# TCP server configuration
MB_TCP_ENABLED=true
MB_TCP_PORT=8081
MB_TCP_HOST=0.0.0.0

# General network settings
MB_MAX_CONNECTIONS=1000
MB_CONNECTION_TIMEOUT=30000
MB_KEEP_ALIVE_INTERVAL=30000
MB_KEEP_ALIVE_TIMEOUT=10000
```

### SSL/TLS Configuration

```env
# SSL/TLS settings
MB_SSL_ENABLED=false
MB_SSL_CERT_PATH=./certs/server.crt
MB_SSL_KEY_PATH=./certs/server.key
MB_SSL_CA_PATH=./certs/ca.crt
MB_SSL_VERIFY_CLIENT=false
MB_SSL_MIN_VERSION=TLSv1.2
MB_SSL_CIPHERS=ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384

# Certificate settings
MB_SSL_KEY_PASSWORD=
MB_SSL_CERT_CHAIN_PATH=
MB_SSL_CRL_PATH=
```

### Message Settings

```env
# Message configuration
MB_MAX_MESSAGE_SIZE=1048576
MB_MAX_HEADER_SIZE=1024
MB_MAX_TOPIC_LENGTH=255
MB_MAX_TOPIC_LEVELS=16
MB_VALIDATE_UTF8=true
MB_VALIDATE_JSON=true
```

### Performance Tuning

```env
# Performance settings
MB_WORKER_THREADS=0  # 0 = number of CPU cores
MB_MAX_PENDING_MESSAGES=1000
MB_MESSAGE_BUFFER_SIZE=65536
MB_TCP_BACKLOG=511
MB_TCP_NO_DELAY=true
MB_TCP_KEEP_ALIVE=true
```

### Authentication & Authorization

```env
# Authentication configuration
MB_AUTH_ENABLED=false
MB_AUTH_TOKEN_SECRET=your-secret-key
MB_AUTH_TOKEN_EXPIRY=86400
MB_AUTH_REQUIRED_CLAIMS=["sub","scope"]

# Authorization configuration
MB_AUTH_DEFAULT_PERMISSIONS=["read"]
MB_AUTH_ANONYMOUS_ACCESS=false
MB_AUTH_CACHE_SIZE=1000
MB_AUTH_CACHE_TTL=300
```

### Rate Limiting

```env
# Rate limiting configuration
MB_RATE_LIMIT_ENABLED=true
MB_RATE_LIMIT_WINDOW=60000
MB_RATE_LIMIT_MAX_REQUESTS=1000
MB_RATE_LIMIT_DELAY=100
MB_RATE_LIMIT_BURST=50
```

### Logging

```env
# Logging configuration
MB_LOG_LEVEL=info
MB_LOG_FORMAT=json
MB_LOG_FILE=./logs/server.log
MB_LOG_MAX_SIZE=10485760
MB_LOG_MAX_FILES=10
MB_LOG_COMPRESS=true
```

### Monitoring & Metrics

```env
# Monitoring configuration
MB_MONITORING_ENABLED=true
MB_MONITORING_PORT=9090
MB_MONITORING_HOST=0.0.0.0
MB_MONITORING_PATH=/metrics
MB_MONITORING_INTERVAL=10000
```

## Configuration File Format

### JSON Configuration

```json
{
    "server": {
        "websocket": {
            "enabled": true,
            "port": 8080,
            "host": "0.0.0.0",
            "path": "/ws"
        },
        "tcp": {
            "enabled": true,
            "port": 8081,
            "host": "0.0.0.0"
        },
        "ssl": {
            "enabled": false,
            "cert": "./certs/server.crt",
            "key": "./certs/server.key",
            "ca": "./certs/ca.crt"
        }
    },
    "message": {
        "maxSize": 1048576,
        "maxHeaderSize": 1024,
        "maxTopicLength": 255,
        "maxTopicLevels": 16,
        "validateUtf8": true,
        "validateJson": true
    },
    "performance": {
        "workerThreads": 0,
        "maxPendingMessages": 1000,
        "messageBufferSize": 65536,
        "tcpBacklog": 511,
        "tcpNoDelay": true,
        "tcpKeepAlive": true
    },
    "auth": {
        "enabled": false,
        "tokenSecret": "your-secret-key",
        "tokenExpiry": 86400,
        "requiredClaims": ["sub", "scope"],
        "defaultPermissions": ["read"],
        "anonymousAccess": false
    },
    "rateLimit": {
        "enabled": true,
        "window": 60000,
        "maxRequests": 1000,
        "delay": 100,
        "burst": 50
    },
    "logging": {
        "level": "info",
        "format": "json",
        "file": "./logs/server.log",
        "maxSize": 10485760,
        "maxFiles": 10,
        "compress": true
    },
    "monitoring": {
        "enabled": true,
        "port": 9090,
        "host": "0.0.0.0",
        "path": "/metrics",
        "interval": 10000
    }
}
```

## Command-line Arguments

```bash
mb-server [options]

Options:
  -c, --config <path>     Path to configuration file
  -p, --ws-port <port>    WebSocket port (default: 8080)
  -t, --tcp-port <port>   TCP port (default: 8081)
  -h, --host <host>       Host to bind to (default: 0.0.0.0)
  --ssl                   Enable SSL/TLS
  --ssl-cert <path>       Path to SSL certificate
  --ssl-key <path>        Path to SSL private key
  --log-level <level>     Logging level (default: info)
  --workers <number>      Number of worker threads (default: CPU cores)
  -v, --version          Show version information
  --help                 Show this help message
```

## Environment Variables Reference

### Server Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MB_WS_ENABLED` | boolean | `true` | Enable WebSocket server |
| `MB_WS_PORT` | number | `8080` | WebSocket server port |
| `MB_WS_HOST` | string | `0.0.0.0` | WebSocket server host |
| `MB_WS_PATH` | string | `/ws` | WebSocket endpoint path |
| `MB_TCP_ENABLED` | boolean | `true` | Enable TCP server |
| `MB_TCP_PORT` | number | `8081` | TCP server port |
| `MB_TCP_HOST` | string | `0.0.0.0` | TCP server host |
| `MB_MAX_CONNECTIONS` | number | `1000` | Maximum concurrent connections |

### SSL/TLS Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MB_SSL_ENABLED` | boolean | `false` | Enable SSL/TLS |
| `MB_SSL_CERT_PATH` | string | - | Path to SSL certificate |
| `MB_SSL_KEY_PATH` | string | - | Path to SSL private key |
| `MB_SSL_CA_PATH` | string | - | Path to CA certificate |
| `MB_SSL_VERIFY_CLIENT` | boolean | `false` | Require client certificates |
| `MB_SSL_MIN_VERSION` | string | `TLSv1.2` | Minimum TLS version |

### Message Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MB_MAX_MESSAGE_SIZE` | number | `1048576` | Maximum message size in bytes |
| `MB_MAX_HEADER_SIZE` | number | `1024` | Maximum header size in bytes |
| `MB_MAX_TOPIC_LENGTH` | number | `255` | Maximum topic length |
| `MB_MAX_TOPIC_LEVELS` | number | `16` | Maximum topic hierarchy levels |
| `MB_VALIDATE_UTF8` | boolean | `true` | Validate UTF-8 encoding |
| `MB_VALIDATE_JSON` | boolean | `true` | Validate JSON payload |

### Performance Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MB_WORKER_THREADS` | number | `0` | Number of worker threads (0 = CPU cores) |
| `MB_MAX_PENDING_MESSAGES` | number | `1000` | Maximum queued messages per connection |
| `MB_MESSAGE_BUFFER_SIZE` | number | `65536` | TCP socket buffer size |
| `MB_TCP_BACKLOG` | number | `511` | TCP connection backlog |
| `MB_TCP_NO_DELAY` | boolean | `true` | Enable TCP_NODELAY |
| `MB_TCP_KEEP_ALIVE` | boolean | `true` | Enable TCP keep-alive |

### Authentication Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MB_AUTH_ENABLED` | boolean | `false` | Enable authentication |
| `MB_AUTH_TOKEN_SECRET` | string | - | JWT secret key |
| `MB_AUTH_TOKEN_EXPIRY` | number | `86400` | Token expiry in seconds |
| `MB_AUTH_REQUIRED_CLAIMS` | string | `["sub","scope"]` | Required JWT claims |
| `MB_AUTH_DEFAULT_PERMISSIONS` | string | `["read"]` | Default permissions |
| `MB_AUTH_ANONYMOUS_ACCESS` | boolean | `false` | Allow anonymous access |

### Rate Limiting Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MB_RATE_LIMIT_ENABLED` | boolean | `true` | Enable rate limiting |
| `MB_RATE_LIMIT_WINDOW` | number | `60000` | Rate limit window in milliseconds |
| `MB_RATE_LIMIT_MAX_REQUESTS` | number | `1000` | Maximum requests per window |
| `MB_RATE_LIMIT_DELAY` | number | `100` | Delay between requests in milliseconds |
| `MB_RATE_LIMIT_BURST` | number | `50` | Maximum burst size |

### Logging Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MB_LOG_LEVEL` | string | `info` | Log level (debug, info, warn, error) |
| `MB_LOG_FORMAT` | string | `json` | Log format (json, text) |
| `MB_LOG_FILE` | string | - | Log file path |
| `MB_LOG_MAX_SIZE` | number | `10485760` | Maximum log file size |
| `MB_LOG_MAX_FILES` | number | `10` | Maximum number of log files |
| `MB_LOG_COMPRESS` | boolean | `true` | Compress rotated logs |

### Monitoring Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MB_MONITORING_ENABLED` | boolean | `true` | Enable monitoring |
| `MB_MONITORING_PORT` | number | `9090` | Monitoring server port |
| `MB_MONITORING_HOST` | string | `0.0.0.0` | Monitoring server host |
| `MB_MONITORING_PATH` | string | `/metrics` | Metrics endpoint path |
| `MB_MONITORING_INTERVAL` | number | `10000` | Collection interval in milliseconds |

## Best Practices

1. **Security**
   - Always enable SSL/TLS in production
   - Use strong secrets for authentication
   - Implement appropriate rate limits
   - Restrict network access appropriately

2. **Performance**
   - Adjust worker threads based on CPU cores
   - Set appropriate buffer sizes for your use case
   - Monitor and adjust rate limits as needed
   - Enable TCP optimizations when possible

3. **Monitoring**
   - Enable monitoring in production
   - Set up appropriate logging
   - Monitor system metrics
   - Set up alerts for critical conditions

4. **Development**
   - Use different configurations for development and production
   - Keep sensitive information in environment variables
   - Document custom configurations
   - Test configuration changes before deployment