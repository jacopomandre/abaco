---
description: Testing rules — frameworks, naming, execution policy
paths:
  - "src/test/java/**/*.java"
---

# Testing

## Frameworks
- Unit tests: JUnit 5 + Mockito.
- Integration tests: `@QuarkusTest` + REST-Assured.
- Domain services: plain unit tests — NO Quarkus infrastructure.

## Naming
- Method names: `methodName_scenario_expectedResult`.
- `@DisplayName` describes the scenario in plain English.

## Coverage requirements
- Every new REST endpoint needs at least one integration test.

## Execution
- Run a single test class: `./mvnw test -Dtest=ClassName`.
- Run a single method: `./mvnw test -Dtest=ClassName#methodName` (use `ClassName$NestedClass#methodName` for JUnit `@Nested`).
- NEVER run the full test suite — always target specific classes.

## Class size & decomposition
- Split a test class when ANY of the following is true: LOC > 800, `@Test` methods > 20, or two `@Nested` groups have fully orthogonal setup (distinct fixtures, no shared helpers).
- `@Nested` grouping does NOT count as a split — Surefire runs all nested classes together; splitting requires separate top-level classes.
- Split pattern: promote a `@Nested` to its own top-level class named `OriginalClass<Concern>Test`, moving helpers/builders used only by that concern. Shared fixtures go to `testsupport/`; scenario-specific request builders stay inside the split class.
- Splits are performed on-touch: when a task modifies a class that already exceeds the thresholds, the same task includes the split. No pre-emptive refactor-only passes.
- Avoid over-splitting: classes with < 3 `@Test` methods and duplicated setup with a sibling class should be merged (under two `@Nested` groups).
