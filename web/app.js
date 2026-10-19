// Abaco Zuzzurellone - vanilla SPA client
// The whole game runs here, with no server: the secret word is drawn from the
// dictionary shipped with the page (dizionario.js, loaded before this file).
(function () {
    'use strict';

    // Dictionary entries: { parola, chiave, categoria, descrizione, difficolta: [...] }
    const DICTIONARY = window.ABACO_DIZIONARIO || [];
    // Difficulty of the UI -> label used in the "difficolta" field of the dictionary
    const DIFFICULTY_LABEL = { EASY: 'facile', MEDIUM: 'media', HARD: 'difficile' };

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
    const $hintsOpen       = document.getElementById('hints-open');
    const $hintsDialog     = document.getElementById('hints-dialog');
    const $hintsRows       = document.getElementById('hints-difficulty-rows');
    // board and history sections (no id, select by class)
    const $board           = document.querySelector('.board');
    const $historySection  = document.querySelector('.history-section');

    // Dictionary edges: the outer bounds a brand-new game starts from
    const DICT_FIRST = 'abaco';
    const DICT_LAST  = 'zuzzurellone';

    // Rules per difficulty: attempts a game starts with (harder games get fewer) and
    // whether the closeness colors are shown (hard games play without them)
    const DIFFICULTY = {
        EASY:   { attempts: 25, closenessHint: true },
        MEDIUM: { attempts: 20, closenessHint: true },
        HARD:   { attempts: 15, closenessHint: false }
    };
    // From this many attempts left downwards, the countdown (in the guess placeholder) is highlighted
    const LOW_ATTEMPTS = 5;

    // localStorage key holding the game in progress
    const SAVE_KEY = 'abaco.partita';

    // Game code format version, bumped if the exported payload ever changes shape
    // (3: carries the difficulty, which sets both the attempts and the color hint;
    //  4: no longer carries the secret, the importer draws a new one between the bounds)
    const CODE_VERSION = 4;

    // Italian alphabetical order, ignoring case and accents: typing "citta" matches "città"
    // (same idea as the accent-free "chiave" field of the dictionary)
    const ITALIAN = new Intl.Collator('it', { sensitivity: 'base' });

    // Current game. Mirrored to localStorage on every change, so a reload resumes it.
    // {
    //   secret: {word, category, definition},
    //   baseLower, baseUpper: bounds the game started from (dictionary edges, or the imported ones)
    //   difficulty:           'EASY' | 'MEDIUM' | 'HARD', key of DIFFICULTY (attempts, color hint)
    //   baseAttempts:         attempts already spent before this session (0, or the imported count)
    //   attempts: [{word, outcome}]  guesses made in this session
    //   status:   'IN_PROGRESS' | 'WON' | 'SURRENDERED' | 'LOST' (attempts ran out)
    // }
    // outcome: 'LOWER' | 'UPPER' | 'WON'
    let game = null;
    // Reference to the editable guess input (recreated on each render)
    let $guess = null;

    // --- Base64 helpers (UTF-8 safe: plain atob()/btoa() would mangle accented letters) ---

    function decodeBase64(encoded) {
        const bytes = Uint8Array.from(atob(encoded), function (c) { return c.charCodeAt(0); });
        return new TextDecoder().decode(bytes);
    }

    function encodeBase64(text) {
        const bytes = new TextEncoder().encode(text);
        return btoa(String.fromCharCode.apply(null, bytes));
    }

    // Draw a random secret word among those of the chosen difficulty.
    // With bounds (import), only words strictly between lower and upper count.
    // Throws when the dictionary is missing or no word of that level fits: an imported code
    // can then not be resumed (dictionary changed since the export, or code edited by hand).
    function pickSecret(difficulty, lower, upper) {
        const label      = DIFFICULTY_LABEL[difficulty];
        const bounded    = lower !== undefined;
        const candidates = DICTIONARY.filter(function (entry) {
            return entry.difficolta.includes(label)
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
        return DIFFICULTY[game.difficulty].attempts - attemptCount();
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
    // Short keys keep the code compact: l=lower, u=upper, g=game difficulty, r=attempts left.
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
        return encodeBase64(JSON.stringify(payload));
    }

    // Turn a game code back into a game, with a fresh secret drawn between its two bounds.
    // Throws if the code is malformed or inconsistent, since it may come from a hand-edited file,
    // or if no dictionary word sits between the bounds.
    // Older codes (version 3) are still accepted: the secret they carry is simply ignored.
    function parseGameCode(code) {
        let payload;
        try {
            payload = JSON.parse(decodeBase64(code.trim()));
        } catch (_) {
            throw new Error('Codice partita non valido.');
        }
        const isText = function (v) { return typeof v === 'string' && v.trim() !== ''; };
        const valid = payload
            && (payload.v === CODE_VERSION || payload.v === 3)
            && isText(payload.l) && isText(payload.u)
            && Object.prototype.hasOwnProperty.call(DIFFICULTY, payload.g)
            // a resumable game has at least one attempt left, and never more than its level grants
            && Number.isInteger(payload.r)
            && payload.r >= 1 && payload.r <= DIFFICULTY[payload.g].attempts
            // the bounds must leave room for a word between them
            && ITALIAN.compare(payload.l, payload.u) < 0;
        if (!valid) {
            throw new Error('Codice partita non valido.');
        }
        return {
            secret:       pickSecret(payload.g, payload.l, payload.u),
            baseLower:    payload.l,
            baseUpper:    payload.u,
            difficulty:   payload.g,
            baseAttempts: DIFFICULTY[payload.g].attempts - payload.r,
            attempts:     [],
            status:       'IN_PROGRESS'
        };
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
                && DIFFICULTY[saved.difficulty] !== undefined
                && Number.isInteger(saved.baseAttempts)
                && Array.isArray(saved.attempts)
                && ['IN_PROGRESS', 'WON', 'SURRENDERED', 'LOST'].includes(saved.status);
            return usable ? saved : null;
        } catch (_) {
            return null;
        }
    }

    // --- Screen helpers ---

    // Show start screen and drop the current game
    function showStartScreen() {
        game = null;
        saveGame();
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
    function renderHistory() {
        $history.innerHTML = '';
        for (const a of game.attempts) {
            const li = document.createElement('li');
            li.textContent = `${a.word} (${outcomeLabel(a.outcome)})`;
            $history.appendChild(li);
        }
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

    // Append a readonly bound row (starting bound or past attempt) to the stack.
    // The row is colored on a scale, far (red) to close (green), by how close the word is to the
    // secret — unless the game's difficulty plays without that hint: then every row looks the same.
    // With the hint on, the leading letters shared with the secret are also set in bold, the rest dimmed.
    // isFresh = the row is the guess just made: with the hint on, it also gets the closeness badge.
    function appendBoundRow(word, isFresh) {
        // A plain element rather than a readonly <input>: only part of its text has to be bold
        const row = document.createElement('div');
        row.className = 'word-input bound';
        if (DIFFICULTY[game.difficulty].closenessHint) {
            // CSS turns --closeness (0..1) into the actual color, see .word-input.bound
            row.style.setProperty('--closeness', closeness(word).toFixed(3));
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
            // Neither --closeness nor the bold prefix: the distance cannot be read from the page either
            row.classList.add('no-closeness');
            row.textContent = word;
        }
        if (isFresh && DIFFICULTY[game.difficulty].closenessHint) {
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
        // Leading "...": keeps the text clear of the caret (a wide block in the Matrix theme).
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

    // Rebuild the board: lower bounds + (editable guess | revealed secret) + upper bounds.
    // freshWord = the guess just made, if any: its row plays the closeness badge.
    function renderBoard(freshWord) {
        $boardStack.innerHTML = '';
        for (const w of lowerWords()) appendBoundRow(w, w === freshWord);

        if (game.status === 'IN_PROGRESS') {
            appendGuessRow();
        } else {
            appendRevealEntry(freshWord !== undefined);
        }

        for (const w of upperWords()) appendBoundRow(w, w === freshWord);
    }

    // Redraw board, history, buttons and banner from the current game.
    // freshWord is passed only right after a guess, so the closeness badge never replays on a
    // reload, an import or a surrender.
    function render(freshWord) {
        // Every change of the game goes through here: keep the saved copy in step
        saveGame();
        renderBoard(freshWord);
        renderHistory();
        showGameScreen();

        // A finished game cannot be played, surrendered or exported
        const ended = game.status !== 'IN_PROGRESS';
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

    // Start a new game with the selected difficulty
    function newGame() {
        clearBanner();
        try {
            const difficulty = $difficulty.value;
            const secret = pickSecret(difficulty);
            game = {
                secret:       secret,
                baseLower:    DICT_FIRST,
                baseUpper:    DICT_LAST,
                difficulty:   difficulty,
                baseAttempts: 0,
                attempts:     [],
                status:       'IN_PROGRESS'
            };
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

    // Surrender current game after user confirmation: reveals the secret
    function surrender() {
        if (!game || game.status !== 'IN_PROGRESS') return;
        if (!window.confirm('Sei sicuro di volerti arrendere?')) return;
        game.status = 'SURRENDERED';
        render();
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

    // Export the game code as text on the clipboard
    async function copyGameCode() {
        if (!game || game.status !== 'IN_PROGRESS') return;
        const code = buildGameCode();
        const ok = await copyText(code);
        if (ok) {
            showBanner('Codice partita copiato negli appunti.', false);
        } else {
            // No silent failure: show the code so it can still be selected and copied by hand
            showBanner(`Copia non riuscita. Seleziona e copia a mano il codice: ${code}`, true);
        }
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

    // One line under the picker: what the chosen difficulty gives, read from DIFFICULTY
    function updateDifficultyNote() {
        const rules = DIFFICULTY[$difficulty.value];
        $difficultyNote.textContent = rules.closenessHint
            ? `${rules.attempts} tentativi, con i colori che dicono quanto sei vicino.`
            : `${rules.attempts} tentativi, senza colori: solo prima o dopo.`;
        $difficultyNote.classList.toggle('no-hint', !rules.closenessHint);
    }

    // Difficulty table of the hints popup, built from DIFFICULTY so it never drifts from the rules
    function fillHintsTable() {
        Object.keys(DIFFICULTY).forEach(function (difficulty) {
            const rules = DIFFICULTY[difficulty];
            const row   = document.createElement('tr');
            [difficultyName(difficulty), String(rules.attempts), rules.closenessHint ? 'sì' : 'no'].forEach(function (text) {
                const cell = document.createElement('td');
                cell.textContent = text;
                row.appendChild(cell);
            });
            if (!rules.closenessHint) row.className = 'no-hint';
            $hintsRows.appendChild(row);
        });
    }

    // --- Event bindings ---
    $newGame.addEventListener('click', newGame);
    $submit.addEventListener('click', submitGuess);
    $surrender.addEventListener('click', surrender);
    $restart.addEventListener('click', showStartScreen);
    $backHome.addEventListener('click', showStartScreen);
    // The logo does the same as the back arrow, without reloading the page
    $logoLink.addEventListener('click', function (ev) {
        ev.preventDefault();
        showStartScreen();
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

    // Hints popup: the "HO CAPITO" button closes it by itself (form method="dialog")
    $hintsOpen.addEventListener('click', function () {
        $hintsDialog.showModal();
        // Focus lands on the close button at the bottom: on a short screen, start reading from the top
        $hintsDialog.scrollTop = 0;
    });
    $hintsDialog.addEventListener('click', function (ev) {
        if (ev.target === $hintsDialog) $hintsDialog.close();
    });
    $difficulty.addEventListener('change', updateDifficultyNote);
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
