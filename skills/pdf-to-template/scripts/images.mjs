#!/usr/bin/env node
// images.mjs <file.pdf> [pageNum=all]
// Lists raster image XObjects and their placed box. Coordinates are in the
// UNROTATED PDF space (media box, bottom-left origin) reported as CSS-top via
// top = pageHeight - yBottom - height. For ROTATED pages, treat this as
// best-effort and confirm the box visually against render.mjs output — rotation
// remaps axes. Vector marks (logos, icons, QR) are NOT XObjects; crop those
// from the render with crop.mjs.
import { readFileSync } from 'fs';
const _drop = /Cannot polyfill|^Warning:/;
const _log = console.log, _warn = console.warn;
console.log = (...a) => { if (!_drop.test(String(a[0]))) _log(...a); };
console.warn = (...a) => { if (!_drop.test(String(a[0]))) _warn(...a); };
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const OPS = pdfjs.OPS;
const file = process.argv[2];
const only = process.argv[3] ? +process.argv[3] : null;
if (!file) { console.error('usage: node images.mjs <file.pdf> [pageNum]'); process.exit(1); }
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;
const mul = (a, b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];

for (let pn = 1; pn <= doc.numPages; pn++) {
  if (only && pn !== only) continue;
  const page = await doc.getPage(pn);
  const H = page.view[3] - page.view[1];
  const ops = await page.getOperatorList();
  let ctm = [1,0,0,1,0,0]; const stack = [];
  const found = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], a = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm.slice());
    else if (fn === OPS.restore) ctm = stack.pop() || [1,0,0,1,0,0];
    else if (fn === OPS.transform) ctm = mul(ctm, a);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject || fn === OPS.paintImageMaskXObject) {
      const w = Math.hypot(ctm[0], ctm[1]), h = Math.hypot(ctm[2], ctm[3]);
      found.push({ name: a[0], left: +ctm[4].toFixed(1), top: +(H - ctm[5] - h).toFixed(1), w: +w.toFixed(1), h: +h.toFixed(1) });
    }
  }
  console.log(`page ${pn} (rotate ${page.rotate}): ${found.length} raster image(s)`);
  for (const f of found) console.log('  ' + JSON.stringify(f));
}
