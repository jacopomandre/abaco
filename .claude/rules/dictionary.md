---
description: Dictionary constraints — 6% prefix cap per level, entry format, mandatory validation
paths:
  - "web/dizionario.js"
  - "tools/check-dizionario.js"
---

# Dictionary

## Binding constraint: 6% prefix cap
- Within EACH difficulty level (`facile`, `media`, `difficile`), NO two-letter prefix may hold more than **6%** of that level's words.
- The cap applies to every change: adding words, removing words, moving a word between levels.
- NEVER raise `MAX_PREFIX_SHARE` in `tools/check-dizionario.js` to make a change pass — fix the dictionary instead (add words to other prefixes, or move/skip words of the crowded one).

## Mandatory validation
- After ANY change to `web/dizionario.js` RUN `node tools/check-dizionario.js` from the project root.
- A change is NOT done while the script exits with an error.

## Entry format
- One entry per line, file sorted by `parola` lowercased with accents stripped; no two words equal once accents are stripped.
- `parola`: single lowercase word, dictionary lemma (noun singular, adjective masculine singular, verb infinitive), with accents.
- No `chiave` field: the checker computes the accent-free form itself (the game never used it).
- `categoria`: `sostantivo` | `aggettivo` | `verbo`.
- `descrizione`: Italian, 1-2 sentences, must not contain the defined word.
- `difficolta`: non-empty array of `facile` | `media` | `difficile`.

## Levels
- `facile`: concrete everyday words a 7-8 year old knows.
- `media`: common vocabulary of everyday adult life.
- `difficile`: abstract, formal, technical or infrequent words known to an educated adult.
