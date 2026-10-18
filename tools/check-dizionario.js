// Abaco Zuzzurellone - dictionary validator.
// Run after ANY change to web/dizionario.js:   node tools/check-dizionario.js
// Exits with code 1 (and lists every problem) when a project constraint is broken.
'use strict';

const path = require('path');

// --- Project constraints ---

// Binding rule: within each difficulty level, no two-letter prefix may hold more than this
// share of the words. A crowded prefix makes the secret too hard to isolate.
const MAX_PREFIX_SHARE = 0.06;
const LEVELS     = ['facile', 'media', 'difficile'];
const CATEGORIES = ['sostantivo', 'aggettivo', 'verbo'];

// --- Load: dizionario.js assigns the array to window.ABACO_DIZIONARIO ---

global.window = {};
require(path.join(__dirname, '..', 'web', 'dizionario.js'));
const dictionary = global.window.ABACO_DIZIONARIO;

const errors = [];

// Accent-free lowercase form: what the "chiave" field must contain
function toKey(word) {
    return word.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

if (!Array.isArray(dictionary) || dictionary.length === 0) {
    errors.push('window.ABACO_DIZIONARIO is missing or empty');
} else {
    // --- Per-entry checks ---
    const seen = new Set();
    let previousKey = '';
    for (const entry of dictionary) {
        const name = entry.parola || JSON.stringify(entry);
        if (typeof entry.parola !== 'string' || !/^[a-z]+$/.test(toKey(entry.parola || ''))) {
            errors.push(`${name}: "parola" must be a single lowercase word`);
            continue;
        }
        if (entry.chiave !== toKey(entry.parola)) {
            errors.push(`${name}: "chiave" must be "${toKey(entry.parola)}"`);
        }
        if (seen.has(entry.chiave)) {
            errors.push(`${name}: duplicated "chiave"`);
        }
        seen.add(entry.chiave);
        // The game relies on nothing but the app's own sort, yet a sorted file keeps diffs readable
        if (entry.chiave < previousKey) {
            errors.push(`${name}: file not sorted by "chiave" (comes after "${previousKey}")`);
        }
        previousKey = entry.chiave;
        if (!CATEGORIES.includes(entry.categoria)) {
            errors.push(`${name}: unknown "categoria" ${JSON.stringify(entry.categoria)}`);
        }
        if (typeof entry.descrizione !== 'string' || entry.descrizione.trim() === '') {
            errors.push(`${name}: empty "descrizione"`);
        }
        const levels = entry.difficolta;
        if (!Array.isArray(levels) || levels.length === 0 || !levels.every(l => LEVELS.includes(l))) {
            errors.push(`${name}: "difficolta" must be a non-empty array of ${LEVELS.join(' | ')}`);
        }
    }

    // --- Per-level checks: size and prefix cap ---
    for (const level of LEVELS) {
        const words = dictionary.filter(e => Array.isArray(e.difficolta) && e.difficolta.includes(level));
        if (words.length === 0) {
            errors.push(`level "${level}" has no words`);
            continue;
        }
        const perPrefix = new Map();
        for (const entry of words) {
            const prefix = String(entry.chiave).slice(0, 2);
            perPrefix.set(prefix, (perPrefix.get(prefix) || 0) + 1);
        }
        const ranked = [...perPrefix.entries()].sort((a, b) => b[1] - a[1]);
        for (const [prefix, count] of ranked) {
            if (count / words.length > MAX_PREFIX_SHARE) {
                const allowed = Math.floor(words.length * MAX_PREFIX_SHARE);
                errors.push(`level "${level}": prefix "${prefix}" has ${count} of ${words.length} words `
                    + `(${(100 * count / words.length).toFixed(1)}%), max ${MAX_PREFIX_SHARE * 100}% = ${allowed}`);
            }
        }
        const [topPrefix, topCount] = ranked[0];
        console.log(`${level.padEnd(9)} ${String(words.length).padStart(5)} words, most crowded prefix `
            + `"${topPrefix}" ${(100 * topCount / words.length).toFixed(1)}%`);
    }
}

if (errors.length > 0) {
    console.error(`\nDictionary NOT valid: ${errors.length} problem(s)`);
    for (const message of errors) {
        console.error(' - ' + message);
    }
    process.exit(1);
}
console.log(`\nDictionary OK: ${dictionary.length} words`);
