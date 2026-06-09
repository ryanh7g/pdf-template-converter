#!/usr/bin/env node
// export-pdf.mjs <url> <out.pdf> <mediaWidthIn> <mediaHeightIn> [bleedIn=0]
// Exercises the real export path: calls window.renderFlyer(data, {bleed,bleedIn})
// then page.pdf() at the MEDIA size (trim + 2*bleed). Verifies the bleed
// mechanism survives Chromium's PDF pipeline. mediaWidth/Height are in INCHES
// and must equal trim + 2*bleed.
import puppeteer from 'puppeteer';
const [, , url, out, wIn, hIn, bleedArg] = process.argv;
if (!url || !out || !wIn || !hIn) { console.error('usage: node export-pdf.mjs <url> <out.pdf> <mediaWin> <mediaHin> [bleedIn]'); process.exit(1); }
const bleedIn = +(bleedArg || 0);
const launch = { args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] };
if (process.env.CHROME_BIN) launch.executablePath = process.env.CHROME_BIN;
const browser = await puppeteer.launch(launch);
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(async (b) => {
  const d = window.__FLYER_DATA__ || await (await fetch('./data.json')).json();
  window.renderFlyer(d, b > 0 ? { bleed: true, bleedIn: b } : { bleed: false });
}, bleedIn);
await page.evaluate(() => document.fonts && document.fonts.ready);
await page.pdf({ path: out, printBackground: true, width: wIn + 'in', height: hIn + 'in', margin: { top: 0, right: 0, bottom: 0, left: 0 } });
console.log(`exported ${out} @ ${wIn}x${hIn}in (bleed ${bleedIn}in)`);
await browser.close();
