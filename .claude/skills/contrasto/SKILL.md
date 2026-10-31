---
name: contrasto
description: "Check the text contrast of the web app (every theme, difficulty, game state, phone and desktop) against the project threshold and report the failures, grouped and with screenshots, so the user can pick which to fix. Only when the user invokes /contrasto."
disable-model-invocation: true
---

# contrasto — text contrast report

The threshold and why it exists: `.claude/rules/contrast.md`. This skill only measures and reports:
it NEVER changes code by itself. The user reads the report and decides what to fix.

## 1. Run the check
- `npm run check:contrast` (tools/check-contrast.js, about 75 seconds; Bash timeout 300000 ms).
- It needs Google Chrome installed (playwright-core drives it). Exit code 2 = it could not run: say why
  (the message it printed) and stop.
- Exit code 0 = every text is above the threshold: tell the user in one line, with the number of texts
  measured, and stop.
- Exit code 1 = failures. The console lists them grouped by element, worst first; the folder
  `contrast-report/` (not committed) holds `index.html` (one card per group, with a screenshot of its
  worst case, the text circled in red) and `lista.txt` (every single case).

## 2. Report (in Italian)
- Send `contrast-report/index.html` with SendUserFile (`display: "render"`), so the user sees the
  screenshots.
- Then a table, one row per group, worst first, numbered as in the report:
  number | what it is in plain words (e.g. "parte attenuata delle parole", "TENTA nel classico",
  "scritta ...N tentativi rimasti"), never just the CSS selector | worst ratio (minimum) | themes |
  cases | a short note: a deliberate style choice (e.g. the dimmed rest of the word of "lettere
  giuste"), something added recently, or a plain miss.
- Say how many texts were measured, how many failed and how long it took.
- If the screenshots show a false alarm (text that is not really visible, a wrong spot), say so and
  leave that group out of the proposals.

## 3. Let the user choose
- Ask which groups to fix (by number). For each group the user picks, propose the fix in one line
  (which color or rule changes, in which themes) before changing anything.
- After the fixes: run the check again and show the new numbers for the groups that were fixed.
- Commit only what the user asked for, following `.claude/rules/git.md`.
