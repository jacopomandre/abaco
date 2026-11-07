// Abaco Zuzzurellone - text contrast check (project requirement, see .claude/rules/contrast.md).
// Run on request only (the /contrasto skill):   npm run check:contrast
// Opens web/ in headless Chrome (the one installed on this PC, through playwright-core), builds every
// theme x difficulty x game state on a phone and on a desktop width, and measures each visible text
// against the pixels actually painted behind it (closeness gradients, highlighters, glows included).
// Report (not committed, folder contrast-report/): index.html with the failures grouped by element, each
// group with a screenshot of its worst case (the text circled in red), and lista.txt with every single
// failure. Exits with code 1 when a text is under the threshold.
'use strict';

const fs   = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

// --- Project constraints (WCAG 2.1 AA) ---

const MIN_TEXT  = 4.5;   // normal text
const MIN_LARGE = 3;     // large text: >= 24px, or >= 18.66px bold
// aria-hidden letters are pictures (the alphabet rail, the help menu's tile icons): the non-text
// threshold, and none at all inside a disabled control (its icon is meant to look switched off)
const MIN_GRAPHIC = 3;

// Pages measured at the same time
const WORKERS = 4;
const REPORT_DIR = path.join(__dirname, '..', 'contrast-report');

const THEMES = ['classico', 'quaderno', 'arcade', 'lavagna', 'notte'];
const VIEWPORTS = {
    telefono: { width: 375, height: 812 },
    desktop:  { width: 1200, height: 900 }
};
// Rules a game can be played by: the three levels and the custom combinations the levels miss
const RULES = {
    facile:                      { difficulty: 'EASY' },
    medio:                       { difficulty: 'MEDIUM' },
    difficile:                   { difficulty: 'HARD' },
    'su misura senza grassetto': { difficulty: 'CUSTOM', rules: { words: 'MEDIUM', attempts: 15, colors: true,  bold: false } },
    'su misura senza colori':    { difficulty: 'CUSTOM', rules: { words: 'MEDIUM', attempts: 15, colors: false, bold: false } }
};

// --- Game states, saved as the app saves them (app.js, "Current game") and resumed by a reload ---

// Secret "lampada": far rows (casa, mare), a close one (lago), a near one (lume), the METÀ help's word
// (lanterna); with "imported" the game resumes from a code, so its bounds show as imported rows
function savedGame(rules, help, status, imported) {
    const used = help === 'used';
    const game = {
        secret:       { word: 'lampada', category: 'sostantivo', definition: 'Apparecchio che fa luce.' },
        baseLower:    imported ? 'baco' : 'abaco',
        baseUpper:    imported ? 'zucca' : 'zuzzurellone',
        difficulty:   rules.difficulty,
        baseAttempts: imported ? 2 : 0,
        attempts: [
            { word: 'casa', outcome: 'LOWER' },
            { word: 'lago', outcome: 'LOWER' },
            { word: 'mare', outcome: 'UPPER' },
            { word: 'lume', outcome: 'UPPER' }
        ],
        help:   used ? ['LAST3', 'CATEGORY', 'HALF'] : [],
        status: status
    };
    if (used) game.attempts.push({ word: 'lanterna', outcome: 'UPPER', help: true });
    if (rules.rules) game.rules = rules.rules;
    return game;
}

// Every scenario: what is in storage before the page loads, and what to open after it
function scenarios(viewport) {
    const list = [
        { name: 'home', game: null },
        { name: 'come si gioca', game: null, open: 'hints', tall: true }
    ];
    for (const [rulesName, rules] of Object.entries(RULES)) {
        list.push({ name: `${rulesName}, aiuti da usare`, game: savedGame(rules, 'free', 'IN_PROGRESS'), open: 'help' });
        list.push({ name: `${rulesName}, aiuti usati, partita importata`, game: savedGame(rules, 'used', 'IN_PROGRESS', true), open: 'help' });
    }
    // End of game: the revealed word is drawn the same at every level, only the rows' colors change.
    // Played to its end after loading, as the app never resumes a game already over.
    for (const rulesName of ['medio', 'difficile']) {
        for (const status of ['WON', 'SURRENDERED', 'LOST']) {
            const game = savedGame(RULES[rulesName], 'used', 'IN_PROGRESS');
            // Loading a game with no attempts left is what makes it lost
            if (status === 'LOST') game.baseAttempts = 99;
            list.push({ name: `${rulesName}, fine partita ${status}`, game: game, finish: status });
        }
    }
    // The "..." menu exists on the phone game screen only
    if (viewport === 'telefono') {
        list.push({ name: 'menu ...', game: savedGame(RULES.medio, 'used', 'IN_PROGRESS'), open: 'menu', tall: true });
    }
    return list;
}

