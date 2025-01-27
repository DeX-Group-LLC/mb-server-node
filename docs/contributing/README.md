# Contributing to MB Server Node

Thank you for your interest in contributing to MB Server Node! This guide will help you get started.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Development Setup

1. Fork and clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/mb-server-node.git
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

4. Run tests:
```bash
npm test
```

## Development Workflow

1. Create a new branch:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes and ensure:
   - All tests pass
   - Code follows style guidelines
   - Documentation is updated
   - New tests are added for new features

3. Commit your changes:
```bash
git add .
git commit -m "feat: add your feature description"
```

4. Push to your fork:
```bash
git push origin feature/your-feature-name
```

5. Create a Pull Request

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Test changes
- `chore:` Build process or auxiliary tool changes

## Code Style

- Use 4 spaces for indentation
- Follow ESLint rules
- Add JSDoc comments for public APIs
- Keep lines under 100 characters
- Use meaningful variable names

## Testing

- Write unit tests for new features
- Maintain test coverage
- Run `npm test` before submitting PR
- Add integration tests for complex features

## Documentation

- Update relevant documentation
- Add JSDoc comments
- Include code examples
- Update changelog

## Pull Request Process

1. Update documentation
2. Add tests
3. Update changelog
4. Get review approval
5. Squash commits
6. Merge to main branch

## Release Process

1. Update version in package.json
2. Update CHANGELOG.md
3. Create release tag
4. Build and publish

## Getting Help

- Join our Discord server
- Check existing issues
- Ask questions in discussions
- Read the documentation

## License

By contributing, you agree that your contributions will be licensed under the MIT License.