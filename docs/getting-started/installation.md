# Installation Guide

This guide explains how to install MB Server Node.

## Prerequisites

- Node.js 18 or later
- npm 8 or later
- Git (for source installation)

## Installation Methods

### 1. From Source

```bash
# Clone the repository
git clone https://github.com/dexgroup/mb-server-node.git

# Enter directory
cd mb-server-node

# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start
```

### 2. Using Docker

```bash
# Pull the image
docker pull dexgroup/mb-server-node:latest

# Run the container
docker run -d \
  -p 8080:8080 \
  -p 8081:8081 \
  -p 9090:9090 \
  --name mb-server \
  dexgroup/mb-server-node:latest
```

### 3. Using Docker Compose

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  mb-server:
    image: dexgroup/mb-server-node:latest
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
    restart: unless-stopped
```

Then run:
```bash
docker-compose up -d
```

## Verification

1. Check server status:
```bash
curl http://localhost:9090/health
```

2. Check WebSocket port:
```bash
curl -v http://localhost:8080
```

3. Check TCP Socket port:
```bash
nc -zv localhost 8081
```

## Next Steps

1. Follow the [Quick Start Guide](quickstart.md)
2. Configure your installation using the [Configuration Guide](configuration.md)
3. Read about [Core Concepts](../concepts/architecture.md)
4. Check [Security Best Practices](../operations/security.md)