---
description: Hexagonal architecture rules — layering, port naming, dependency injection
paths:
  - "src/main/java/**/*.java"
---

# Architecture

## Layering
- Dependency direction: `adapters -> app.services -> app.interfaces -> app.domain`.
- `app.domain` MUST have ZERO framework dependencies (no CDI, no Quarkus annotations).
- Adapters live in `adapters/driving/` (inbound) or `adapters/driven/` (outbound).

## Ports
- Inbound ports: `app.interfaces/DrivingPorts/`.
- Outbound ports: `app.interfaces/DrivenPorts/`.
- Naming: `For<Action><Resource>` (e.g. `ForRetrievingUser`).
- Adapters implement the matching port interface.

## Dependency injection
- Constructor injection ONLY — NEVER `@Inject` on fields.
- USE Lombok `@RequiredArgsConstructor` with `final` fields — Quarkus CDI auto-binds the single generated constructor.
- `@Transactional` (if introduced later) allowed only on service layer — NEVER on REST resources.

Allowed:
```java
@ApplicationScoped
@RequiredArgsConstructor
public class FooService {
    private final ForRetrievingX forRetrievingX;
    private final ForPersistingY forPersistingY;
}
```

Not allowed:
```java
@ApplicationScoped
public class FooService {
    @Inject
    ForRetrievingX forRetrievingX;
}
```
