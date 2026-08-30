#!/usr/bin/env node
// fitprobe.mjs <templateDir> [--json]
//
// The BROWSER half of the autofit audit (contract §6.4b). fitcheck.mjs reads the
// declared widths; this one renders the template and watches the engine work.
//
// ── WHAT ONLY A BROWSER CAN ANSWER ────────────────────────────────────────
//
//   • Did the engine RUN at all?  (data-fit-scale present on the node)
//   • Did it HIT THE FLOOR?       (data-fit-overflow="true" — a human must
//                                  shorten the copy; nothing is truncated)
//   • Flex containers — trap (d). scrollWidth overflow detection is unreliable
//     on them and the static pass cannot see it at all.
//   • Widths the static pass reports as UNCHECKED: calc(), %, flex, var().
//   • Does a fitted line actually LAND ON another element? Real rects, not
//     declared boxes.
//
// ── AND THE PART NEITHER HALF DID BEFORE: STRESS DATA ─────────────────────
//
// Rendering the shipped sample proves very little — the samples are short by
// construction. So each text field is filled to ITS OWN DECLARED maxChars, the
// longest value the template says it accepts. If it cannot render that, either
// the box is too small or maxChars is a lie; both are defects, and which one is
// a judgment call for a human.
//
// Fields with no maxChars get a realistic worst case by key
// (`ALEXANDRA MONTGOMERY-WHITFIELD`, `31680 RANCHO VIEJO ROAD`, `$12,750,000`).
//
// ── RUNNING IT ────────────────────────────────────────────────────────────
//
// Uses puppeteer (bundled) or playwright, whichever resolves. With neither:
//   docker run --rm -v $PWD:/w -w /w mcr.microsoft.com/playwright:v1.60.0-noble \
//     node /w/scripts/fitprobe.mjs <templateDir>
// Exits 0 and says so when no browser is available — this is the FULL-mode
// check; fitcheck.mjs is the one that must always pass.
import { readFileSync, existsSync } from 'fs';
import { resolve, join, extname } from 'path';
import { createServer } from 'http';

const dir = process.argv[2];
const JSON_OUT = process.argv.includes('--json');
if (!dir) { console.error('usage: node fitprobe.mjs <templateDir> [--json]'); process.exit(1); }

const schema = JSON.parse(readFileSync(`${dir}/schema.json`, 'utf8'));
const data = JSON.parse(readFileSync(`${dir}/data.json`, 'utf8'));
const html = readFileSync(`${dir}/template.html`, 'utf8');

if (!/FIT_TARGETS/.test(html) && !/data-fit=/.test(html)) {
  console.log('\nfitprobe: this template has no autofit — nothing to probe.\n');
  process.exit(0);
}

