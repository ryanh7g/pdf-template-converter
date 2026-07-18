---
name: pdf-to-template
description: >-
  Convert a print-ready PDF (real-estate flyer, business card, postcard,
  brochure page) into a self-contained "Marketing Builder" template folder
  (manifest.json, schema.json, data.json, rules.json, template.html, fonts/,
  assets/, thumbnail.jpg). Use when the user gives a PDF and asks to turn it
  into an editable template, convert it for the marketing platform, or
  "templatize" a finished design. Produces manifest/schema/data/rules/mapping
  JSON + template.html + fonts/assets/thumbnail. Handles trim/bleed, page
  rotation, font sourcing/substitution, asset extraction, MLS listing autofill
  (mapping.json + photo roles), and automated visual self-checks.
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
`node $SCRIPTS/preflight.mjs` — installs deps and prints a **MODE** line. If it
exits non-zero, relay its plain-English message and stop; do not hand-fix the
toolchain. Note the mode:
- **full** — a headless browser is available; do the pixel-accurate visual checks.
- **no-browser** — no Chromium (e.g. a Claude Cowork session). `shoot.mjs` and
  `export-pdf.mjs` CANNOT run; do **not** call them (they'll just fail). Use the
  browser-free verification path in step 7 instead. Everything else (probe, render
  the source, selfcheck, fontcheck) works unchanged.

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
strings), `schema.json` (editable subset; compute image `aspect`/`minPx`; **tag
image fields — `role:"property"` + `classifyHints` on listing photos,
`brandingAsset:true`/`role:"branding"` on headshot/logo** — per the contract),
`rules.json` (thorough `pageIntent`, `subsetFonts`, font notes), `manifest.json`
(`id` MUST equal the folder name; list every font + asset).

**6b. Write `mapping.json`** (contract §5.5) — has TWO sections:
- `fields` (UNLESS branding-only): map the listing-derived text keys (address,
  city, stats.*, description) to `${RESO}` tokens (`${StreetNumber}`, `${City}`,
  `${BedroomsTotal}`, `${PublicRemarks}`, …). This is what fills a design from an
  MLS listing; omit it and the template renders perfectly but fills NOTHING from a
  listing. Photos fill via the `role:"property"` tags from step 6, not here.
- `agent` (config-driven branding — **emit this so the agent block fills with no
  app code change**): map each agent schema key → a branding token from the
  contract §5.5 vocabulary (e.g. `"agent.name":"name"`, `"agent.dre":"dre"`,
  `"photos.headshot":"headshot"`, `"photos.agentLogo":"logo"`). The platform
  resolves the tokens against the signed-in agent's profile on create.
- `coAgent` (**two-agent templates only**): if the layout has a SECOND agent block
  (co-listing flyer, etc.), emit a `coAgent` map with the same token vocabulary but
  pointing at your SECONDARY agent keys (use distinct keys, e.g. `agent.secondary.*`
  / `photos.secondaryHeadshot`). It fills from a co-agent the user picks (or the
  listing's co-list agent). Single-agent templates emit `agent` only. Contract §5.5.

**7. Self-verify.** These run in BOTH modes (no browser needed) and must pass:
- `node $SCRIPTS/selfcheck.mjs <templateDir>` — four-way sync + constraints + the MLS
  layer (mapping keys ⊆ schema text keys; valid image `role`s; missing-asset on disk;
  warns if a listing template has no `mapping.json` or no `role:"property"` photos).
- `node $SCRIPTS/verbatim-diff.mjs <templateDir>` — contract JS zone unchanged.
- `node $SCRIPTS/fontcheck.mjs <font> "<the actual data.json strings>"` for each bundled
  face — confirms real glyph coverage (this is how you catch blank-glyph risk WITHOUT
  rendering, which matters most in no-browser mode).
- `node $SCRIPTS/render.mjs <pdf> work 300` — render the SOURCE pages; **open them and
  read them yourself**, then cross-check each element's position/size against your
  template's absolute `.sheet` pt coordinates (same coordinate space as the probe) and
  against `data.json` content. This is your geometry/typography/content audit.

**Full mode only** (pixel-accurate visual — skip entirely in no-browser mode):
- `node $SCRIPTS/serve.cjs <templateDir> 8137 &`
- `SHOOT_SEL="#page1" node $SCRIPTS/shoot.mjs http://localhost:8137/template.html work/r1.png 850 1100`
  (one per page) — must report no console/asset errors.
- `node $SCRIPTS/compare.mjs work/page-1.png work/r1.png work/cmp1.jpg` — open it and fix drift.
- If `bleedIn > 0`: `node $SCRIPTS/export-pdf.mjs <url> work/out.pdf <mediaWin> <mediaHin> <bleedIn>`,
  rerender, confirm backgrounds reach all four media edges.

**Thumbnail.** Full mode: from the page-1 screenshot. No-browser mode: from the page-1
SOURCE render (`work/page-1.png` → `sharp` resize → `thumbnail.jpg`) — the template
reproduces the source, so it's a faithful stand-in. Set `manifest.thumbnail`.

**8. Report** honestly: state any font substitution, low-res default image, or
guessed measurement. **Confirm the `agent` map you wrote in `mapping.json`** —
list the schema-key → token pairs so a human can sanity-check the branding wiring
(no developer registration needed anymore; the map IS the wiring). If you mapped
a composite `creds`/`contact` token, confirm its target is a `type:"list"` field.
**If you ran in no-browser mode, say so explicitly:** the template was verified
structurally + against the source render, but NOT pixel-rendered — a visual pass in
a browser-capable environment is still recommended before it ships. Those are what a
human must confirm before shipping.

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
- **No `mapping.json` → fills nothing from a listing.** The most common "looks
  perfect but is inert" failure. Real-estate templates need it; only branding-only
  ones (business cards) skip it.
- **Photos need `role:"property"`.** An image field without it never receives an
  MLS/uploaded photo, no matter how good `classifyHints` is.
- **Agent branding is config-driven via the `agent` map** in `mapping.json`. Emit
  it (schema key → branding token, contract §5.5) and the agent block fills with
  NO app code change. Use the standard `agent.*` / `photos.*` keys. (An older
  hardcoded-per-template path still exists as a fallback, but new templates should
  rely on the map.)
