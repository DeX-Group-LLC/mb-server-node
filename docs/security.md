# Security Best Practices

This document outlines security best practices for deploying and operating MB Server Node.

## Network Security

### TLS/SSL Configuration

1. **Enable SSL/TLS in Production**
   ```env
   MB_SSL_ENABLED=true
   MB_SSL_MIN_VERSION=TLSv1.2
   MB_SSL_CIPHERS=ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384
   ```

2. **Certificate Requirements**
   - Use strong certificates (2048-bit RSA or 256-bit ECC)
   - Keep private keys secure
   - Implement proper certificate rotation
   - Use trusted Certificate Authorities
   - Enable certificate validation

3. **Client Certificate Authentication**
   ```env
   MB_SSL_VERIFY_CLIENT=true
   MB_SSL_CA_PATH=./certs/ca.crt
   MB_SSL_CRL_PATH=./certs/crl.pem
   ```

### Network Access Control

1. **Firewall Configuration**
   - Restrict access to server ports
   - Use IP whitelisting when possible
   - Implement network segmentation
   - Monitor network traffic

2. **Reverse Proxy Setup**
   - Use a reverse proxy (e.g., Nginx)
   - Enable HTTP/2
   - Configure proper headers
   - Implement request filtering

Example Nginx configuration:
```nginx
server {
    listen 443 ssl http2;
    server_name broker.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;

    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}
```

## Authentication & Authorization

### Token-based Authentication

1. **JWT Configuration**
   ```env
   MB_AUTH_ENABLED=true
   MB_AUTH_TOKEN_SECRET=<strong-secret>
   MB_AUTH_TOKEN_EXPIRY=3600
   MB_AUTH_REQUIRED_CLAIMS=["sub","scope","exp"]
   ```

2. **Token Best Practices**
   - Use strong secrets
   - Implement token rotation
   - Set appropriate expiry times
   - Validate all claims
   - Implement token revocation

Example JWT payload:
```json
{
    "sub": "client-123",
    "scope": ["publish", "subscribe"],
    "exp": 1704067200,
    "iat": 1704063600,
    "iss": "mb-server"
}
```

### Authorization Controls

1. **Permission Configuration**
   ```env
   MB_AUTH_DEFAULT_PERMISSIONS=["read"]
   MB_AUTH_ANONYMOUS_ACCESS=false
   ```

2. **Topic Access Control**
   ```json
   {
       "permissions": {
           "user.123.#": ["read", "write"],
           "public.*": ["read"],
           "admin.#": ["admin"]
       }
   }
   ```

3. **Service Registration Control**
   - Implement service authentication
   - Validate service credentials
   - Control service registration permissions
   - Monitor service activities

## Message Security

### Message Validation

1. **Size Limits**
   ```env
   MB_MAX_MESSAGE_SIZE=1048576
   MB_MAX_HEADER_SIZE=1024
   MB_MAX_TOPIC_LENGTH=255
   ```

2. **Content Validation**
   ```env
   MB_VALIDATE_UTF8=true
   MB_VALIDATE_JSON=true
   ```

3. **Topic Validation**
   - Implement topic naming policies
   - Validate topic structure
   - Control topic creation
   - Monitor topic usage

### Rate Limiting

1. **Connection-level Limits**
   ```env
   MB_RATE_LIMIT_ENABLED=true
   MB_RATE_LIMIT_WINDOW=60000
   MB_RATE_LIMIT_MAX_REQUESTS=1000
   ```

2. **Topic-level Limits**
   ```json
   {
       "topicLimits": {
           "user.*": {
               "maxSubscribers": 100,
               "maxPublishRate": 10,
               "maxMessageSize": 65536
           }
       }
   }
   ```

## Monitoring & Auditing

### Security Monitoring

1. **Enable Security Logging**
   ```env
   MB_LOG_LEVEL=info
   MB_LOG_FORMAT=json
   MB_LOG_FILE=./logs/security.log
   ```

2. **Monitor Security Events**
   - Authentication failures
   - Authorization violations
   - Rate limit breaches
   - Connection anomalies
   - Message validation failures

Example security log:
```json
{
    "timestamp": "2024-01-01T00:00:00Z",
    "level": "warn",
    "event": "auth_failure",
    "client_id": "client-123",
    "ip": "192.168.1.100",
    "reason": "invalid_token"
}
```

### Audit Trail

1. **Enable Audit Logging**
   - Track all security events
   - Log administrative actions
   - Monitor configuration changes
   - Track service registrations

2. **Audit Log Format**
   ```json
   {
       "timestamp": "2024-01-01T00:00:00Z",
       "action": "config_change",
       "user": "admin",
       "resource": "rate_limit",
       "changes": {
           "old": {"max_requests": 1000},
           "new": {"max_requests": 2000}
       }
   }
   ```

## Operational Security

### Secure Deployment

1. **Container Security**
   - Use minimal base images
   - Run as non-root user
   - Implement resource limits
   - Regular security updates

Example Dockerfile:
```dockerfile
FROM node:18-alpine

# Create non-root user
RUN addgroup -S mbserver && adduser -S mbserver -G mbserver

# Set working directory
WORKDIR /app

# Copy application files
COPY --chown=mbserver:mbserver . .

# Install dependencies
RUN npm ci --production

# Set user
USER mbserver

# Start server
CMD ["npm", "start"]
```

2. **Environment Security**
   - Use environment variables for secrets
   - Implement secret rotation
   - Secure configuration storage
   - Regular security audits

### Incident Response

1. **Security Incident Handling**
   - Define incident response procedures
   - Implement automated alerts
   - Document response actions
   - Regular incident drills

2. **Recovery Procedures**
   - Backup critical data
   - Document recovery steps
   - Test recovery procedures
   - Maintain incident logs

## Development Security

### Secure Coding Practices

1. **Code Security**
   - Regular dependency updates
   - Static code analysis
   - Security code reviews
   - Vulnerability scanning

2. **Development Guidelines**
   - Input validation
   - Error handling
   - Secure defaults
   - Code documentation

### Security Testing

1. **Test Requirements**
   - Security unit tests
   - Integration testing
   - Penetration testing
   - Load testing

2. **Test Automation**
   - Automated security scans
   - Regular vulnerability assessments
   - Compliance checking
   - Performance monitoring

## Compliance & Documentation

### Security Documentation

1. **Required Documentation**
   - Security policies
   - Operating procedures
   - Incident response plans
   - Recovery procedures

2. **Compliance Requirements**
   - Data protection regulations
   - Industry standards
   - Security certifications
   - Regular audits

### Security Updates

1. **Update Procedures**
   - Regular security patches
   - Dependency updates
   - Configuration reviews
   - Security assessments

2. **Change Management**
   - Document changes
   - Test updates
   - Rollback procedures
   - Monitor impacts