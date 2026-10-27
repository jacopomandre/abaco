// Abaco Zuzzurellone - vanilla SPA client
// The whole game runs here, with no server: the secret word is drawn from the
// dictionary shipped with the page (dizionario.js, loaded before this file).
(function () {
    'use strict';

    // Dictionary entries: { parola, chiave, categoria, descrizione, difficolta: [...] }
    const DICTIONARY = window.ABACO_DIZIONARIO || [];
    // Word pools a game can draw from -> labels of the "difficolta" field of the dictionary
    const WORD_POOLS = {
        EASY:   ['facile'],
        MEDIUM: ['media'],
        HARD:   ['difficile'],
        ALL:    ['facile', 'media', 'difficile']
    };

    // DOM references
    const $difficulty      = document.getElementById('difficulty');
    const $newGame         = document.getElementById('new-game');
    const $importCode      = document.getElementById('import-code');
    const $importGame      = document.getElementById('import-game');
    // Same import, on the game screen: a button opens a popup holding the code field
    const $importOpen      = document.getElementById('import-open');
    const $importDialog    = document.getElementById('import-dialog');
    const $importForm      = document.getElementById('import-form');
    const $importCodeGame  = document.getElementById('import-code-game');
    const $importWarning   = document.getElementById('import-dialog-warning');
    const $importError     = document.getElementById('import-dialog-error');
    const $importCancel    = document.getElementById('import-cancel');
    const $boardStack      = document.getElementById('board-stack');
    const $submit          = document.getElementById('submit-guess');
    const $surrender       = document.getElementById('surrender');
    const $restart         = document.getElementById('restart-game');
    const $backHome        = document.getElementById('back-home');
    const $logoLink        = document.getElementById('logo-link');
    const $copyCode        = document.getElementById('copy-code');
    const $history         = document.getElementById('history');
    const $banner          = document.getElementById('banner');
    const $startScreen     = document.getElementById('start-screen');
    const $theme           = document.getElementById('theme-select');
    const $difficultyNote  = document.getElementById('difficulty-note');
    const $noteSizer       = document.getElementById('difficulty-note-sizer');
    // Custom game panel, shown under the picker when "su misura" is chosen
    const $customRules     = document.getElementById('custom-rules');
    const $customWords     = document.getElementById('custom-words');
    const $customAttempts  = document.getElementById('custom-attempts');
    const $attemptsStepper = document.getElementById('custom-attempts-stepper');
    const $customColors    = document.getElementById('custom-colors');
    const $customBold      = document.getElementById('custom-bold');
    // Confirmation popup (surrender, leaving a game), filled in by askConfirm
    const $confirmDialog   = document.getElementById('confirm-dialog');
    const $confirmTitle    = document.getElementById('confirm-dialog-title');
    const $confirmText     = document.getElementById('confirm-dialog-text');
    const $confirmOk       = document.getElementById('confirm-ok');
    const $confirmCancel   = document.getElementById('confirm-cancel');
    const $confirmExtra    = document.getElementById('confirm-extra');
    const $hintsOpen       = document.getElementById('hints-open');
    const $hintsDialog     = document.getElementById('hints-dialog');
    const $hintsRows       = document.getElementById('hints-difficulty-rows');
    // board and history sections (no id, select by class)
    const $board           = document.querySelector('.board');
    const $historySection  = document.querySelector('.history-section');
    // Phone game screen: attempts counter and "..." menu (see "Phone game screen" in style.css)
    const $attemptsCount   = document.getElementById('attempts-count');
    const $menuOpen        = document.getElementById('menu-open');
    const $menuDialog      = document.getElementById('menu-dialog');
    const $menuImport      = document.getElementById('menu-import');
    const $menuExport      = document.getElementById('menu-export');
    const $menuHints       = document.getElementById('menu-hints');
    const $menuHistory     = document.getElementById('menu-history');

    // Same width as the "Phone game screen" media query of style.css: below it the game is one fixed screen
    const PHONE = window.matchMedia('(max-width: 640px)');

    // Dictionary edges: the outer bounds a brand-new game starts from
    const DICT_FIRST = 'abaco';
    const DICT_LAST  = 'zuzzurellone';

    // Rules a game plays by:
    //   words:    key of WORD_POOLS, the words the secret is drawn from
    //   attempts: attempts the game starts with
    //   colors:   closeness hint, row colors and badge (both read the same closeness value)
    //   bold:     leading letters shared with the secret set in bold; only together with colors,
    //             since it extends the same hint past the first two letters
    // Presets per difficulty (harder games get fewer attempts and fewer hints).
    const DIFFICULTY = {
        EASY:   { words: 'EASY',   attempts: 20, colors: true,  bold: true  },
        MEDIUM: { words: 'MEDIUM', attempts: 15, colors: true,  bold: true  },
        HARD:   { words: 'HARD',   attempts: 15, colors: false, bold: false }
    };
    // Custom game: the player sets every rule; the game then carries its own rules
    const CUSTOM = 'CUSTOM';
    const RULE_KEYS = ['words', 'attempts', 'colors', 'bold'];
    const BOOLEAN_RULES = ['colors', 'bold'];
    // Attempts a custom game may start with
    const CUSTOM_ATTEMPTS_MIN = 10;
    const CUSTOM_ATTEMPTS_MAX = 30;
    // Rules the custom panel shows the first time
    const CUSTOM_DEFAULT = DIFFICULTY.MEDIUM;
    // From this many attempts left downwards, the countdown (in the guess placeholder) is highlighted
    const LOW_ATTEMPTS = 5;

    // localStorage key holding the game in progress
    const SAVE_KEY = 'abaco.partita';
    // localStorage key holding the last custom rules, so the panel opens on them
    const CUSTOM_SAVE_KEY = 'abaco.su-misura';

    // Game code format version, bumped if the exported payload ever changes shape
    // (3: carries the difficulty, which sets both the attempts and the color hint;
    //  4: no longer carries the secret, the importer draws a new one between the bounds;
    //  5: a custom game also carries its rules)
    const CODE_VERSION = 5;
    // Short keys of the rules in a game code (same order as RULE_KEYS)
    const RULE_CODE_KEYS = { words: 'w', attempts: 'a', colors: 'h', bold: 'b' };

    // Italian alphabetical order, ignoring case and accents: typing "citta" matches "città"
    // (same idea as the accent-free "chiave" field of the dictionary)
    const ITALIAN = new Intl.Collator('it', { sensitivity: 'base' });

    // Current game. Mirrored to localStorage on every change, so a reload resumes it.
    // {
    //   secret: {word, category, definition},
    //   baseLower, baseUpper: bounds the game started from (dictionary edges, or the imported ones)
    //   difficulty:           'EASY' | 'MEDIUM' | 'HARD' (key of DIFFICULTY) | 'CUSTOM'
    //   rules:                custom games only: the rules chosen by the player (see DIFFICULTY)
    //   baseAttempts:         attempts already spent before this session (0, or the imported count)
    //   attempts: [{word, outcome}]  guesses made in this session
    //   status:   'IN_PROGRESS' | 'WON' | 'SURRENDERED' | 'LOST' (attempts ran out)
    // }
    // outcome: 'LOWER' | 'UPPER' | 'WON'
    let game = null;
    // Reference to the editable guess input (recreated on each render)
    let $guess = null;
    // Attempts chosen in the custom panel, moved only by its step buttons
    let customAttempts = CUSTOM_DEFAULT.attempts;

    // --- Rules ---

    function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
    }

    // True when "rules" is a complete, well-formed rules object: exactly the RULE_KEYS, each with a
    // value in range. Custom rules come from the player, from storage or from a pasted game code
    // (hand-editable Base64), so every source goes through this one check.
    function isValidRules(rules) {
        return rules !== null && typeof rules === 'object' && !Array.isArray(rules)
            && Object.keys(rules).length === RULE_KEYS.length
            && RULE_KEYS.every(function (key) { return hasOwn(rules, key); })
            && typeof rules.words === 'string' && hasOwn(WORD_POOLS, rules.words)
            && Number.isInteger(rules.attempts)
            && rules.attempts >= CUSTOM_ATTEMPTS_MIN && rules.attempts <= CUSTOM_ATTEMPTS_MAX
            && BOOLEAN_RULES.every(function (key) { return typeof rules[key] === 'boolean'; })
            // The right letters build on the colors: never one without the other
            && (rules.colors || !rules.bold);
    }

    // Rules of a game: a preset's are read live (a level's changes reach saved games too),
    // a custom game carries its own
    function rulesOf(target) {
        return target.difficulty === CUSTOM ? target.rules : DIFFICULTY[target.difficulty];
    }

    // --- Base64 helpers (UTF-8 safe: plain atob()/btoa() would mangle accented letters) ---

    function decodeBase64(encoded) {
        const bytes = Uint8Array.from(atob(encoded), function (c) { return c.charCodeAt(0); });
        return new TextDecoder().decode(bytes);
    }

    function encodeBase64(text) {
        const bytes = new TextEncoder().encode(text);
        return btoa(String.fromCharCode.apply(null, bytes));
    }

    // Draw a random secret word from a word pool (key of WORD_POOLS).
    // With bounds (import), only words strictly between lower and upper count.
    // Throws when the dictionary is missing or no word of that level fits: an imported code
    // can then not be resumed (dictionary changed since the export, or code edited by hand).
    function pickSecret(words, lower, upper) {
        const labels     = WORD_POOLS[words];
        const bounded    = lower !== undefined;
        const candidates = DICTIONARY.filter(function (entry) {
            return entry.difficolta.some(function (label) { return labels.includes(label); })
                && (!bounded
                    || (ITALIAN.compare(lower, entry.parola) < 0 && ITALIAN.compare(entry.parola, upper) < 0));
        });
        if (candidates.length === 0) {
            throw new Error(bounded
                ? 'Codice partita non valido: nessuna parola disponibile tra i suoi confini.'
                : 'dizionario non disponibile');
        }
        const entry = candidates[Math.floor(Math.random() * candidates.length)];
        // Category and definition are optional in the dictionary
        return {
            word:       entry.parola,
            category:   entry.categoria || '',
            definition: entry.descrizione || ''
        };
    }

    // --- Derived game values ---

    // Total attempts spent on this game, including those made before an import
    function attemptCount() {
        return game.baseAttempts + game.attempts.length;
    }

    // Attempts still available: the countdown shown to the player
    function attemptsLeft() {
        return rulesOf(game).attempts - attemptCount();
    }

    // Words known to come before the secret, in alphabetical order
    function lowerWords() {
        const guessed = game.attempts.filter(a => a.outcome === 'LOWER').map(a => a.word);
        return [game.baseLower, ...guessed].sort(ITALIAN.compare);
    }

    // Words known to come after the secret, in alphabetical order
    function upperWords() {
        const guessed = game.attempts.filter(a => a.outcome === 'UPPER').map(a => a.word);
        return [...guessed, game.baseUpper].sort(ITALIAN.compare);
    }

    // --- Closeness hint: row colors from far (red) to close (green) ---

    // Largest distance between two letters of the alphabet (a..z)
    const LETTER_SPAN = 25;

    // A word's first two letters as alphabet positions (a = 0 .. z = 25).
    // Accents are stripped and non-letters dropped; a one-letter word counts as "<letter>a".
    function prefixLetters(word) {
        const letters = word.toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z]/g, '');
        return {
            first:  letters.length > 0 ? letters.charCodeAt(0) - 97 : 0,
            second: letters.length > 1 ? letters.charCodeAt(1) - 97 : 0
        };
    }

    // Closeness of two letters that differ (distance 1..25), from 1 (next to each other) to 0
    // (a vs z). Logarithmic: the first steps away count the most.
    function letterCloseness(distance) {
        return 1 - Math.log1p(distance - 1) / Math.log1p(LETTER_SPAN - 1);
    }

    // How close a word is to the secret, judged only by the first two letters:
    // 0 = far away, 1 = close (same two letters). The value falls in the band of its level
    // (see CLOSENESS_CLOSE / CLOSENESS_NEAR), and shades inside it so rows of one level still differ:
    //   same two letters      -> 1                            ("close")
    //   same first letter     -> by the second letters' gap   ("near")
    //   different first letter -> by the first letters' gap   ("far")
    function closeness(word) {
        const guess  = prefixLetters(word);
        const secret = prefixLetters(game.secret.word);
        let result;
        if (guess.first !== secret.first) {
            result = CLOSENESS_FAR_TOP * letterCloseness(Math.abs(guess.first - secret.first));
        } else if (guess.second !== secret.second) {
            result = CLOSENESS_NEAR
                + (CLOSENESS_NEAR_TOP - CLOSENESS_NEAR) * letterCloseness(Math.abs(guess.second - secret.second));
        } else {
            result = 1;
        }
        return result;
    }

    // --- Closeness badge: the "fuori strada / in pista / a un passo" shout over the row just guessed ---

    // Closeness (0..1) from which a guess is called "close" or "near"; below, "far".
    // CLOSE: same first two letters as the secret.
    // NEAR:  same first letter only.
    // FAR:   different first letter.
    // The *_TOP values keep each band clear of the next one's threshold.
    // The row colors change band at these same points (--closeness-scale in the CSS): keep them in sync.
    const CLOSENESS_CLOSE    = 0.85;
    const CLOSENESS_NEAR     = 0.45;
    const CLOSENESS_NEAR_TOP = 0.84;
    const CLOSENESS_FAR_TOP  = 0.44;
    // How long the badge stays before leaving, and how long its exit animation lasts (ms)
    const BADGE_DURATION = 1500;
    const BADGE_EXIT     = 350;
    // The winning shout stays longer: it is the end of the game, nothing follows it
    const WIN_BADGE_DURATION = 3000;

    // Text shouted for each level, the same in every color theme (only its look changes);
    // the keys double as CSS classes of the badge. "won" is not a closeness level: it is the
    // celebration played when the secret is found.
    const CLOSENESS_BADGE_TEXT = { far: 'fuori strada', near: 'in pista', close: 'a un passo', won: 'trovata' };

    // Level of a guess, from the same closeness value that colors its row: the two never disagree
    function closenessLevel(word) {
        const h = closeness(word);
        if (h >= CLOSENESS_CLOSE) return 'close';
        if (h >= CLOSENESS_NEAR)  return 'near';
        return 'far';
    }

    // Build the animated badge for a level. It plays once, then removes itself from the page
    // after "duration" milliseconds.
    function createClosenessBadge(level, duration = BADGE_DURATION) {
        const text  = CLOSENESS_BADGE_TEXT[level];
        const badge = document.createElement('span');
        badge.className = 'closeness-badge ' + level;
        // Announced once as a whole word; the single letters below are decoration
        badge.setAttribute('role', 'status');
        badge.setAttribute('aria-label', text);
        // One span per letter, so each can slam in after the previous one (--i = its position)
        [...text].forEach(function (letter, i) {
            const span = document.createElement('span');
            span.className   = 'closeness-letter';
            span.textContent = letter;
            span.setAttribute('aria-hidden', 'true');
            span.style.setProperty('--i', i);
            badge.appendChild(span);
        });
        setTimeout(function () { badge.classList.add('leaving'); }, duration);
        setTimeout(function () { badge.remove(); }, duration + BADGE_EXIT);
        return badge;
    }

    // --- Game code (export / import) ---

    // Serialize the game as one Base64 blob: the two closest bounds and the attempts countdown.
    // The secret is NOT in it: decoding the code must not reveal the word. The importer draws
    // a new secret between the two bounds instead (see parseGameCode).
    // Short keys keep the code compact: l=lower, u=upper, g=game difficulty, r=attempts left,
    // c=rules (custom games only, keys from RULE_CODE_KEYS).
    function buildGameCode() {
        const lowers = lowerWords();
        const uppers = upperWords();
        const payload = {
            v: CODE_VERSION,
            l: lowers[lowers.length - 1], // tightest lower bound
            u: uppers[0],                 // tightest upper bound
            g: game.difficulty,
            r: attemptsLeft()
        };
        if (game.difficulty === CUSTOM) {
            payload.c = {};
            RULE_KEYS.forEach(function (key) { payload.c[RULE_CODE_KEYS[key]] = game.rules[key]; });
        }
        return encodeBase64(JSON.stringify(payload));
    }

    // Rules read back from the "c" field of a game code; null when the field is not a
    // well-formed rules object (missing, extra or out-of-range keys)
    function rulesFromCode(coded) {
        let result = null;
        if (coded !== null && typeof coded === 'object' && !Array.isArray(coded)
                && Object.keys(coded).length === RULE_KEYS.length) {
            const rules = {};
            RULE_KEYS.forEach(function (key) {
                if (hasOwn(coded, RULE_CODE_KEYS[key])) rules[key] = coded[RULE_CODE_KEYS[key]];
            });
            if (isValidRules(rules)) result = rules;
        }
        return result;
    }

    // Turn a game code back into a game, with a fresh secret drawn between its two bounds.
    // Throws if the code is malformed or inconsistent, since it may come from a hand-edited file,
    // or if no dictionary word sits between the bounds.
    // Older codes (versions 3 and 4) are still accepted for the preset levels: the secret a
    // version 3 code carries is simply ignored.
    function parseGameCode(code) {
        let payload;
        try {
            payload = JSON.parse(decodeBase64(code.trim()));
        } catch (_) {
            throw new Error('Codice partita non valido.');
        }
        const isText   = function (v) { return typeof v === 'string' && v.trim() !== ''; };
        const isObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload);
        const custom   = isObject && payload.v === CODE_VERSION && payload.g === CUSTOM;
        // A custom game must carry valid rules; a preset game must carry none
        const rules    = custom ? rulesFromCode(payload.c) : null;
        const valid = isObject
            && [3, 4, CODE_VERSION].includes(payload.v)
            && isText(payload.l) && isText(payload.u)
            && (custom
                ? rules !== null
                : typeof payload.g === 'string' && hasOwn(DIFFICULTY, payload.g) && !hasOwn(payload, 'c'))
            // a resumable game has at least one attempt left
            && Number.isInteger(payload.r) && payload.r >= 1
            // a custom game cannot have more attempts left than it started with
            && (!custom || payload.r <= rules.attempts)
            // the bounds must leave room for a word between them
            && ITALIAN.compare(payload.l, payload.u) < 0;
        if (!valid) {
            throw new Error('Codice partita non valido.');
        }
        const gameRules = custom ? rules : DIFFICULTY[payload.g];
        // Never more than the level grants today: a code exported when it granted more is cut down to it
        const left = Math.min(payload.r, gameRules.attempts);
        const imported = {
            secret:       pickSecret(gameRules.words, payload.l, payload.u),
            baseLower:    payload.l,
            baseUpper:    payload.u,
            difficulty:   payload.g,
            baseAttempts: gameRules.attempts - left,
            attempts:     [],
            status:       'IN_PROGRESS'
        };
        if (custom) imported.rules = rules;
        return imported;
    }

    // --- Saved game (survives a reload, or the phone closing the app in background) ---

    // Storage can be unavailable or full (private mode, blocked site data): the game then
    // simply plays without saving, so every access is guarded.
    function saveGame() {
        try {
            if (game) {
                localStorage.setItem(SAVE_KEY, JSON.stringify(game));
            } else {
                localStorage.removeItem(SAVE_KEY);
            }
        } catch (_) { /* play on without saving */ }
    }

    // Read back the saved game; null when there is none or it is not usable
    function loadSavedGame() {
        try {
            const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
            const usable = saved
                && saved.secret && typeof saved.secret.word === 'string'
                && typeof saved.baseLower === 'string' && typeof saved.baseUpper === 'string'
                && (saved.difficulty === CUSTOM
                    ? isValidRules(saved.rules)
                    : typeof saved.difficulty === 'string' && hasOwn(DIFFICULTY, saved.difficulty))
                && Number.isInteger(saved.baseAttempts)
                && Array.isArray(saved.attempts)
                && ['IN_PROGRESS', 'WON', 'SURRENDERED', 'LOST'].includes(saved.status);
            return usable ? saved : null;
        } catch (_) {
            return null;
        }
    }

    // Last custom rules, so the panel opens on them; the defaults when none (or unusable) are stored
    function loadCustomRules() {
        let result = CUSTOM_DEFAULT;
        try {
            const saved = JSON.parse(localStorage.getItem(CUSTOM_SAVE_KEY));
            if (isValidRules(saved)) result = saved;
        } catch (_) { /* keep the defaults */ }
        return result;
    }

    function saveCustomRules(rules) {
        try {
            localStorage.setItem(CUSTOM_SAVE_KEY, JSON.stringify(rules));
        } catch (_) { /* the panel will just open on the defaults */ }
    }

    // --- Screen helpers ---

    // Show start screen and drop the current game
    function showStartScreen() {
        game = null;
        saveGame();
        document.body.classList.remove('playing', 'ended');
        $startScreen.hidden    = false;
        $board.hidden          = true;
        $historySection.hidden = true;
        $importCode.value      = '';
        clearBanner();
    }

    // Show game screen (board + history) and hide start screen
    function showGameScreen() {
        $startScreen.hidden    = true;
        $board.hidden          = false;
        $historySection.hidden = false;
        // On a phone the game screen becomes one fixed screen (style.css, "Phone game screen")
        document.body.classList.add('playing');
    }

    // --- Outcome / history helpers ---

    // Map outcome to the italian label shown in history
    // LOWER => guess is before the secret => player must move forward (avanti)
    // UPPER => guess is after  the secret => player must move backward (indietro)
    function outcomeLabel(outcome) {
        switch (outcome) {
            case 'LOWER': return 'avanti';
            case 'UPPER': return 'indietro';
            case 'WON':   return 'vinto!';
            default:      return outcome;
        }
    }

    // --- Banner helpers ---

    // Show a message in the bottom banner (error or info)
    function showBanner(text, isError) {
        $banner.hidden = false;
        $banner.textContent = text;
        $banner.classList.toggle('error', !!isError);
    }

    // Hide bottom banner
    function clearBanner() {
        $banner.hidden = true;
        $banner.textContent = '';
        $banner.classList.remove('error');
    }

    // --- Board rendering ---

    // Render attempts history list (this session only: imported attempts are just a count)
    // The same list goes in the phone game menu, where the fixed screen keeps the history
    function renderHistory() {
        for (const list of [$history, $menuHistory]) {
            list.innerHTML = '';
            for (const a of game.attempts) {
                const li = document.createElement('li');
                li.textContent = `${a.word} (${outcomeLabel(a.outcome)})`;
                list.appendChild(li);
            }
        }
    }

    // Attempts counter of the phone game screen's top bar: "13 / 20 tentativi" while playing,
    // the attempts spent once the game is over
    function renderAttemptsCount() {
        const left  = attemptsLeft();
        const count = attemptCount();
        const big   = document.createElement('b');
        let rest;
        if (game.status === 'IN_PROGRESS') {
            big.textContent = String(left);
            rest = ` / ${rulesOf(game).attempts} ${left === 1 ? 'tentativo' : 'tentativi'}`;
        } else {
            big.textContent = String(count);
            rest = count === 1 ? ' tentativo' : ' tentativi';
        }
        $attemptsCount.replaceChildren(big, rest);
        $attemptsCount.classList.toggle('low', game.status === 'IN_PROGRESS' && left <= LOW_ATTEMPTS);
    }

    // --- Phone game screen: far rows collapse to fit ---

    // Sides whose collapsed rows the player opened by tapping their counter, until the next guess
    const openedSides = { lower: false, upper: false };

    // Counter standing for the far rows of one side: "+ 4 parole prima  balena ... gatto".
    // Tapping it opens them again (the board scrolls from then on).
    function moreWordsButton(side, rows) {
        const button = document.createElement('button');
        button.type      = 'button';
        button.className = 'more-words';
        // A fresh row is wrapped with its badge (.bound-wrap): read the row only, not the badge's letters
        const words = rows.map(function (r) { return (r.querySelector('.word-input') || r).textContent; });
        const label = document.createElement('span');
        label.textContent = `+ ${rows.length} ${rows.length === 1 ? 'parola' : 'parole'} ${side === 'lower' ? 'prima' : 'dopo'}`;
        const range = document.createElement('span');
        range.className   = 'more-words-range';
        range.textContent = words.length === 1 ? words[0] : `${words[0]} … ${words[words.length - 1]}`;
        button.append(label, range);
        button.addEventListener('click', function () {
            openedSides[side] = true;
            fitBoard();
        });
        return button;
    }

    // Fit the board into the phone game screen without scrolling: keep the rows closest to the guess
    // (or to the revealed word) and fold the farther ones of each side into a counter, one row at a time,
    // until the board fits. At least the closest row of each side always stays: the two bounds are what
    // the player plays against. Wide screens scroll the page instead: every row stays.
    function fitBoard() {
        $boardStack.querySelectorAll('.more-words').forEach(function (b) { b.remove(); });
        const items  = Array.from($boardStack.children);
        items.forEach(function (el) { el.hidden = false; });
        if (!PHONE.matches || !game) return;

        const center = items.findIndex(function (el) {
            return el === $guess || el.classList.contains('dict-entry');
        });
        // The guess just played (wrapped with its badge, .bound-wrap) never folds, even when it lands
        // outside the bounds: the player must see where it went and its badge
        const isRow = function (el) {
            return !el.classList.contains('dict-edge') && !el.classList.contains('bound-wrap');
        };
        // Rows ordered from the farthest to the closest one, on each side
        const sides = {
            lower: items.slice(0, center).filter(isRow),
            upper: items.slice(center + 1).filter(isRow).reverse()
        };
        const folded   = { lower: 0, upper: 0 };
        const counters = { lower: [], upper: [] };
        const overflows = function () { return $boardStack.scrollHeight > $boardStack.clientHeight + 1; };

        while (overflows()) {
            // Fold on the side keeping more rows, so the guess stays near the middle
            const canFold = function (side) {
                return !openedSides[side] && sides[side].length - folded[side] > 1;
            };
            const keptLower = sides.lower.length - folded.lower;
            const keptUpper = sides.upper.length - folded.upper;
            let side = keptLower >= keptUpper ? 'lower' : 'upper';
            if (!canFold(side)) side = side === 'lower' ? 'upper' : 'lower';
            if (!canFold(side)) break;

            folded[side]++;
            const hidden = sides[side].slice(0, folded[side]);
            hidden.forEach(function (el) { el.hidden = true; });
            counters[side].forEach(function (c) { c.remove(); });
            // One counter per run of folded rows, in their place: two runs when the guess just played
            // stays visible between them. Runs read in alphabetical (board) order, whatever the side.
            const runs = [];
            let run = null;
            items.forEach(function (el) {
                if (hidden.includes(el)) {
                    if (!run) runs.push(run = []);
                    run.push(el);
                } else {
                    run = null;
                }
            });
            counters[side] = runs.map(function (rows) {
                const counter = moreWordsButton(side, rows);
                rows[0].before(counter);
                return counter;
            });
        }

        // Still too tall (rows opened by hand, a long definition): show the guess or the revealed word
        if (overflows() && items[center]) {
            items[center].scrollIntoView({ block: 'center' });
        }
    }

    // The visible height, keyboard excluded: the phone game screen sizes itself on it (--app-height),
    // also where the keyboard covers the page instead of shrinking it (iOS)
    function updateAppHeight() {
        const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`);
    }

    // Screen resized (keyboard opened or closed, phone turned): refit, once per frame
    let refitFrame = 0;
    function onViewportChange() {
        cancelAnimationFrame(refitFrame);
        refitFrame = requestAnimationFrame(function () {
            updateAppHeight();
            if (game) fitBoard();
        });
    }

    // Number of leading letters a word shares with the secret, position by position, stopping at the
    // first difference (CASA vs COSA -> 1, CASA vs CASCATA -> 3). Letters must match exactly
    // (case aside): an accented letter does not match its plain twin.
    function commonPrefixLength(word) {
        const a = Array.from(word.toLowerCase());
        const b = Array.from(game.secret.word.toLowerCase());
        let n = 0;
        while (n < a.length && n < b.length && a[n] === b[n]) n++;
        return n;
    }

    // Append one of the dictionary's ends (abaco / zuzzurellone) as a frame line, like the guide words
    // printed at the top and bottom of a dictionary page. Every board has them, imported games too:
    // they are not guesses, so no row and no hint (else "abaco" would light up for free whenever the
    // secret starts with "a").
    function appendDictEdge(word) {
        const edge  = document.createElement('div');
        edge.className = 'dict-edge';
        const label = document.createElement('span');
        label.className   = 'dict-edge-word';
        label.textContent = word;
        edge.appendChild(label);
        $boardStack.appendChild(edge);
    }

    // Append a readonly bound row (starting bound or past attempt) to the stack.
    // The row is colored on a scale, far (red) to close (green), by how close the word is to the
    // secret — unless the game's rules play without the colors: then every row looks the same.
    // With the bold hint on, the leading letters shared with the secret are set in bold, the rest dimmed.
    // The dictionary's ends are not rows at all: renderBoard draws them as the frame, see appendDictEdge.
    // An imported game's bounds are plain rows without the hint (drawn like a hard game's), so they plainly give none: each import
    // draws a new secret, and colored bounds would let the player re-import the same code until they
    // come up green.
    // isFresh = the row is the guess just made: with the colors on, it also gets the closeness badge.
    function appendBoundRow(word, isFresh) {
        if (word === DICT_FIRST || word === DICT_LAST) return;
        // A plain element rather than a readonly <input>: only part of its text has to be bold
        const row = document.createElement('div');
        row.className = 'word-input bound';
        const rules    = rulesOf(game);
        const imported = word === game.baseLower || word === game.baseUpper;
        const colored  = rules.colors && !imported;
        const bolded   = rules.bold && !imported;
        if (imported) {
            row.classList.add('imported');
        } else if (colored) {
            // CSS turns --closeness (0..1) into the actual color, see .word-input.bound
            row.style.setProperty('--closeness', closeness(word).toFixed(3));
        } else {
            // No --closeness: the distance cannot be read from the row's color
            row.classList.add('no-closeness');
        }
        if (bolded) {
            row.classList.add('bold-hint');
            const letters = Array.from(word);
            const shared  = commonPrefixLength(word);
            if (shared > 0) {
                const prefix = document.createElement('span');
                prefix.className   = 'common-prefix';
                prefix.textContent = letters.slice(0, shared).join('');
                row.appendChild(prefix);
            }
            // The rest is dimmed by CSS, so the shared letters read as "already found"
            const rest = document.createElement('span');
            rest.className   = 'word-rest';
            rest.textContent = letters.slice(shared).join('');
            row.appendChild(rest);
        } else {
            row.textContent = word;
        }
        if (isFresh && colored) {
            // Wrap the row so the badge can sit over it
            const wrap = document.createElement('div');
            wrap.className = 'bound-wrap';
            wrap.appendChild(row);
            wrap.appendChild(createClosenessBadge(closenessLevel(word)));
            $boardStack.appendChild(wrap);
        } else {
            $boardStack.appendChild(row);
        }
    }

    // Append the editable guess input to the stack and bind its Enter handler.
    // Its placeholder carries the attempts countdown: that is where the player is looking,
    // and it stays in view however long the board grows.
    function appendGuessRow() {
        const left  = attemptsLeft();
        const input = document.createElement('input');
        input.type         = 'text';
        input.id           = 'guess-input';
        // "low" turns the placeholder red when few attempts are left
        input.className    = 'word-input guess' + (left <= LOW_ATTEMPTS ? ' low' : '');
        input.autocomplete = 'off';
        input.spellcheck   = false;
        // Phone keyboards: no capital first letter, no autocorrection, "send" key submits the guess
        input.autocapitalize = 'none';
        input.setAttribute('autocorrect', 'off');
        input.enterKeyHint = 'send';
        // Countdown only, kept short: a longer text gets cut off on a phone screen.
        // Leading "...": keeps the text clear of the caret.
        input.placeholder  = left === 1
            ? '...ultimo tentativo'
            : `...${left} tentativi rimasti`;
        input.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                submitGuess();
            }
        });
        $boardStack.appendChild(input);
        $guess = input;
    }

    // Append the revealed secret, laid out like a dictionary entry (headword, grammatical
    // category below it, definition). It takes the guess row's place, so the player sees exactly
    // where the word sits between the words tried.
    // isFresh = the game ended just now: a win is then celebrated with the "trovata" badge.
    function appendRevealEntry(isFresh) {
        const won   = game.status === 'WON';
        const count = attemptCount();

        const entry = document.createElement('article');
        entry.className = 'dict-entry' + (won ? ' won' : '');
        if (won && isFresh) {
            entry.appendChild(createClosenessBadge('won', WIN_BADGE_DURATION));
        }

        let outcomeText;
        if (won) {
            outcomeText = `Hai indovinato in ${count} ${count === 1 ? 'tentativo' : 'tentativi'}!`;
        } else if (game.status === 'LOST') {
            outcomeText = 'Tentativi esauriti. La parola era:';
        } else {
            outcomeText = 'Ti sei arreso. La parola era:';
        }
        const status = document.createElement('p');
        status.className   = 'dict-status';
        status.textContent = outcomeText;
        entry.appendChild(status);

        const head = document.createElement('p');
        head.className = 'dict-head';
        const word = document.createElement('dfn');
        word.className   = 'dict-word';
        word.textContent = game.secret.word;
        head.appendChild(word);
        entry.appendChild(head);

        // Category and definition may be missing in the dictionary: skip the empty parts.
        // The category goes on its own line, right below the headword.
        if (game.secret.category) {
            const category = document.createElement('p');
            category.className   = 'dict-category';
            category.textContent = game.secret.category;
            entry.appendChild(category);
        }

        if (game.secret.definition) {
            const definition = document.createElement('p');
            definition.className   = 'dict-definition';
            definition.textContent = game.secret.definition;
            entry.appendChild(definition);
        }

        $boardStack.appendChild(entry);
        $guess = null;
    }

    // Rebuild the board: frame top + lower bounds + (editable guess | revealed secret) + upper bounds + frame bottom.
    // freshWord = the guess just made, if any: its row plays the closeness badge.
    function renderBoard(freshWord) {
        $boardStack.innerHTML = '';
        appendDictEdge(DICT_FIRST);
        for (const w of lowerWords()) appendBoundRow(w, w === freshWord);

        if (game.status === 'IN_PROGRESS') {
            appendGuessRow();
        } else {
            appendRevealEntry(freshWord !== undefined);
        }

        for (const w of upperWords()) appendBoundRow(w, w === freshWord);
        appendDictEdge(DICT_LAST);
    }

    // Redraw board, history, buttons and banner from the current game.
    // freshWord is passed only right after a guess, so the closeness badge never replays on a
    // reload, an import or a surrender.
    function render(freshWord) {
        // Every change of the game goes through here: keep the saved copy in step
        saveGame();
        renderBoard(freshWord);
        renderHistory();
        renderAttemptsCount();
        showGameScreen();

        // A finished game cannot be played, surrendered or exported
        const ended = game.status !== 'IN_PROGRESS';
        document.body.classList.toggle('ended', ended);
        $menuExport.disabled   = ended;
        // A new board: the rows opened by hand fold again, then the board fits the phone screen
        openedSides.lower = false;
        openedSides.upper = false;
        updateAppHeight();
        fitBoard();
        $submit.disabled       = ended;
        $surrender.disabled    = ended;
        $copyCode.disabled     = ended;

        clearBanner();
        if (!ended) {
            // preventScroll: the browser's own jump-to-focus would fight the centering below
            $guess.focus({ preventScroll: true });
            if (freshWord) {
                // After a guess the board has grown: bring the next guess row back to the
                // vertical center of the screen, between the words tried so far
                $guess.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
        } else if (freshWord) {
            // The last guess ended the game: center the revealed word, so the player sees it
            // (and the winning celebration) however long the board has grown
            $boardStack.querySelector('.dict-entry').scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }

    // --- Game actions ---

    // Start a new game with the selected difficulty (or the custom panel's rules)
    function newGame() {
        clearBanner();
        try {
            const difficulty = $difficulty.value;
            const custom     = difficulty === CUSTOM;
            const rules      = custom ? readCustomRules() : DIFFICULTY[difficulty];
            if (!rules) {
                throw new Error('regole della partita non valide.');
            }
            game = {
                secret:       pickSecret(rules.words),
                baseLower:    DICT_FIRST,
                baseUpper:    DICT_LAST,
                difficulty:   difficulty,
                baseAttempts: 0,
                attempts:     [],
                status:       'IN_PROGRESS'
            };
            if (custom) {
                game.rules = rules;
                saveCustomRules(rules);
            }
            render();
        } catch (e) {
            showBanner(`Errore avvio partita: ${e.message}`, true);
        }
    }

    // Evaluate a guess against the secret, entirely client-side
    function submitGuess() {
        if (!game || game.status !== 'IN_PROGRESS') return;
        const word = ($guess.value || '').trim().toLowerCase();
        if (!word) return;

        const cmp = ITALIAN.compare(word, game.secret.word);
        let outcome;
        if (cmp === 0) {
            outcome = 'WON';
            game.status = 'WON';
        } else if (cmp < 0) {
            outcome = 'LOWER';
        } else {
            outcome = 'UPPER';
        }
        game.attempts.push({ word: word, outcome: outcome });
        // Countdown reached zero without the right word: the game is lost
        if (game.status === 'IN_PROGRESS' && attemptsLeft() === 0) {
            game.status = 'LOST';
        }
        render(word);
    }

    // Ask a question in the confirmation popup, the themed stand-in for window.confirm().
    // extraLabel, if given, adds a third choice between cancel and confirm.
    // Resolves to 'ok' (confirm), 'extra' (the third choice) or '' (cancel, Esc, a click on the backdrop).
    function askConfirm(title, text, okLabel, cancelLabel, extraLabel) {
        $confirmTitle.textContent  = title;
        $confirmText.textContent   = text;
        $confirmOk.textContent     = okLabel;
        $confirmCancel.textContent = cancelLabel;
        $confirmExtra.textContent  = extraLabel || '';
        $confirmExtra.hidden       = !extraLabel;
        // returnValue keeps the last answer across openings: clear it, so Esc does not reuse an old "ok"
        $confirmDialog.returnValue = '';
        $confirmDialog.showModal();
        return new Promise(function (resolve) {
            $confirmDialog.addEventListener('close', function () {
                const answer = $confirmDialog.returnValue;
                resolve(answer === 'ok' || answer === 'extra' ? answer : '');
            }, { once: true });
        });
    }

    // Surrender current game after user confirmation: reveals the secret
    async function surrender() {
        if (!game || game.status !== 'IN_PROGRESS') return;
        const answer = await askConfirm(
            'Ti arrendi?',
            'La parola segreta verrà svelata e la partita finisce qui.',
            'MI ARRENDO', 'CONTINUO');
        if (answer !== 'ok') return;
        game.status = 'SURRENDERED';
        render();
    }

    // Back to the start screen (back arrow, logo, "nuova partita"). Going back drops the saved game,
    // so one still being played is left only after user confirmation; a finished one goes right away.
    // The popup also offers to export first: the game code lands on the clipboard, ready to paste
    // in the start screen's field.
    async function leaveGame() {
        if (game && game.status === 'IN_PROGRESS') {
            const answer = await askConfirm(
                'Abbandoni la caccia?',
                'La parola segreta resterà un mistero.',
                'ABBANDONO', 'CONTINUO', 'ESPORTA ED ESCI');
            if (answer === '') return;
            if (answer === 'extra') {
                // Copy failed: stay in the game, where the banner shows the code to copy by hand
                if (!await copyGameCode()) return;
                showStartScreen();
                showBanner('Partita esportata: il codice è negli appunti, conservalo per riprenderla quando vuoi.', false);
                return;
            }
        }
        showStartScreen();
    }

    // --- Export ---

    // Copy text to the clipboard. The async API needs a secure context and can be
    // denied, so fall back to a hidden textarea + execCommand. Resolves to true/false.
    async function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (_) { /* fall through to the legacy path */ }
        }
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity  = '0';
        document.body.appendChild(area);
        area.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
        document.body.removeChild(area);
        return ok;
    }

    // How long the export button shows the green check after a successful copy (ms)
    const COPIED_DURATION = 1800;
    let copiedTimer = null;

    // Swap the export icon for the animated green check, then back. A second copy restarts it.
    function flashCopied() {
        clearTimeout(copiedTimer);
        $copyCode.classList.remove('copied');
        // Force a reflow, so removing and re-adding the class replays the animations
        void $copyCode.offsetWidth;
        $copyCode.classList.add('copied');
        copiedTimer = setTimeout(function () { $copyCode.classList.remove('copied'); }, COPIED_DURATION);
    }

    // Export the game code as text on the clipboard. Resolves to true when it got there.
    async function copyGameCode() {
        if (!game || game.status !== 'IN_PROGRESS') return false;
        const code = buildGameCode();
        const ok = await copyText(code);
        if (ok) {
            flashCopied();
            showBanner('Codice partita copiato negli appunti.', false);
        } else {
            // No silent failure: show the code so it can still be selected and copied by hand
            showBanner(`Copia non riuscita. Seleziona e copia a mano il codice: ${code}`, true);
        }
        return ok;
    }

    // --- Import ---

    // Start screen: resume a game from the code pasted in the card's field
    function importFromStartScreen() {
        const code = ($importCode.value || '').trim();
        if (!code) return;
        clearBanner();
        try {
            game = parseGameCode(code);
            render();
        } catch (e) {
            showBanner(e.message, true);
        }
    }

    // Game screen: open the import popup, empty and without a stale error
    function openImportDialog() {
        $importCodeGame.value = '';
        $importError.hidden   = true;
        // Importing over a game still being played throws it away: say so up front
        $importWarning.hidden = !(game && game.status === 'IN_PROGRESS');
        $importDialog.showModal();
        $importCodeGame.focus();
    }

    // Popup confirmed (button or Enter): replace the current game with the pasted one.
    // An invalid code keeps the popup open and the current game untouched.
    function importFromDialog(ev) {
        ev.preventDefault();
        const code = ($importCodeGame.value || '').trim();
        if (!code) return;
        try {
            game = parseGameCode(code);
            $importDialog.close();
            render();
        } catch (e) {
            $importError.textContent = e.message;
            $importError.hidden      = false;
        }
    }

    // --- Difficulty explanations (start screen note + hints popup) ---

    // Name a difficulty is shown with: the text of its option in the picker
    function difficultyName(difficulty) {
        const option = $difficulty.querySelector(`option[value="${difficulty}"]`);
        return option ? option.textContent : difficulty;
    }

    // Hints a set of rules turns on, as words for the notes: same names as the custom panel
    // and the hints popup
    function hintNames(rules) {
        const names = [];
        if (rules.colors)   names.push('i colori di vicinanza');
        if (rules.bold)     names.push('le lettere giuste');
        return names;
    }

    // One line describing a set of rules (attempts and hints)
    function rulesSummary(rules) {
        const names = hintNames(rules);
        let hints;
        if (names.length === 0) {
            hints = 'senza aiuti';
        } else if (names.length === 1) {
            hints = `con ${names[0]}`;
        } else {
            hints = `con ${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
        }
        return `${rules.attempts} tentativi, ${hints}.`;
    }

    // Custom panel -> rules; null if they do not pass the check (the panel cannot produce
    // invalid rules, but the game must never start from unchecked ones)
    function readCustomRules() {
        const rules = {
            words:    $customWords.value,
            attempts: customAttempts,
            colors:   $customColors.checked,
            bold:     $customBold.checked
        };
        return isValidRules(rules) ? rules : null;
    }

    // Sizer under the note: every note the custom panel can show (each hint on or off, the most
    // attempts), so the note keeps the height of the longest one and GIOCA stays put
    function fillNoteSizer() {
        [true, false].forEach(function (colors) {
            [true, false].forEach(function (bold) {
                if (bold && !colors) return; // not a valid combination, see isValidRules
                const text = document.createElement('span');
                text.textContent = rulesSummary({ attempts: CUSTOM_ATTEMPTS_MAX, colors: colors, bold: bold });
                $noteSizer.appendChild(text);
            });
        });
    }

    // Rules -> custom panel
    function fillCustomPanel(rules) {
        $customWords.value      = rules.words;
        customAttempts          = rules.attempts;
        $customColors.checked   = rules.colors;
        $customBold.checked     = rules.bold;
    }

    // Move the custom attempts by a step button, never past the limits
    function stepCustomAttempts(ev) {
        const button = ev.target.closest('.step-btn');
        if (!button) return;
        const step = Number(button.dataset.step);
        customAttempts = Math.min(CUSTOM_ATTEMPTS_MAX, Math.max(CUSTOM_ATTEMPTS_MIN, customAttempts + step));
        updateDifficultyNote();
    }

    // One line under the picker: what the chosen difficulty (or the custom panel) gives.
    // The custom panel shows only while "su misura" is chosen.
    function updateDifficultyNote() {
        // Without the colors the right letters cannot be on: switch them off and lock them
        if (!$customColors.checked) $customBold.checked = false;
        $customBold.disabled = !$customColors.checked;
        $customBold.closest('.toggle-field').classList.toggle('locked', $customBold.disabled);
        const custom = $difficulty.value === CUSTOM;
        const rules  = custom ? readCustomRules() : DIFFICULTY[$difficulty.value];
        $customRules.hidden = !custom;
        // The preset notes never change under the player's hand: no room to keep for them
        $noteSizer.hidden   = !custom;
        $customAttempts.textContent = String(customAttempts);
        // A limit reached turns off the buttons that would push past it
        $attemptsStepper.querySelectorAll('.step-btn').forEach(function (button) {
            const step = Number(button.dataset.step);
            button.disabled = step < 0 ? customAttempts <= CUSTOM_ATTEMPTS_MIN : customAttempts >= CUSTOM_ATTEMPTS_MAX;
        });
        $difficultyNote.textContent = rules ? rulesSummary(rules) : '';
    }

    // Difficulty table of the hints popup, built from DIFFICULTY so it never drifts from the rules
    function fillHintsTable() {
        Object.keys(DIFFICULTY).forEach(function (difficulty) {
            const rules = DIFFICULTY[difficulty];
            const names = hintNames(rules);
            const row   = document.createElement('tr');
            [difficultyName(difficulty), String(rules.attempts), names.length > 0 ? 'sì' : 'no'].forEach(function (text) {
                const cell = document.createElement('td');
                cell.textContent = text;
                row.appendChild(cell);
            });
            if (names.length === 0) row.className = 'no-hint';
            $hintsRows.appendChild(row);
        });
        // The custom level: the player picks both
        const custom = document.createElement('tr');
        [difficultyName(CUSTOM), `${CUSTOM_ATTEMPTS_MIN}-${CUSTOM_ATTEMPTS_MAX}`, 'a scelta'].forEach(function (text) {
            const cell = document.createElement('td');
            cell.textContent = text;
            custom.appendChild(cell);
        });
        $hintsRows.appendChild(custom);
    }

    // --- Event bindings ---
    $newGame.addEventListener('click', newGame);
    $submit.addEventListener('click', submitGuess);
    $surrender.addEventListener('click', surrender);
    $restart.addEventListener('click', leaveGame);
    $backHome.addEventListener('click', leaveGame);
    // The logo does the same as the back arrow, without reloading the page
    $logoLink.addEventListener('click', function (ev) {
        ev.preventDefault();
        leaveGame();
    });
    $copyCode.addEventListener('click', copyGameCode);
    $importGame.addEventListener('click', importFromStartScreen);
    // Allow pressing Enter in the start-screen code field to import
    $importCode.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            importFromStartScreen();
        }
    });

    // Import popup: open, confirm (submit covers both the button and Enter), cancel
    $importOpen.addEventListener('click', openImportDialog);
    $importForm.addEventListener('submit', importFromDialog);
    $importCancel.addEventListener('click', function () { $importDialog.close(); });
    // A click on the dimmed backdrop lands on the <dialog> itself, not on its content: close
    $importDialog.addEventListener('click', function (ev) {
        if (ev.target === $importDialog) $importDialog.close();
    });

    // Confirmation popup: its buttons close it by themselves (form method="dialog"); the backdrop answers no
    $confirmDialog.addEventListener('click', function (ev) {
        if (ev.target === $confirmDialog) $confirmDialog.close();
    });

    // Hints popup: the "HO CAPITO" button closes it by itself (form method="dialog")
    $hintsOpen.addEventListener('click', function () {
        // Focus lands on the title (autofocus), so the popup opens at its top even on a short screen
        $hintsDialog.showModal();
    });
    $hintsDialog.addEventListener('click', function (ev) {
        if (ev.target === $hintsDialog) $hintsDialog.close();
    });
    // Phone game menu: each choice closes it first, then does what the hidden bar button did
    $menuOpen.addEventListener('click', function () { $menuDialog.showModal(); });
    $menuDialog.addEventListener('click', function (ev) {
        if (ev.target === $menuDialog) $menuDialog.close();
    });
    $menuImport.addEventListener('click', function () { $menuDialog.close(); openImportDialog(); });
    $menuExport.addEventListener('click', function () { $menuDialog.close(); copyGameCode(); });
    $menuHints.addEventListener('click', function () { $menuDialog.close(); $hintsDialog.showModal(); });

    // Phone game screen: the keyboard stays open while playing. Closing a popup gives the focus
    // back to the guess, and TENTA does not take the focus away from it (that would close the keyboard)
    [$menuDialog, $importDialog, $confirmDialog, $hintsDialog].forEach(function (dialog) {
        dialog.addEventListener('close', function () {
            if (PHONE.matches && $guess && !$guess.disabled && !document.querySelector('dialog[open]')) {
                $guess.focus({ preventScroll: true });
            }
        });
    });
    $submit.addEventListener('pointerdown', function (ev) {
        if (PHONE.matches && $guess) ev.preventDefault();
    });
    // A message floating over the phone game screen closes with a tap
    $banner.addEventListener('click', function () {
        if (PHONE.matches && document.body.classList.contains('playing')) clearBanner();
    });
    // Keyboard opened or closed, phone turned, screen crossing the phone width: fit the board again
    window.addEventListener('resize', onViewportChange);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onViewportChange);
    PHONE.addEventListener('change', onViewportChange);
    // Row heights change once the theme's web font arrives
    if (document.fonts) document.fonts.ready.then(onViewportChange);

    $difficulty.addEventListener('change', updateDifficultyNote);
    // Every control of the custom panel updates the note as it changes
    $customRules.addEventListener('change', updateDifficultyNote);
    $attemptsStepper.addEventListener('click', stepCustomAttempts);
    fillCustomPanel(loadCustomRules());
    fillNoteSizer();
    fillHintsTable();
    updateDifficultyNote();

    // Theme picker: shows the theme applied by theme.js, and switches (and remembers) it
    $theme.value = window.AbacoTheme.current();
    $theme.addEventListener('change', function () {
        window.AbacoTheme.set($theme.value);
    });

    // --- Page load: resume the saved game if there is one, else show the start screen ---
    game = loadSavedGame();
    if (game) {
        // A game saved when its level granted more attempts may already be past today's limit
        if (game.status === 'IN_PROGRESS' && attemptsLeft() <= 0) {
            game.status = 'LOST';
        }
        render();
    } else {
        showStartScreen();
    }
}());
