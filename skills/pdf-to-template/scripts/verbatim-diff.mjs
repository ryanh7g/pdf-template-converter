#!/usr/bin/env node
// verbatim-diff.mjs <templateDir> [skeletonHtml]
// Proves the platform-contract JS zone in template.html is byte-identical to
// the reference skeleton — EXCEPT the body of render() (your field bindings),
// which is the only part you may customize. Any difference outside render() is
// a contract violation that silently breaks the editor/QA/export. Exits
// non-zero if the non-render zones differ.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const here = dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
const skel = process.argv[3] || join(here, '..', 'reference', 'template-skeleton.html');
if (!dir) { console.error('usage: node verbatim-diff.mjs <templateDir> [skeletonHtml]'); process.exit(1); }
const grabScript = s => s.slice(s.indexOf('<script>') + 8, s.indexOf('</script>'));
// strip the render() body so only the contract zones remain
const stripRender = s => {
  const a = s.indexOf('function render');
  const b = s.indexOf('window.renderFlyer');
  return a >= 0 && b >= 0 ? s.slice(0, a) + s.slice(b) : s;
};
const ref = stripRender(grabScript(readFileSync(skel, 'utf8'))).trim();
const mine = stripRender(grabScript(readFileSync(`${dir}/template.html`, 'utf8'))).trim();
if (ref === mine) { console.log('NON-RENDER ZONES IDENTICAL ✓'); process.exit(0); }
// show first divergence for debugging
const ra = ref.split('\n'), ma = mine.split('\n');
const n = Math.max(ra.length, ma.length);
console.log('✗ Contract JS zone differs from the reference. First divergences:');
let shown = 0;
for (let i = 0; i < n && shown < 8; i++) {
  if (ra[i] !== ma[i]) { console.log(`  ref : ${ra[i] ?? '(none)'}`); console.log(`  mine: ${ma[i] ?? '(none)'}`); console.log(''); shown++; }
}
process.exit(1);
