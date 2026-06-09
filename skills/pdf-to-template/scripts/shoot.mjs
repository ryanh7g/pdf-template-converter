#!/usr/bin/env node
// shoot.mjs <url> <outPng> [widthPx=850] [heightPx=1100]
// Screenshots a rendered template page for visual self-check / thumbnail.
// Set SHOOT_SEL to a CSS selector (e.g. "#page1") to capture one page element.
// Set CHROME_BIN to use a specific browser; otherwise puppeteer's bundled one.
// Reports any console / page errors (e.g. blank-glyph or missing-asset hints).
import puppeteer from 'puppeteer';
const [, , url, out, w, h] = process.argv;
if (!url || !out) { console.error('usage: node shoot.mjs <url> <outPng> [wPx] [hPx]'); process.exit(1); }
const launch = { args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] };
if (process.env.CHROME_BIN) launch.executablePath = process.env.CHROME_BIN;
const browser = await puppeteer.launch(launch);
const page = await browser.newPage();
await page.setViewport({ width: +w || 850, height: +h || 1100, deviceScaleFactor: 2 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
page.on('requestfailed', r => errs.push('REQFAIL ' + r.url()));
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts && document.fonts.ready);
await new Promise(r => setTimeout(r, 400));
const sel = process.env.SHOOT_SEL;
if (sel) { const el = await page.$(sel); if (!el) { console.error('selector not found: ' + sel); process.exit(2); } await el.screenshot({ path: out }); }
else await page.screenshot({ path: out });
console.log(errs.length ? 'ISSUES:\n' + errs.join('\n') : 'ok — no console/asset errors');
await browser.close();
