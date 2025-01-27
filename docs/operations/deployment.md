# Deployment Guide

This guide explains how to deploy MB Server Node in a production environment.

## Deployment Options

### 1. Docker Deployment

#### Docker Image
```dockerfile
FROM node:18-alpine

# Create non-root user
RUN addgroup -S mbserver && adduser -S mbserver -G mbserver

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy application files
COPY --chown=mbserver:mbserver . .

# Set user
USER mbserver

# Expose ports
EXPOSE 8080 8081 9090

# Start server
CMD ["npm", "start"]
```

#### Docker Compose
```yaml
version: '3.8'

services:
  mb-server:
    build: .
    ports:
      - "8080:8080"  # WebSocket
      - "8081:8081"  # TCP Socket
      - "9090:9090"  # Monitoring
    volumes:
      - ./config:/app/config
      - ./certs:/app/certs
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
      - MB_SSL_ENABLED=true
      - MB_SSL_CERT_PATH=/app/certs/server.crt
      - MB_SSL_KEY_PATH=/app/certs/server.key
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9090/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 2. Kubernetes Deployment

#### Deployment Manifest
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mb-server
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mb-server
  template:
    metadata:
      labels:
        app: mb-server
    spec:
      containers:
      - name: mb-server
        image: your-registry/mb-server:latest
        ports:
        - containerPort: 8080
          name: websocket
        - containerPort: 8081
          name: tcp
        - containerPort: 9090
          name: monitoring
        env:
        - name: NODE_ENV
          value: "production"
        - name: MB_SSL_ENABLED
          value: "true"
        volumeMounts:
        - name: config
          mountPath: /app/config
        - name: certs
          mountPath: /app/certs
        - name: logs
          mountPath: /app/logs
        resources:
          requests:
            cpu: "500m"
            memory: "512Mi"
          limits:
            cpu: "2000m"
            memory: "2Gi"
        livenessProbe:
          httpGet:
            path: /health
            port: monitoring
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: monitoring
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: config
        configMap:
          name: mb-server-config
      - name: certs
        secret:
          secretName: mb-server-certs
      - name: logs
        emptyDir: {}
```

#### Service Manifest
```yaml
apiVersion: v1
kind: Service
metadata:
  name: mb-server
  namespace: production
spec:
  selector:
    app: mb-server
  ports:
  - name: websocket
    port: 8080
    targetPort: websocket
  - name: tcp
    port: 8081
    targetPort: tcp
  - name: monitoring
    port: 9090
    targetPort: monitoring
```

## Production Configuration

### 1. Environment Configuration

```env
# Server Configuration
MB_PORTS_WEBSOCKET=8080
MB_PORTS_TCP=8081
MB_HOST=0.0.0.0

# SSL/TLS Configuration
MB_SSL_KEY=/app/certs/server.key
MB_SSL_CERT=/app/certs/server.crt

# Logging Configuration
MB_LOGGING_LEVEL=info
MB_LOGGING_FORMAT=json

# Authentication Configuration
MB_AUTH_FAILURE_LOCKOUT_THRESHOLD=5
MB_AUTH_FAILURE_LOCKOUT_DURATION=60

# Rate Limiting
MB_RATE_LIMIT_GLOBAL_PER_SERVICE=1000
MB_RATE_LIMIT_GLOBAL_PER_TOPIC=1000

# Connection Management
MB_CONNECTION_MAX_CONCURRENT=10000
MB_CONNECTION_HEARTBEAT_RETRY_TIMEOUT=30000
MB_CONNECTION_HEARTBEAT_DEREGISTER_TIMEOUT=60000

# Request Configuration
MB_REQUEST_RESPONSE_TIMEOUT_DEFAULT=5000
MB_REQUEST_RESPONSE_TIMEOUT_MAX=3600000
MB_MAX_OUTSTANDING_REQUESTS=10000

# Message Configuration
MB_MESSAGE_PAYLOAD_MAX_LENGTH=1048576

# Monitoring Configuration
MB_MONITORING_INTERVAL=60000
```

### 2. SSL/TLS Setup

```bash
# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout server.key -out server.crt \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=example.com"

# Generate CSR for production certificate
openssl req -new -newkey rsa:2048 -nodes \
  -keyout server.key -out server.csr \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=example.com"
```

## Load Balancing

### 1. Nginx Configuration

```nginx
upstream mb_websocket {
    server mb-server-1:8080;
    server mb-server-2:8080;
    server mb-server-3:8080;
}

upstream mb_tcp {
    server mb-server-1:8081;
    server mb-server-2:8081;
    server mb-server-3:8081;
}

server {
    listen 443 ssl http2;
    server_name broker.example.com;

    ssl_certificate /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    location /ws {
        proxy_pass http://mb_websocket;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Host $host;
    }
}

stream {
    upstream mb_tcp_backend {
        server mb-server-1:8081;
        server mb-server-2:8081;
        server mb-server-3:8081;
    }

    server {
        listen 8081 ssl;
        proxy_pass mb_tcp_backend;
        ssl_certificate /etc/nginx/certs/server.crt;
        ssl_certificate_key /etc/nginx/certs/server.key;
        ssl_protocols TLSv1.2 TLSv1.3;
    }
}
```

