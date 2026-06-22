# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability within Markov, please send an email to security@markov-edu.org. All security vulnerabilities will be promptly addressed.

**Please do not report security vulnerabilities through public GitHub issues.**

## Security Measures

- **Encryption:** All data encrypted at rest (AES-256-GCM) and in transit (TLS 1.3)
- **Authentication:** JWT/OIDC with short-lived tokens
- **Authorization:** Row-Level Security (RLS) on all database tables
- **Audit Trail:** Immutable append-only audit logs
- **Input Validation:** Zod schema validation at all API boundaries
- **PII Protection:** Field-level encryption and PII scrubbing before AI calls
- **Rate Limiting:** Token bucket rate limiting with behavioral analysis
- **Dependencies:** Automated vulnerability scanning via Trivy and Dependabot

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 3.0.x   | :white_check_mark: |
| < 3.0   | :x:                |

## Compliance

- **FERPA:** Student education records protected
- **COPPA:** Children's online privacy protected
- **GDPR:** Right to erasure, data minimization, explicit consent