// ── a browser, or an honest exit ──────────────────────────────────────────
let launch = null, flavour = '';
try { const p = (await import('puppeteer')).default; launch = () => p.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--allow-file-access-from-files'] }); flavour = 'puppeteer'; }
catch {
  try { const { chromium } = await import('playwright'); launch = () => chromium.launch({ args: ['--allow-file-access-from-files'] }); flavour = 'playwright'; }
  catch {
    console.log('\nfitprobe: no browser available (neither puppeteer nor playwright resolves).');
    console.log('  This is the FULL-mode check. fitcheck.mjs is the one that must always pass.');
    console.log('  To run it anyway:');
    console.log('    docker run --rm -v $PWD:/w -w /w mcr.microsoft.com/playwright:v1.60.0-noble \\');
    console.log('      node /w/scripts/fitprobe.mjs <templateDir>\n');
    process.exit(0);
  }
}

// ── STRESS DATA: every text field at its own declared maximum ─────────────
const WORST = [
  [/(^|\.)address$|addr/i,        '31680 RANCHO VIEJO ROAD'],
  [/(^|\.)city$/i,                'RANCHO SANTA MARGARITA, CA 92688'],
  [/name/i,                       'ALEXANDRA MONTGOMERY-WHITFIELD'],
  [/price|offered|list/i,         '$12,750,000'],
  [/phone|mobile|cell/i,          '(949) 555-0147 ext. 2200'],
  [/email/i,                      'alexandra.montgomery@sevengables.com'],
  [/web|site|url/i,               'www.alexandramontgomery-whitfield.com'],
  [/dre|lic/i,                    'DRE# 01234567 · DRE# 07654321'],
  [/sqft|square/i,                '12,450'],
  [/bed|bath/i,                   '12.5'],
  [/headline|kicker|title/i,      'AN EXTRAORDINARY COASTAL RESIDENCE'],
];
function stressFor(f) {
  const max = f.constraints?.maxChars;
  const worst = (WORST.find(([re]) => re.test(f.key)) ?? [null, 'WWWWWWWWWWWWWWWWWWWWWWWWWWWW'])[1];
  if (max) {
    // Fill to EXACTLY the declared maximum — the longest value this template
    // claims to accept. Repeat the realistic string rather than padding with a
    // single glyph, so the width is representative of real copy.
    let s = worst;
    while (s.length < max) s += ' ' + worst;
    return s.slice(0, max).trimEnd();
  }
  return worst;
}
const stress = JSON.parse(JSON.stringify(data));
const setPath = (o, k, v) => { const p = k.split('.'); let c = o; for (const s of p.slice(0, -1)) { if (typeof c[s] !== 'object' || c[s] === null) c[s] = {}; c = c[s]; } c[p.at(-1)] = v; };
const stressed = [];
for (const f of schema.fields) {
  if (f.type !== 'text' && f.type !== 'richText') continue;
  if (f.editable === false) continue;
  const v = stressFor(f);
  setPath(stress, f.key, v);
  stressed.push({ key: f.key, len: v.length, max: f.constraints?.maxChars ?? null });
}

// ── probe ─────────────────────────────────────────────────────────────────
// ── SERVED OVER HTTP, NOT file:// ────────────────────────────────────────
// Two things break under file:// and both corrupt the measurement rather than
// failing loudly: @font-face requests are blocked, so the engine measures
// FALLBACK METRICS and every scale it reports is wrong; and the template's own
// boot fetch of data.json is refused ("URL scheme file is not supported").
// Handoff §4.5 is the same trap from the other direction.
const MIME = { '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.js': 'text/javascript',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const root = resolve(dir);
const server = createServer((req, res) => {
  const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'template.html';
  const f = join(root, rel);
  if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await launch();
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto(`${origin}/template.html`, { waitUntil: 'load' });
// Give webfonts a chance before the first measurement; the engine's own second
// pass on document.fonts.ready is what actually corrects it.
await page.evaluate(() => (document.fonts && document.fonts.ready) || null).catch(() => {});

async function measure(payload) {
  await page.evaluate((t) => { window.__probeTargets = t; }, TARGETS);
  return await page.evaluate(async (d) => {
    if (typeof window.renderFlyer === 'function') window.renderFlyer(d);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await new Promise(r => setTimeout(r, 120));           // let the second fit pass land
    const nodes = [...document.querySelectorAll('[data-fit-scale], [data-fit]')];
    const positioned = [...document.querySelectorAll('.abs, [style*="position"]')]
      .filter(n => getComputedStyle(n).position === 'absolute');
    const rect = n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const idOf = n => n.id || n.className || n.tagName.toLowerCase();
    const sectionOf = n => { const s = n.closest('section'); return s ? (s.id || [...document.querySelectorAll('section')].indexOf(s)) : null; };
    // Which declared targets did the engine actually TOUCH? A selector in
    // FIT_TARGETS that matches nothing, or matches a node the engine never
    // stamped, is a target that silently does not exist.
    const declared = (window.__probeTargets || []);
    const untouched = declared.filter((t) => {
      let found;
      try { found = [...document.querySelectorAll(t)]; } catch { return false; }
      if (!found.length) return true;                       // selector matches nothing
      return !found.some((n) => n.hasAttribute('data-fit-scale') || n.hasAttribute('data-fit'));
    });
    return {
      untouched,
      hasEngine: nodes.length > 0,
      nodes: nodes.map(n => ({
        id: idOf(n),
        scale: parseFloat(n.getAttribute('data-fit-scale') || 'NaN'),
        overflow: n.getAttribute('data-fit-overflow') === 'true',
        scrollW: n.scrollWidth, clientW: n.clientWidth,
        display: getComputedStyle(n).display,
        section: sectionOf(n),
        rect: rect(n),
        text: (n.textContent || '').trim().slice(0, 40),
      })),
      others: positioned.map(n => ({ id: idOf(n), section: sectionOf(n), rect: rect(n) })),
    };
  }, payload);
}

const TARGETS = (() => {
  const m = /FIT_TARGETS\s*=\s*["']([^"']+)["']/.exec(html);
  return m ? m[1].split(',').map(x => x.trim()).filter(Boolean) : [];
})();

const base = await measure(data);
const hard = await measure(stress);
await browser.close();
server.close();

// ── report ────────────────────────────────────────────────────────────────
let fail = 0;
const bad = m => { console.log('  ✗ ' + m); fail++; };
const warn = m => console.log('  ⚠ ' + m);
const ok = m => console.log('  ✓ ' + m);

console.log(`\nfitprobe (${flavour}) — ${dir}\n`);

if (!base.hasEngine) {
  bad('the page carries FIT_TARGETS but NO node has data-fit-scale — the engine never ran. Check it is inside render() (§6.4b).');
} else {
  ok(`the engine ran: ${base.nodes.length} node(s) carry data-fit-scale`);
}

// A declared target the engine never stamped. Either the selector matches
// nothing in this template (a copied FIT_TARGETS list), or the node is not in
// the DOM — both mean that element is UNPROTECTED while the list claims it is.
for (const t of base.untouched ?? []) {
  bad(`${t} is in FIT_TARGETS but the engine never stamped it — the selector matches nothing here, so that element has NO autofit despite being listed`);
}

// Silent no-ops — trap (a), caught by MEASUREMENT rather than inference.
//
// "It did not shrink at maxChars" is NOT by itself a defect: a box wide enough
// for the longest legal value correctly leaves the type alone. The defect is a
// box that CANNOT shrink because it grows with its own content, and that is
// directly observable — an auto-width element is WIDER in the stressed pass
// than in the base one, while a fixed box measures the same in both.
for (const n of base.nodes) {
  const s = hard.nodes.find(x => x.id === n.id);
  if (n.clientW === 0) { bad(`${n.id} has zero width at render — autofit cannot measure it`); continue; }
  if (!s) continue;
  if (s.clientW > n.clientW + 1) {
    bad(`${n.id} GREW from ${n.clientW}px to ${s.clientW}px with longer text — it shrink-wraps, so scrollWidth never exceeds clientWidth and autofit can never fire (§6.4b trap a)`);
  }
}

// The real question: does it survive its OWN declared maximum?
const floored = hard.nodes.filter(n => n.overflow);
if (floored.length) {
  for (const n of floored) {
    bad(`${n.id} HITS THE FLOOR at its declared maxChars and still does not fit — either the box is too small or maxChars is wrong ("${n.text}…")`);
  }
} else if (hard.hasEngine) {
  ok('every fitted line survives its own declared maxChars without hitting the floor');
}

// The floor is per-template: the postcards run a newer engine that reduces
// letter-spacing before font-size and reaches 0.73, below the 0.80 the original
// documented. Read it rather than assuming.
const floorM = /FIT_FLOOR\s*=\s*([\d.]+)/.exec(html);
const FLOOR = floorM ? parseFloat(floorM[1]) : 0.80;
const tight = hard.nodes.filter(n => !n.overflow && n.scale < FLOOR + 0.05).map(n => `${n.id} ${n.scale.toFixed(2)}`);
if (tight.length) warn(`within 5% of this template's ${FLOOR} floor at maxChars: ${tight.join(', ')}`);

// Real overlap, measured from absolute rects — no page-scoping guesswork.
//
// ONLY OVERLAPS THAT APPEAR UNDER STRESS COUNT. An overlap present with the
// SHIPPED sample is the design, not a defect: AVANT's stat chips deliberately
// sit over the bottom edge of the photos, and its rules.json says so. Comparing
// the two passes is what tells a deliberate overlay from a collision — and it
// generalises: anything already true at base is how the template is meant to
// look.
const overlapsIn = (snap) => {
  const out = new Set();
  for (const n of snap.nodes) {
    for (const o of snap.others) {
      if (o.id === n.id || o.section !== n.section) continue;
      const a = n.rect, b = o.rect;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 1 && oy > 1 && b.x > a.x) out.add(`${n.id}|${o.id}|${Math.round(ox)}`);
    }
  }
  return out;
};
const byDesign = new Set([...overlapsIn(base)].map(k => k.split('|').slice(0, 2).join('|')));
const under = overlapsIn(hard);
let overlaps = 0;
for (const k of under) {
  const [a, b, px] = k.split('|');
  if (byDesign.has(`${a}|${b}`)) continue;              // present in the comp = intended
  overlaps++;
  bad(`${a} runs under ${b} by ${px}px ONLY at maxChars — it fits the sample and collides with real copy (§6.4b trap c)`);
}
if (!overlaps && hard.hasEngine) {
  ok(`no NEW collision at maxChars${byDesign.size ? ` (${byDesign.size} deliberate overlap(s) ignored)` : ''}`);
}

// Flex containers — trap (d), invisible to the static pass.
const flex = hard.nodes.filter(n => /flex/.test(n.display));
if (flex.length) {
  const suspicious = flex.filter(n => n.scrollW <= n.clientW && n.scale === 1);
  if (suspicious.length) {
    warn(`flex fit targets that reported no overflow at maxChars: ${suspicious.map(n => n.id).join(', ')} — scrollWidth is unreliable on flex (§6.4b trap d); check these by eye`);
  } else {
    ok(`${flex.length} flex fit target(s) shrank as expected`);
  }
}

if (errors.length) warn(`page errors during render: ${errors.slice(0, 3).join(' | ')}`);

if (JSON_OUT) console.log(JSON.stringify({ base, hard, stressed }, null, 2));
else console.log(`\n  stressed ${stressed.length} text field(s) to their declared maxChars`);

console.log(fail ? `\nfitprobe: ${fail} problem(s)\n` : '\nfitprobe: passed\n');
process.exit(fail ? 1 : 0);
