#!/usr/bin/env node
// fontcheck.mjs <fontFile> [string1] [string2] ...
// Reports family/subfamily/glyph count and whether the font covers the given
// strings (and a baseline Latin set). Use it to (a) confirm a user-provided
// font is a FULL face, not a subset, and (b) verify it covers the default
// content before you rely on it. Catches the "blank box on edited text" trap.
import * as fontkitNS from 'fontkit';
const fontkit = fontkitNS.default || fontkitNS;
const [, , file, ...strings] = process.argv;
if (!file) { console.error('usage: node fontcheck.mjs <fontFile> [strings...]'); process.exit(1); }
const font = fontkit.openSync(file);
console.log(`family: ${font.familyName} | subfamily: ${font.subfamilyName} | glyphs: ${font.numGlyphs} | outlines: ${font.type}`);
const latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#&.,-|/():;!?\'"%$+ ®';
const missingFrom = s => [...s].filter(ch => ch !== ' ' && !font.hasGlyphForCodePoint(ch.codePointAt(0)));
const baseMiss = missingFrom(latin);
console.log('baseline Latin coverage:', baseMiss.length ? 'MISSING ' + JSON.stringify(baseMiss) : 'complete');
for (const s of strings) {
  const m = missingFrom(s);
  console.log(`  "${s.slice(0, 40)}${s.length > 40 ? '…' : ''}": ` + (m.length ? 'MISSING ' + JSON.stringify(m) : 'covered'));
}
process.exit(baseMiss.length ? 1 : 0);
