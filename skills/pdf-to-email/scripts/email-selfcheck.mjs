#!/usr/bin/env node
// email-selfcheck.mjs <kitDir>
// Structural + compile-safety QA for a pdf-to-email kit.json, mirroring
// pdf-to-template/scripts/selfcheck.mjs's style and rigor (reference/
// email-contract.md §6 is the authoritative check list). Exits non-zero on
// any FAIL. Mirrors the marketing-builder runtime it targets:
//   lib/types.ts (EmailKit/BlockDef/SchemaField), lib/emailBlocks.ts
//   (renderDataDrivenBlock/escapeHtml/richTextToHtml/safeUrl), lib/branding.ts
//   (BRANDING_TOKENS). This script does NOT import that app (separate repo) —
//   it reimplements the same small, pure interpolation/escaping rules so the
//   compile-safety check exercises the identical contract offline.
import { readFileSync, existsSync } from 'fs';
import { basename, resolve } from 'path';

const dir = process.argv[2];
if (!dir) { console.error('usage: node email-selfcheck.mjs <kitDir>'); process.exit(1); }

let fail = 0;
const bad = (m) => { console.log('  ✗ ' + m); fail++; };
const warn = (m) => console.log('  ⚠ ' + m);
const ok = (m) => console.log('  ✓ ' + m);

