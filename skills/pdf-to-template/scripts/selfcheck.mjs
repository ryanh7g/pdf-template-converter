#!/usr/bin/env node
// selfcheck.mjs <templateDir>
// Structural QA per the contract §9: four-way sync (schema <-> data <-> DOM
// data-field <-> render() binding), constraint validation on defaults,
// self-containment (only relative fonts/ assets/ refs), renderFlyer present,
// and manifest.id == folder name. Exits non-zero on any failure.
import { readFileSync } from 'fs';
import { basename, resolve } from 'path';
const dir = process.argv[2];
if (!dir) { console.error('usage: node selfcheck.mjs <templateDir>'); process.exit(1); }
const J = f => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
const schema = J('schema.json'), data = J('data.json'), manifest = J('manifest.json');
const html = readFileSync(`${dir}/template.html`, 'utf8');
let fail = 0; const bad = m => { console.log('  ✗ ' + m); fail++; };
const get = (o, p) => p.split('.').reduce((a, k) => a == null ? undefined : a[k], o);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const domBody = html.slice(0, html.indexOf('<script>'));
const renderBody = html.slice(html.indexOf('function render'), html.indexOf('window.renderFlyer'));

for (const f of schema.fields) {
  const v = get(data, f.key);
  if (f.required && (v == null || v === '')) bad(`data.json missing required '${f.key}'`);
  if (!domBody.includes(`data-field="${f.key}"`)) bad(`DOM missing data-field="${f.key}"`);
  const re = new RegExp(`id="(f-[^"]+)"[^>]*data-field="${esc(f.key)}"|data-field="${esc(f.key)}"[^>]*id="(f-[^"]+)"`);
  const m = domBody.match(re);
  if (!m) { bad(`no id="f-…" node carries data-field="${f.key}"`); continue; }
  const id = m[1] || m[2];
  if (!renderBody.includes(`"${id}"`)) bad(`render() has no binding for ${id} (key ${f.key})`);
  const c = f.constraints || {};
  if ((f.type === 'text' || f.type === 'richText') && typeof v === 'string' && c.maxChars && v.length > c.maxChars)
    bad(`'${f.key}' default length ${v.length} > maxChars ${c.maxChars}`);
}
const schemaKeys = new Set(schema.fields.map(f => f.key));
for (const df of new Set([...domBody.matchAll(/data-field="([^"]+)"/g)].map(m => m[1])))
  if (!schemaKeys.has(df)) bad(`DOM data-field="${df}" has no schema entry`);
for (const m of html.matchAll(/(?:src=|url\()["']?([^"')]+)/g)) {
  const u = m[1];
  if (/^(https?:)?\/\//.test(u) || u.startsWith('/') || /^[A-Za-z]:\\/.test(u)) { if (!u.startsWith('data:')) bad(`non-relative reference: ${u}`); }
}
if (!/window\.renderFlyer\s*=\s*render/.test(html)) bad('window.renderFlyer = render missing');
if (manifest.id !== basename(resolve(dir))) bad(`manifest.id '${manifest.id}' != folder '${basename(resolve(dir))}'`);

console.log(fail === 0 ? 'ALL STRUCTURAL CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`);
process.exit(fail ? 1 : 0);
