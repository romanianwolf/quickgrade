# Contributing to Markov

Thank you for your interest in contributing to Markov! This document provides guidelines and instructions for contributing.

## Development Setup

1. Fork the repository
2. Clone your fork
3. Run `scripts\configure.bat`
4. Create a feature branch: `git checkout -b feat/my-feature`
5. Make your changes
6. Run tests: `pnpm test`
7. Run linter: `pnpm lint`
8. Commit with conventional commits: `git commit -m "feat: add new feature"`
9. Push and create a Pull Request

## Conventional Commits

We enforce conventional commits for automated changelog generation:

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `style:` — Code style changes (formatting, etc.)
- `refactor:` — Code refactoring
- `test:` — Adding or updating tests
- `chore:` — Maintenance tasks
- `security:` — Security fixes

## Code Standards

- **TypeScript:** Strict mode, no `any`, no `console.log`
- **Validation:** All inputs validated with Zod at boundaries
- **Security:** PII scrubbing before AI calls, audit logging for mutations
- **Testing:** All business logic covered by unit tests
- **PRs:** Require at least 1 approval, CI must pass

## Security

If you discover a security vulnerability, please see [SECURITY.md](.github/SECURITY.md) for reporting instructions.

## Code of Conduct

Be respectful, inclusive, and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