// --- Static server for web/ ---

const WEB = path.join(__dirname, '..', 'web');
const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json',
    '.webp': 'image/webp', '.jpg': 'image/jpeg', '.txt': 'text/plain', '.xml': 'application/xml'
};

function startServer() {
    const server = http.createServer(function (req, res) {
        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        const file = path.normalize(path.join(WEB, urlPath === '/' ? 'index.html' : urlPath));
        if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404);
            res.end();
            return;
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(function (resolve) {
        server.listen(0, '127.0.0.1', function () { resolve(server); });
    });
}

// --- In the page: what to measure, and how ---

// Still and plain while measuring: no transition or animation half way through
const STILL_CSS = '*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }';
// Every text made invisible, to photograph only what is painted behind it
const NO_TEXT_CSS = '* { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }'
    + ' *::placeholder { color: transparent !important; } *::before, *::after { color: transparent !important; }';

// Runs in the page: every visible text, with its box, color and the threshold it must meet
function collectTexts(limits) {
    const parse = function (c) {
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const opacityOf = function (el) {
        let o = 1;
        for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity);
        return o;
    };
    // Hit test with every element hittable (the rail and the tag let taps through)
    const hits = document.createElement('style');
    hits.textContent = '* { pointer-events: auto !important; }';
    document.head.appendChild(hits);
    const visibleAt = function (el, rect) {
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
        // The text's element (or something inside it) must be the topmost thing there: an ancestor
        // means the text is clipped away or covered (a scrolled box, a modal popup's backdrop)
        const hit = document.elementFromPoint(x, y);
        return !!hit && el.contains(hit);
    };
    const items = [];
    const add = function (el, rect, color, text) {
        const cs = getComputedStyle(el);
        const size = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight, 10) >= 700;
        const graphic = !!el.closest('[aria-hidden="true"]');
        if (graphic && el.closest(':disabled')) return;
        const min = graphic ? limits.graphic
            : (size >= 24 || (size >= 18.66 && bold)) ? limits.large : limits.text;
        const o = opacityOf(el);
        if (o < 0.01 || cs.visibility !== 'visible') return;
        items.push({
            text: text.trim().replace(/\s+/g, ' ').slice(0, 40),
            where: (el.id ? '#' + el.id : '') + '.' + (typeof el.className === 'string' ? el.className.trim().split(/\s+/).join('.') : ''),
            x: rect.left, y: rect.top, w: rect.width, h: rect.height,
            fg: color, opacity: o, min: min
        });
    };
    // Text nodes
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.nodeValue.trim()) continue;
        const el = node.parentElement;
        if (!el || el.closest('script, style, option, noscript')) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
            if (rect.width < 2 || rect.height < 2 || !visibleAt(el, rect)) continue;
            add(el, rect, parse(getComputedStyle(el).color), node.nodeValue);
        }
    }
    // Fields: the typed value or the placeholder, and the picked option of a select
    for (const el of document.querySelectorAll('input, select, textarea')) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2 || !visibleAt(el, rect)) continue;
        const cs = getComputedStyle(el);
        const inner = new DOMRect(rect.left + parseFloat(cs.paddingLeft), rect.top + parseFloat(cs.paddingTop),
            Math.min(rect.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), 160),
            rect.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
        if (el.tagName === 'SELECT') {
            add(el, inner, parse(cs.color), el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '');
        } else if (el.value) {
            add(el, inner, parse(cs.color), el.value);
        } else if (el.placeholder) {
            add(el, inner, parse(getComputedStyle(el, '::placeholder').color), el.placeholder);
        }
    }
    hits.remove();
    return items;
}

