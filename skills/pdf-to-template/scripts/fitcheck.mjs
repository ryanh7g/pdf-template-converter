#!/usr/bin/env node
// fitcheck.mjs <templateDir>
//
// Audits the two autofit bug classes that the ENGINE CANNOT DETECT ITSELF
// (contract §6.4b). Both are properties of the widths YOU set, and both have
// already shipped broken templates:
//
//   (a) A fit target with NO EXPLICIT WIDTH. An absolutely-positioned element
//       shrink-wraps its content, so scrollWidth === clientWidth always and the
//       engine silently does nothing. Hit on the Mod `.price`.
//
//   (b) A fit target that RUNS PAST THE TRIM EDGE. The engine fits the text to
//       the declared box, so a box hanging off the page produces type that is
//       trimmed away at the guillotine — invisible on screen, gone on paper.
//
//   (c) A fit target WIDER THAN THE GAP to the next element on its row. The
//       engine only knows its own box, so it fits the text to a width that
//       something else paints over. On AVANT PC-8 a 200pt agent name sat in a
//       170pt gap and the co-agent headshot covered the last 30pt:
//       `ALEXANDRA MONTGOM▌`. Five instances across 24 postcards.
//
// No browser: this reads the static CSS, which is where those widths are
// declared, and the DOM to learn which PAGE each class sits on — two elements
// with the same `top` on different pages are not neighbours, and comparing them
// produced a false "crossing" on the first real template this was run against. It therefore sees ONLY rules with literal pt/in geometry — the same
// thing a human would check by eye, done exhaustively. Anything positioned by a
// mechanism it cannot read is REPORTED AS UNCHECKED rather than passed, because
// silence would read as approval.
//
// Exits non-zero on (a), (b) or (c). Warnings do not fail.
import { readFileSync } from 'fs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node fitcheck.mjs <templateDir>'); process.exit(1); }
const html = readFileSync(`${dir}/template.html`, 'utf8');

let fail = 0;
const bad  = m => { console.log('  ✗ ' + m); fail++; };
const warn = m => console.log('  ⚠ ' + m);
const ok   = m => console.log('  ✓ ' + m);

// ── the engine's own target list, read from the template ──────────────────
const ftMatch = html.match(/FIT_TARGETS\s*=\s*["']([^"']+)["']/);
if (!ftMatch) {
  // The Sectional family uses the OLDER engine (`[data-fit]` attributes,
  // shrinking letter-spacing before font-size). Saying "no autofit" about those
  // would be wrong, so look before reporting.
  const older = /\[data-fit\]|data-fit=/.test(html);
  console.log(older
    ? '\nfitcheck: this template uses the OLDER [data-fit] engine (contract §6.4b).'
    : '\nfitcheck: no autofit in this template.');
  console.log(older
    ? '  Its targets are declared as attributes, not a FIT_TARGETS selector list, so\n  the width checks below do not apply. Audit it by hand.'
    : '  Not universal — a template with no tracked display type legitimately has none.\n  If this one DOES have a long address or agent name in a fixed box, see §6.4b.');
  console.log('');
  process.exit(0);
}
const targets = ftMatch[1].split(',').map(s => s.trim()).filter(Boolean);

// ── which PAGE does each class appear on? ─────────────────────────────────
// Every page is its own coordinate space. Without this, an element at top:100pt
// on page 2 "overlaps" one at top:100pt on page 1 and the audit reports a
// crossing that cannot happen. Found on the first real template it was run on.
const pageOf = new Map(); // class -> Set(sectionIndex)
{
  const sections = [...html.matchAll(/<section\b[^>]*>/g)].map(m => m.index);
  const sectionAt = (i) => {
    let n = -1;
    for (let k = 0; k < sections.length; k++) if (sections[k] <= i) n = k;
    return n;
  };
  for (const m of html.matchAll(/class="([^"]+)"/g)) {
    const sec = sectionAt(m.index);
    if (sec < 0) continue;
    for (const c of m[1].split(/\s+/).filter(Boolean)) {
      if (!pageOf.has(c)) pageOf.set(c, new Set());
      pageOf.get(c).add(sec);
    }
  }
}
/** Do these two selectors ever appear on the same page? Unknown = assume yes,
 *  so an unreadable case is examined rather than silently skipped. */
