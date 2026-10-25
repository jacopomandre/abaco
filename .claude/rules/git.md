---
description: Git workflow rules — feature branches only, never commit on main, never push
---

# Git

## Branches
- NEVER commit on `main`.
- Every new feature or fix starts on a NEW branch created from the CURRENT branch, not from `main` (e.g. `feature/<short-name>`, `fix/<short-name>`).
- Why: the user stacks features on top of each other's unmerged work; branching from `main` would drop it.
- If the current branch is `main` when work starts, create and switch to a new branch BEFORE the first commit.

## Commit messages
- NEVER add a `Co-Authored-By:` trailer (or any other co-author / AI attribution line) to commit messages.
- Why: the site deploys on Netlify's free plan, which allows a single contributor on private repos; an extra co-author fails the deploy ("unrecognized Git contributor").

## Commit identity
- Every commit is authored AND committed with the GitHub noreply address `56002919+jacopomandre@users.noreply.github.com` (set as this repo's `user.email`).
- NEVER commit with a personal email address; check `git config user.email` before committing if in doubt.
- Why: the repository is public, so every commit's email is readable by anyone; the personal one was scrubbed from the whole history.

## Push
- NEVER push to any branch, remote or tag (`git push` in any form, including `--force`, `--tags`, `-u`).
- Work only in the context of local commits: the user handles every push.
- The ONLY exception is an explicit request from the user in the current conversation ("push it", "fai il push"). The request covers that single push, not later ones.