// ---- 1. kit.json parses + top-level shape ---------------------------------
const kitPath = `${dir}/kit.json`;
if (!existsSync(kitPath)) { console.error(`no kit.json in ${dir}`); process.exit(1); }
let kit;
try {
  kit = JSON.parse(readFileSync(kitPath, 'utf8'));
} catch (e) {
  console.error(`kit.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

const REQUIRED_TOP = ['id', 'name', 'description', 'theme', 'blocks', 'primitives', 'structure'];
for (const k of REQUIRED_TOP) if (!(k in kit)) bad(`kit.json missing top-level key "${k}"`);

const folderName = basename(resolve(dir));
if (kit.id !== folderName) bad(`kit.json id "${kit.id}" != folder "${folderName}"`);

// ---- 2. theme ---------------------------------------------------------------
const THEME_KEYS = ['brandColor', 'accent', 'fontFamily', 'textColor', 'backgroundColor'];
const theme = kit.theme || {};
for (const k of THEME_KEYS) {
  if (typeof theme[k] !== 'string' || theme[k].trim() === '') bad(`theme.${k} missing or not a non-empty string`);
}
if (theme.contentWidth != null && typeof theme.contentWidth !== 'number') bad('theme.contentWidth must be a number when present');
// Email-safety: fontFamily should read as a stack (comma-separated, generic fallback), not a single custom face.
if (typeof theme.fontFamily === 'string') {
  const looksLikeStack = /,/.test(theme.fontFamily) && /(serif|sans-serif|monospace|cursive|fantasy)\s*$/i.test(theme.fontFamily.trim());
  if (!looksLikeStack) warn(`theme.fontFamily "${theme.fontFamily}" doesn't look like a system stack ending in a generic family (serif/sans-serif/...) — confirm it's not a single custom @font-face-only face`);
}

const blocks = Array.isArray(kit.blocks) ? kit.blocks : [];

// ---- 3. unique block types ---------------------------------------------------
const seenTypes = new Set();
for (const b of blocks) {
  if (!b.type) { bad('a block is missing "type"'); continue; }
  if (seenTypes.has(b.type)) bad(`duplicate block type "${b.type}"`);
  seenTypes.add(b.type);
}

const PRIMITIVES = new Set(Array.isArray(kit.primitives) ? kit.primitives : []);
const KNOWN_TYPES = new Set([...seenTypes, ...PRIMITIVES]);

// ---- helpers shared by checks 4-7 -------------------------------------------
const isImageLike = (f) => f.type === 'image' || (f.type === 'list' && f.itemType === 'image');
const TEXT_KINDS = new Set(['text', 'richText']);

const BRANDING_TOKENS = new Set(['name', 'title', 'phone', 'email', 'dre', 'office', 'website', 'headshot', 'logo', 'creds', 'contact']);
const IMAGE_TOKENS = new Set(['headshot', 'logo']);
const LIST_TOKENS = new Set(['creds', 'contact']);

const THEME_TOKEN_KEYS = new Set(['brandColor', 'accent', 'fontFamily', 'textColor', 'backgroundColor', 'contentWidth']);

// RESO token vocabulary this contract documents (§4.1). Unrecognized tokens
// warn (not fail) — a real listing record may carry fields beyond this list.
const KNOWN_RESO_TOKENS = new Set([
  'StreetNumber', 'StreetName', 'City', 'StateOrProvince', 'PostalCode',
  'BedroomsTotal', 'BathroomsTotalInteger', 'LivingArea', 'LotSizeSquareFeet',
  'ListPriceUSD', 'ListPrice', 'PublicRemarks', 'OpenHouse',
]);

const INTERPOLATION_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

for (const b of blocks) {
  const fields = Array.isArray(b.fields) ? b.fields : [];
  const fieldsByKey = new Map(fields.map((f) => [f.key, f]));

  // ---- 4. every {{key}} resolves ----
  if (typeof b.mjml === 'string') {
    for (const m of b.mjml.matchAll(INTERPOLATION_RE)) {
      const key = m[1];
      if (key.startsWith('theme.')) {
        const token = key.slice('theme.'.length);
        if (!THEME_TOKEN_KEYS.has(token)) bad(`block "${b.type}": {{${key}}} is not a valid theme token`);
      } else if (!fieldsByKey.has(key)) {
        bad(`block "${b.type}": {{${key}}} does not match any field in this block's fields[] (dangling reference)`);
      }
    }
  } else if (b.mjml != null) {
    bad(`block "${b.type}": mjml must be a string when present`);
  }

  for (const f of fields) {
    if (!f.key) { bad(`block "${b.type}": a field is missing "key"`); continue; }

    // ---- 5. listingField tokens ----
    if (typeof f.listingField === 'string') {
      if (!TEXT_KINDS.has(f.type)) bad(`block "${b.type}" field "${f.key}": listingField set on a non-text/richText field (type "${f.type}")`);
      for (const m of f.listingField.matchAll(/\$\{(\w+)\}/g)) {
        if (!KNOWN_RESO_TOKENS.has(m[1])) warn(`block "${b.type}" field "${f.key}": listingField references unrecognized RESO token "${m[1]}"`);
      }
    }

    // ---- 6. brandingToken / brandingAgent ----
    if (f.brandingToken != null || f.brandingAgent != null) {
      if (!f.brandingToken) bad(`block "${b.type}" field "${f.key}": brandingAgent set without brandingToken`);
      else if (!BRANDING_TOKENS.has(f.brandingToken)) bad(`block "${b.type}" field "${f.key}": brandingToken "${f.brandingToken}" not in BRANDING_TOKENS`);
      if (!f.brandingAgent) bad(`block "${b.type}" field "${f.key}": brandingToken set without brandingAgent`);
      else if (f.brandingAgent !== 'primary' && f.brandingAgent !== 'secondary') bad(`block "${b.type}" field "${f.key}": brandingAgent "${f.brandingAgent}" must be "primary" or "secondary"`);
      if (f.brandingToken && IMAGE_TOKENS.has(f.brandingToken) && !isImageLike(f)) bad(`block "${b.type}" field "${f.key}": brandingToken "${f.brandingToken}" is an image token but field is type "${f.type}"`);
      if (f.brandingToken && LIST_TOKENS.has(f.brandingToken) && f.type !== 'list') bad(`block "${b.type}" field "${f.key}": brandingToken "${f.brandingToken}" is a composite (list) token but field is type "${f.type}"`);
      if (f.brandingToken && !IMAGE_TOKENS.has(f.brandingToken) && !LIST_TOKENS.has(f.brandingToken) && !TEXT_KINDS.has(f.type)) bad(`block "${b.type}" field "${f.key}": brandingToken "${f.brandingToken}" is a text token but field is type "${f.type}"`);
    }

    // ---- 7. role / classifyHints ----
    if (f.role != null) {
      if (f.role !== 'property' && f.role !== 'branding') bad(`block "${b.type}" field "${f.key}": role "${f.role}" invalid (allowed: property|branding)`);
      else if (!isImageLike(f)) bad(`block "${b.type}" field "${f.key}": role set on a non-image field`);
      if (f.role === 'property' && f.brandingToken) bad(`block "${b.type}" field "${f.key}": role:"property" AND brandingToken both set (mutually exclusive fill sources)`);
      if (f.role === 'property' && (!Array.isArray(f.classifyHints) || f.classifyHints.length === 0)) warn(`block "${b.type}" field "${f.key}": role:"property" with no classifyHints (placement works, match quality lower)`);
    }
    if (f.role === 'property' && !isImageLike(f)) bad(`block "${b.type}" field "${f.key}": role:"property" must be on an image (or list-of-image) field`);
  }
}

