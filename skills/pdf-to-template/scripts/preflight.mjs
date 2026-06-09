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

// 3. Headless browser (puppeteer bundles its own Chromium)
try {
  const pptr = (await import('puppeteer')).default;
  const path = pptr.executablePath();
  existsSync(path) ? ok('headless browser ready')
    : warn('puppeteer installed but Chromium not downloaded — run: npx puppeteer browsers install chrome');
} catch (e) {
  warn('puppeteer not usable yet: ' + e.message.split('\n')[0]);
}

console.log('');
if (hard) { console.log(`${hard} blocking issue(s) — fix the ✗ lines above, then re-run preflight.`); process.exit(1); }
console.log('Ready. You can convert a PDF now.');
