---
name: pdf-to-email
description: >-
  Convert a print-ready PDF (a real-estate LISTING EMAIL design) into a
  data-driven Adobe/Marketing-Builder EMAIL KIT (kit.json + theme + per-block
  MJML fragments + assets/ + thumbnail.jpg). Use when the user gives a PDF and
  asks to turn it into an email template, "templatize it for the email
  builder", or build a listing-email kit. Differs from pdf-to-template (which
  emits a fixed-layout PRINT folder): this skill reflows the PDF into a
  single-column, email-safe MJML composition and emits the SAME
  listing/branding LABELS (listingField ${Reso} tokens, brandingToken/
  brandingAgent, role:"property"+classifyHints) inline on kit.json's block
  fields, so a kit built here autofills from an MLS listing exactly like a
  labeled print template does.
allowed-tools: >-
  Bash(node *), Bash(npm *), Bash(npx *), Read, Write, Edit, Glob, Grep,
  AskUserQuestion
---

# PDF → Marketing-Builder Email Kit

You convert one source PDF (a print-ready **email design** — an agent typically
supplies a comp or a PDF export of the intended email) into a `kit.json`
**email kit** that conforms **exactly** to `reference/email-contract.md`. Read
that file once at the start of every job — it is the source of truth for the
kit folder shape, the `EmailKit`/`BlockDef`/`SchemaField` JSON shapes, the
data-driven `mjml` convention, the escaping rules, and the labeling vocabulary.
**Do not "improve" the contract.**

`ENGINE=${CLAUDE_SKILL_DIR}/../pdf-to-template/scripts` — this skill has **no
separate probe/render/crop engine**. It shares the sibling `pdf-to-template`
skill's Node scripts (probe/render/crop/sample/images/fontcheck/preflight) by
calling them via a relative path — see "Shared engine" below for why. `SCRIPTS
= ${CLAUDE_SKILL_DIR}/scripts` holds only what's unique to email:
`email-selfcheck.mjs` (+ its own `package.json` pinning `mjml`). `REF =
${CLAUDE_SKILL_DIR}/reference`.

## Shared engine — how this skill reuses pdf-to-template's scripts

Both skills ship inside the **same plugin** (`pdf-template-converter`), so a
sibling skill's directory is always present on disk at
`${CLAUDE_SKILL_DIR}/../pdf-to-template/`. Plugin skills do not have a
cross-skill import/symlink mechanism, and a symlink into `scripts/` would not
reliably survive every distribution path (marketplace installs may copy the
plugin folder rather than preserve symlinks). The clean, portable answer:
**this skill's method invokes the sibling's scripts directly by relative
path** — `node ${CLAUDE_SKILL_DIR}/../pdf-to-template/scripts/probe.mjs …` —
rather than duplicating probe/render/crop/fontcheck/preflight here. Only the
email-specific self-check script is new and lives under this skill's own
`scripts/`. Run `${CLAUDE_SKILL_DIR}/../pdf-to-template/scripts/preflight.mjs`
once per job exactly as pdf-to-template does — it installs the shared deps
into the sibling's `node_modules`, which this skill's `node ENGINE/*.mjs`
calls then resolve against.

## The split that makes this reliable

The shared scripts do the mechanical, exact work (probe, render, crop,
font-check). **You** do the judgment: reinterpreting a fixed print/PDF layout
as a **reflowed, single-column email**, choosing an email-safe font stack,
authoring each block's MJML fragment, and wiring the listing/branding labels.
Never skip the judgment gates below — especially the reflow decision and the
label wiring.

## Email ≠ print — the reinterpretation you must do

A PDF handed to this skill was laid out for a fixed canvas (bleed, absolute pt
positions, arbitrary multi-column art). An email is **not** a canvas — it is a
single ≤600px-wide column read top-to-bottom in any client, with no bleed and
no guaranteed CSS beyond what `mj-*` components emit. Reinterpret, don't
transcribe:

- **No bleed, no trim.** Ignore `bleedIn`/trim geometry entirely — there is no
  print export from this path.
- **No absolute positioning.** Every region of the PDF becomes one or more
  stacked `mj-section`s in reading order. Side-by-side print columns usually
  collapse to stacked sections (or an `mj-column`/`mj-group` pair no wider than
  600px total) — pick whichever preserves the intended reading order on a
  narrow (480px breakpoint) screen.
- **Fonts become a system stack, never `@font-face`.** Identify the PDF's
  display/body typefaces, then choose the closest email-safe system stack
  (e.g. a slab/serif display face → `Georgia, 'Times New Roman', Times,
  serif`; a humanist sans → `Arial, Helvetica, sans-serif`). Do **not** bundle
  a font file or emit `@font-face` — `lib/emailCompile.ts`'s
  `FALLBACK_FONT_STACK` is exactly this convention, and Outlook/older engines
  silently fail on `@font-face`.
