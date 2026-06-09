#!/usr/bin/env node
// probe.mjs <file.pdf>
// Prints a JSON report: per-page geometry (MediaBox/TrimBox -> trim + bleed,
// rotation, display size), every text run in DISPLAY (rotation-applied) coords
// with its real BaseFont, and a font inventory flagging subsets / embedding.
// Display coords have a top-left origin; subtract the bleed offset to get
// trim-relative (.sheet) coordinates. This is the first step of every job.
import { readFileSync } from 'fs';
// pdfjs' legacy build prints "Cannot polyfill DOMMatrix/Path2D" at import time
// (harmless for text/geometry extraction). Filter those so stdout stays clean
// JSON, then dynamic-import pdfjs after the patch is in place.
const _drop = /Cannot polyfill|^Warning:/;
const _log = console.log, _warn = console.warn;
console.log = (...a) => { if (!_drop.test(String(a[0]))) _log(...a); };
console.warn = (...a) => { if (!_drop.test(String(a[0]))) _warn(...a); };
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const file = process.argv[2];
if (!file) { console.error('usage: node probe.mjs <file.pdf>'); process.exit(1); }
const bytes = readFileSync(file);
const raw = bytes.toString('latin1');

// Best-effort raw-PDF box scan (pdfjs exposes MediaBox but not Trim/Bleed).
function boxes() {
  const out = [];
  const re = /\/(MediaBox|TrimBox|BleedBox)\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s*\]/g;
  let m, cur = {};
  while ((m = re.exec(raw))) {
    cur[m[1]] = [m[2], m[3], m[4], m[5]].map(Number);
    if (cur.MediaBox && cur.TrimBox) { out.push(cur); cur = {}; }
  }
  return out;
}
const rawBoxes = boxes();

// Font descriptors from raw bytes: subset prefix (ABCDEF+) and embedded file.
function fonts() {
  const seen = {};
  const re = /\/BaseFont\s*\/([A-Za-z0-9+\-]+)[\s\S]{0,400}?(FontFile3?2?)?/g;
  let m;
  for (const fm of raw.matchAll(/\/FontName\s*\/([A-Za-z0-9+\-]+)[\s\S]{0,200}?(FontFile3|FontFile2|FontFile)/g)) {
    const name = fm[1];
    seen[name] = { name, subset: /^[A-Z]{6}\+/.test(name), embedded: true, file: fm[2] };
  }
  for (const bm of raw.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-]+)/g)) {
    const name = bm[1];
    if (!seen[name]) seen[name] = { name, subset: /^[A-Z]{6}\+/.test(name), embedded: false };
  }
  return Object.values(seen);
}

const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
const report = { file, numPages: doc.numPages, pages: [], fonts: fonts() };

for (let pn = 1; pn <= doc.numPages; pn++) {
  const page = await doc.getPage(pn);
  const vp = page.getViewport({ scale: 1 });            // rotation applied -> display
  const mb = rawBoxes[pn - 1]?.MediaBox || page.view;
  const tb = rawBoxes[pn - 1]?.TrimBox || mb;
  const bleedPt = +Math.min(tb[0] - mb[0], tb[1] - mb[1], mb[2] - tb[2], mb[3] - tb[3]).toFixed(2);
  const trimWpt = +(tb[2] - tb[0]).toFixed(1), trimHpt = +(tb[3] - tb[1]).toFixed(1);
  // rotation swaps trim dims for the on-screen (display) orientation
  const rot = page.rotate % 180 !== 0;
  const content = await page.getTextContent();
  await page.getOperatorList();
  const objs = page.commonObjs;
  const items = [];
  for (const it of content.items) {
    if (!it.str.trim()) continue;
    let base = '?'; try { base = objs.get(it.fontName)?.name || '?'; } catch {}
    const fs = +Math.hypot(it.transform[2], it.transform[3]).toFixed(1);
    const [dx, dy] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
    items.push({ s: it.str, dispX: +dx.toFixed(1), dispBaselineY: +dy.toFixed(1), fs, font: base });
  }
  report.pages.push({
    page: pn, rotate: page.rotate,
    displayPt: [+vp.width.toFixed(1), +vp.height.toFixed(1)],
    trimPt: rot ? [trimHpt, trimWpt] : [trimWpt, trimHpt],
    trimIn: rot ? [+(trimHpt/72).toFixed(3), +(trimWpt/72).toFixed(3)] : [+(trimWpt/72).toFixed(3), +(trimHpt/72).toFixed(3)],
    bleedIn: +(bleedPt / 72).toFixed(4),
    bleedOffsetPt: bleedPt,
    text: items,
  });
}
console.log(JSON.stringify(report, null, 2));
