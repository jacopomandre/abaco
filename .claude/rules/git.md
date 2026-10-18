---
description: Git workflow rules — feature branches only, never commit on main, never push
---

# Git

## Branches
- NEVER commit on `main`.
- Every new feature or fix starts on a NEW branch created from `main` (e.g. `feature/<short-name>`, `fix/<short-name>`).
- If the current branch is `main` when work starts, create and switch to a new branch BEFORE the first commit.

## Push
- NEVER push to any branch, remote or tag (`git push` in any form, including `--force`, `--tags`, `-u`).
- Work only in the context of local commits: the user handles every push.
- The ONLY exception is an explicit request from the user in the current conversation ("push it", "fai il push"). The request covers that single push, not later ones.
