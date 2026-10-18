---
description: Java code style — language features, immutability, money, comments, single-return
paths:
  - "src/main/java/**/*.java"
  - "src/test/java/**/*.java"
---

# Code Style

## Language & types
- Java 17 — USE records, sealed classes, pattern matching where appropriate.
- Monetary values: `BigDecimal` with `RoundingMode.HALF_EVEN`, scale 2.
- NO null returns — USE `Optional` for single values, empty collections for lists.
- PREFER immutability: `final` fields, unmodifiable collections.

## Domain & mapping
- Domain VOs: Lombok `@Builder`, `@Getter`, `@With`, `@Jacksonized` — NO setters.
- Domain services: pure functions, no injected dependencies, no framework annotations.
- USE MapStruct for every DTO <-> domain mapping.

## Time source & timezone
- Business timezone is `Europe/Rome`. Both production and test code MUST NOT call `LocalDate.now()`, `LocalDateTime.now()`, `Instant.now()`, or `new Date()` without an explicit zone — test fixtures must be reproducible regardless of the host JVM TZ.
- Declare a shared `private static final ZoneId ROME = ZoneId.of("Europe/Rome");` in each class that needs it, and use `LocalDateTime.now(ROME)` / `LocalDate.now(ROME)`.
- Allowed exceptions (must include a `// WHY` comment): code that intrinsically lives in UTC (OIDC token expiry, third-party SDK callbacks).

Not allowed:
```java
LocalDate today = LocalDate.now();                       // implicit JVM TZ — drifts when JVM TZ != Europe/Rome
entity.setCreatedAt(LocalDateTime.now());                // same issue
Instant ts = Instant.now();                              // OK only if the value semantically lives in UTC — add `// WHY` comment, otherwise use Clock.system(ROME)
```

Allowed:
```java
private static final ZoneId ROME = ZoneId.of("Europe/Rome");

LocalDate today = LocalDate.now(ROME);
entity.setCreatedAt(LocalDateTime.now(ROME));
```

## Comments
- English only (applies to `//`, `/* */`, Javadoc, config files).
- Concise, explain WHY, not WHAT.
- Non-English comments MUST be translated when touched.

## Single return per method
- Every method has exactly ONE `return` at the end.
- NO early returns, NO guard-clause returns.
- Use a single `result` variable assigned inside branches.
- `void` methods: no bare `return;` mid-body.

Not allowed:
```java
int foo(int x) {
    if (x < 0) return 0;
    return x * 2;
}
```

Allowed:
```java
int foo(int x) {
    int result;
    if (x < 0) {
        result = 0;
    } else {
        result = x * 2;
    }
    return result;
}
```
