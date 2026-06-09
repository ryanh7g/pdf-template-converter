---
name: pdf-to-template
description: >-
  Convert a print-ready PDF (real-estate flyer, business card, postcard,
  brochure page) into a self-contained "Marketing Builder" template folder
  (manifest.json, schema.json, data.json, rules.json, template.html, fonts/,
  assets/, thumbnail.jpg). Use when the user gives a PDF and asks to turn it
  into an editable template, convert it for the marketing platform, or
  "templatize" a finished design. Handles trim/bleed, page rotation, font
  sourcing/substitution, asset extraction, and automated visual self-checks.
allowed-tools: >-
  Bash(node *), Bash(npm *), Bash(npx *), Read, Write, Edit, Glob, Grep,
  AskUserQuestion
---

# PDF → Marketing-Builder Template

You convert one source PDF into a template folder that conforms **exactly** to
the platform contract in `reference/contract.md`. Read that file once at the
start of every job — it is the source of truth for folder shape, the four-way
binding model, the bleed mechanism, and the verbatim JS zone. **Do not "improve"
the contract.**

`SCRIPTS=${CLAUDE_SKILL_DIR}/scripts` — the bundled engine. `REF=${CLAUDE_SKILL_DIR}/reference`.

## The split that makes this reliable
The scripts do the mechanical, exact work (probe, render, measure, crop,
self-check). **You** do the judgment: interpreting geometry, choosing fonts,
framing asset crops, and the final visual comparison. Never skip the judgment
gates below — especially fonts.

## Method

**0. Preflight (always first).**
`node $SCRIPTS/preflight.mjs` — installs deps and confirms a headless browser.
If it exits non-zero, relay its plain-English message to the user and stop; do
not try to hand-fix the toolchain.

**1. Probe.** `node $SCRIPTS/probe.mjs <pdf>` → JSON: pages, rotation,
`trimPt`/`trimIn`, `bleedIn`, `bleedOffsetPt`, every text run in DISPLAY coords
(top-left origin) with its real BaseFont, and a font inventory.
- Trim = the finished size (manifest.trim). Bleed = `bleedIn` (often 0, or
  0.125 if TrimBox is inset from MediaBox).
- **Rotation:** if `rotate` is 90/270, the page is landscape; coordinates are
  already in display space. **Subtract `bleedOffsetPt` from each x and y** to get
  trim-relative (`.sheet`) coordinates used in the CSS.

**2. Render & measure.** `node $SCRIPTS/render.mjs <pdf> work 300`.
Open `work/page-N.png` to measure boxes the text probe can't give you (rule
lines, color bands, photo frames). Use `sample.mjs` for colors/edges and
`images.mjs` for raster photo placements. Record `left/top/width/height` in
points for every element.

**3. Extract assets** into the template's `assets/`:
- Raster photos: copy the embedded images (or re-crop from the render).
- Vector marks (logos, icons, QR, stat icons are NOT raster XObjects): crop them
  from the render with `crop.mjs`, e.g.
  `node $SCRIPTS/crop.mjs work/page-1.png 300 '[["logo",68,63,117,17]]' tmp`.

**4. Fonts — JUDGMENT GATE (do not skip).** From the probe inventory:
- Identify each typeface and whether it is `subset` and/or commercial.
- Open-licensed fonts (e.g. Lato, OFL): download the FULL weights you use and
  bundle them. Never bundle a PDF-embedded subset and pretend it covers
  arbitrary text.
- Commercial / unclear-license fonts (e.g. BentonSans): **use AskUserQuestion**
  to make the user choose: (a) provide a licensed full font file, or (b)
  substitute a free look-alike (Public Sans is a close Benton-Gothic match;
  Lato is a general fallback). Record the real license in `manifest.fonts[]` and
  note any substitution in `rules.json`.
- When the user provides a font, run `node $SCRIPTS/fontcheck.mjs <file> "<sample strings>"`
  to confirm it is a full face covering the content, then rename to the exact
  filenames the `@font-face` expects and match the `format()` to the file type
  (`.otf` → `opentype`, `.ttf` → `truetype`).

**5. Build `template.html`** from `$REF/template-skeleton.html`. Customize ONLY:
(1) the `@font-face` + per-element CSS, (2) the page `<section>` DOM, (3) the
body of `render()`. **Keep everything else byte-for-byte**, especially the
bleed CSS structure and the entire edit-mode/messaging/boot JS.
- One `<section class="page">` per page. Inset content is `position:absolute` in
  pt on `.sheet`, in trim coordinates.
- Full-bleed art: a solid page background reaches the bleed cleanly when painted
  on `.page` (the media box) — e.g. `#page2.page{ background:var(--navy); }` —
  with `.sheet` left transparent. For full-bleed PHOTOS, use the `body.mb-bleed`
  overscan pattern from the contract.
- Every editable node needs `id="f-…"`, `data-field="<key>"` (and `data-index`
  for list images), plus a matching `render()` binding.

**6. Write the JSON.** `data.json` (real extracted content + fixed render-only
strings), `schema.json` (editable subset; compute image `aspect`/`minPx` per the
contract), `rules.json` (thorough `pageIntent`, `subsetFonts`, font notes),
`manifest.json` (`id` MUST equal the folder name; list every font + asset).

**7. Self-verify (all must pass).** Serve, then:
- `node $SCRIPTS/serve.cjs <templateDir> 8137 &`
- `node $SCRIPTS/selfcheck.mjs <templateDir>` — four-way sync + constraints + self-containment.
- `node $SCRIPTS/verbatim-diff.mjs <templateDir>` — contract JS zone unchanged.
- `SHOOT_SEL="#page1" node $SCRIPTS/shoot.mjs http://localhost:8137/template.html work/r1.png 850 1100`
  (one per page) — must report no console/asset errors (catches blank glyphs / missing images).
- `node $SCRIPTS/compare.mjs work/page-1.png work/r1.png work/cmp1.jpg` — open it and
  fix geometry/typography drift against the original.
- If `bleedIn > 0`: `node $SCRIPTS/export-pdf.mjs <url> work/out.pdf <mediaWin> <mediaHin> <bleedIn>`,
  rerender it, and confirm backgrounds reach all four media edges (no white strips).
- Generate `thumbnail.jpg` from the page-1 screenshot; set `manifest.thumbnail`.

**8. Report** honestly: state any font substitution, low-res default image, or
guessed measurement — those are what a human must confirm before shipping.

## Gotchas (hard-won)
- **manifest.id == folder name**, always. The editor 404s otherwise.
- **PDF Y is bottom-left; CSS is top-left.** The probe already flips text to
  display coords; for raster boxes use `top = pageHeight − pdfY − height`.
- **Rotated pages** (business cards): subtract the bleed offset to reach trim
  coords, and verify raster boxes visually — `images.mjs` is best-effort under rotation.
- **Subset fonts** render blank boxes on edited text. Either bundle a full
  licensed face or declare `fontSubset:true` + `rules.json.subsetFonts`.
- **`@page` must NOT set `size`** — the exporter passes explicit width/height.
- **Never edit the verbatim JS** outside `render()`'s body; `verbatim-diff.mjs` enforces this.
