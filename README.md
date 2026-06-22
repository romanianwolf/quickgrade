# Markov v3

**AI-Powered Grading Platform for Schools** — 100% free, secure, open-source.

[![CI](https://github.com/markov-edu/markov/actions/workflows/ci.yml/badge.svg)](https://github.com/markov-edu/markov/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Security](https://img.shields.io/badge/security-OWASP%20ASVS%20Level%202-brightgreen)](SECURITY.md)

## Architecture

```
markov/
├── apps/
│   ├── web/          # Next.js 15 (Edge + Node runtime)
│   └── worker/       # Isolated background processor
├── packages/
│   ├── core/         # Business logic (OCR, AI, grading, crypto)
│   ├── types/        # Zod schemas, TypeScript interfaces
│   ├── db/           # Supabase client, migrations, RLS
│   ├── cache/        # Redis, circuit breaker, rate limiter
│   ├── ui/           # shadcn components
│   ├── config/       # Shared TypeScript config
│   └── observability/# Structured logging, metrics
├── scripts/          # Setup and management scripts
└── vercel.json       # Vercel deployment config
```

## Security

- **Zero-Trust:** All communications authenticated. mTLS service-to-service.
- **Encryption:** AES-256-GCM at rest, TLS 1.3 in transit, HKDF key derivation.
- **Immutable Audit:** Append-only audit table with RLS preventing UPDATE/DELETE.
- **PII Protection:** Field-level encryption + scrubbing before any AI/OCR call.
- **Rate Limiting:** Token bucket + behavioral analysis.
- **CSP/COOP/COEP:** Strict security headers on all responses.

## Quick Start

```bash
# 1. Configure
scripts\configure.bat

# 2. Edit .env.local with your API keys

# 3. Start development
scripts\startup.bat
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `SUPABASE_JWT_SECRET` | Yes | Supabase JWT secret for IP hashing |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis token |
| `QSTASH_CURRENT_SIGNING_KEY` | Yes | QStash current signing key |
| `QSTASH_NEXT_SIGNING_KEY` | Yes | QStash next signing key |
| `GOOGLE_CLOUD_VISION_API_KEY` | Yes | Google Vision API key |
| `GROQ_API_KEY` | Yes | Groq API key |
| `GOOGLE_AI_STUDIO_KEY` | Yes | Google AI Studio key |
| `FIELD_ENCRYPTION_KEY` | Auto | Generated at configure time |
| `NEXT_PUBLIC_APP_URL` | No | App URL (default: http://localhost:3000) |
| `NODE_ENV` | No | Environment (default: development) |
| `RATE_LIMIT_WINDOW_MS` | No | Rate limit window (default: 60000) |
| `RATE_LIMIT_MAX_REQUESTS` | No | Max requests per window (default: 5) |
| `AUDIT_LOG_RETENTION_DAYS` | No | Audit log retention (default: 365) |
| `IMAGE_RETENTION_DAYS` | No | Image retention (default: 30) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Next.js 15.1+ (App Router) |
| Language | TypeScript 5.7+ (strict) |
| Database | Supabase (PostgreSQL 15) |
| Cache | Upstash Redis |
| Queue | Upstash QStash |
| AI/OCR | Google Vision, Groq, Gemini |
| UI | Tailwind CSS 4 + shadcn/ui |
| Lint | Biome 1.9+ |
| Testing | Vitest + Playwright |
| Deploy | Vercel + Supabase |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/health` | System health check |
| `POST` | `/api/v1/scan` | OCR image scan |
| `POST` | `/api/v1/grade` | AI grading |
| `POST` | `/api/v1/review/accept` | Accept human review corrections |

## Compliance

- **FERPA:** Student education records protected
- **COPPA:** Children's online privacy protected
- **GDPR:** Right to erasure, data minimization, explicit consent

## License

MIT — see [LICENSE](LICENSE)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.
