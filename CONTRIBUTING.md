# Contributing to Open Wemo

Thank you for your interest in contributing to Open Wemo! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) v1.0 or later
- Git
- A WeMo device for testing (optional but recommended)

### Setup

```bash
# Clone the repository
git clone https://github.com/haal-laah/open-wemo.git
cd open-wemo

# Switch to develop branch
git checkout develop

# Install dependencies
bun install

# Start development server
bun run dev
```

## Development Workflow

### Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
# Check for issues
bun run lint

# Auto-fix issues
bun run lint:fix

# Format code
bun run format
```

### Type Checking

```bash
bun run typecheck
```

### Testing

```bash
bun run test
```

## Project Structure

```
open-wemo/
├── packages/
│   ├── bridge/          # Desktop tray app + REST API
│   │   └── src/
│   │       ├── main.ts  # Entry point
│   │       ├── server/  # Hono REST API
│   │       ├── wemo/    # WeMo protocol
│   │       ├── tray/    # System tray
│   │       └── db/      # SQLite
│   │
│   └── web/             # PWA frontend
│       ├── index.html
│       ├── css/
│       ├── js/
│       └── sw.js
│
├── scripts/             # Build scripts
└── docs/                # Documentation
```

## Submitting Changes

### Commit Messages

Write clear, concise commit messages:

- **Good**: "Add power monitoring display to device card"
- **Bad**: "Updated stuff"

Use present tense ("Add feature" not "Added feature").

### Pull Requests

1. Create a feature branch from `develop` (not `main`)
2. Make your changes
3. Run tests and linting
4. Submit a PR **targeting the `develop` branch**

> **Note:** The `main` branch is reserved for stable releases. All pull requests should target `develop`.

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Tests pass (`bun run test`)
- [ ] Linting passes (`bun run lint`)
- [ ] Type checking passes (`bun run typecheck`)
- [ ] Documentation updated (if applicable)
- [ ] Commit messages are clear

## Code Guidelines

### TypeScript

- Use strict typing - avoid `any`
- Export types from dedicated type files
- Document public APIs with JSDoc comments

### Error Handling

- Always handle errors gracefully
- Provide user-friendly error messages
- Log errors for debugging

### Testing

- Write unit tests for protocol code
- Test error cases, not just happy paths
- Keep tests focused and fast

## Adding Device Support

To add support for a new WeMo device type:

1. Add the device type to `packages/bridge/src/wemo/types.ts`
2. Implement any device-specific SOAP actions
3. Update the discovery code if needed
4. Add tests for the new device type
5. Update documentation

## Reporting Issues

If you find a bug or have a feature request:

1. Check existing [GitHub Issues](https://github.com/haal-laah/open-wemo/issues)
2. Open a new issue with a clear description
3. Include steps to reproduce (for bugs)
4. Include expected vs actual behavior

## Questions?

Open an issue or start a discussion. We're happy to help!

## License

By contributing, you agree that your contributions will be licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).
