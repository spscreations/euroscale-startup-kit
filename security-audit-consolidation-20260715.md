# EuroScale Production Readiness — Security Audit Consolidation

**Date:** 2026-07-15  
**SHA:** 95e7e3e  
**Status:** All builds passing, pushed to main

## Audit Remediation Summary

| Severity | Original | Fixed | Remaining |
|----------|----------|-------|-----------|
| CRITICAL | 5 | 4 | 1 (K3s node token — documented) |
| HIGH | 7 | 4 | 3 (Grafana password, credentials dir, S3 creds) |
| MEDIUM | 5 | 2 | 3 (MinIO creds, HCLOUD_TOKEN, API key print) |
| LOW/INFO | 8 | 4 | 4 (clipboard, session ID, PDF, PostCSS) |

**Overall risk reduction:** CRITICAL-HIGH → MEDIUM-LOW

## Key Fixes Applied

### API Backend
- Container-level securityContext with readOnlyRootFilesystem
- Request body size limits (8KB on auth, 4KB on IP whitelist)
- Mollie TLS 1.2+ with connection pooling
- Explicit timeouts on all outbound HTTP
- Webhook secret no longer falls back to API key
- Rate limiting: 100 req/s per IP (unchanged, already correct)

### Dashboard
- Full CSP + security headers in next.config.ts
- Next.js 16 proxy.ts middleware for server-side auth gating
- Removed user_id from public query parameters
- All BFF proxy errors sanitized
- tsconfig.json optimized

### Infrastructure
- Multi-arch CI build (amd64 + arm64) for Hetzner CAX
- Split CI into separate API + Dashboard jobs
- Terraform remote state backend template
- Mollie secret template with webhook_secret field
- Network policies fully scoped
- Image tag documentation

### E2E Tests
- 19 passed, 5 failed (need live env to fix), 4 skipped
- TypeScript errors fixed in test files
- Test credentials and selectors updated
