// Theme switcher: picks which optional stylesheet layers on top of style.css.
// Loaded in <head>, right after the theme <link>s: it runs before the page is drawn,
// so a saved theme shows up at once, with no flash of the default one.
(function () {
    'use strict';

    // localStorage key holding the chosen theme
    const THEME_KEY = 'abaco.tema';
    const DEFAULT_THEME = 'classico';
    // Phone browser bar color per theme, matching each theme's page background.
    // Its keys are also the list of valid theme names.
    const THEME_COLOR = {
        classico: '#FDF8EB',
        hacker:   '#000000',
        retro:    '#008080',
        sketch:   '#F1EEE6'
    };

    // Old theme names still saved on some devices -> the theme that replaced them
    const RENAMED = { matrix: 'hacker' };

    // Saved theme, or the default one when none (or an unknown one) is stored.
    // Storage can be unavailable (private mode, blocked site data): every access is guarded.
    function readSaved() {
        try {
            const stored = localStorage.getItem(THEME_KEY);
            const saved = RENAMED[stored] || stored;
            return THEME_COLOR[saved] ? saved : DEFAULT_THEME;
        } catch (_) {
            return DEFAULT_THEME;
        }
    }

    // Turn on the stylesheets of one theme and off all the others.
    // Every theme stays loaded; media "not all" simply keeps a sheet from applying.
    function apply(name) {
        document.querySelectorAll('link[data-theme]').forEach(function (link) {
            link.media = link.dataset.theme === name ? 'all' : 'not all';
        });
        document.documentElement.dataset.theme = name;
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = THEME_COLOR[name];
    }

    // Public API, used by app.js (theme picker and themed badge words)
    window.AbacoTheme = {
        current: function () {
            return document.documentElement.dataset.theme || DEFAULT_THEME;
        },
        // Switch theme and remember it for the next visit
        set: function (name) {
            const theme = THEME_COLOR[name] ? name : DEFAULT_THEME;
            apply(theme);
            try {
                localStorage.setItem(THEME_KEY, theme);
            } catch (_) { /* the theme still applies, it just is not remembered */ }
        }
    };

    apply(readSaved());
}());