- **Colors** (brand/accent/text/bg) are sampled from the PDF the same way
  pdf-to-template samples them (`sample.mjs`), but land in `theme.brandColor` /
  `theme.accent` / `theme.textColor` / `theme.backgroundColor` — tokens every
  block's MJML references via `{{theme.<token>}}`, not hardcoded per-block
  hex.

## Method

**0. Preflight (always first).**
`node ${CLAUDE_SKILL_DIR}/../pdf-to-template/scripts/preflight.mjs` — same
preflight as the print skill (it is the same engine). Note the MODE line:
- **full** — a headless browser is available. You can still screenshot/serve
  the compiled HTML output for a visual sanity check if useful, though it is
  not required (there is no `shoot.mjs`/`export-pdf.mjs` equivalent for email —
  the real email-safety gate is `mjml2html` returning zero errors, run by
  `email-selfcheck.mjs`).
- **no-browser** — proceed exactly the same; nothing in this skill's method
  requires a browser. The compile-safety check (`mjml2html`) is pure Node.

**1. Probe & render the source** (identical tools, email framing of the
output):
`node ${CLAUDE_SKILL_DIR}/../pdf-to-template/scripts/probe.mjs <pdf>` for text
runs, fonts, and page geometry (geometry here just tells you reading order and
relative proportions — you will NOT reproduce absolute coordinates).
`node ${CLAUDE_SKILL_DIR}/../pdf-to-template/scripts/render.mjs <pdf> work 300`
to open `work/page-N.png` and read the design directly: identify each
region's *role* (header/logo band, hero photo + headline, one or more listing
cards, body copy, call-to-action, agent signature block, footer/disclaimer) —
this is the region list that becomes your ordered blocks.

**2. Extract assets** into the kit's `assets/` folder (same tools as print):
raster photos via `pdfimages`/embedded-image extraction or a crop from the
render; vector logos/marks via
`node ${CLAUDE_SKILL_DIR}/../pdf-to-template/scripts/crop.mjs`. You typically
need: the brokerage logo (header), a hero/exterior photo, one or more
listing/interior photos, and an agent headshot.

**3. Author `theme`.** Fill `EmailTheme` (`reference/email-contract.md` §2):
`brandColor`, `accent`, `fontFamily` (a system **stack**, see above),
`textColor`, `backgroundColor`, `contentWidth` (600 unless the PDF's design
clearly reads better narrower — never wider).

**4. Design the block list + `structure`.** For each region identified in
step 1, pick (in order of preference):
   a. A block **type name that matches an existing coded renderer** in
      `lib/emailBlocks.ts` (`header`, `hero`, `listing-card`, `text`,
      `cta-button`, `agent-signature`, `footer`) when the region's shape
      genuinely matches that renderer's fields — you still author `mjml` (see
      step 5) rather than relying on the coded fallback, so the kit is fully
      self-describing, but reusing the type name keeps your field-key
      choices aligned with the shipped reference kit.
   b. A **new block type** for anything the coded catalog doesn't cover
      (e.g. a stat-badges strip, a two-column feature grid) — data-driven
      `mjml` supports arbitrary layouts (LISTING-EMAIL-AUTOFILL-PLAN.md B1),
      so don't force a bad fit into the coded 7.
   Set `structure.required` (blocks the email cannot ship without — typically
   `header`, `footer`), `structure.singleton` (blocks that appear at most once
   — typically `header`, `hero`, `footer`, `agent-signature`), and
   `structure.defaultComposition` (the ordered instance list with real
   extracted content in `data`, reproducing the source PDF's content and
   order).

**5. Author each block's `mjml` fragment.** One data-driven MJML string per
`BlockDef` (`reference/email-contract.md` §3 has the full convention + a
worked example). Rules (fail-closed if violated — `email-selfcheck.mjs`
enforces the ones that are checkable):
   - **`mj-*` components only**, one or more `mj-section`s, ≤600px total width,
     no absolute positioning, no `@font-face`.
   - **Every `{{key}}` hole must resolve** to either a `key` in that block's
     own `fields[]`, or `theme.<token>` (`brandColor`, `accent`, `fontFamily`,
     `textColor`, `backgroundColor`, `contentWidth`). A hole that resolves to
     neither is a compile-time kit error — the runtime substitutes `""` and
     `email-selfcheck.mjs` FAILS the kit for it.
   - **Do not pre-escape.** The runtime (`renderDataDrivenBlock` in
     `lib/emailBlocks.ts`) escapes every value by the field's declared `type`:
     `text`/`richText` → HTML-escaped (richText additionally paragraphized);
     `image` → passed through `safeUrl` (rejects anything but an `http(s)://`
     absolute URL or a root-relative `/…` path — `javascript:`/`data:`/
     protocol-relative are blanked). Consequences for you as the author:
     - Put an `image`-typed field **only** inside an `mj-image src="…"` (or
       another URL-only attribute) — never inside body text.
     - Never put a `text` field inside an `href` where the scheme matters if
       you can avoid it (known pre-existing gap, not blocking — see
       `reference/email-contract.md` §5).
     - Don't add manual `&amp;`/`&lt;` escaping in your template string; the
       runtime already does it and double-escaping corrupts output.

