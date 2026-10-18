---
description: Security rules — input validation, error exposure, secrets
paths:
  - "src/main/java/**/rest/**/*.java"
  - "src/main/java/**/security/**/*.java"
---

# Security

## Input validation
- Validate every `@PathParam` / `@QueryParam` with `@NotNull` / `@Valid`.
- Cascade `@Valid` on every request DTO field that itself has constraints.

## Error exposure
- NEVER leak bare `RuntimeException` to clients — throw / map domain exceptions instead.
- NEVER `e.printStackTrace()` — use a proper logger.

## Credentials & config
- NO hardcoded credentials — read from `application.properties` or env vars.
- NEVER log secrets, API keys, tokens, or full PII.