function sharePage(selA, selB) {
  const a = pageOf.get(selA.replace(/^\./, "")), b = pageOf.get(selB.replace(/^\./, ""));
  if (!a || !b) return true;
  for (const x of a) if (b.has(x)) return true;
  return false;
}

// ── CSS rules with literal geometry ───────────────────────────────────────
// Only the <style> block; inline styles are handled separately below.
const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const css = styleBlocks.replace(/\/\*[\s\S]*?\*\//g, '');

const toPt = (v) => {
  const m = /^(-?[\d.]+)(pt|in|px)$/.exec(v.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === 'pt' ? n : m[2] === 'in' ? n * 72 : n * 0.75; // px at 96dpi
};

/** Every declaration block for a selector, merged in source order. */
function declsFor(sel) {
  const out = {};
  const re = new RegExp(`(^|[,}])\\s*([^{}]*${sel.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[^{}]*)\\{([^}]*)\\}`, 'g');
  for (const m of css.matchAll(re)) {
    // The selector list must contain this exact target as one of its parts.
    const parts = m[2].split(',').map(s => s.trim());
    if (!parts.some(p => p === sel || p.endsWith(` ${sel}`) || p.startsWith(`${sel} `) || p === sel.replace(/^\./, '.'))) continue;
    for (const d of m[3].split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
  }
  return out;
}

console.log(`\nfitcheck — ${targets.length} fit target(s)\n`);

// ── (a) explicit width ────────────────────────────────────────────────────
const boxes = [];
for (const sel of targets) {
  // EVERY CLASS ON THE ELEMENT, not just this one.
  //
  // A fit target rarely carries its geometry on its own class:
  // `class="abs blk-1 ag-name ln-name"` gets its width from `.blk-1`. Checking
  // the `.ag-name` rule alone reported 84 shrink-wrapping targets across the
  // library, and a browser pass proved almost none of them real. Composing the
  // element's full class list is what makes this check honest.
  const cls = sel.replace(/^\./, '');
  const companions = new Set([sel]);
  for (const m of html.matchAll(new RegExp(`class="([^"]*\\b${cls}\\b[^"]*)"`, 'g'))) {
    for (const c of m[1].split(/\s+/).filter(Boolean)) companions.add('.' + c);
  }
  const d = {};
  for (const c of companions) Object.assign(d, declsFor(c));
  const inlineHasWidth = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*style="[^"]*width\\s*:`).test(html);
  const w = d.width ? toPt(d.width) : null;

  if (!d.width && !inlineHasWidth) {
    // A WARNING, NOT A FAILURE — and the demotion was earned.
    //
    // The first version failed on this and reported 84 shrink-wrapping targets
    // across 33 templates. A browser pass measured all 45 and found ZERO boxes
    // that actually grow with their text: the widths come from a companion
    // class, a parent, or a shorthand this parser cannot follow. Composing the
    // element's full class list cut it to 9, and every one of those 9 also
    // measured fixed in the browser.
    //
    // Static analysis can prove a width is DECLARED. It cannot prove one is
    // ABSENT. So this points at fitprobe rather than pretending to an answer.
    warn(`${sel} — no explicit width found on ${[...companions].join(' ')}. If it really shrink-wraps, autofit can never fire (§6.4b trap a) — but this check CANNOT see widths from a parent or shorthand. Confirm with: node fitprobe.mjs <templateDir>`);
    continue;
    continue;
  }
  if (w === null) {
    warn(`${sel} width is "${d.width}" — not literal pt/in/px, so its box cannot be checked here. Verify by eye.`);
    continue;
  }
  const left = d.left ? toPt(d.left) : null;
  boxes.push({ sel, left, width: w, top: d.top ? toPt(d.top) : null });
  ok(`${sel} has an explicit width (${w.toFixed(1)}pt)`);
}

// ── (b) does the box run off the trim? ────────────────────────────────────
// The trim width lives in the CSS custom property the skeleton sets. A box that
// extends past it produces type the guillotine removes — correct on screen,
// missing on paper.
{
  const tw = /--trim-w:\s*([\d.]+)(pt|in)/.exec(css);
  const trimW = tw ? (tw[2] === "in" ? parseFloat(tw[1]) * 72 : parseFloat(tw[1])) : null;
  if (trimW === null) {
    warn("no --trim-w in the CSS — cannot check whether a fit target runs off the page");
  } else {
    let over = 0;
    for (const b of boxes) {
      if (b.left === null) continue;
      const right = b.left + b.width;
      if (right > trimW + 0.5) {
        over++;
        bad(
          `${b.sel} runs to ${right.toFixed(1)}pt on a ${trimW.toFixed(1)}pt trim — ` +
          `autofit fits the text to that box, so the overhang is cut off at the guillotine (§6.4b trap b)`,
        );
      }
    }
    if (!over) ok(`no fit target runs off the ${trimW.toFixed(1)}pt trim`);
  }
}

// ── (c) does the box cross its neighbour? ─────────────────────────────────
// Every absolutely-positioned element with literal left/top/width, fit target
// or not — a headshot is not a fit target but it is exactly what painted over
// the agent name.
const all = [];
for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
  const decl = {};
  for (const d of m[2].split(';')) {
    const i = d.indexOf(':');
    if (i > 0) decl[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  }
  if (!decl.left || !decl.top || !decl.width) continue;
  const left = toPt(decl.left), top = toPt(decl.top), width = toPt(decl.width);
  const height = decl.height ? toPt(decl.height) : null;
  if (left === null || top === null || width === null) continue;
  for (const sel of m[1].split(',').map(s => s.trim())) {
    if (sel) all.push({ sel, left, top, width, height });
  }
}

let crossings = 0, checkedRows = 0;
for (const b of boxes) {
  if (b.left === null || b.top === null) {
    warn(`${b.sel} has no literal left/top — cannot check it against its neighbours. Measure the gap by eye (§6.4b trap c).`);
    continue;
  }
  // "On the same row" = vertical overlap. Without a height, treat as a thin band
  // at `top`; a text line is short, so this is the conservative reading.
  const bBottom = b.top + (b.height ?? 1);
  const right = b.left + b.width;
  let nearest = null;
  for (const o of all) {
    if (o.sel === b.sel) continue;
    if (o.left <= b.left) continue;                 // only what sits to the RIGHT
    if (!sharePage(b.sel, o.sel)) continue;         // different pages are different spaces
    const oBottom = o.top + (o.height ?? 1);
    const overlaps = b.top < oBottom && o.top < bBottom;
    if (!overlaps) continue;
    if (!nearest || o.left < nearest.left) nearest = o;
  }
  if (!nearest) continue;
  checkedRows++;
  // A THRESHOLD, because adjacency is not collision. Boxes that abut are
  // normal — one template has a fit target ending 1.3pt into its neighbour,
  // which no reader will ever see. The PC-8 bug ate 30pt of a name. Six points
  // is roughly half a glyph at display size: below it, say so; above it, fail.
  const OVERLAP_PT = 6;
  const by = right - nearest.left;
  if (by > 0.5 && by <= OVERLAP_PT) {
    warn(
      `${b.sel} ends ${by.toFixed(1)}pt inside ${nearest.sel} — adjacency rather than a collision at this size, ` +
      `but tighten it if the two ever carry long values`,
    );
  } else if (by > OVERLAP_PT) {
    crossings++;
    bad(
      `${b.sel} runs to ${right.toFixed(1)}pt but ${nearest.sel} starts at ${nearest.left.toFixed(1)}pt — ` +
      `autofit will fit text into ${(right - nearest.left).toFixed(1)}pt that ${nearest.sel} paints over (§6.4b trap c). ` +
      `Set width to the GAP (${(nearest.left - b.left).toFixed(1)}pt), not the panel.`,
    );
  }
}
if (checkedRows && !crossings) ok(`no fit target crosses a neighbour (${checkedRows} row overlap(s) checked)`);
if (!checkedRows) warn('no fit target shares a row with another positioned element — trap (c) not exercised here');

console.log(fail ? `\nfitcheck: ${fail} problem(s)\n` : '\nfitcheck: passed\n');
process.exit(fail ? 1 : 0);