**6. Wire the labels** (the whole point of this skill — the email analog of
writing print's `mapping.json`) directly on each field in `fields[]`:
   - **Listing text** → `listingField: "${Reso}"` — identical token syntax to
     print's `mapping.json` `fields` RHS (e.g. `"${StreetNumber}
     ${StreetName}"`, `"${ListPriceUSD}"`, `"${PublicRemarks}"`). Use the
     token table in `reference/email-contract.md` §4.
   - **Agent/co-agent branding** → `brandingToken` (one of the
     `BRANDING_TOKENS` in `lib/branding.ts`: `name, title, phone, email, dre,
     office, website, headshot, logo, creds, contact`) + `brandingAgent`
     (`"primary"` for the hosting agent, `"secondary"` only for an explicit
     two-agent layout).
   - **Listing photos** → `role: "property"` + `classifyHints` (keywords for
     the photo classifier — `["exterior","front","facade"]` for a hero,
     `["interior","kitchen"]` etc. for listing-card photos). Agent
     headshot/brokerage logo → `brandingAsset: true` + `role: "branding"`
     instead (never `role:"property"` — that's for MLS photos only).
   None of this is optional for a listing-email kit: an image field with no
   `role` never receives an MLS/uploaded photo, and a text field with no
   `listingField` never fills from a listing (identical failure mode to
   print's "no mapping.json" gotcha — see Gotchas below).

**7. Thumbnail.** Render or compose a representative page-1-equivalent image
(the hero + header area reads well as a thumbnail) and save it as
`thumbnail.jpg` in the kit folder. No browser required — derive it from
`work/page-1.png` (crop/resize with `sharp`, same approach pdf-to-template
uses in no-browser mode).

**8. Self-verify.**
`npm install` once in `${CLAUDE_SKILL_DIR}/scripts` (pulls in `mjml`, pinned in
this skill's `package.json`), then:
`node ${CLAUDE_SKILL_DIR}/scripts/email-selfcheck.mjs <kitDir>` — validates the
kit shape, every `{{key}}` reference, every `listingField`/`brandingToken`/
`role`, `structure` satisfiability, and **compiles every block's `mjml`
through `mjml2html` with sample values, failing on any MJML error** (the real
email-safety gate, mirroring how pdf-to-template's `selfcheck.mjs` + a real
render are both required). If `mjml` isn't installed, the script still runs
every structural check and reports the compile step as skipped with an
"install mjml to enable" notice rather than crashing — do not treat that as a
pass; call it out explicitly in your report.

**9. Report** honestly, mirroring pdf-to-template's step 8:
- List the block types you chose and why (coded-name reuse vs. new type).
- **Confirm the label wiring** — list every `listingField`, `brandingToken`+
  `brandingAgent`, and `role:"property"`+`classifyHints` you set, keyed by
  block/field, so a human can sanity-check the listing/branding fill (same
  spirit as pdf-to-template confirming its `mapping.json` `agent` map).
- State any font-stack substitution (which system stack you picked for which
  PDF typeface) and any low-res default image.
- State whether `email-selfcheck.mjs` passed cleanly, including whether the
  `mjml` compile step actually ran (vs. skipped for a missing install).

## Gotchas (hard-won, carried over + email-specific)

- **kit folder name == `kit.json`'s `id`**, same discipline as
  print's `manifest.id == folder name` (the registry keys off the folder;
  see `lib/registry.ts`'s disk-kit scan).
- **No `mapping.json` here — labels live inline** on `fields[]`
  (`listingField`/`brandingToken`/`role`). LISTING-EMAIL-AUTOFILL-PLAN.md A1
  deliberately rejected a separate email mapping file because it can't
  address block *instances* cleanly; don't reintroduce one.
- **An image field with no `role` never fills from a listing or agent
  profile** — identical failure mode to the print skill's #1 gotcha, just on
  the email side.
- **A text field with no `listingField` silently keeps its default forever**
  when the email is created from an MLS listing — the fill is opt-in per
  field, not automatic from field name.
- **Never bundle `@font-face` or a font file for an email kit.** This is the
  one place this skill's output *diverges* from print's obsession with
  bundling exact typefaces — email clients need the system-stack convention,
  not fidelity.
- **Every `{{key}}` must resolve.** An unresolved hole isn't a warning at
  runtime — it's silently blanked (fail-closed by design), which reads as "the
  kit renders blank in that spot" days later. Catch it here with
  `email-selfcheck.mjs`, not in production.
- **Trust the template, never the value.** The `mjml` fragment string is
  trusted authorship (same trust level as print's `template.html`); every
  interpolated *value* is untrusted and auto-escaped by the runtime. Do not
  add your own escaping — you'll double-escape — and do not try to work around
  `safeUrl`'s scheme rejection by concatenating strings inside the template.
