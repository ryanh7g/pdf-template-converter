#!/usr/bin/env node
// crop.mjs <srcPng> <dpi> <regionsJson> [outDir=.]
// Crops rectangular regions (in POINTS, display space) out of a rendered page.
// regionsJson: [["name", leftPt, topPt, widthPt, heightPt], ...]
// Used to extract vector brand marks / icons / logos as PNG assets.
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join } from 'path';
const [, , src, dpiArg, regionsJson, outDirArg] = process.argv;
if (!src || !dpiArg || !regionsJson) { console.error('usage: node crop.mjs <srcPng> <dpi> <regionsJson> [outDir]'); process.exit(1); }
const S = (+dpiArg) / 72;
const outDir = outDirArg || '.';
mkdirSync(outDir, { recursive: true });
const regions = JSON.parse(regionsJson);
const meta = await sharp(src).metadata();
for (const [name, l, t, w, h] of regions) {
  const left = Math.round(l * S), top = Math.round(t * S);
  const width = Math.min(Math.round(w * S), meta.width - left);
  const height = Math.min(Math.round(h * S), meta.height - top);
  const out = join(outDir, `crop_${name}.png`);
  await sharp(src).extract({ left, top, width, height }).toFile(out);
  console.log(`${out}  ${width}x${height}px`);
}