### 2. HAProxy Configuration

```haproxy
global
    maxconn 50000
    ssl-default-bind-ciphers ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384
    ssl-default-bind-options no-sslv3 no-tlsv10 no-tlsv11

defaults
    mode tcp
    timeout connect 5s
    timeout client 30s
    timeout server 30s

frontend websocket
    bind *:8080 ssl crt /etc/haproxy/certs/server.pem
    default_backend websocket_servers

frontend tcp
    bind *:8081 ssl crt /etc/haproxy/certs/server.pem
    default_backend tcp_servers

backend websocket_servers
    balance roundrobin
    server mb-1 mb-server-1:8080 check
    server mb-2 mb-server-2:8080 check
    server mb-3 mb-server-3:8080 check

backend tcp_servers
    balance roundrobin
    server mb-1 mb-server-1:8081 check
    server mb-2 mb-server-2:8081 check
    server mb-3 mb-server-3:8081 check
```

## Scaling

### 1. Horizontal Scaling

```bash
# Scale Kubernetes deployment
kubectl scale deployment mb-server --replicas=5

# Scale Docker Compose
docker-compose up --scale mb-server=5
```

### 2. Vertical Scaling

```yaml
resources:
  requests:
    cpu: "1000m"
    memory: "1Gi"
  limits:
    cpu: "4000m"
    memory: "4Gi"
```

## Monitoring Setup

### 1. Prometheus Configuration

```yaml
scrape_configs:
  - job_name: 'mb-server'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        regex: mb-server
        action: keep
    metrics_path: '/metrics'
    scheme: http
```

### 2. Grafana Dashboard

```json
{
  "dashboard": {
    "title": "MB Server Production",
    "panels": [
      {
        "title": "Connection Count",
        "type": "graph",
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "sum(mb_connections_total)"
          }
        ]
      }
    ]
  }
}
```

## Backup and Recovery

### 1. Configuration Backup

```bash
#!/bin/bash
BACKUP_DIR="/backups/mb-server"
DATE=$(date +%Y%m%d)

# Backup configuration
tar -czf $BACKUP_DIR/config-$DATE.tar.gz /app/config/

# Backup certificates
tar -czf $BACKUP_DIR/certs-$DATE.tar.gz /app/certs/

# Rotate old backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
```

### 2. Recovery Procedure

```bash
#!/bin/bash
BACKUP_DATE="20240120"

# Restore configuration
tar -xzf /backups/mb-server/config-$BACKUP_DATE.tar.gz -C /

# Restore certificates
tar -xzf /backups/mb-server/certs-$BACKUP_DATE.tar.gz -C /

# Restart services
kubectl rollout restart deployment mb-server
```

## Security Hardening

### 1. Container Security

```dockerfile
# Use multi-stage build
FROM node:18-alpine AS builder
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
RUN addgroup -S mbserver && adduser -S mbserver -G mbserver
WORKDIR /app
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
USER mbserver
CMD ["node", "dist/index.js"]
```

### 2. Network Security

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: mb-server-network-policy
spec:
  podSelector:
    matchLabels:
      app: mb-server
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - ports:
    - port: 8080
    - port: 8081
    - port: 9090
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: monitoring
```

## Deployment Checklist

1. **Pre-deployment**
   - [ ] SSL certificates ready
   - [ ] Configuration validated
   - [ ] Resources allocated
   - [ ] Monitoring configured
   - [ ] Backups set up

2. **Deployment**
   - [ ] Deploy load balancer
   - [ ] Deploy message broker
   - [ ] Configure auto-scaling
   - [ ] Enable monitoring
   - [ ] Test connectivity

3. **Post-deployment**
   - [ ] Verify metrics
   - [ ] Check logs
   - [ ] Test failover
   - [ ] Document deployment
   - [ ] Update DNS

## Maintenance Procedures

1. **Regular Updates**
   ```bash
   # Update Docker images
   docker pull your-registry/mb-server:latest
   kubectl rollout restart deployment mb-server
   ```

2. **Certificate Rotation**
   ```bash
   # Generate new certificates
   openssl req -new -x509 -nodes -days 365 \
     -keyout new-server.key -out new-server.crt

   # Update Kubernetes secret
   kubectl create secret tls mb-server-certs \
     --cert=new-server.crt \
     --key=new-server.key \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

3. **Performance Tuning**
   ```bash
   # Update resource limits
   kubectl patch deployment mb-server -p \
     '{"spec":{"template":{"spec":{"containers":[{"name":"mb-server","resources":{"limits":{"cpu":"4","memory":"4Gi"}}}]}}}}'
   ```