#!/usr/bin/env node
// render.mjs <file.pdf> <outDir> [dpi=300]
// Rasterizes every page to <outDir>/page-N.png at the given DPI, with page
// rotation applied (mupdf, no system deps). Use these PNGs to measure element
// geometry and to crop vector brand marks / icons that aren't raster XObjects.
import * as mupdf from 'mupdf';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const [, , file, outDir, dpiArg] = process.argv;
if (!file || !outDir) { console.error('usage: node render.mjs <file.pdf> <outDir> [dpi]'); process.exit(1); }
const dpi = +(dpiArg || 300);
mkdirSync(outDir, { recursive: true });
const doc = mupdf.Document.openDocument(readFileSync(file), 'application/pdf');
const scale = dpi / 72;
for (let i = 0; i < doc.countPages(); i++) {
  const page = doc.loadPage(i);
  const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
  const out = join(outDir, `page-${i + 1}.png`);
  writeFileSync(out, pix.asPNG());
  const b = page.getBounds();
  console.log(`page ${i + 1}: ${out}  ${pix.getWidth()}x${pix.getHeight()}px  (${(b[2]-b[0]).toFixed(0)}x${(b[3]-b[1]).toFixed(0)}pt @ ${dpi}dpi)`);
}
