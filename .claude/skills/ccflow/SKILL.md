---
name: ccflow
description: "Run the project's end-to-end agent workflow on a request. Starting from planner-pippo, decompose the request into subtasks, dispatch each to the most suitable specialist (architect-olmo, backend-wanda, paolo-frontend, tester-patti, security-andrea), gate every implementation step through reviewer-ilaria + supervisor-demarinis, and loop until PASS. Use when a request is non-trivial and benefits from structured decomposition + verified delivery."
---

# ccflow — Orchestrated agent workflow

When the user invokes this skill, follow the steps below in order. Do NOT improvise — the value of this flow is its repeatability.

The user's request comes via `$ARGUMENTS`. If empty, ask the user to describe the task in one sentence and stop until they answer.

## Team roster (mandatory reference)

Use ONLY these agents. Never invent specialists.

| Agent | Role |
|-------|------|
| `planner-pippo` | Decomposes work into subtasks (read-only, no code) |
| `architect-olmo` | Architectural decisions |
| `backend-wanda` | Production code (controllers, services, adapters, mappers) |
| `paolo-frontend` | Vanilla HTML/CSS/JS under `META-INF/resources/` |
| `tester-patti` | Tests (JUnit + `@QuarkusTest`); leaves `// TODO(patti):` for gaps |
| `reviewer-ilaria` | Code review + maintains `TODO.md` + Postman |
| `supervisor-demarinis` | Verifies (PASS/PARTIAL/FAIL with evidence) + maintains `docs/` |
| `debugger-vittorio` | Root-cause analysis on failures (read-only) |
| `security-andrea` | Security review |

## Step-by-step protocol

### 1 — Plan (always)

Invoke `planner-pippo` with the user's request. Pippo returns a structured plan with subtasks, assignees, dependencies, and a verification gate.

Pippo's plan header indicates the mode:
- **`Mode: FAST-LANE`** — trivial change (single file, ≤ 30 LOC, no endpoint/DTO/security surface). Only one `S1.x` subtask + `S5.1`. Dispatch P1 → P5 directly (skip P2/P3/P4).
- **`Mode: STANDARD`** — full pipeline P1 → P2 → (P3) → P4 → P5 as defined below.

If the plan contains "Unresolved questions for the user", STOP. Surface those questions to the user and wait for answers before dispatching anything. Do NOT guess.

### 2 — Dispatch implementation subtasks

Read the plan's `### Dispatch graph` section — it is the authoritative source of ordering. Group subtasks by dependency:
- **Independent subtasks** (different files, no `Depends on`) → dispatch IN PARALLEL via a single message with multiple Agent tool calls.
- **Dependent subtasks** → dispatch sequentially, waiting for the prerequisite to complete.

Each agent invocation must include:
- A self-contained brief (the agent has no memory of pippo's plan).
- The file paths in scope.
- The success criterion (compile / test name / behavior).
- The relevant `.claude/rules/*.md` to honor.
- A clear "do NOT do X" list when the scope is narrow.

### 3 — Verification gate

**STANDARD mode** — run BOTH in parallel after P1 + P2 complete:
- `reviewer-ilaria` — code quality, style rules, test quality, `TODO.md` sync. Outputs APPROVED / APPROVED-WITH-NITS / CHANGES-REQUIRED.
- `supervisor-demarinis` — task completion vs plan, diff evidence, docs sync. Outputs PASS / PARTIAL / FAIL per task.

Their scopes are intentionally non-overlapping (see the "Out of scope" section in each agent's MD). Pass both the same task list and file scope, so verification is targeted.

**FAST-LANE mode** — skip `reviewer-ilaria`. Dispatch only `supervisor-demarinis` as the single gate. Rationale: the change is trivial enough that the supervisor's PASS/FAIL is sufficient.

### 4 — Loop on failure

If any task is FAIL or CHANGES-REQUIRED:
- Re-dispatch the affected subtask to the implementer (`backend-wanda` / `tester-patti`) with the reviewer's notes inlined.
- Re-run the verification gate.
- Hard cap: **3 iterations**. If still failing after the 3rd, stop and ask the user for direction.

If PARTIAL: surface the gap to the user. Apply the trivial nits inline (≤ 3 lines per file) without re-looping; defer larger ones to a new TODO item.

### 5 — Bookkeeping (always, after final PASS)

- `reviewer-ilaria` should already have updated `TODO.md` (resolved items removed, new follow-ups added with the lowest free number, other numbers unchanged). Verify it did.
- `supervisor-demarinis` should already have updated `docs/*.md` if the change was observable. Verify it did when the change touched: a REST endpoint, a DTO field, a domain rule, or a contract.
- Pure refactors / DI cleanup / comment translations / test reorders → no docs update expected.

### 6 — Final report to user

In Italian (project output style):
- Goal recap (1 line).
- Subtasks executed + assignee (table).
- Verification verdicts (PASS / PARTIAL / FAIL + reason).
- Files touched (paths).
- Tests run + result (`./mvnw test -Dtest=ClassName` per class).
- TODO.md / docs/ changes.
- Any unresolved decision left to the user.

Under 250 words.

## Failure modes to avoid

- Skipping pippo and dispatching directly. The planning step is non-negotiable — it forces decomposition and surfaces hidden subtasks.
- Skipping verification. Implementation without verification leaves silent regressions.
- Running implementers in series when their files are disjoint. Parallelize.
- Re-running the full test suite. ALWAYS target the specific test class.
- Letting the fix loop run forever. Cap at 3.
- Inventing agents not in the roster. Escalate instead.
- Editing files yourself instead of delegating. The orchestrator dispatches; the agents implement.
- Forgetting to surface pippo's "Unresolved questions" to the user.

## When NOT to use ccflow

- One-shot trivial fixes (1–2 line edits, rename, typo). Just do it directly.
- Pure read-only investigation (use `debugger-vittorio` directly).
- Pure documentation tweaks the user dictates verbatim.
- When the user explicitly says "no agents, just do it".

## Notes on parallelism

- Up to 4 implementer agents can run in parallel safely if their file scopes are disjoint. More than 4 = build-tool contention risk.
- Verification gate (ilaria + demarinis) should always run in parallel — they don't write production code.
- Pippo runs alone; downstream depends on its plan.
