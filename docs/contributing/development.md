# Development Setup Guide

This guide explains how to set up your development environment for MB Server Node.

## Prerequisites

1. Node.js and npm:
   - Node.js 18 or later
   - npm 8 or later

2. Development tools:
   - Git
   - Visual Studio Code (recommended)
   - Docker (optional)

## Initial Setup

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/mb-server-node.git
cd mb-server-node
```

2. Install dependencies:
```bash
npm install
```

3. Set up pre-commit hooks:
```bash
npm run prepare
```

## Development Environment

### VS Code Setup

1. Install recommended extensions:
   - ESLint
   - Prettier
   - TypeScript
   - Jest Runner

2. Use workspace settings:
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

### Environment Variables

Create a `.env` file:
```bash
# Server Ports
MB_PORTS_WEBSOCKET=8080
MB_PORTS_TCP=8081
MB_HOST=localhost

# SSL/TLS (Development)
MB_SSL_ENABLED=false
MB_SSL_KEY=./certs/server.key
MB_SSL_CERT=./certs/server.crt

# Logging
MB_LOGGING_LEVEL=debug
MB_LOGGING_FORMAT=pretty

# Monitoring
MB_MONITORING_ENABLED=true
MB_MONITORING_PORT=9090
```

## Build and Test

### Build Commands

```bash
# Build TypeScript
npm run build

# Watch mode
npm run build:watch

# Clean build
npm run clean && npm run build
```

### Test Commands

```bash
# Run all tests
npm test

# Run specific test
npm test -- path/to/test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Lint Commands

```bash
# Run ESLint
npm run lint

# Fix ESLint issues
npm run lint:fix

# Check types
npm run typecheck
```

## Development Workflow

### 1. Start Development Server

```bash
# Start in development mode
npm run dev

# Start with specific config
NODE_ENV=development npm run dev
```

### 2. Run Tests

```bash
# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- src/core/router.test.ts
```

### 3. Debug

1. Using VS Code debugger:
   - Set breakpoints
   - Use "Debug" configuration
   - Start debugging (F5)

2. Using Chrome DevTools:
   - Start with `--inspect`:
     ```bash
     node --inspect dist/index.js
     ```
   - Open Chrome DevTools
   - Connect to Node process

### 4. Monitor

1. Check metrics:
```bash
curl http://localhost:9090/metrics
```

2. Check health:
```bash
curl http://localhost:9090/health
```

## Project Structure

```
mb-server-node/
├── src/
│   ├── core/           # Core functionality
│   ├── config/         # Configuration
│   ├── utils/          # Utilities
│   └── index.ts        # Entry point
├── test/               # Tests
├── docs/               # Documentation
└── scripts/            # Build scripts
```

## Common Tasks

### Adding a New Feature

1. Create feature branch
2. Add tests first (TDD)
3. Implement feature
4. Update documentation
5. Submit PR

### Fixing a Bug

1. Create bug fix branch
2. Add failing test
3. Fix bug
4. Verify fix
5. Submit PR

### Adding Documentation

1. Update relevant docs
2. Add code examples
3. Update JSDoc comments
4. Submit PR

## Best Practices

### Code Style

- Follow TypeScript best practices
- Use meaningful names
- Keep functions small
- Add comments for complex logic

### Testing

- Write unit tests first
- Mock external dependencies
- Test edge cases
- Maintain test coverage

### Git

- Keep commits atomic
- Write clear commit messages
- Rebase before merging
- Squash when needed

## Troubleshooting

### Common Issues

1. Build fails:
   - Check Node.js version
   - Clear node_modules
   - Clean build

2. Tests fail:
   - Check test environment
   - Verify mocks
   - Check async timing

3. Type errors:
   - Run typecheck
   - Update types
   - Check imports

### Getting Help

1. Check documentation
2. Search issues
3. Ask in discussions
4. Join Discord server