#!/usr/bin/env node
// Preflight: verify the toolchain before a conversion. Installs npm deps if
// missing, confirms a usable headless browser, and prints a plain-English
// status. Run this FIRST. Exits non-zero with a clear message if a hard
// dependency is missing so a non-technical user knows exactly what to fix.
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const ok = m => console.log('  ✓ ' + m);
const warn = m => console.log('  ! ' + m);
let hard = 0;
const fail = m => { console.log('  ✗ ' + m); hard++; };

console.log('PDF→Template preflight\n');

// 1. Node
const [maj] = process.versions.node.split('.').map(Number);
maj >= 18 ? ok(`Node ${process.versions.node}`) : fail(`Node ${process.versions.node} — need >= 18. Install from nodejs.org or ask IT.`);

// 2. npm deps
if (!existsSync(join(here, 'node_modules'))) {
  console.log('  … installing dependencies (one-time, ~1 min)…');
  try {
    execSync('npm install --no-audit --no-fund', { cwd: here, stdio: 'inherit' });
    ok('dependencies installed');
  } catch (e) { fail('npm install failed — check your internet connection, then re-run preflight.'); }
} else ok('dependencies present');

// 3. Browser-free verification engines (these do the real work; no browser needed).
let mupdfOk = false;
try { await import('mupdf'); mupdfOk = true; ok('mupdf ready (source PDF → PNG, no browser)'); }
catch { fail('mupdf missing — run npm install in scripts/'); }
try { await import('sharp'); ok('sharp ready (comparison images, no browser)'); }
catch { warn('sharp missing — comparison images unavailable (npm install in scripts/)'); }

// 4. Headless browser (puppeteer/Chromium) — OPTIONAL. Enables the pixel-accurate
//    template screenshot (shoot.mjs) + the bleed export-pdf check. Sandboxed
//    environments (e.g. a Claude Cowork session) often have no Chromium; that is
//    NOT a blocker — the skill falls back to the browser-free verification path.
let browser = false;
try {
  const pptr = (await import('puppeteer')).default;
  if (existsSync(pptr.executablePath())) { browser = true; ok('headless browser ready (full visual mode)'); }
  else warn('no Chromium — running in NO-BROWSER mode');
} catch { warn('no usable browser — running in NO-BROWSER mode'); }

console.log('');
if (hard) { console.log(`${hard} blocking issue(s) — fix the ✗ lines above, then re-run preflight.`); process.exit(1); }
if (browser) {
  console.log('MODE: full — pixel-accurate self-shoot + compare + bleed export-pdf available.');
} else {
  console.log('MODE: no-browser — shoot.mjs / export-pdf.mjs are UNAVAILABLE (they need Chromium).');
  console.log('Verify with the browser-free path instead (see SKILL.md "Verification"):');
  console.log('  • render the SOURCE pdf (render.mjs/mupdf) and inspect it directly;');
  console.log('  • run selfcheck.mjs (sync + MLS layer + missing-asset + overflow) and fontcheck.mjs (glyph coverage);');
  console.log('  • cross-check template.html absolute pt coordinates against probe.mjs measurements;');
  console.log('  • flag that a pixel-accurate visual pass in a browser env is still pending before ship.');
}
console.log('\nReady. You can convert a PDF now.');
