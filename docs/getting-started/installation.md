# Installation Guide

This guide covers the prerequisites and installation steps for MB Server Node.

## Prerequisites

- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- Basic understanding of message brokers and pub/sub patterns
- (Optional) Docker for containerized deployment

## Installation Methods

### From Source

1. Clone the repository:
```bash
git clone https://github.com/your-org/mb-server-node.git
cd mb-server-node
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

### Using Docker

Pull and run the official Docker image:

```bash
docker pull your-org/mb-server-node:latest
docker run -p 8080:8080 -p 8081:8081 your-org/mb-server-node:latest
```

## Verifying Installation

1. Start the server:
```bash
# Development mode
npm run dev

# Production mode
npm start
```

2. Check that the server is running:
   - WebSocket server should be listening on port 8080
   - TCP server should be listening on port 8081

3. You should see startup logs indicating:
   - Server ports and protocols
   - Configuration loaded
   - Ready to accept connections

## Next Steps

- Continue to the [Quick Start Guide](./quickstart.md) to learn basic usage
- Review the [Configuration Guide](./configuration.md) for customization options
- Check [Troubleshooting](./troubleshooting.md) if you encounter any issues