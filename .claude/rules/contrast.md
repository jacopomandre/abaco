---
description: Text contrast of the web app — the required threshold and when to check it
paths:
  - "web/**"
---

# Text contrast

## Threshold (project requirement, WCAG 2.1 level AA)
- Normal text: contrast ratio of at least **4.5:1** against what is actually painted behind it.
- Large text only (at least 24px, or at least 18.66px bold): at least **3:1**.
- It holds in EVERY theme (classico, quaderno, arcade, lavagna, notte), EVERY difficulty (easy, medium,
  hard, custom with and without colors / bold) and on phone and desktop widths.
- Disabled or already-used controls (e.g. a used help in the AIUTI menu) are NOT exempt: they must
  still read, at the same threshold. Show "used / not available" with other cues (gray tiles, icons).
- Why: a text that reads in one combination can vanish in another (the METÀ word was light gold on the
  light plain rows of the hard level in classico).

## Check (on the user's request only)
- `npm run check:contrast` (tools/check-contrast.js, about 75 seconds) opens the game in headless Chrome,
  builds every combination above (helps unused and used, menus open, close / far / imported rows, end
  of game) and measures every visible text against the real pixels behind it. Report with screenshots
  in `contrast-report/` (not committed).
- It runs ONLY when the user invokes the `/contrasto` skill: NOT on every commit, NOT in the Android
  build (too slow for that). Never run it unasked.
- The user reads the report and picks what to fix; never change colors to meet the threshold without
  their choice.
- When changing how something looks, still choose colors that meet the threshold in every theme and
  difficulty (check light plain rows, gradients and highlighters by eye in the browser).
- A new screen, state or element that shows text gets a scenario in tools/check-contrast.js.