// ---- 8. structure satisfiability ---------------------------------------------
const structure = kit.structure || {};
const required = Array.isArray(structure.required) ? structure.required : [];
const singleton = Array.isArray(structure.singleton) ? structure.singleton : [];
const defaultComposition = Array.isArray(structure.defaultComposition) ? structure.defaultComposition : [];

for (const t of required) if (!KNOWN_TYPES.has(t)) bad(`structure.required references unknown block type "${t}"`);
for (const t of singleton) if (!KNOWN_TYPES.has(t)) bad(`structure.singleton references unknown block type "${t}"`);

const compTypeCounts = new Map();
for (const inst of defaultComposition) {
  if (!inst.type || !KNOWN_TYPES.has(inst.type)) bad(`structure.defaultComposition instance "${inst.id ?? '?'}" has unknown type "${inst.type}"`);
  compTypeCounts.set(inst.type, (compTypeCounts.get(inst.type) || 0) + 1);
}
for (const t of required) if (!compTypeCounts.has(t)) bad(`structure.required includes "${t}" but defaultComposition has no instance of it — unsatisfiable`);
for (const t of singleton) if ((compTypeCounts.get(t) || 0) > 1) bad(`structure.singleton includes "${t}" but defaultComposition has ${compTypeCounts.get(t)} instances of it`);
// duplicate instance ids
const ids = defaultComposition.map((i) => i.id);
const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
for (const id of new Set(dupIds)) bad(`structure.defaultComposition has duplicate instance id "${id}"`);

if (fail === 0) ok('structural checks (1-8) passed');

