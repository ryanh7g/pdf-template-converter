#!/usr/bin/env node
// selfcheck.mjs <templateDir>
// Structural QA per the contract §9: four-way sync (schema <-> data <-> DOM
// data-field <-> render() binding), constraint validation on defaults,
// self-containment (only relative fonts/ assets/ refs), renderFlyer present,
// and manifest.id == folder name. Exits non-zero on any failure.
import { readFileSync, existsSync } from 'fs';
import { basename, resolve } from 'path';
const dir = process.argv[2];
if (!dir) { console.error('usage: node selfcheck.mjs <templateDir>'); process.exit(1); }
const J = f => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
const schema = J('schema.json'), data = J('data.json'), manifest = J('manifest.json');
const html = readFileSync(`${dir}/template.html`, 'utf8');
let fail = 0; const bad = m => { console.log('  ✗ ' + m); fail++; };
const warn = m => console.log('  ⚠ ' + m);
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
// Referenced files exist on disk — the browser-free equivalent of the headless
// screenshot's "request failed" (missing image/font) check, so a no-browser run
// still catches a broken asset path.
const refs = new Set();
for (const m of html.matchAll(/(?:src=|href=|url\()\s*["']?((?:assets|fonts)\/[^"')\s]+)/g)) refs.add(m[1]);
const walk = v => { if (typeof v === 'string') { if (/^(assets|fonts)\//.test(v)) refs.add(v); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { typeof v.src === 'string' ? walk(v.src) : Object.values(v).forEach(walk); } };
walk(data);
for (const f of refs) if (!existsSync(`${dir}/${f}`)) bad(`referenced file missing on disk: ${f}`);
if (!/window\.renderFlyer\s*=\s*render/.test(html)) bad('window.renderFlyer = render missing');
if (manifest.id !== basename(resolve(dir))) bad(`manifest.id '${manifest.id}' != folder '${basename(resolve(dir))}'`);

// ── MLS autofill layer (contract §5.5): image roles + mapping.json ──
const isImageLike = f => f.type === 'image' || (f.type === 'list' && f.itemType === 'image');
for (const f of schema.fields) {
  if (f.role != null && f.role !== 'property' && f.role !== 'branding') bad(`schema '${f.key}' role "${f.role}" invalid (allowed: property|branding)`);
  if (f.role != null && !isImageLike(f)) bad(`schema '${f.key}' has a role on a non-image field (role applies to image or list-of-image)`);
}
const imageFields = schema.fields.filter(isImageLike);
const propertySlots = imageFields.filter(f => f.role === 'property');
const textKinds = new Set(['text', 'richText']);
if (existsSync(`${dir}/mapping.json`)) {
  let mapping; try { mapping = J('mapping.json'); } catch { bad('mapping.json is not valid JSON'); mapping = null; }
  if (mapping) {
    const fields = mapping.fields || {};
    if (Object.keys(fields).length === 0) warn('mapping.json has no fields — a listing build will fill nothing');
    for (const k of Object.keys(fields)) {
      if (!schemaKeys.has(k)) bad(`mapping.json key '${k}' has no schema field`);
      else if (!textKinds.has(get(schema.fields.find(f => f.key === k), 'type'))) bad(`mapping.json key '${k}' maps a non-text field (only text/richText map; photos use role:"property")`);
    }
    if (imageFields.length > 0 && propertySlots.length === 0) warn('mapping.json present but NO image field has role:"property" — MLS photos will not place');

    // Agent-branding maps (contract §5.5): { "<schema.key>": "<token>" }. Tokens
    // mirror the app's brandingValue() vocabulary in lib/branding.ts. `agent`
    // fills from the signed-in agent; `coAgent` (two-agent templates) fills the
    // SECONDARY agent block from the picked co-agent — same tokens, same rules.
    const TEXT_TOKENS = new Set(['name', 'title', 'phone', 'email', 'dre', 'office', 'website']);
    const IMAGE_TOKENS = new Set(['headshot', 'logo']);
    const LIST_TOKENS = new Set(['creds', 'contact']); // composite — target must be list
    const checkBrandingMap = (map, label) => {
      for (const [k, token] of Object.entries(map || {})) {
        const sf = schema.fields.find(f => f.key === k);
        if (!sf) { bad(`mapping.json ${label} key '${k}' has no schema field`); continue; }
        if (!TEXT_TOKENS.has(token) && !IMAGE_TOKENS.has(token) && !LIST_TOKENS.has(token))
          bad(`mapping.json ${label} '${k}' → unknown token "${token}" (allowed: ${[...TEXT_TOKENS, ...IMAGE_TOKENS, ...LIST_TOKENS].join(', ')})`);
        else if (IMAGE_TOKENS.has(token) && !isImageLike(sf))
          bad(`mapping.json ${label} '${k}' → image token "${token}" but field is not an image`);
        else if (LIST_TOKENS.has(token) && sf.type !== 'list')
          bad(`mapping.json ${label} '${k}' → composite token "${token}" must target a type:"list" field (got "${sf.type}")`);
        else if (TEXT_TOKENS.has(token) && !textKinds.has(sf.type))
          bad(`mapping.json ${label} '${k}' → text token "${token}" but field is type "${sf.type}" (expected text/richText)`);
      }
    };
    checkBrandingMap(mapping.agent, 'agent');
    checkBrandingMap(mapping.coAgent, 'coAgent');
  }
} else if (propertySlots.length > 0) {
  warn('schema has role:"property" photos but no mapping.json — listing TEXT will not fill (add mapping.json) — OK only if branding-only by design');
}
for (const f of propertySlots) if (!Array.isArray(f.classifyHints) || f.classifyHints.length === 0) warn(`property photo '${f.key}' has no classifyHints (placement works, match quality lower)`);

// ── Editor↔template message-contract handlers (contract §6.4) ──
// Detection mirrors lib/templateContract.ts's own string-based detect regexes
// (matching the quoted message-type literal in a comparison is enough — that's
// how the app itself decides whether a stored template already handles a type
// vs. needs the serve-time polyfill). WARN, not fail: a template author may
// have implemented a handler in a form this regex doesn't recognize, and this
// check can't run a browser to prove behavior either way.
const CONTRACT_MESSAGE_TYPES = [
  'render', 'set-edit-mode', 'highlight', 'clear-highlight', 'mark-overflow',
  'mark-provisional', 'mark-placeholder', 'locate-field', 'flash-field',
];
for (const type of CONTRACT_MESSAGE_TYPES) {
  const detect = new RegExp(`["']${type}["']`);
  if (!detect.test(html)) warn(`no reference to message type "${type}" found in template.html — confirm the editor↔template contract handler for it is implemented (contract §6.4)`);
}

console.log(fail === 0 ? 'ALL STRUCTURAL CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`);
process.exit(fail ? 1 : 0);