// Runs in the page: the contrast of each text against the photo of what lies behind it. The photo is
// sampled over the text's box; the 10th-percentile ratio stands for the worst part of the background
// (a gradient, a highlighter stroke), without letting a single stray pixel decide.
async function measureTexts(items, photo) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + photo;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const scale = img.width / innerWidth;
    const lum = function (c) {
        const f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    return items.map(function (item) {
        const ratios = [];
        const steps = 8;
        for (let i = 0; i < steps; i++) {
            for (let j = 0; j < 3; j++) {
                const x = Math.floor((item.x + item.w * (i + 0.5) / steps) * scale);
                const y = Math.floor((item.y + item.h * (j + 1) / 4) * scale);
                if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
                const d = ctx.getImageData(x, y, 1, 1).data;
                const bg = { r: d[0], g: d[1], b: d[2] };
                const a = item.fg.a * item.opacity;
                const fg = { r: item.fg.r * a + bg.r * (1 - a), g: item.fg.g * a + bg.g * (1 - a), b: item.fg.b * a + bg.b * (1 - a) };
                const l1 = lum(fg);
                const l2 = lum(bg);
                ratios.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
            }
        }
        ratios.sort(function (a, b) { return a - b; });
        const ratio = ratios.length ? ratios[Math.floor(ratios.length * 0.1)] : 21;
        return { text: item.text, where: item.where, ratio: Math.round(ratio * 100) / 100, min: item.min,
            x: item.x, y: item.y, w: item.w, h: item.h };
    });
}

// --- Run ---

async function setTheme(page, theme) {
    await page.evaluate(async function (name) {
        window.AbacoTheme.set(name);
        await document.fonts.ready;
        await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
    }, theme);
}

async function measure(page) {
    const items = await page.evaluate(collectTexts, { text: MIN_TEXT, large: MIN_LARGE, graphic: MIN_GRAPHIC });
    const hide = await page.addStyleTag({ content: NO_TEXT_CSS });
    const photo = (await page.screenshot()).toString('base64');
    await hide.evaluate(function (el) { el.remove(); });
    return page.evaluate(function (args) { return (0, eval)('(' + args.fn + ')')(args.items, args.photo); },
        { fn: measureTexts.toString(), items: items, photo: photo });
}

// The failure's surroundings, with the text circled in red, for the report
async function snapshot(page, failure, file) {
    const size = page.viewportSize();
    const pad = 70;
    const x = Math.max(0, Math.floor(failure.x - pad));
    const y = Math.max(0, Math.floor(failure.y - pad));
    const clip = {
        x: x, y: y,
        width:  Math.min(size.width - x, Math.ceil(failure.w + 2 * pad)),
        height: Math.min(size.height - y, Math.ceil(failure.h + 2 * pad))
    };
    await page.evaluate(function (f) {
        const ring = document.createElement('div');
        ring.id = 'contrast-ring';
        ring.style.cssText = `position:fixed;left:${f.x - 4}px;top:${f.y - 3}px;width:${f.w + 8}px;height:${f.h + 6}px;`
            + 'border:2px solid #e00000;border-radius:6px;z-index:2147483647;pointer-events:none';
        document.body.appendChild(ring);
    }, failure);
    await page.screenshot({ path: file, clip: clip });
    await page.evaluate(function () { document.getElementById('contrast-ring').remove(); });
}

// Failures grouped by element (the same element and threshold): one group per thing to fix
function groupKey(f) {
    return f.where + ' | ' + f.min;
}

// Bring a loaded game to its end, then leave the page as still as the other scenarios
async function finishGame(page, status, secret) {
    if (status === 'WON') {
        await page.fill('#guess-input', secret);
        await page.click('#submit-guess');
    } else if (status === 'SURRENDERED') {
        await page.click('#surrender');
        await page.click('#confirm-ok');
    }
    await page.waitForSelector('.dict-entry');
    await page.evaluate(function () {
        document.getAnimations().forEach(function (a) { a.finish(); });
        document.querySelectorAll('.closeness-badge').forEach(function (b) { b.remove(); });
        window.scrollTo({ top: 0, behavior: 'instant' });
    });
}

