#!/usr/bin/env node
// compare.mjs <sourcePng> <renderPng> <out.jpg> [layout=stack|side]
// Builds a source-vs-render comparison image (source on top/left, divided by a
// red line) so you can eyeball geometry/typography drift against the original.
import sharp from 'sharp';
const [, , src, mine, out, layout = 'stack'] = process.argv;
if (!src || !mine || !out) { console.error('usage: node compare.mjs <sourcePng> <renderPng> <out.jpg> [stack|side]'); process.exit(1); }
const DIM = 900;
if (layout === 'side') {
  const a = await sharp(src).resize({ height: DIM }).extend({ right: 6, background: '#ff0000' }).toBuffer();
  const b = await sharp(mine).resize({ height: DIM }).toBuffer();
  const am = await sharp(a).metadata(), bm = await sharp(b).metadata();
  await sharp({ create: { width: am.width + bm.width, height: DIM, channels: 3, background: '#fff' } })
    .composite([{ input: a, left: 0, top: 0 }, { input: b, left: am.width, top: 0 }]).jpeg().toFile(out);
} else {
  const W = 760;
  const a = await sharp(src).resize({ width: W }).extend({ bottom: 4, background: '#ff0000' }).toBuffer();
  const b = await sharp(mine).resize({ width: W }).toBuffer();
  const am = await sharp(a).metadata(), bm = await sharp(b).metadata();
  await sharp({ create: { width: W, height: am.height + bm.height, channels: 3, background: '#fff' } })
    .composite([{ input: a, top: 0, left: 0 }, { input: b, top: am.height, left: 0 }]).jpeg().toFile(out);
}
console.log('wrote ' + out + ' (source then render, red divider)');
