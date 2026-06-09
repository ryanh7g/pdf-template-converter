#!/usr/bin/env node
// sample.mjs <srcPng> <dpi> <pointsJson>
// Samples hex colors at points (POINTS, display space) or scans a horizontal
// line for non-background pixels. Used to read palette colors and to locate
// rule lines / band boundaries / box edges.
//   pointsJson item:  [xPt, yPt]                      -> hex at that point
//                     ["hscan", yPt, x0Pt, x1Pt]      -> non-white run on that row
import sharp from 'sharp';
const [, , src, dpiArg, pointsJson] = process.argv;
if (!src || !dpiArg || !pointsJson) { console.error('usage: node sample.mjs <srcPng> <dpi> <pointsJson>'); process.exit(1); }
const S = (+dpiArg) / 72;
const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
const hex = (xp, yp) => {
  const x = Math.round(xp * S), y = Math.round(yp * S);
  const i = (y * info.width + x) * info.channels;
  return '#' + [data[i], data[i+1], data[i+2]].map(v => v.toString(16).padStart(2, '0')).join('');
};
for (const a of JSON.parse(pointsJson)) {
  if (a[0] === 'hscan') {
    const [, y, x0, x1] = a; const cols = [];
    for (let x = x0; x <= x1; x++) { const c = hex(x, y); if (c !== '#ffffff' && c !== '#fefefe') cols.push(x); }
    console.log(`hscan y=${y}: ` + (cols.length ? `${cols[0]}..${cols[cols.length-1]} (n=${cols.length})` : 'all background'));
  } else {
    console.log(`(${a[0]},${a[1]}) ${hex(a[0], a[1])}`);
  }
}