// One page: load the scenario, then measure it in every theme (and with the AIUTI menu closed / open).
// shots: the worst failure seen so far per group, with the screenshot taken of it
async function runScenario(browser, base, viewportName, size, scenario, shots) {
    const results = [];
    const page = await browser.newPage({
        viewport: { width: size.width, height: scenario.tall ? 2400 : size.height },
        deviceScaleFactor: 1
    });
    await page.addInitScript(function (args) {
        localStorage.clear();
        localStorage.setItem('abaco.alfabeto', 'aperto');
        if (args.game) localStorage.setItem('abaco.partita', JSON.stringify(args.game));
    }, { game: scenario.game });
    await page.goto(base);
    await page.addStyleTag({ content: STILL_CSS });
    await page.evaluate(function () { return document.fonts.ready; });
    if (scenario.finish) await finishGame(page, scenario.finish, scenario.game.secret.word);
    if (scenario.open === 'hints') {
        await page.evaluate(function () { document.getElementById('hints-dialog').showModal(); });
    } else if (scenario.open === 'menu') {
        await page.click('#menu-open');
    }
    for (const theme of THEMES) {
        await setTheme(page, theme);
        const states = scenario.open === 'help' ? ['menu AIUTI chiuso', 'menu AIUTI aperto'] : [''];
        for (const state of states) {
            await page.evaluate(function (open) {
                const menu = document.getElementById('help-menu');
                if (menu) menu.hidden = !open;
            }, state === 'menu AIUTI aperto');
            for (const r of await measure(page)) {
                Object.assign(r, { viewport: viewportName, theme: theme, scenario: scenario.name + (state ? ', ' + state : '') });
                results.push(r);
                if (r.ratio >= r.min) continue;
                const key = groupKey(r);
                if (!shots.has(key) || r.ratio < shots.get(key).failure.ratio) {
                    const file = `gruppo-${shots.has(key) ? shots.get(key).n : shots.size + 1}.png`;
                    shots.set(key, { n: shots.has(key) ? shots.get(key).n : shots.size + 1, file: file, failure: r });
                    await snapshot(page, r, path.join(REPORT_DIR, file));
                }
            }
        }
    }
    await page.close();
    return results;
}

function groupFailures(failures, shots) {
    const groups = new Map();
    for (const f of failures) {
        const key = groupKey(f);
        if (!groups.has(key)) {
            groups.set(key, { where: f.where, min: f.min, count: 0, worst: Infinity, best: 0, shot: shots.get(key),
                themes: new Set(), viewports: new Set(), scenarios: new Set(), texts: new Set() });
        }
        const g = groups.get(key);
        g.count++;
        g.worst = Math.min(g.worst, f.ratio);
        g.best = Math.max(g.best, f.ratio);
        g.themes.add(f.theme);
        g.viewports.add(f.viewport);
        g.scenarios.add(f.scenario.replace(/, menu AIUTI (chiuso|aperto)$/, ''));
        g.texts.add(f.text);
    }
    return [...groups.values()].sort(function (a, b) { return a.worst - b.worst; });
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}

function list(set, max) {
    const items = [...set];
    return items.slice(0, max).join(', ') + (items.length > max ? `, … (${items.length})` : '');
}

