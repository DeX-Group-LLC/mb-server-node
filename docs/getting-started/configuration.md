# Configuration Guide

This guide details all available configuration options for MB Server Node.

## Configuration Methods

Configuration can be provided through:
1. Environment variables
2. Configuration file (YAML)
3. Command line arguments

## Configuration Parameters

### Server Configuration
```yaml
# Network settings
ports:
  websocket: 3000  # WebSocket server port
  tcp: 3001        # TCP Socket server port
host: 'localhost'   # Server host binding

# SSL/TLS Configuration (Optional)
ssl:
  key: '/path/to/key.pem'    # SSL private key path
  cert: '/path/to/cert.pem'  # SSL certificate path

# Logging Configuration
logging:
  level: 'info'   # Log level (debug, info, warn, error)
  format: 'json'  # Log format (json, text)
```

### Authentication Configuration
```yaml
auth:
  failure:
    lockout:
      threshold: 5   # Number of failures before lockout
      duration: 60   # Lockout duration in seconds
```

### Rate Limiting
```yaml
rate:
  limit:
    global:
      per:
        service: 0    # Global per-service rate limit (0 = unlimited)
        topic: 0      # Global per-topic rate limit (0 = unlimited)
    topic:
      per:
        service: {}   # Per-topic rate limits for services
```

### Connection Management
```yaml
connection:
  max:
    concurrent: 100   # Maximum concurrent connections
  heartbeatRetryTimeout: 30000        # Heartbeat retry timeout (ms)
  heartbeatDeregisterTimeout: 60000   # Service deregister timeout (ms)
```

### Request Handling
```yaml
request:
  response:
    timeout:
      default: 5000    # Default request timeout (ms)
      max: 3600000     # Maximum allowed timeout (ms)

max:
  outstanding:
    requests: 10000    # Maximum pending requests
```

### Message Configuration
```yaml
message:
  payload:
    maxLength: 16384   # Maximum payload size in bytes
```

### Monitoring Configuration
```yaml
monitoring:
  interval: 60000      # Metrics collection interval (ms)
```

## Environment Variables

Each configuration parameter can be set via environment variables using the following format:
- Convert path to uppercase
- Replace dots with underscores
- Prefix with `MB_`

Examples:
```bash
# Server Configuration
MB_PORTS_WEBSOCKET=3000
MB_PORTS_TCP=3001
MB_HOST=localhost

# SSL Configuration
MB_SSL_KEY=/path/to/key.pem
MB_SSL_CERT=/path/to/cert.pem

# Logging Configuration
MB_LOGGING_LEVEL=info
MB_LOGGING_FORMAT=json

# Authentication Configuration
MB_AUTH_FAILURE_LOCKOUT_THRESHOLD=5
MB_AUTH_FAILURE_LOCKOUT_DURATION=60

# Rate Limiting
MB_RATE_LIMIT_GLOBAL_PER_SERVICE=0
MB_RATE_LIMIT_GLOBAL_PER_TOPIC=0

# Connection Management
MB_CONNECTION_MAX_CONCURRENT=100
MB_CONNECTION_HEARTBEAT_RETRY_TIMEOUT=30000
MB_CONNECTION_HEARTBEAT_DEREGISTER_TIMEOUT=60000

# Request Configuration
MB_REQUEST_RESPONSE_TIMEOUT_DEFAULT=5000
MB_REQUEST_RESPONSE_TIMEOUT_MAX=3600000
MB_MAX_OUTSTANDING_REQUESTS=10000

# Message Configuration
MB_MESSAGE_PAYLOAD_MAX_LENGTH=16384

# Monitoring Configuration
MB_MONITORING_INTERVAL=60000
```

## Configuration File

Create a `config.yaml` file:

```yaml
ports:
  websocket: 3000
  tcp: 3001
host: 'localhost'
ssl:
  key: '/path/to/key.pem'
  cert: '/path/to/cert.pem'
logging:
  level: 'info'
  format: 'json'
auth:
  failure:
    lockout:
      threshold: 5
      duration: 60
rate:
  limit:
    global:
      per:
        service: 0
        topic: 0
    topic:
      per:
        service: {}
connection:
  max:
    concurrent: 100
  heartbeatRetryTimeout: 30000
  heartbeatDeregisterTimeout: 60000
request:
  response:
    timeout:
      default: 5000
      max: 3600000
max:
  outstanding:
    requests: 10000
message:
  payload:
    maxLength: 16384
monitoring:
  interval: 60000
```

## Best Practices

1. **Security**
   - Always use SSL/TLS in production
   - Set appropriate rate limits
   - Configure authentication
   - Limit maximum connections

2. **Performance**
   - Adjust timeouts based on network
   - Set appropriate message size limits
   - Configure monitoring interval
   - Tune connection parameters

3. **Monitoring**
   - Enable JSON logging in production
   - Set appropriate log levels
   - Configure metrics collection
   - Monitor connection limits

4. **Development**
   - Use debug logging in development
   - Set shorter timeouts for testing
   - Use text logging for readability
   - Enable detailed error messages