// ---- 9. compile-safety: mjml2html on every block with sample values -------
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function richTextToHtml(raw) {
  if (!raw || raw.trim() === '') return '';
  return escapeHtml(raw).split(/\n{2,}/).map((p) => `<p style="margin:0 0 10px;">${p.replace(/\n/g, '<br/>')}</p>`).join('');
}
function safeUrl(value) {
  const s = value.trim();
  if (/^https?:\/\/[^\s]+$/i.test(s)) return s;
  if (s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\')) return s;
  return '';
}
function sampleValueFor(f) {
  if (f.type === 'image') return 'https://example.com/sample.jpg';
  if (f.type === 'richText') return 'Sample paragraph one.\n\nSample paragraph two, with a line break.';
  if (f.type === 'list') return f.itemType === 'image' ? ['https://example.com/a.jpg'] : ['Sample line'];
  if (f.type === 'enum') return (f.constraints && f.constraints.values && f.constraints.values[0]) || 'sample';
  return 'Sample text';
}
function renderDataDrivenBlockSample(def, theme) {
  const fieldsByKey = new Map((def.fields || []).map((f) => [f.key, f]));
  const errors = [];
  const mjml = (def.mjml || '').replace(INTERPOLATION_RE, (_m, key) => {
    if (key.startsWith('theme.')) {
      const token = key.slice('theme.'.length);
      const value = theme[token];
      if (value === undefined || value === null) { errors.push(`unknown theme token {{${key}}}`); return ''; }
      return escapeHtml(String(value));
    }
    const field = fieldsByKey.get(key);
    if (!field) { errors.push(`unknown field {{${key}}}`); return ''; }
    const raw = sampleValueFor(field);
    if (raw === undefined || raw === null) return '';
    if (field.type === 'richText') return richTextToHtml(String(raw));
    if (field.type === 'image') return escapeHtml(safeUrl(String(raw)));
    return escapeHtml(String(raw));
  });
  return { mjml, errors };
}

let mjml2html = null;
try {
  ({ default: mjml2html } = await import('mjml'));
} catch {
  warn('mjml is not installed in scripts/node_modules — run `npm install` in this skill\'s scripts/ directory to enable the compile-safety check (step 9 SKIPPED, not passed)');
}

if (mjml2html) {
  const width = theme.contentWidth || 600;
  const fontFamily = theme.fontFamily || 'Arial, Helvetica, sans-serif';
  for (const b of blocks) {
    if (typeof b.mjml !== 'string' || b.mjml.trim() === '') continue;
    const { mjml: rendered } = renderDataDrivenBlockSample(b, { ...theme, fontFamily });
    const doc = `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="${fontFamily}" />
      <mj-text color="${theme.textColor || '#333333'}" font-family="${fontFamily}" font-size="14px" />
      <mj-button font-family="${fontFamily}" />
    </mj-attributes>
  </mj-head>
  <mj-body width="${width}px" background-color="${theme.backgroundColor || '#ffffff'}">
    ${rendered}
  </mj-body>
</mjml>`;
    let result;
    try {
      result = mjml2html(doc, { validationLevel: 'soft' });
    } catch (e) {
      bad(`block "${b.type}": mjml2html threw: ${e.message}`);
      continue;
    }
    for (const e of result.errors || []) {
      bad(`block "${b.type}": MJML compile error: ${e.formattedMessage || e.message}`);
    }
  }
  if (fail === 0) ok('compile-safety check (9): all blocks compiled with zero MJML errors');
}

// ---- asset path discipline (10) --------------------------------------------
// Every asset reference ANYWHERE in the kit (defaultComposition data, block
// mjml, theme) must be the app's absolute form `/templates/<kit-id>/assets/…`
// with <kit-id> == this folder, and the file must exist on disk. Two failure
// modes this catches (both shipped 2026-07-21 and broke the deployed kits):
//   1. a working-title id baked into paths (/templates/sg-minimal-email/…
//      while the folder shipped as minimal-email-solo) → every image 404s;
//   2. bare relative `assets/…` refs → 404 in the editor's srcdoc preview.
{
  const strings = new Set();
  const walk = (v) => {
    if (typeof v === 'string') strings.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(kit);
  let assetFail = 0;
  for (const s of strings) {
    for (const m of s.matchAll(/\/templates\/([^/\s"']+)\/((?:assets|[^\s"']+)\/[^\s"')]+)/g)) {
      if (m[1] !== folderName) { bad(`asset path "${m[0]}" uses id "${m[1]}" but the kit folder is "${folderName}" — use /templates/${folderName}/… (no working-title ids)`); assetFail++; continue; }
      if (!existsSync(`${dir}/${m[2]}`)) { bad(`asset path "${m[0]}" has no file at ${dir}/${m[2]}`); assetFail++; }
    }
    if (/^assets\//.test(s)) { bad(`relative asset ref "${s}" — the editor previews via srcdoc (no base URL); use /templates/${folderName}/${s}`); assetFail++; }
  }
  if (assetFail === 0) ok('asset path discipline (10): every /templates/<id>/ ref matches the folder id and resolves on disk');
}

console.log(fail === 0 ? '\nALL CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`);
process.exit(fail ? 1 : 0);