// index.html of the report: one card per group, worst first, with its screenshot
function writeHtml(groups, total, measured, seconds) {
    const cards = groups.map(function (g, i) {
        const w = g.shot.failure;
        return `<section class="card">
  <h2>${i + 1}. <code>${escapeHtml(g.where)}</code></h2>
  <p class="nums"><b>${g.worst}:1</b> nel caso peggiore (fino a ${g.best}:1), minimo ${g.min}:1 — ${g.count} casi</p>
  <img src="${g.shot.file}" alt="">
  <p class="worst">Caso nello screenshot: ${escapeHtml(w.viewport)}, ${escapeHtml(w.theme)}, ${escapeHtml(w.scenario)} — "${escapeHtml(w.text)}"</p>
  <dl>
    <dt>Testi</dt><dd>${escapeHtml(list(g.texts, 6))}</dd>
    <dt>Temi</dt><dd>${escapeHtml(list(g.themes, 5))}</dd>
    <dt>Larghezze</dt><dd>${escapeHtml(list(g.viewports, 2))}</dd>
    <dt>Dove</dt><dd>${escapeHtml(list(g.scenarios, 5))}</dd>
  </dl>
</section>`;
    }).join('\n');
    const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contrasto dei testi</title>
<style>
  body { margin: 0; padding: 24px 16px; background: #f4f4f2; color: #1d1d1b; font: 15px/1.5 system-ui, sans-serif; }
  main { max-width: 860px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 24px; }
  .intro { margin: 0 0 24px; color: #4a4a46; }
  .card { background: #fff; border: 1px solid #ddd; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .card h2 { margin: 0 0 4px; font-size: 16px; }
  .nums { margin: 0 0 12px; }
  .nums b { color: #b00000; }
  img { display: block; max-width: 100%; border: 1px solid #ccc; border-radius: 6px; }
  .worst { margin: 8px 0; font-size: 13px; color: #4a4a46; }
  dl { display: grid; grid-template-columns: 90px 1fr; gap: 2px 12px; margin: 0; font-size: 13px; }
  dt { color: #4a4a46; }
  dd { margin: 0; }
</style>
</head>
<body>
<main>
  <h1>Contrasto dei testi</h1>
  <p class="intro">${total} testi sotto soglia su ${measured} misurati (${seconds} s), in ${groups.length} gruppi, dal peggiore.
  Soglia: 4,5:1 per il testo normale, 3:1 per il testo grande e le lettere decorative. Elenco completo in lista.txt.</p>
${cards}
</main>
</body>
</html>
`;
    fs.writeFileSync(path.join(REPORT_DIR, 'index.html'), html);
}

async function main() {
    const started = Date.now();
    fs.rmSync(REPORT_DIR, { recursive: true, force: true });
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const server = await startServer();
    const base = `http://127.0.0.1:${server.address().port}/`;
    let browser;
    try {
        browser = await chromium.launch({ channel: 'chrome', headless: true });
    } catch (e) {
        console.error('check-contrast: Google Chrome not found (playwright-core uses the installed one).');
        console.error(e.message);
        server.close();
        process.exit(2);
    }
    // Every page to measure, run WORKERS at a time
    const jobs = [];
    for (const [viewportName, size] of Object.entries(VIEWPORTS)) {
        for (const scenario of scenarios(viewportName)) jobs.push([viewportName, size, scenario]);
    }
    const results = [];
    const shots = new Map();
    let next = 0;
    async function worker() {
        while (next < jobs.length) {
            const job = jobs[next++];
            results.push(...await runScenario(browser, base, job[0], job[1], job[2], shots));
        }
    }
    await Promise.all(Array.from({ length: WORKERS }, worker));
    await browser.close();
    server.close();

    const failures = results.filter(function (r) { return r.ratio < r.min; });
    const seconds = Math.round((Date.now() - started) / 1000);
    if (failures.length === 0) {
        console.log(`check-contrast: OK, ${results.length} testi misurati in ${seconds}s, tutti sopra soglia.`);
        return;
    }
    fs.writeFileSync(path.join(REPORT_DIR, 'lista.txt'), failures.map(function (f) {
        return `${f.viewport} | ${f.theme} | ${f.scenario} | "${f.text}" (${f.where}) ${f.ratio}:1, minimo ${f.min}:1`;
    }).join('\n') + '\n');
    const groups = groupFailures(failures, shots);
    writeHtml(groups, failures.length, results.length, seconds);
    console.log(`check-contrast: ${failures.length} testi sotto soglia su ${results.length} misurati (${seconds}s), `
        + `${groups.length} gruppi, dal peggiore:`);
    groups.forEach(function (g, i) {
        console.log('');
        console.log(`${i + 1}. ${g.where}  —  ${g.count} casi, contrasto ${g.worst}:1 … ${g.best}:1 (minimo ${g.min}:1)`);
        console.log(`   testi:     ${list(g.texts, 5)}`);
        console.log(`   temi:      ${list(g.themes, 5)}`);
        console.log(`   larghezze: ${list(g.viewports, 2)}`);
        console.log(`   dove:      ${list(g.scenarios, 4)}`);
        console.log(`   screen:    ${path.relative(process.cwd(), path.join(REPORT_DIR, g.shot.file))}`);
    });
    console.log('');
    console.log(`Report con gli screenshot: ${path.relative(process.cwd(), path.join(REPORT_DIR, 'index.html'))}`);
    process.exit(1);
}

main().catch(function (e) {
    console.error(e);
    process.exit(2);
});
