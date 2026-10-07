# PROMPT: Convert a PDF into a Marketing-Builder Template

> Paste everything below the line into a fresh LLM session, then attach (or give a
> path to) the source PDF. It is fully self-contained: it does not assume the
> target model has ever seen this platform.

---

You are an expert print-design engineer. Your job is to convert a single source
**PDF** (a finished, print-ready marketing piece — e.g. a real-estate flyer) into
a **template** for a web platform called *Marketing Builder*. On that platform a
non-technical user picks a template and edits its **content** (text + photos) by
chatting with an AI or clicking elements directly; the **layout never changes**.
The platform renders a live preview, runs an automated visual-QA pass, and exports
a print-ready PDF at the correct trim + bleed.

Your output is a **self-contained template folder** that conforms exactly to the
contract below. Reproduce the contract faithfully — the platform's editor, QA, and
PDF export all depend on precise conventions, several of which are non-obvious and
hard-won. **Do not "improve" or restructure the contract code.**

---

## 0. Assumptions about your environment (read first)

This prompt is written for an **agentic model with a shell and a filesystem** that
can run standard PDF tooling and render HTML. Specifically it assumes you can:

- inspect the PDF: `pdffonts file.pdf`, `pdfimages -list file.pdf`,
  `pdftotext -layout file.pdf -`, and a page-geometry tool such as `mutool info`
  or `pdfinfo`;
- extract embedded raster images (`pdfimages -all`) and render pages to PNG
  (`pdftoppm -png -r 300`) so you can measure positions visually;
- write files and open an HTML file in a headless browser to self-check.

If you are instead a **vision-only chat model** with no tools, you can still
produce the folder, but you must: measure geometry by reasoning over a
high-resolution image of each page against the known trim size (below), ask the
user to supply the original fonts and full-resolution photos, and skip the
automated self-checks in §9 (do them by inspection). Say so explicitly in your
output if you are in this mode.

---

## 1. What a "template" is — the folder contract

A template is **one folder** named with a lowercase, hyphenated `id` (e.g.
`ravenswood`, `open-house`). It is simultaneously (a) a standalone artifact that
opens in any browser and prints correctly with no server or internet, and (b) an
editor-consumable unit the platform reads to drive editing, QA, and export.

```
<id>/                     # FOLDER NAME MUST EXACTLY EQUAL manifest.id (see §2)
├── manifest.json         # identity + page geometry + font/asset inventory  (§2)
├── schema.json           # the EDITABLE-content contract (the AI's allow-list) (§3)
├── data.json             # default/sample content the layout is filled with   (§4)
├── rules.json            # template-aware QA rubric + design intent            (§5)
├── mapping.json          # MLS listing-field → schema-key autofill (§5.5)      — REQUIRED for listing-fillable templates; OMIT for branding-only (e.g. a business card)
├── template.html         # self-contained fixed-layout page + render()         (§6)
├── thumbnail.jpg         # gallery preview image (render of page 1)            (§9)
├── fonts/                # every font used, embeddable, licensed
│   └── *.ttf | *.woff2
└── assets/               # default photos, logos, stat icons
    └── *.jpg | *.png | *.svg
```

**Self-containment is a hard requirement.** Every font and image the template uses
travels inside `fonts/` and `assets/`. `template.html` references them by
**relative** path (`fonts/…`, `assets/…`) only — never an absolute path, a CDN, or
an external URL.

**Hard rule — folder name = `manifest.id`.** The platform loads a template by
joining its templates directory with `manifest.id`, but serves the folder's assets
by the folder's own name. If they differ, the editor 404s. Keep them identical.

---

## 2. `manifest.json` — identity + geometry

Exact shape (TypeScript, for precision — emit plain JSON):

```ts
{
  id: string;            // == folder name. lowercase-hyphenated.
  name: string;          // human gallery title, e.g. "Ravenswood Real-Estate Flyer"
  description: string;   // one line for the gallery card
  version: string;       // "1.0.0"
  category: string;      // e.g. "real-estate"
  tags: string[];        // e.g. ["real-estate","open-house","flyer"]
  cobrand?: boolean;     // OMIT unless the design has a spot for the AGENT'S OWN
                         // logo. `true` = cobranded record (§5.6). Never emit
                         // `false` — absence is the brokerage-only default.
  pages: number;         // page count (one <section class="page"> per page)
  trim: { width: number; height: number; unit: "in" | "pt" };  // FINISHED size
  bleedIn: number;       // bleed beyond trim on every edge, in INCHES (e.g. 0.125)
  pageRotation?: Record<string, 90 | -90>; // TURNED pages only — see "Turned pages" below
  thumbnail: string;     // relative file name, e.g. "thumbnail.jpg"
  entry: string;         // "template.html"
  fonts:  { file: string; family: string; license: string; subset?: boolean }[];
  assets: { file: string; role: string }[];   // inventory of bundled defaults
}
```

- `trim` is the finished (cut) size. US Letter = `8.5 × 11 in`. Read the real trim
  from the PDF's MediaBox/TrimBox (`pdfinfo`/`mutool info` report points; divide by
  72 for inches).
- `bleedIn` is how far full-bleed art must extend past the trim edge on export.
  `0.125` in is standard. If the source has no bleed art, you may set `0`.
- `cobrand` is the TEMPLATE-LEVEL flag for a **cobranded** design — one that has a
  placeholder for the AGENT'S OWN logo, not just the brokerage lockup. Emit
  `"cobrand": true` **only** when the cobrand question (§5.6) was answered yes;
  otherwise leave the key out entirely. The app stores the whole manifest, so this
  key travels with the template on import and on promotion between environments.
- List **every** font file under `fonts/` and state its real license. List the
  default images under `assets/` with a short `role` tag (free-form, e.g.
  `"default-hero"`, `"stat-icon"`).

Reference (`ravenswood/manifest.json`):

```json
{
  "id": "ravenswood",
  "name": "Ravenswood Real-Estate Flyer",
  "description": "Two-page premium real-estate listing flyer (open house).",
  "version": "1.0.0",
  "category": "real-estate",
  "tags": ["real-estate", "open-house", "flyer"],
  "pages": 2,
  "trim": { "width": 8.5, "height": 11, "unit": "in" },
  "bleedIn": 0.125,
  "thumbnail": "thumbnail.jpg",
  "entry": "template.html",
  "fonts": [
    { "file": "fonts/Lato-Light.ttf",   "family": "Lato",      "license": "OFL-1.1" },
    { "file": "fonts/Lato-Regular.ttf", "family": "Lato",      "license": "OFL-1.1" },
    { "file": "fonts/Lato-Medium.ttf",  "family": "Lato",      "license": "OFL-1.1" },
    { "file": "fonts/Lato-Bold.ttf",    "family": "Lato",      "license": "OFL-1.1" },
    { "file": "fonts/BornReadySlanted.ttf", "family": "BornReady",
      "license": "Creative Market Standard Commercial License — Born Ready Slanted (Nicky Laatz)" }
  ],
  "assets": [
    { "file": "assets/p1_img1.jpg", "role": "default-hero" },
    { "file": "assets/p1_img0.jpg", "role": "default-backyard" },
    { "file": "assets/icon_bed.png", "role": "stat-icon" }
  ]
}
```

---

## 3. `schema.json` — the editable-content contract

This is the **single source of truth for what the AI/user may edit**. It is the
*editable subset* of the data, not all of it. Render-only fixed strings (labels
like `"HOSTED BY:"`, a static `"REALTOR®"` role) live in `data.json` but are
**deliberately omitted here** so the editor can't change them.

Exact shape:

```ts
{
  fields: Array<{
    key: string;          // dot-path into data.json, e.g. "stats.sqft", "photos.hero"
    type: "text" | "richText" | "image" | "enum" | "list" | "qr";
    itemType?: "text" | "richText" | "image" | "enum" | "list";  // for list items
    label: string;        // short human label shown in the editor
    description: string;   // tells the AI the field's INTENT — write these well
    required: boolean;
    fontSubset?: boolean;  // true if this field is rendered in a SUBSET font (§7)
    brandingAsset?: boolean; // headshot/logo: the 300-DPI minPx is advisory, not blocking (CONSUMED — relaxes the export gate)
    role?: "property" | "branding"; // image fields only (§5.5). "property" = REQUIRED on any photo slot that should receive an uploaded/MLS listing photo — without it the slot never auto-fills. "branding" = headshot/logo marker (convention; the value is filled by the app's agent branding, not by role).
    classifyHints?: string[];        // "property" images only: keywords the photo classifier matches to choose WHICH listing photo lands here (e.g. ["exterior","kitchen"]). Optional — improves placement quality; slots still fill (best match, then MLS order) without it.
    constraints?: {
      maxChars?: number;   // text/richText: fixed boxes DON'T reflow — length is validated
      maxLines?: number;
      aspect?: string;     // image: "W:H" of the placed box, e.g. "512:254"
      minPx?: [number, number];  // image: min source px for 300 DPI at placed size
      fullBleed?: boolean; // image: source must cover trim + bleed
      values?: string[];   // enum: allowed values
    };
    qrSizeIn?: number;      // qr ONLY, REQUIRED: printed edge length in INCHES (min 0.5)
    qrDestination?: string; // qr only, OPTIONAL default. NEVER decode it from the source PDF.
  }>;
}
```

Field-type guide:

- `text` — single short string in a fixed box. Set `maxChars`/`maxLines`; the box
  does not grow, so the value MUST fit.
- `richText` — longer body copy in a fixed box (e.g. a property description). Still
  length-validated by `maxChars`/`maxLines`.
- `image` — one photo/logo. Give `aspect` and `minPx`; add `fullBleed: true` for
  edge-to-edge art. **Then tag it for the listing flow (§5.5):**
  - A **property photo** (anything that should be filled from an MLS listing's
    photos) MUST get `"role": "property"`, plus `classifyHints` keywords for which
    shot belongs there (`["exterior","front"]`, `["interior","kitchen"]`, …).
    Without `role:"property"` the slot is invisible to MLS photo placement and
    stays on its default forever. A `list` with `itemType:"image"` can also be
    `role:"property"` — it expands to one listing-photo slot per item (e.g. a row
    of three interior shots).
  - An **agent headshot or logo** gets `"brandingAsset": true` (relaxes the 300-DPI
    export gate for directory art) and is conventionally marked `"role": "branding"`.
    Its value is filled by the app's agent-branding step, not by the listing — see
    the branding note in §5.5.
- `list` — an ordered set. With `itemType:"text"` it's repeated lines (e.g. contact
  lines). With `itemType:"image"` it's a fixed row of photos (e.g. exactly 3).
- `enum` — one value from `constraints.values`.
- `qr` — a QR code the APP generates. **See §5.7 — do not crop the source PDF's QR
  into `assets/`.**

**Deriving image constraints from the layout** (do this per image box):

- `aspect` = `"<placedWidthPt>:<placedHeightPt>"` using the box's pt dimensions.
- `minPx` = `[ ceil(placedWidthPt / 72 * 300), ceil(placedHeightPt / 72 * 300) ]`
  — i.e. the pixel count needed for 300 DPI at the placed size. Example: a 512pt ×
  254pt box → `[2133, 1058]`.

Write `description` fields as genuine instructions to an AI ("Big brush-script
headline at the top of page 1", "Full-bleed photo across the bottom of page 1; must
cover trim + bleed"). The chat agent and the QA model both read them.

Reference excerpt (`ravenswood/schema.json`):

```json
{
  "fields": [
    { "key": "headline", "type": "text", "label": "Headline",
      "description": "Big brush-script headline at the top of page 1.",
      "required": true, "fontSubset": false,
      "constraints": { "maxChars": 28, "maxLines": 1 } },

    { "key": "stats.sqft", "type": "text", "label": "Square feet",
      "description": "Interior square footage (commas allowed).",
      "required": true, "constraints": { "maxChars": 7, "maxLines": 1 } },

    { "key": "description", "type": "richText", "label": "Property description",
      "description": "Main body copy on page 2. Fixed box — length is validated, not reflowed.",
      "required": true, "constraints": { "maxChars": 1750, "maxLines": 18 } },

    { "key": "hostedBy.contact", "type": "list", "label": "Hosting agent contact",
      "description": "Phone / email / site lines for the hosting agent.",
      "required": false, "constraints": { "maxLines": 3, "maxChars": 30 } },

    { "key": "photos.hero", "type": "image", "label": "Hero photo (front entry)",
      "description": "Main photo inside the framed area on page 1.",
      "required": true, "role": "property", "classifyHints": ["exterior", "front", "facade", "entry", "curb"],
      "constraints": { "aspect": "512:254", "minPx": [2133, 1058] } },

    { "key": "photos.backyard", "type": "image", "label": "Backyard photo (full-bleed)",
      "description": "Full-bleed photo across the bottom of page 1; must cover trim + bleed.",
      "required": true, "role": "property", "classifyHints": ["backyard", "yard", "pool", "patio", "outdoor", "exterior"],
      "constraints": { "aspect": "612:384", "minPx": [2550, 1600], "fullBleed": true } },

    { "key": "photos.headshot", "type": "image", "label": "Agent headshot",
      "description": "Hosting agent headshot on page 2 (filled from the agent directory, not the listing).",
      "required": true, "role": "branding", "brandingAsset": true,
      "constraints": { "aspect": "62:80", "minPx": [261, 335] } }
  ]
}
```

> The two photo fields above carry `role:"property"` + `classifyHints` (verbatim
> from the shipped `ravenswood/schema.json`) and the headshot carries
> `role:"branding"` + `brandingAsset:true`. An earlier draft of this contract
> dropped the `role`/`classifyHints` keys — that omission is exactly why a
> hand-authored template renders fine but fills nothing from a listing. Always
> tag image fields.

---

## 4. `data.json` — the default content

A plain JSON object whose structure matches every schema `key` (dot-paths become
nested objects: `"stats.sqft"` → `{ "stats": { "sqft": "…" } }`; a `list` is a JSON
array). It also carries the render-only fixed strings that are absent from the
schema. Fill it with the **real content extracted from the source PDF** so the
template previews as a faithful copy of the original.

**Image values** take one of two shapes, and the renderer handles both:

```jsonc
"hero": "assets/p1_img1.jpg"                       // plain relative path, OR
"hero": { "src": "assets/p1_img1.jpg",
          "crop": { "x": 0.5, "y": 0.5, "scale": 1 } }  // path + non-destructive crop
```

The `crop` is a non-destructive pan + zoom applied at render time (NOT pixel
editing): `x`,`y` are the focal point in `0..1` (`0.5,0.5` = centered); `scale` ≥ 1
zooms in. Default images can just be the plain string form. All image paths are
**relative** (`assets/…`).

Every `required` schema field must be present here, and every default value must
satisfy its `constraints` (text fits `maxChars`/`maxLines`; images meet `minPx`).

Reference excerpt (`ravenswood/data.json`):

```json
{
  "headline": "This One Hits Different",
  "openHouse": "SATURDAY, 05/30/2026 FROM 12 - 3 PM",
  "address": "3874 RAVENSWOOD",
  "city": "YORBA LINDA",
  "stats": { "beds": "3", "baths": "3", "sqft": "1,664", "lot": "4,800" },
  "description": "Tucked at the end of a quiet cul-de-sac …",
  "hostedBy": {
    "label": "HOSTED BY:",
    "name": "ALI GOVAHI",
    "creds": ["MBA, BROKER ASSOC., REALTOR®", "CREN, CELA, CLHA, CREM, CSCS"],
    "contact": ["714.264.4151", "Ali@SoldByAliG.com", "SoldByAliG.com"],
    "dre": "DRE #01946545"
  },
  "listingBy": { "label": "LISTING BY:", "firm": "MAJOR LEAGUE PROPERTIES",
    "name": "CONNOR SEAMAN", "role": "REALTOR®", "contact": ["714.928.4179"],
    "dre": "DRE #02048978" },
  "watermark": { "logo": "assets/sevengables_logo.png" },
  "footer": { "line1": "…DRE #00745605…", "line2": "Information deemed reliable…" },
  "photos": {
    "hero": "assets/p1_img1.jpg",
    "backyard": "assets/p1_img0.jpg",
    "mid": ["assets/p2_img4.jpg", "assets/p2_img3.jpg", "assets/p2_img2.jpg"],
    "headshot": "assets/p2_img5.jpg",
    "agentLogo": "assets/ag_logo.png"
  }
}
```

Note how `hostedBy.label`, `listingBy.label`, and `listingBy.role` exist here but
are **not** in `schema.json` — they are fixed by design.

---

## 5. `rules.json` — template-aware QA rubric + design intent

The platform runs a vision model over each rendered page and combines its own
built-in global rubric with two fields it reads from **your** `rules.json`:

- `pageIntent: string[]` — design facts the QA model must NOT flag as defects
  ("Headline intentionally overlaps the top frame line and is optically centered").
  **This is the most load-bearing field** — without it the QA model reports
  intentional design choices as bugs. Write one bullet per non-obvious layout
  decision.
- `subsetFonts: { [family]: { appliesTo, note } }` — declare any font that is only
  a partial glyph subset (see §7) so QA watches for blank/box glyphs.

The remaining fields (`extends`, `hardConstraints`, `thresholds`, `cropPriority`)
are authoring documentation that records the template's design contract; reproduce
the structure. Use `owner` tags on hard constraints: `"template"` = guaranteed at
authoring time (never auto-fixed), `"agent"` = auto-repairable by shortening text,
`"user"` = needs a human decision/asset (e.g. a higher-res photo).

Reference (`ravenswood/rules.json`):

```json
{
  "extends": "global-rubric",
  "notes": "Template-aware QA rules layered on the global rubric. owner: 'agent'=auto-repairable, 'user'=hand back, 'template'=guaranteed at authoring time.",
  "hardConstraints": [
    { "id": "headline-no-clip", "owner": "agent",
      "rule": "Headline must not clip the title frame or top edge; shorten or pick shorter text.",
      "appliesTo": "headline" },
    { "id": "no-text-overflow", "owner": "agent",
      "rule": "No text box may overflow or clip its fixed region.",
      "appliesTo": ["description", "openHouse", "address", "city", "stats.*"] },
    { "id": "fullbleed-reaches-trim", "owner": "template",
      "rule": "Full-bleed photos must reach the trim edge and extend 0.125in into the bleed on export.",
      "appliesTo": "photos.backyard" },
    { "id": "image-300dpi", "owner": "user",
      "rule": "Every placed image must be >= 300 DPI at its placed size.",
      "appliesTo": "photos.*" }
  ],
  "thresholds": { "maxTextBoxFillPct": 96, "cropTolerancePct": 4, "minContrastRatio": 4.5 },
  "cropPriority": {
    "note": "When subject-framing and bleed-fill compete, FILL trim+bleed wins.",
    "order": ["fill-trim-bleed", "subject-prominence"]
  },
  "pageIntent": [
    "Headline intentionally overlaps the top frame line and is optically centered.",
    "The address bar is a thin navy strip; address bold, city regular, separated by a vertical bar.",
    "The backyard photo is full-bleed across the bottom of page 1.",
    "Page 2: two large photos top, a row of three smaller photos, then justified body copy, then two agent blocks flanking the center logo."
  ],
  "subsetFonts": {
    "BornReady": { "appliesTo": "headline",
      "note": "If only a SUBSET is bundled, QA must flag any blank/box glyph; arbitrary headlines won't render correctly." }
  }
}
```

---

## 5.5 `mapping.json` — MLS listing autofill (REQUIRED for listing templates)

When an agent creates a design **from an MLS listing**, the platform auto-fills the
template from that listing before they edit. That fill is driven entirely by
`mapping.json`. **Without this file the listing fill is silently skipped** — every
text field stays on its `data.json` default (this is a real, shipped failure mode:
a template that renders perfectly but "doesn't replace any content" from a listing).
A branding-only template with no listing data (e.g. a business card) legitimately
omits the file.

Shape:

```json
{
  "fields": {
    "<schema-key>": "<string with ${ResoToken} placeholders>"
  }
}
```

- Each entry maps a **text/richText** schema key → a template string. `${Token}`
  interpolates against the listing (a RESO record); a token that resolves to empty
  is dropped, and an entry that resolves to all-empty is skipped.
- Map only **listing-derived text**: address, city, stats, description. Do NOT map
  creative copy (a brush headline has no listing source — leave it to the default),
  fixed strings, or agent/branding fields (those come from the branding step below).
- **Photos are not mapped here.** Listing photos place via image-field
  `role:"property"` + `classifyHints` (§3). `mapping.json` is text only.

**Token vocabulary** — the listing is a RESO record, so any RESO field present can be
a `${Token}`. The fields the shipped templates rely on:

| Token | Meaning |
|-------|---------|
| `StreetNumber`, `StreetName` | street address parts |
| `City`, `StateOrProvince`, `PostalCode` | city / state / zip |
| `BedroomsTotal` | beds |
| `BathroomsTotalInteger` | baths |
| `LivingArea` | interior sq ft |
| `LotSizeSquareFeet` | lot sq ft |
| `ListPriceUSD` | list price, **pre-formatted** "$940,000" — **prefer this for a displayed price** (already includes the `$`, so don't prefix another) |
| `ListPrice` | list price as a RAW number (`940000`, no separators). **`selfcheck` now FAILS on this in a mapping** — a text field is filled verbatim, so there is nowhere to format it. It shipped once and read "940000" on a real flyer |
| `PublicRemarks` | the listing's marketing description |
| `OpenHouse` | open-house line (when present) |

> **Raw vs. derived tokens.** `${Token}` interpolates the listing field **verbatim with
> no formatting** — RESO numbers come through bare (`ListPrice`→`1020000`,
> `LivingArea`→`4180`, no commas). The listing is augmented at fetch time with a few
> **derived, display-ready** helpers; today that's **`${ListPriceUSD}`**. Use the derived
> token whenever one exists (especially price). For other numbers, decide per design
> whether bare is acceptable (sqft "4180" usually fine; a headline price is not).

Reference (`legrande/mapping.json`, verbatim from a shipped template):

```json
{
  "fields": {
    "address": "${StreetNumber} ${StreetName}",
    "city": "${City}, ${StateOrProvince}",
    "addressBar": "${StreetNumber} ${StreetName} | ${City}",
    "stats.beds": "${BedroomsTotal}",
    "stats.baths": "${BathroomsTotalInteger}",
    "stats.sqft": "${LivingArea}",
    "description": "${PublicRemarks}"
  }
}
```

### The third integration point: agent branding (config-driven — you CAN finish this)

Listing **text** comes from `mapping.json`'s `fields`; listing **photos** from
`role:"property"`; the **hosting agent's** identity (name / phone / email / DRE /
headshot / logo) comes from a separate agent-branding step the platform runs on
create. That step is now **config-driven**: you emit an `agent` map in
`mapping.json` and the platform fills the agent block from it — **no app code
change is needed**. (Older templates were branded by a hardcoded per-template
branch in app code; that path still exists as a fallback, but new templates
should use the `agent` map.)

**Emit an `agent` map** alongside `fields` in `mapping.json`. Each entry maps a
**schema key** → a **branding token**. The platform resolves each token against
the signed-in agent's directory profile (falsy/absent fields are skipped):

```json
{
  "fields": { "...": "..." },
  "agent": {
    "agent.name":      "name",
    "agent.phone":     "phone",
    "agent.email":     "email",
    "agent.dre":       "dre",
    "agent.website":   "website",
    "photos.headshot": "headshot",
    "photos.agentLogo": "logo"
  }
}
```

**Branding token vocabulary** (canonical list — mirrors the app's `brandingValue`
in `lib/branding.ts`; the schema key on the left is whatever YOUR template uses):

| Token | Resolves to | Shape |
|-------|-------------|-------|
| `name` | agent full name | text |
| `title` | agent title, ® stripped (template renders its own ®) | text |
| `phone` | agent phone | text |
| `email` | agent SG email | text |
| `dre` | `DRE #<number>` (prefix added by the app) | text |
| `office` | brokerage/office name | text |
| `officeAddress` | the office's street address | text |
| `website` | `www.web.site` placeholder (no directory field yet — set unconditionally) | text |
| `headshot` | agent headshot image | image `{src}` |
| `logo` | agent personal logo image | image `{src}` |
| `creds` | composite `[title, office]` (drops empties) | **list** of text |
| `contact` | composite `[phone, email]` (drops empties) | **list** of text |

Rules:
- The **left-hand schema key must exist** in `schema.json` (selfcheck enforces
  `agent` keys ⊆ schema keys, same as `fields`).
- The **right-hand token must be in the table above** (selfcheck enforces the
  vocabulary). Unknown tokens are rejected, not silently dropped.
- **`creds` / `contact` are list-typed composites** — only map them to a schema
  field of `type:"list"` (e.g. a `hostedBy.creds` credential line that stacks
  `title` + `office`). For separate single-line fields, use the atomic tokens
  (`title`, `office`, `phone`, `email`) instead.
- Image tokens (`headshot`, `logo`) target the `photos.*` keys you already marked
  `brandingAsset:true` + `role:"branding"` in the schema.
- Brokerage-level strings (return address, brokerage DRE, broker logo) stay as
  fixed `data.json` defaults — they're **not** per-agent, so don't map them.
- **Branding-only templates** (e.g. a business card) with no listing fields still
  get an `agent` map — emit `agent` and OMIT `fields` (or `fields: {}`).

### Two-agent templates: the `coAgent` map (secondary agent)

Some templates are a **two-agent variation** — a co-listing flyer with two headshots
and two contact blocks, say. When an agent starts one, they pick a **co-agent** (from
the directory, or auto-selected from the listing's co-list agent), and the platform
fills the SECONDARY agent block exactly the way it fills the primary one.

If your template has a second agent block, emit a **`coAgent` map** alongside `agent`
in `mapping.json`. It has the **same shape and the same token vocabulary** as `agent`
(the table above) — but its schema keys point at your SECONDARY agent fields, and each
token resolves against the **picked co-agent's** directory profile instead of the
signed-in agent's:

```json
{
  "fields": { "...": "..." },
  "agent": {
    "agent.primary.name":     "name",
    "agent.primary.phone":    "phone",
    "photos.primaryHeadshot": "headshot"
  },
  "coAgent": {
    "agent.secondary.name":     "name",
    "agent.secondary.phone":    "phone",
    "agent.secondary.email":    "email",
    "agent.secondary.dre":      "dre",
    "photos.secondaryHeadshot": "headshot"
  }
}
```

Same rules as `agent` (selfcheck validates `coAgent` identically): the left-hand key
must exist in `schema.json`, the right-hand token must be in the branding vocabulary,
image tokens target `brandingAsset:true` + `role:"branding"` image fields, and
`creds`/`contact` target `type:"list"` fields.

- **Only emit `coAgent` for a two-agent template variation.** A single-agent template
  emits `agent` alone.
- Give the two agents **distinct schema keys** — e.g. `agent.primary.*` /
  `agent.secondary.*` and `photos.primaryHeadshot` / `photos.secondaryHeadshot` — so
  the two blocks are separately addressable. **Never reuse the same key for both.**
- The `coAgent` map is one of two ways this gets configured: an admin can also label
  the secondary fields in the app's template editor after import. Emitting the map
  means the two-agent fill works out of the box, with no post-import step.
- **Team** (3+ agents, a roster from the directory) is a separate, larger case and is
  **not** expressed via `coAgent` — don't attempt it here.

---

## 5.6 Cobranded designs — the agent's OWN logo (ASK; never guess)

Almost every design carries the **brokerage** lockup (Seven Gables). A small number
are **cobranded**: they also have a spot for the **agent's own** logo — their personal
brand mark — which the platform fills from the signed-in agent's chosen logo, the way
it already fills their headshot. Cobranded designs are separate template records; the
app's new-design flow offers the choice, and it needs to know which records qualify.

**The rule that makes this safe: ASK, then tag only when confident.**

A converter that hunts for "a logo" in every PDF gets it wrong in the expensive
direction: it tags the BROKERAGE mark, and every design made from that template
silently replaces the brokerage lockup with an agent's logo. A missing tag is a
visible gap someone fixes in the admin editor; a wrong tag ships bad brokerage
artwork to print. So:

1. **Ask the user, explicitly** (`AskUserQuestion`, §8 step 3b) whether this design
   is cobranded — whether it has a place for the AGENT's own logo as opposed to the
   brokerage lockup. **Do not infer it from the artwork.**
2. If the answer is **no** (the default): emit nothing. No `cobrand` key, no `logo`
   token, no logo schema field. The conversion is exactly what it would have been
   before this section existed.
3. If the answer is **yes**: emit `"cobrand": true` in `manifest.json` — always,
   whether or not you manage to tag the block — and then try to tag the block.

### What "confident" means (the actual rule)

Run these in order over the image placements you catalogued in §8 step 3. All five
must hold; anything else is NOT confident.

1. **Exclude** every image field you tagged `role:"property"` (listing photos).
2. **Exclude** the agent headshot slot.
3. **Exclude** the brokerage lockup: any mark whose extracted crop *is* the
   brokerage wordmark/emblem (you have the crops open — this is a visual judgment,
   not a measurement), and any mark that repeats at the same coordinates on 2+ pages
   (a running brokerage mark or a return-address block).
4. **Exactly one** placement survives 1–3. Zero, or two or more → not confident.
5. That survivor has at least **one positive signal**: a legend beside or inside it
   ("logo", "your logo here", "agent logo", "co-brand"); OR it sits inside the agent
   block (within ~0.5 in of a field you mapped to an `agent.*` branding token) and is
   not the headshot; OR the user's answer named or located it.

Size is a **tiebreaker at most, never a test**. "Small mark" thresholds in inches are
wrong on the sizes this skill converts — 1.5 in is a modest mark on a Letter flyer
and nearly half the width of a 3.5 × 2 in business card.

**Do not ask a second "which block is it?" question to force confidence.** An
untagged cobranded template is a supported outcome — the admin finishes it in the
app's template editor, which offers the same `logo` label.

### Tagging it, when confident

Tag the surviving block the way §5.5 already tags a headshot — same labelling, one
different token:

- `schema.json`: key **`photos.agentLogo`**, `type:"image"`, `brandingAsset: true`,
  `role: "branding"`, with the usual `aspect` / `minPx` computed from the placement.
- `required: **false**` unless you have real default artwork for it in `assets/`. A
  cobrand spot is often an empty box in the source; a `required` field with no
  `data.json` default fails `selfcheck.mjs`.
- `mapping.json`: add `"photos.agentLogo": "logo"` to the **`agent`** map.
- `data.json`: the extracted placeholder artwork if there genuinely is some,
  otherwise `""`.
- `manifest.json`: `"cobrand": true`.

### When you are NOT confident

Emit `"cobrand": true` and **stop** — no logo field, no `logo` token. `selfcheck.mjs`
WARNs about exactly this state, and your §8 report must name the untagged spot and
point the human at the admin editor. That is the designed path, not a failure.

**The `logo` token is the AGENT's logo, never the brokerage's.** If a template's only
mark is the brokerage lockup, it stays a fixed `data.json` default (e.g. a
`brokerLogo` field) and is never mapped to `logo`.

## 5.7 QR codes — NEVER bake the source PDF's code into the template

**If the source design has a QR code, do NOT crop it into `assets/`.**

This is a correctness rule, not a preference. A QR is a picture of a URL. The
one in the source PDF encodes *the original designer's* link — a specific
agent's property page, a campaign that ended, a listing that sold. Cropping it
produces a template that prints that same code on every agent's flyer, forever.
It is wrong on paper, where nothing can correct it: a postcard in a mailbox
cannot be re-issued.

Every other vector mark (brokerage lockup, stat icons, an Equal Housing badge)
IS cropped, because it means the same thing on every copy. A QR does not.

### What to emit instead

**A `qr` schema field**, which the app fills at design time by registering a
short link and rendering the code:

```json
{
  "key": "qr.listing",
  "type": "qr",
  "label": "QR code",
  "description": "Scans through to the property page. The agent chooses which page.",
  "required": true,
  "qrSizeIn": 1.0
}
```

**And an ordinary image element** in `template.html`, positioned where the
source QR sat:

```html
<div class="abs qr-slot"><img id="f-qr" data-field="qr.listing" data-qr alt="QR code"></div>
```

**A placeholder drawn over the slot needs `pointer-events: none`.** The dashed
"click to choose" hint is usually a `::before`/`::after` on the SLOT with
`position:absolute; inset:0`. A pseudo-element hit-tests, and it paints after
the `<img>`, so it takes the click — which then targets the slot, and the slot
carries no `data-field`, so nothing opens. Same dead click as `display:none`,
different cause, and fixing one without the other leaves the QR just as dead.

```css
.qr-slot::after { content:"QR code — click to choose"; position:absolute; inset:0;
                  pointer-events:none; /* REQUIRED */ }
```

`selfcheck.mjs` refuses an absolutely-positioned QR placeholder without it.

**Hide an empty slot with `opacity:0`, NEVER `display:none`.** The `<img>` has
no `src` until a code is minted, so the slot is hidden and the parent's dashed
placeholder shows through. `display:none` and `visibility:hidden` take the
element out of hit-testing: the click never reaches it, the QR panel never
opens, and the code can only be minted from that panel — so the slot can never
leave the state that blocks it. `opacity:0` hides it and keeps it clickable.

```css
.qr-slot img:not([src]), .qr-slot img[src=""] { opacity: 0; }   /* NOT display:none */
```

`selfcheck.mjs` refuses `display:none` and `visibility:hidden` here.

**`data-qr` is load-bearing, not decoration** — and `selfcheck.mjs` now
REFUSES a `qr` field whose element lacks it, because saying it here was not
enough twice. The editor's contract treats
every `img[data-field]` as a PHOTO — drag to reposition, alt+scroll to zoom, and
a click that is deliberately swallowed so the photo tray can open instead
(`if (el.tagName === "IMG") return;`). A QR slot is an `<img>`, so without the
marker clicking it opens the photo panel and the QR panel is unreachable.

**These two edits are not optional.** A template can carry `data-qr`,
`opacity:0` and `pointer-events:none` and STILL be dead: an unguarded click
handler bails on every image, and unguarded pointer handlers drag the code like
a photo. Verified in a browser — with only the guard missing, a real click
produced `img-grab`/`img-release` and the QR panel never opened. `selfcheck.mjs`
refuses both.

Exclude `[data-qr]` from every photo handler and let it through the click
handler:

```js
if (el.tagName === "IMG" && !el.hasAttribute("data-qr")) return;   // click
const img = e.target.closest('img[data-field]:not([data-qr])');    // drag / zoom
```

```css
.mb-editmode img[data-field]:not([data-qr]) { cursor: grab; }
.mb-editmode img[data-qr]                   { cursor: pointer; }
```

Bind it with the template's existing image helper, passing the WHOLE value:

```js
applyImg("f-qr", d.qr?.listing);   // NOT d.qr?.listing.svg
```

The app stores `{ destination, shortCode, shortUrl, src }`, and `src` is the
`data:image/svg+xml` URI — the same key `applyImg` already reads off an image
value, which is what makes "the existing helper works unchanged" true. Do not
unwrap it and do not invent a key: a helper that finds no `src` sets an empty
one, and the slot renders NOTHING, silently, on paper. **Do not type the field as
`image`** — that routes it through the JPEG print conversion and turns a crisp
vector into a bitmap, besides handing it to the photo-upload and MLS
photo-matching paths, which a QR has no business being in.

### `qrSizeIn` — measured, and floored at 0.5in

`qrSizeIn` is the printed edge length in INCHES **of the code itself** — the
image box, EXCLUDING any padding the slot adds around it. Measure the source
QR's box in points and divide by 72.

Which one it measures is load-bearing: a 0.6in slot with 0.1in of padding holds
a 0.4in code, below what a phone reads off paper. Declaring the outer box would
pass the check and print something unscannable. A schema cannot measure CSS, so this declaration is
what the app checks scannability against.

**The minimum is 0.5in (36pt)** (it was 0.9in until 2026-09-14; the owner asked
for 0.5in so postcard-sized codes import as drawn). A real code is 25 modules
plus a 4-module quiet zone each side = 33 modules, which at 0.015in per module
needs 0.495in — a close-range scan, proved to decode at 300 DPI by the app's
`scripts/check-qr-decodes.mjs`. The app still re-checks the declared size
against the REAL code when a link is minted, so a 12-character short code is
refused in a 0.5in slot at that point, never printed.

**If the source QR measures under 36pt, ASK — do not silently emit an
under-minimum value**, which produces a template that fails the app's own gate
with no explanation:

> **This design's QR is 0.4in. The app's minimum is 0.5in, below which a
> printed code is unreliable to scan.**
> — **Enlarge it to 0.5in** (recommended; the layout shifts slightly) ·
> **Keep the source size** (the template will be rejected until someone changes it)

### `qrDestination` — leave it out, and NEVER decode the source

`qrDestination` is an optional default. **Do not read the source PDF's QR to
find one.** That URL belongs to the original design's owner; using it as a
default silently proposes one agent's link to every other agent.

Omit the field and the agent chooses when they open the design. Offer a default
only if the human converting the template tells you which one — the same
judgment gate as cobranding in §5.6: ask, never infer.

### The placeholder

Until the agent picks a destination the `<img>` has no `src`, so the slot must
say what it is rather than showing a blank white square nobody has a reason to
click:

```css
.qr-slot { position: relative; width: 1in; height: 1in; padding: .06in; background: #fff; }
.qr-slot img { width: 100%; height: 100%; display: block; }
/* An <img> with an empty src still paints: a broken-image icon and its alt text,
   right on top of the placeholder. Hide it until it has a real value. */
/* opacity, NOT display:none. The element carrying `data-field` must keep its
 BOX: the editor selects a field by hit-testing what the agent clicked, so a
 zero-size img makes the empty slot unselectable — the click lands on the
 wrapper, which has no data-field, and "make editable" then says there is no
 text to promote. Found 2026-08-30 on the first real QR templates. */
.qr-slot img:not([src]), .qr-slot img[src=""] { opacity: 0; }
.qr-slot::after {
  /* Must not intercept the click, or the field is unselectable. */
  pointer-events: none;
  content: "QR code — click to choose";
  position: absolute; inset: .06in;
  display: flex; align-items: center; justify-content: center; text-align: center;
  font-size: 7pt; line-height: 1.25; color: #8a8a8a;
  border: 1px dashed #c4c4c4; border-radius: 2px;
}
  /* NOT `img[src]` — the fill helper does `el.src = ""` when there is no value,
     which SETS the attribute, so `img[src]` matches an empty one and the
     placeholder disappears behind a blank white square. Found 2026-08-30 by
     rendering it. */
  .qr-slot:has(img[src]:not([src=""]))::after { content: none; border: 0; }
```

The quiet zone is INSIDE the generated SVG, so the padding above is extra
breathing room rather than the margin itself. Keep artwork clear of the slot —
a code with something touching its edge is the classic reason a phone will not
read it.

---

## 6. `template.html` — the layout + render contract (MOST IMPORTANT)

This one file is the fixed layout AND the data→DOM renderer AND the editor
integration. It has **three zones that you customize per template** and a large
**verbatim zone that is platform contract and must be reproduced essentially
byte-for-byte**. Getting the verbatim zone wrong silently breaks the editor, QA,
and export.

### 6.1 The binding model — four things that MUST stay in sync

For every editable field, FOUR locations must agree:

1. the `key` in `schema.json` (e.g. `"photos.mid"`),
2. the structure in `data.json` (e.g. `photos.mid` = array),
3. the DOM node's `data-field` attribute (and `data-index` for list items), and
4. the binding line inside `render()`.

A DOM node is marked editable with `data-field="<key>"`. List **image** items add
`data-index="0|1|2|…"` and share one `data-field`. Each node also carries a stable
`id="f-…"` that `render()` targets. Example:

```html
<div class="abs hero"><img id="f-hero" data-field="photos.hero" alt="Front entry"></div>
...
<div class="p2-mid">
  <div class="cell"><img id="f-mid1" data-field="photos.mid" data-index="0"></div>
  <div class="cell"><img id="f-mid2" data-field="photos.mid" data-index="1"></div>
  <div class="cell"><img id="f-mid3" data-field="photos.mid" data-index="2"></div>
</div>
```

### 6.2 Geometry rules (how to position content)

- Work in **points** (`pt`). 1 inch = 72 pt. US Letter trim = **612 × 792 pt**.
- PDF native units are already points, but the PDF origin is **bottom-left** while
  CSS is **top-left**: `cssTop_pt = pageHeight_pt − pdfY_pt − elementHeight_pt`.
  Convert every measured coordinate this way.
- Each page is one `<section class="page"><div class="sheet">…</div></section>`.
  All inset content is `position:absolute` inside `.sheet`, positioned in `pt`
  (`left`, `top`, `width`, `height`). Define palette colors and per-element CSS in
  the `<style>` block, mirroring the measured PDF exactly (fonts, sizes in `pt`,
  letter-spacing, weights, colors sampled from the PDF).
- Photos sit in a fixed box with `overflow:hidden`; the `<img>` uses
  `width:100%; height:100%; object-fit:cover` so any source fills the box and the
  crop transform can pan/zoom within it.

### 6.3 The bleed mechanism — DO NOT "clean up" (hard-won, 3 failed attempts)

Bleed is **export-only and purely additive** over the trim render, driven by one
CSS variable `--bleed` (set from `manifest.bleedIn`; `0pt` in preview/QA). The
mechanism below is the ONLY one that survives Chromium's PDF pipeline — earlier
attempts with padding, with border+`overflow-clip-margin`, and with `@page { size }`
all produced white strips in the real exported PDF. Preserve it exactly:

- `.page` is the **media box** (trim + 2·bleed) with plain `overflow:hidden`.
- `.sheet` is the **trim area**, offset by `--bleed`, and is the containing block —
  so inset content keeps its exact trim coordinates at any bleed.
- Full-bleed elements overscan **past** `.sheet` to the media edge (a `body.mb-bleed`
  rule widens/moves each one by `--bleed`); `.page` clips them at the media edge.
- **`@page` must NOT set `size`.** The exporter passes explicit width/height to
  `page.pdf()`; a literal `@page size` would pin trim content to the top-left of a
  larger media box and leave the bleed area white. Keep `@page { margin:0; }` only.

Keep the explanatory comments from the reference file in place — they encode why
each alternative fails, so a future editor doesn't reintroduce the bug.

### 6.4 The render + editor-integration JS — REPRODUCE VERBATIM

Everything in the `<script>` is platform contract **except the body of `render()`**,
which you rewrite to bind your fields. Reproduce verbatim:

- the helpers `$`, `text`, `html`, `esc`, `lines`, and `applyImg` (image
  string-or-`{src,crop}` handling — pan via `object-position`, zoom via `transform:
  scale`);
- `window.renderFlyer = render;` (the headless QA + export call this exact name);
- the entire **edit-mode block**: `mouseover`/`mouseout` hover outlines, the
  click-to-edit handler that posts `element-clicked`, the pointer gesture handlers
  that post `img-grab` / `img-pan` / `img-zoom` / `img-release`, the inbound
  `message` handler (`render`, `set-edit-mode`, `highlight`, `clear-highlight`,
  `mark-overflow`, `mark-provisional`, `mark-placeholder`, **`locate-field`,
  `flash-field`** — the last two are REQUIRED for every new conversion, see
  below), and `setActive` / `nodeForKey` / `fieldKeyOf`;
- the **boot sequence and its priority order**: render from
  `window.__FLYER_DATA__` if present, else `fetch("./data.json")`, then
  `postMessage({type:"template-ready"})` to the parent.

**REQUIRED — `locate-field` / `flash-field` (added 2026-07-22, "scroll to
field + flash" round2 W2a #7).** The editor's "fix this" affordance sends
`{type:'locate-field', fieldKey}` and expects the template to reply with
`window.parent.postMessage({type:'field-located', fieldKey, top, height}, '*')`
where `top`/`height` are the `[data-field]` element's **document-relative**
position (`getBoundingClientRect().top + window.scrollY`, and `.height`) — the
parent, not this iframe, does the actual scrolling of its own scaled preview
container. Separately, `{type:'flash-field', fieldKey}` must add class
`mb-flash` to that same element and remove it again after ~1100ms
(`setTimeout(() => el.classList.remove('mb-flash'), 1100)`). Add matching CSS:
a ~1.1s outline+background pulse animation in brand orange `#ff5c33`, with a
`prefers-reduced-motion` static-outline fallback (and no animation at all
under `@media print`). Reference implementation to mirror exactly:
`public/templates/ravenswood/template.html` in the marketing-builder app (its
message listener's `locate-field`/`flash-field` branches and its `.mb-flash`
CSS block) — copy its behavior, not just the shape. The app's serve-time
`lib/templateContract.ts` polyfills these two message types into any
DB-stored template that predates them, but new template folders authored by
this skill must implement them natively — do not rely on the polyfill.

`render(d, opts)` must be **pure, idempotent, and side-effect-free** — it is called
on every keystroke in the editor, inside the QA screenshot pass, and during export.
Only rewrite its body: the per-field `text()/html()/applyImg()` binding lines that
map your `data.json` structure onto your `id="f-…"` nodes (mirror the reference's
`text("f-headline", d.headline)`, `applyImg("f-hero", d.photos?.hero)`, etc.). Use
`text()` for plain strings, `html()` + `esc()` for single rich strings, `lines()`
for `list` text arrays (joins with `<br>`), and `applyImg()` for every image.

### 6.4b Autofit — shrink-to-fit for tracked display type

Every template here is a fixed-layout, absolutely-positioned reproduction:
hard-coded `left`/`top`/`width` in points, no flow to push against. The CONTENT
is variable. `ADDRESS` in a comp is 7 characters; a real one is
`31680 RANCHO VIEJO ROAD`. `MICHAEL HICKMAN` is 15 characters;
`ALEXANDRA MONTGOMERY-WHITFIELD` is 30.

Without intervention the long value overflows its box — over a photo, or past
the trim — or wraps to a line the layout has no room for. Autofit shrinks the
type until it fits and FLAGS the case where even the floor is not enough.

**It is a runtime safety net, not a substitute for validation.** `schema.json`
still carries `maxChars`/`maxLines` so the editor warns at authoring time. If
you widen a box, revisit `maxChars`.

#### Where it goes, and why it cannot go anywhere else

`verbatim-diff.mjs` requires everything in `<script>` to match the skeleton
byte-for-byte EXCEPT the body of `render(data)`. So the engine is defined
**inside `render()`**, after the field bindings. Do not move it to its own
`<script>`, do not attach it to the boot sequence, do not put it in an external
file — all three fail the diff. CSS for fitted elements goes in the per-template
`<style>` block, which is not verbatim-checked.

#### The engine

```js
var FIT_FLOOR   = 0.80;                    // never shrink below 80% of design size
var FIT_TARGETS = ".fr-address, .fr-city, .chip, .price-bar, .ag-name, .ag-phone, .ag-line, .ag-dre";

function __fitText(el) {
  if (!el) return;
  if (!el.getAttribute("data-fit-base")) {                       // cache design size ONCE
    el.setAttribute("data-fit-base", parseFloat(getComputedStyle(el).fontSize));
  }
  var base = parseFloat(el.getAttribute("data-fit-base"));
  if (!base) return;
  el.style.whiteSpace = "nowrap";                                // single-line by contract
  el.style.fontSize   = base + "px";                             // always start from design size
  var avail = el.clientWidth;
  if (!avail) return;                                            // not laid out yet — bail
  var size = base, floor = base * FIT_FLOOR, step = base * 0.005, guard = 0;
  while (el.scrollWidth > avail && size > floor && guard++ < 200) {
    size -= step;
    el.style.fontSize = size + "px";
  }
  var fits = el.scrollWidth <= avail;
  el.setAttribute("data-fit-scale",    (size / base).toFixed(3));
  el.setAttribute("data-fit-overflow", fits ? "false" : "true");
}

function __fitAll() {
  var nodes = document.querySelectorAll(FIT_TARGETS);
  for (var i = 0; i < nodes.length; i++) __fitText(nodes[i]);
}

__fitAll();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(__fitAll);
```

#### Five decisions you must not undo

1. **Letter-spacing in `em`, NEVER `pt`.** The single most important detail.
   These designs use extreme tracking — 0.359em on the AVANT address, 0.533em on
   its city line. Tracking is MOST of the line's width, not a rounding detail.
   In `em` it shrinks with the font size and the line stays optically correct;
   in points the glyphs would shrink while the gaps stayed fixed, recovering
   almost no width.
2. **`text-indent` = `letter-spacing` on centred text.** CSS adds the trailing
   letter-space after the final glyph, pushing centred text left by half a
   space. Setting `text-indent` to the same em value cancels it. Right-aligned
   tracked blocks get a NEGATIVE `margin-right` for the same reason at the other
   edge.
3. **Idempotency via `data-fit-base`.** The design size is cached on first run
   and every run restarts from it. Without this a re-render shrinks an
   already-shrunk element again, compounding — and the editor's live preview
   calls `render()` many times.
4. **Two passes: immediate, then `document.fonts.ready`.** The first measures
   with whatever face is resolved. If webfonts have not loaded that is a
   fallback with different metrics and the answer is wrong. Do not remove the
   second.
5. **The floor hands back; it does not clamp.** At 80% the loop stops and sets
   `data-fit-overflow="true"`. NOTHING IS TRUNCATED. Below ~80% the piece stops
   resembling the approved comp, so a human should shorten the copy. Record it
   in `rules.json` as a `fit-floor` constraint with `owner: "user"`.

**Deliberately NOT fitted:** `description`/`blurb` body copy. Multi-line
justified text looks worse shrunk; validate its length with `maxChars` instead.

#### Six traps, each a real defect already found

**(a) An auto-width absolutely-positioned element is INVISIBLE to the check.**
An `.abs` with no explicit `width` shrink-wraps its content, so
`scrollWidth === clientWidth` always and the engine silently does nothing. Hit
on the Mod `.price`. **Give every fit target an explicit `width`.**

**(b) The box must not run past the TRIM.** The engine fits the text to whatever
box it is given, so an overhang is correct on screen and removed at the
guillotine. `fitcheck` checks this against `--trim-w`.

**(c) The width must be the AVAILABLE GAP, not the panel width.** The worst bug
found. On AVANT PC-8 the agent block got `width: 200pt` at `left: 105.6pt`,
sized off the panel — but the co-agent headshot starts at `275.4pt`, so the real
gap is ~170pt. The engine fitted the name to 200pt and the headshot, later in
DOM order, painted over the last 30pt. The name read `ALEXANDRA MONTGOM▌`.

The engine CANNOT detect this — it only knows its own box. **You set these
widths, so this is yours to get right: measure the distance to the next element
on that row.** An audit found five instances across 24 postcards.

**(d) Flex containers are the least predictable case.** `.chip`, `.price-bar`
and the Mod stat boxes are `display:flex` with centred content, where
`scrollWidth` overflow detection is less reliable. Verified on AVANT PC only.
First suspect when a chip or bar misbehaves.

**(e) A post-build patch gets silently wiped.** The engine was once applied by a
post-processing script that patched generated files; re-running a family's
builder regenerated them WITHOUT it, and it vanished from two templates
unnoticed. **Emit the engine from the builder itself.**

**(f) Fonts and assets must actually resolve.** Open `preview.html` from an
unpacked folder, never inside a zip viewer — relative `fonts/` and `assets/`
paths fail there, the engine measures fallback metrics and shrinks wrongly.

#### Checking it

After a render, every fitted node carries `data-fit-scale` (`1.000` = untouched)
and `data-fit-overflow`. A console audit:

```js
[...document.querySelectorAll('[data-fit-scale]')]
  .filter(n => n.dataset.fitOverflow === 'true' || +n.dataset.fitScale < 0.9)
  .map(n => [n.id, n.dataset.fitScale, n.dataset.fitOverflow]);
```

#### Two audits, and what each can honestly prove

**`fitcheck.mjs`** — no browser. Reads the declared widths and checks that a fit
target does not run past the TRIM, and does not run under a NEIGHBOUR on the
same page. Both are failures. It also reports a target with no width it can
find, as a WARNING pointing at fitprobe.

That warning is a warning because of what happened when it was an error. The
first version failed on it and reported **84 shrink-wrapping targets across 33
templates**. A browser pass then measured all 45 and found **ZERO boxes that
actually grow with their text**: the widths come from a companion class
(`class="abs blk-1 ag-name"` takes its width from `.blk-1`), a parent, or a
shorthand. Composing the element's full class list cut 84 to 9, and all 9 also
measured fixed. **Static analysis can prove a width is DECLARED; it cannot prove
one is ABSENT.**

**`fitprobe.mjs`** — full mode. Renders the template, calls `render()` and reads
the engine's own output. It answers what static cannot:

- did the engine RUN, and did every declared target get stamped;
- does a box GROW with its text (trap (a), measured rather than inferred);
- does a line hit the FLOOR;
- do two elements COLLIDE, using real rects.

**And it stresses the content**, which is the part that finds new bugs. Each text
field is filled to ITS OWN DECLARED `maxChars` — the longest value the template
says it accepts. If it cannot render that, either the box is too small or
`maxChars` is a lie.

Two rules that keep it honest: an overlap present with the SHIPPED sample is the
DESIGN, not a defect — AVANT's stat chips deliberately sit over the photos and
`rules.json` says so — so only overlaps that APPEAR under stress are reported.
And the floor is read from the template, because the postcards run a newer
engine reaching 0.73 rather than the 0.80 documented here.

**Across the 45 templates carrying the engine, 51 lines hit the floor at their
own declared `maxChars`, in 31 templates** — every AVANT family, plus Minimal
and Mod.

**That is the system WORKING, not a defect list. Do not widen those boxes and do
not lower those `maxChars`** (owner, 2026-08-30). The floor is a hand-back by
design: nothing is truncated, `data-fit-overflow` is raised, QA reports it and
the agent shortens the copy — which is why `rules.json` records `fit-floor` with
`owner: "user"`. `maxChars` is the outer bound of what is *legal*, not a promise
that every legal value looks good at design size.

Read the number as coverage instead: it says the engine is reachable and
correctly signalling on 31 templates. What WOULD be a defect is a line that
overflows without raising the flag.

**Honest status, updated:** the handoff recorded the engine as observed on ONE
template. `fitprobe` has now run it on all 45 that carry it, under both the
shipped sample and stressed content. What remains unverified is how it LOOKS —
these checks measure geometry, not whether 0.73 scale still resembles the
approved comp.

#### The other engine — `__flowBody`, Sectional flyers only

`sectional-2-flyer-4/5/6` carry a second, unrelated mechanism: one `description`
string flowed across three columns of different widths and depths, each paired
with and vertically centred against a photo. Distribution is BALANCED, not
greedy — it binary-searches the shallowest common depth at which all the copy
fits, so no column is left empty. Breaks land on word boundaries; copy too long
for all three sets `.mb-overflow` and a non-zero `window.__flowLeftover`, and is
never truncated.

That code was inherited verbatim from a client-supplied template. **Preserve it
as-is.** Those templates also use an OLDER autofit (`[data-fit]` attributes,
reducing letter-spacing toward 0 BEFORE touching font-size, measuring with
`Range` + `getClientRects`). That approach is arguably better — it loses the
airiness before it loses the type size, and `getClientRects` handles flex
containers more predictably than `scrollWidth`, which would likely fix trap (d).
Two implementations coexist. **Do not "unify" them without testing both
families.**

---

### 6.5 Full reference `template.html`

Use this verbatim as your skeleton. **Customize** only: (1) the `@font-face` + CSS
in `<style>`, (2) the page `<section>` DOM, and (3) the body of `render()`. **Keep
verbatim** everything else, especially the bleed CSS structure and the entire
edit-mode/boot JS.

````html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ravenswood Flyer — template</title>

<!--
  Self-contained, fixed-layout, print-accurate. Content is NOT in this file:
  it lives in data.json and is injected into the pure render(data) below. This
  is the SINGLE render path used by (1) the live-preview iframe, (2) the QA
  screenshot pass, and (3) the PDF export.

  Data is provided three ways, in priority order:
    1. window.__FLYER_DATA__ inlined before this script (standalone export), else
    2. postMessage({ type:"render", data }) from a parent (the editor), else
    3. fetch("./data.json") (standalone, when served over HTTP).
-->

<style>
  /* ---- Fonts (self-contained, no internet needed) ---------------------- */
  @font-face { font-family:"Lato"; font-weight:300; src:url("fonts/Lato-Light.ttf") format("truetype"); }
  @font-face { font-family:"Lato"; font-weight:400; src:url("fonts/Lato-Regular.ttf") format("truetype"); }
  @font-face { font-family:"Lato"; font-weight:500; src:url("fonts/Lato-Medium.ttf") format("truetype"); }
  @font-face { font-family:"Lato"; font-weight:700; src:url("fonts/Lato-Bold.ttf") format("truetype"); }
  @font-face { font-family:"BornReady"; src:url("fonts/BornReadySlanted.ttf") format("truetype"); }

  /* ---- Color palette (sample from the source PDF) ---------------------- */
  :root{
    --navy:#1D252C; --ink:#231F20; --body:#4D4D4F; --line:#4D4D4F;
    --photo-bg:#E6E7E8; --black:#000000;
    /* Trim is intrinsic to this template's absolute-pt layout; these mirror
       manifest.trim. Bleed defaults to 0 (preview/QA) and is set by render()
       from manifest.bleedIn at export time. */
    --trim-w:8.5in; --trim-h:11in; --bleed:0pt;
  }

  *{ box-sizing:border-box; margin:0; padding:0; }
  /* No `size` here: export's page.pdf() passes explicit width/height (the
     manifest media box). A literal `@page size` would define the LAYOUT page
     box independently of that — content would flow into an 8.5x11 region pinned
     top-left of the larger media box, leaving the bleed area white. Omitting
     size lets page.pdf's dimensions drive both the media box AND layout, so
     bleed geometry survives into the PDF. */
  @page{ margin:0; }
  html,body{ background:#525252; }
  body{
    font-family:"Lato",Arial,sans-serif; color:var(--ink);
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  /* ---- Bleed geometry (export only) -----------------------------------
     Purely ADDITIVE over the trim render, all driven by --bleed (set from
     manifest.bleedIn; 0pt = trim, so preview/QA are unchanged):

     .page is the MEDIA box (trim + 2*bleed) with plain overflow:hidden, so it
     clips at the media edge. We use a structural inner .sheet rather than a
     border/padding/overflow-clip trick: padding doesn't move the abspos origin,
     a border does but then overflow:hidden clips at the trim edge (inkless
     bleed), and overflow-clip-margin fixes that ON SCREEN but is DROPPED in
     Chromium's PDF pipeline (verified — real PDF had white strips). Plain
     overflow:hidden on a media-sized box is the one mechanism that survives
     print. .sheet is the trim area, offset by --bleed and acting as the
     containing block, so inset content keeps its exact trim coordinates; the
     full-bleed photos extend past .sheet to the media edge and .page clips them
     there. No crop marks in v1. */
  .page{
    position:relative;
    width:calc(var(--trim-w) + 2*var(--bleed));
    height:calc(var(--trim-h) + 2*var(--bleed));
    background:#fff; overflow:hidden; margin:24px auto; box-shadow:0 4px 22px rgba(0,0,0,.45);
  }
  /* The trim area: origin re-located by --bleed, the containing block for all
     inset content. At --bleed:0 it fills .page (trim), so trim mode is a no-op. */
  .sheet{
    position:absolute; left:var(--bleed); top:var(--bleed);
    width:var(--trim-w); height:var(--trim-h);
  }
  @media print{
    html,body{ background:#fff; }
    .page{ margin:0; box-shadow:none; page-break-after:always; }
    .page:last-child{ page-break-after:auto; }
  }

  /* Full-bleed overscan: each edge photo widens/moves by --bleed so it reaches
     the media edge. One rule per full-bleed element. */
  body.mb-bleed .backyard{
    left:calc(-1*var(--bleed)); width:calc(612pt + 2*var(--bleed)); height:calc(384pt + var(--bleed));
  }
  body.mb-bleed .p2-photo-tl{
    left:calc(-1*var(--bleed)); top:calc(-1*var(--bleed));
    width:calc(298pt + var(--bleed)); height:calc(284pt + var(--bleed));
  }
  body.mb-bleed .p2-photo-tr{
    top:calc(-1*var(--bleed));
    width:calc(298pt + var(--bleed)); height:calc(284pt + var(--bleed));
  }

  .abs{ position:absolute; }
  img{ display:block; }

  /* ---- Edit mode (editor only; never affects print/standalone) --------- */
  .mb-editmode [data-field]{ cursor:pointer; }
  .mb-editmode img[data-field]{ cursor:grab; }
  .mb-editmode img[data-field]:active{ cursor:grabbing; }
  .mb-editable-hover{ outline:2px solid #5b8cff !important; outline-offset:1px; }
  .mb-editable-active{ outline:2px solid #ffb020 !important; outline-offset:1px; }
  /* Over-length field flagged by the editor (too long for its box). */
  .mb-overflow{ outline:2px dashed #e05656 !important; outline-offset:2px; }
  /* Field still showing the template default (sample) text — a passive
     hint outline until the agent edits it. Editor preview only; never
     printed/exported (see the @media print reset below). */
  .mb-placeholder{ box-shadow:inset 0 0 0 2px #f0a020 !important; background:rgba(240,160,32,.08) !important; }
  @media print{ .mb-placeholder{ box-shadow:none !important; background:none !important; } }
  /* Low-res MLS placeholder photo: amber inset frame + corner badge (editor only). */
  .mb-provisional{ box-shadow:inset 0 0 0 3px #f0a020 !important; }
  .mb-provisional::after{ content:"⚠ MLS — replace"; position:absolute; left:0; top:0; z-index:6;
    background:#f0a020; color:#1a1a1a; font:600 9px/1 "Lato",Arial,sans-serif; padding:3px 5px; letter-spacing:.3px; pointer-events:none; }
  @media print{ .mb-editable-hover, .mb-editable-active, .mb-overflow{ outline:none !important; }
    .mb-provisional{ box-shadow:none !important; } .mb-provisional::after{ display:none !important; } }
  /* "Fix" → scroll into view + flash (round2 W2a #7; REQUIRED, see §6.4). */
  .mb-flash{ animation: mb-flash-pulse 1.1s ease-out; }
  @keyframes mb-flash-pulse{
    0%{ outline:3px solid #ff5c33; outline-offset:2px; background-color:rgba(255,92,51,.22); }
    100%{ outline:3px solid rgba(255,92,51,0); outline-offset:2px; background-color:rgba(255,92,51,0); }
  }
  @media (prefers-reduced-motion: reduce){ .mb-flash{ animation:none; outline:3px solid #ff5c33; outline-offset:2px; } }
  @media print{ .mb-flash{ animation:none; outline:none !important; background:none !important; } }
  #mb-img-hint{
    position:fixed; z-index:99999; pointer-events:none; display:none;
    transform:translateX(-50%);
    background:rgba(15,17,21,.85); color:#fff; border-radius:6px;
    padding:5px 9px; white-space:nowrap;
    font:500 11px/1.2 "Lato",Arial,sans-serif; letter-spacing:.2px;
    box-shadow:0 2px 10px rgba(0,0,0,.4);
  }
  @media print{ #mb-img-hint{ display:none !important; } }

  /* =====================  PAGE 1  (CUSTOMIZE per template)  ============= */
  .frame{ left:36pt; top:48pt; width:540pt; height:308pt; border:0.6pt solid var(--line); }
  .title-mask{ left:73pt; top:14pt; width:466pt; height:46pt; background:#fff; }
  .title{ left:0; right:0; top:25pt; text-align:center; font-family:"BornReady",cursive; font-size:43pt; line-height:1; color:var(--navy); }
  .hero{ left:50pt; top:89pt; width:512pt; height:254pt; background:var(--photo-bg); overflow:hidden; }
  .hero img{ width:100%; height:100%; object-fit:cover; }
  .open-house{ left:89pt; top:305pt; width:434pt; height:38pt; background:#fff;
    display:flex; align-items:center; justify-content:center; font-size:10pt; color:var(--ink); letter-spacing:1.6pt; }
  .open-house b{ font-weight:700; }
  .open-house .reg{ font-weight:400; }
  .address-bar{ left:36pt; top:367pt; width:540pt; height:16pt; background:var(--navy); color:#fff;
    display:flex; align-items:center; justify-content:center; font-size:10pt; letter-spacing:2.4pt; }
  .address-bar b{ font-weight:700; }
  .address-bar .reg{ font-weight:400; }
  .stats{ left:89pt; top:401pt; width:434pt; height:47pt; background:#fff;
    display:flex; align-items:center; justify-content:space-between; padding:0 22pt; }
  .stat{ display:flex; align-items:center; gap:11pt; }
  .stat-num{ font-size:12pt; color:var(--ink); }
  .stat-ico{ height:24pt; width:auto; }
  .stat .stat-ico.bath{ height:21pt; }
  .stat .stat-ico.lot{ height:20pt; }
  .divider{ width:0.6pt; height:26pt; background:#c9c9ca; }
  .backyard{ left:0; top:408pt; width:612pt; height:384pt; background:var(--photo-bg); overflow:hidden; }
  .backyard img{ width:100%; height:100%; object-fit:cover; }
  .watermark{ left:0; right:0; top:731pt; text-align:center; }
  .watermark img{ width:150pt; height:auto; margin:0 auto; }

  /* =====================  PAGE 2  (CUSTOMIZE per template)  ============= */
  .p2-photo-tl{ left:0; top:0; width:298pt; height:284pt; background:var(--photo-bg); overflow:hidden; }
  .p2-photo-tr{ left:314pt; top:0; width:298pt; height:284pt; background:var(--photo-bg); overflow:hidden; }
  .p2-photo-tl img,.p2-photo-tr img{ width:100%; height:100%; object-fit:cover; }
  .p2-mid{ left:58pt; top:250pt; width:498pt; height:127pt; display:flex; justify-content:space-between; }
  .p2-mid .cell{ width:157pt; height:127pt; background:var(--photo-bg); overflow:hidden; }
  .p2-mid .cell img{ width:100%; height:100%; object-fit:cover; }
  .description{ left:73pt; top:396pt; width:469pt; font-size:10pt; line-height:14.3pt; color:var(--body); text-align:justify; }
  .headshot{ left:72pt; top:642pt; width:65pt; height:98pt; background:var(--photo-bg); overflow:hidden; }
  .headshot img{ width:100%; height:100%; object-fit:cover; }
  .hosted{ left:145pt; top:640pt; width:200pt; color:var(--black); }
  .hosted .label{ font-weight:500; font-size:11pt; }
  .hosted .name{ font-weight:700; font-size:12.3pt; margin-top:1pt; }
  .hosted .creds{ font-weight:700; font-size:8pt; line-height:10pt; margin-top:1pt; }
  .hosted .contact{ font-weight:500; font-size:10pt; line-height:12pt; margin-top:5pt; }
  .hosted .dre{ font-weight:400; font-size:8pt; margin-top:4pt; }
  .ag-logo{ left:291pt; top:661pt; width:94pt; text-align:center; }
  .ag-logo img{ width:100%; height:auto; }
  .listing{ right:62pt; top:646pt; width:240pt; text-align:right; color:var(--black); }
  .listing .label{ font-weight:500; font-size:11pt; }
  .listing .firm{ font-weight:500; font-size:11pt; line-height:13pt; }
  .listing .name{ font-weight:700; font-size:12.3pt; margin-top:3pt; }
  .listing .role{ font-weight:700; font-size:8pt; margin-top:1pt; }
  .listing .contact{ font-weight:500; font-size:10pt; margin-top:5pt; }
  .listing .dre{ font-weight:400; font-size:8pt; margin-top:3pt; }
  .footer{ left:73pt; top:754pt; width:466pt; text-align:center; color:var(--body); }
  .footer .f1{ font-weight:500; font-size:5.4pt; line-height:7pt; }
  .footer .f2{ font-weight:300; font-size:5.4pt; line-height:7pt; margin-top:1pt; }
</style>
</head>
<body>

<!-- ============================ PAGE 1 (CUSTOMIZE DOM) ============================ -->
<section class="page" id="page1">
 <div class="sheet">
  <div class="abs frame"></div>
  <div class="abs title-mask"></div>
  <div class="abs title" id="f-headline" data-field="headline"></div>

  <div class="abs hero"><img id="f-hero" data-field="photos.hero" alt="Front entry"></div>

  <div class="abs open-house">
    <b>OPEN&nbsp;HOUSE</b><span class="reg">&nbsp;&nbsp;|&nbsp;&nbsp;<span id="f-openhouse" data-field="openHouse"></span></span>
  </div>

  <div class="abs address-bar">
    <b id="f-address" data-field="address"></b><span class="reg">&nbsp;&nbsp;|&nbsp;&nbsp;<span id="f-city" data-field="city"></span></span>
  </div>

  <div class="abs stats">
    <div class="stat"><span class="stat-num" id="f-beds" data-field="stats.beds"></span><img class="stat-ico bed"  src="assets/icon_bed.png"  alt="beds"></div>
    <div class="divider"></div>
    <div class="stat"><span class="stat-num" id="f-baths" data-field="stats.baths"></span><img class="stat-ico bath" src="assets/icon_bath.png" alt="baths"></div>
    <div class="divider"></div>
    <div class="stat"><span class="stat-num" id="f-sqft" data-field="stats.sqft"></span><img class="stat-ico sqft" src="assets/icon_sqft.png" alt="sq ft"></div>
    <div class="divider"></div>
    <div class="stat"><span class="stat-num" id="f-lot" data-field="stats.lot"></span><img class="stat-ico lot"  src="assets/icon_lot.png"  alt="lot sq ft"></div>
  </div>

  <div class="abs backyard"><img id="f-backyard" data-field="photos.backyard" alt="Backyard"></div>
  <div class="abs watermark"><img id="f-wm" data-field="watermark.logo" alt="Watermark"></div>
 </div>
</section>

<!-- ============================ PAGE 2 (CUSTOMIZE DOM) ============================ -->
<section class="page" id="page2">
 <div class="sheet">
  <div class="abs p2-photo-tl"><img id="f-tl" data-field="photos.topLeft" alt="Interior"></div>
  <div class="abs p2-photo-tr"><img id="f-tr" data-field="photos.topRight" alt="Interior"></div>

  <div class="abs p2-mid">
    <div class="cell"><img id="f-mid1" data-field="photos.mid" data-index="0" alt="Interior"></div>
    <div class="cell"><img id="f-mid2" data-field="photos.mid" data-index="1" alt="Interior"></div>
    <div class="cell"><img id="f-mid3" data-field="photos.mid" data-index="2" alt="Interior"></div>
  </div>

  <p class="abs description" id="f-description" data-field="description"></p>

  <div class="abs headshot"><img id="f-headshot" data-field="photos.headshot" alt="Agent"></div>

  <div class="abs hosted" data-group="Hosting agent">
    <div class="label"   id="f-h-label"></div>
    <div class="name"    id="f-h-name"    data-field="hostedBy.name"></div>
    <div class="creds"   id="f-h-creds"   data-field="hostedBy.creds"></div>
    <div class="contact" id="f-h-contact" data-field="hostedBy.contact"></div>
    <div class="dre"     id="f-h-dre"     data-field="hostedBy.dre"></div>
  </div>

  <div class="abs ag-logo"><img id="f-logo" data-field="photos.agentLogo" alt="Agent logo"></div>

  <div class="abs listing" data-group="Listing agent">
    <div class="label"   id="f-l-label"></div>
    <div class="firm"    id="f-l-firm"    data-field="listingBy.firm"></div>
    <div class="name"    id="f-l-name"    data-field="listingBy.name"></div>
    <div class="role"    id="f-l-role"></div>
    <div class="contact" id="f-l-contact" data-field="listingBy.contact"></div>
    <div class="dre"     id="f-l-dre"     data-field="listingBy.dre"></div>
  </div>

  <div class="abs footer">
    <div class="f1" id="f-foot1" data-field="footer.line1"></div>
    <div class="f2" id="f-foot2" data-field="footer.line2"></div>
  </div>
 </div>
</section>

<!-- =====================  RENDER + EDITOR INTEGRATION  ===================== -->
<!-- Everything below is PLATFORM CONTRACT. Reproduce verbatim EXCEPT the body of
     render(), which you rewrite to bind YOUR fields. -->
<script>
  const $ = id => document.getElementById(id);
  const text = (id, v) => { const el = $(id); if (el) el.textContent = v ?? ""; };
  const html = (id, v) => { const el = $(id); if (el) el.innerHTML = v ?? ""; };
  const esc  = s => (s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const lines = arr => (arr || []).map(esc).join("<br>");

  // An image value is either "url" OR { src, crop:{x,y,scale} }. The crop is a
  // non-destructive pan (x,y in 0..1) + zoom (scale >= 1) applied to the <img> —
  // NO pixel editing, and it lives in data so preview, QA, and export all show
  // the identical framing.
  function applyImg(id, value) {
    const el = $(id);
    if (!el) return;
    const src = typeof value === "string" ? value : (value && value.src) || "";
    el.src = src;
    const crop = value && typeof value === "object" ? value.crop : null;
    if (crop) {
      const x = (crop.x ?? 0.5) * 100;
      const y = (crop.y ?? 0.5) * 100;
      const scale = crop.scale ?? 1;
      el.style.objectPosition = x + "% " + y + "%";
      el.style.transformOrigin = x + "% " + y + "%";
      el.style.transform = "scale(" + scale + ")";
    } else {
      el.style.objectPosition = "50% 50%";
      el.style.transformOrigin = "50% 50%";
      el.style.transform = "none";
    }
  }

  // ===== CUSTOMIZE: only the BINDINGS inside render() change per template. =====
  // Keep the bleed handling at the top exactly as-is.
  function render(d, opts) {
    if (!d) return;
    // Bleed mode is export-only and purely additive; preview/QA omit opts.
    const bleedOn = !!(opts && opts.bleed);
    document.body.classList.toggle("mb-bleed", bleedOn);
    if (bleedOn) {
      const bi = typeof opts.bleedIn === "number" ? opts.bleedIn : 0.125;
      document.documentElement.style.setProperty("--bleed", bi + "in");
    } else {
      document.documentElement.style.removeProperty("--bleed");
    }

    // ---- field bindings (rewrite this block for your schema/data) ----
    text("f-headline", d.headline || "");
    text("f-openhouse", d.openHouse);
    text("f-address", d.address);
    text("f-city", d.city);
    text("f-beds",  d.stats?.beds);
    text("f-baths", d.stats?.baths);
    text("f-sqft",  d.stats?.sqft);
    text("f-lot",   d.stats?.lot);
    text("f-description", d.description);

    html("f-h-label",   esc(d.hostedBy?.label));
    html("f-h-name",    esc(d.hostedBy?.name));
    html("f-h-creds",   lines(d.hostedBy?.creds));
    html("f-h-contact", lines(d.hostedBy?.contact));
    html("f-h-dre",     esc(d.hostedBy?.dre));

    html("f-l-label",   esc(d.listingBy?.label));
    html("f-l-firm",    esc(d.listingBy?.firm));
    html("f-l-name",    esc(d.listingBy?.name));
    html("f-l-role",    esc(d.listingBy?.role));
    html("f-l-contact", lines(d.listingBy?.contact));
    html("f-l-dre",     esc(d.listingBy?.dre));

    applyImg("f-wm", d.watermark?.logo);
    text("f-foot1", d.footer?.line1);
    text("f-foot2", d.footer?.line2);

    const p = d.photos || {};
    applyImg("f-hero",     p.hero);
    applyImg("f-backyard", p.backyard);
    applyImg("f-tl",       p.topLeft);
    applyImg("f-tr",       p.topRight);
    applyImg("f-mid1",     p.mid?.[0]);
    applyImg("f-mid2",     p.mid?.[1]);
    applyImg("f-mid3",     p.mid?.[2]);
    applyImg("f-headshot", p.headshot);
    applyImg("f-logo",     p.agentLogo);
    // ---- end field bindings ----
  }

  // The headless QA + export call this EXACT name. Do not rename.
  window.renderFlyer = render;

  // ===== VERBATIM BELOW: edit-mode + messaging + boot. Do not modify. =====
  let editMode = false;

  function fieldKeyOf(el) {
    if (!el || !el.dataset || el.dataset.field == null) return null;
    const idx = el.dataset.index;
    return idx != null ? `${el.dataset.field}[${idx}]` : el.dataset.field;
  }
  function nodeForKey(key) {
    const m = key.match(/^(.*?)(?:\[(\d+)\])?$/);
    const base = m[1], idx = m[2];
    if (idx != null)
      return document.querySelector(`[data-field="${base}"][data-index="${idx}"]`);
    return document.querySelector(`[data-field="${base}"]`);
  }

  let imgHint;
  function showImgHint(img) {
    if (!imgHint) {
      imgHint = document.createElement("div");
      imgHint.id = "mb-img-hint";
      imgHint.textContent = "Drag to reposition · Alt/⌘ + scroll to zoom";
      document.body.appendChild(imgHint);
    }
    const r = img.getBoundingClientRect();
    imgHint.style.left = r.left + r.width / 2 + "px";
    imgHint.style.top = r.top + 8 + "px";
    imgHint.style.display = "block";
  }
  function hideImgHint() { if (imgHint) imgHint.style.display = "none"; }

  document.addEventListener("mouseover", (e) => {
    if (!editMode) return;
    const el = e.target.closest("[data-field]");
    if (el) el.classList.add("mb-editable-hover");
    if (el && el.tagName === "IMG") showImgHint(el);
    else hideImgHint();
  });
  document.addEventListener("mouseout", (e) => {
    const el = e.target.closest && e.target.closest("[data-field]");
    if (el) el.classList.remove("mb-editable-hover");
    if (el && el.tagName === "IMG") hideImgHint();
  });
  document.addEventListener("click", (e) => {
    if (!editMode) return;
    const el = e.target.closest("[data-field]");
    if (!el) return;
    if (el.tagName === "IMG") return;
    e.preventDefault();
    e.stopPropagation();
    const key = fieldKeyOf(el);
    const group = el.closest("[data-group]");
    const r = el.getBoundingClientRect();
    window.parent.postMessage(
      { type: "element-clicked", fieldKey: key, group: group ? group.dataset.group : null,
        top: r.top + window.scrollY, height: r.height },
      "*",
    );
  }, true);

  let imgGesture = null;
  let imgPending = null;
  const TOUCH_SLOP = 18;

  document.addEventListener("pointerdown", (e) => {
    if (!editMode) return;
    const img = e.target.closest("img[data-field]");
    if (!img) return;
    const key = fieldKeyOf(img);
    const r = img.getBoundingClientRect();
    const top = r.top + window.scrollY;
    if (e.pointerType === "touch" && img !== activeEl) {
      imgPending = { key, sx: e.clientX, sy: e.clientY, top };
      return;
    }
    e.preventDefault();
    imgGesture = { key, sx: e.clientX, sy: e.clientY, w: r.width || 1, h: r.height || 1, top, moved: false };
    try { img.setPointerCapture(e.pointerId); } catch (_) {}
    img.style.touchAction = "none";
    hideImgHint();
    window.parent.postMessage({ type: "img-grab", fieldKey: key }, "*");
  }, true);

  document.addEventListener("pointermove", (e) => {
    if (imgPending) {
      const dx = e.clientX - imgPending.sx, dy = e.clientY - imgPending.sy;
      if (dx * dx + dy * dy > TOUCH_SLOP * TOUCH_SLOP) imgPending = null;
      return;
    }
    if (!imgGesture) return;
    const dx = e.clientX - imgGesture.sx, dy = e.clientY - imgGesture.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) imgGesture.moved = true;
    window.parent.postMessage(
      { type: "img-pan", fieldKey: imgGesture.key, dxFrac: dx / imgGesture.w, dyFrac: dy / imgGesture.h },
      "*",
    );
  });

  document.addEventListener("pointerup", () => {
    if (imgPending) {
      const p = imgPending;
      imgPending = null;
      window.parent.postMessage({ type: "img-grab", fieldKey: p.key }, "*");
      window.parent.postMessage({ type: "img-release", fieldKey: p.key, moved: false, top: p.top }, "*");
      return;
    }
    if (!imgGesture) return;
    window.parent.postMessage(
      { type: "img-release", fieldKey: imgGesture.key, moved: imgGesture.moved, top: imgGesture.top },
      "*",
    );
    imgGesture = null;
  });

  document.addEventListener("pointercancel", () => {
    imgPending = null;
    if (imgGesture) {
      window.parent.postMessage(
        { type: "img-release", fieldKey: imgGesture.key, moved: imgGesture.moved, top: imgGesture.top },
        "*",
      );
      imgGesture = null;
    }
  });
  document.addEventListener("wheel", (e) => {
    if (!editMode) return;
    const img = e.target.closest("img[data-field]");
    if (!img) return;
    if (!(e.altKey || e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    window.parent.postMessage({ type: "img-zoom", fieldKey: fieldKeyOf(img), delta: -e.deltaY }, "*");
  }, { passive: false });

  let activeEl = null;
  function setActive(el) {
    if (activeEl) {
      activeEl.classList.remove("mb-editable-active");
      if (activeEl.tagName === "IMG") activeEl.style.touchAction = "";
    }
    activeEl = el;
    if (el) {
      el.classList.add("mb-editable-active");
      if (el.tagName === "IMG") el.style.touchAction = "none";
    }
  }

  window.addEventListener("message", (e) => {
    const msg = e.data || {};
    if (msg.type === "render") render(msg.data);
    else if (msg.type === "set-edit-mode") {
      editMode = !!msg.on;
      document.body.classList.toggle("mb-editmode", editMode);
      if (!editMode) { setActive(null); hideImgHint(); }
    } else if (msg.type === "highlight") setActive(nodeForKey(msg.fieldKey));
    else if (msg.type === "clear-highlight") setActive(null);
    else if (msg.type === "mark-overflow") {
      document.querySelectorAll(".mb-overflow").forEach((n) => n.classList.remove("mb-overflow"));
      (msg.keys || []).forEach((k) => {
        const n = nodeForKey(k) || document.querySelector(`[data-field="${k.replace(/\[\d+\]$/, "")}"]`);
        if (n) n.classList.add("mb-overflow");
      });
    } else if (msg.type === "mark-provisional") {
      document.querySelectorAll(".mb-provisional").forEach((n) => n.classList.remove("mb-provisional"));
      (msg.keys || []).forEach((k) => {
        const n = nodeForKey(k) || document.querySelector(`[data-field="${k.replace(/\[\d+\]$/, "")}"]`);
        const box = n && n.tagName === "IMG" ? (n.parentElement || n) : n;
        if (box) box.classList.add("mb-provisional");
      });
    } else if (msg.type === "mark-placeholder") {
      document.querySelectorAll(".mb-placeholder").forEach((n) => n.classList.remove("mb-placeholder"));
      (msg.keys || []).forEach((k) => {
        const base = k.replace(/\[\d+\]$/, "");
        document.querySelectorAll(`[data-field="${base}"]`).forEach((n) => n.classList.add("mb-placeholder"));
      });
    } else if (msg.type === "locate-field") {
      // Reference impl of the generic scroll-to-field bridge (round2 W2a #7):
      // reply with the element's document-relative position; the parent scrolls
      // its own scaled preview container (it — not this iframe — is what scrolls).
      const el = nodeForKey(msg.fieldKey);
      if (el) {
        const r = el.getBoundingClientRect();
        window.parent.postMessage(
          { type: "field-located", fieldKey: msg.fieldKey, top: r.top + window.scrollY, height: r.height },
          "*",
        );
      }
    } else if (msg.type === "flash-field") {
      const el = nodeForKey(msg.fieldKey);
      if (el) {
        el.classList.add("mb-flash");
        setTimeout(() => el.classList.remove("mb-flash"), 1100);
      }
    }
  });

  (async function boot() {
    if (window.__FLYER_DATA__) {
      render(window.__FLYER_DATA__);
    } else {
      try {
        const res = await fetch("./data.json", { cache: "no-store" });
        if (res.ok) render(await res.json());
      } catch (_) { /* opened via file:// with no inline data — stays blank */ }
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "template-ready" }, "*");
    }
  })();
</script>

</body>
</html>
````

---

## 7. Fonts & assets — pitfalls that will bite you

- **PDF-embedded fonts are usually SUBSETS** (only the glyphs the document used)
  and their license is often unclear. Do NOT rip a subset out of the PDF, embed it,
  and pretend it covers arbitrary text — that breaks the moment a user types a new
  headline (the missing glyphs render as blank boxes). Instead: identify the
  typeface (`pdffonts` lists names), obtain the **full, embedding-licensed** font
  file from the user or a legitimate source, and record the real license in
  `manifest.fonts[].license`. If you truly can only bundle a subset, set
  `fontSubset: true` on the affected schema field AND declare it in
  `rules.json.subsetFonts` so QA flags blank glyphs. Be honest about coverage.
- **Bundle every weight you use** as its own `@font-face` (e.g. Lato 300/400/500/700
  are four files).
- **Images:** extract the real photos (`pdfimages -all`) for faithful defaults, but
  PDF-embedded copies are often below 300 DPI at placed size. Record honest `minPx`
  in the schema; if the extracted default is too low-res, note it — the platform
  will ask the user for a higher-res upload at edit time. `object-fit:cover` frames
  any source; the crop transform (`{x,y,scale}`) pans/zooms within the box.

---

## 8. Step-by-step method

1. **Probe the PDF.** Get page count, MediaBox/TrimBox (→ `trim`, `pages`,
   `bleedIn`). Identify fonts (`pdffonts`) and images (`pdfimages -list`). Extract
   text (`pdftotext -layout`).
2. **Render each page to a high-res PNG** (`pdftoppm -png -r 300`) to measure
   element geometry. For every text run, photo box, rule, and color block, record
   `left/top/width/height` in **points** (remember the Y-flip in §6.2), font family
   + size + weight + letter-spacing, and sampled hex colors.
3. **Extract assets** into `assets/` (photos, logos, icons) and **source full
   licensed fonts** into `fonts/` (§7).
3b. **Ask the cobrand question** (§5.6) — with the marks from step 3 in front of
   you, ask the user explicitly whether this design is **cobranded**: does it have a
   place for the AGENT'S OWN logo, as opposed to the brokerage lockup? Never infer
   it. A "no" (the default) means nothing cobrand-related is emitted anywhere. A
   "yes" means `manifest.cobrand: true` plus a tagged `photos.agentLogo` field IF
   and only if the §5.6 confidence rule is satisfied.
4. **Build `template.html`** from the §6.5 skeleton: replace the `@font-face` +
   per-element CSS with your measured layout, replace the page `<section>` DOM with
   your elements (each editable node gets `id="f-…"`, `data-field`, and `data-index`
   for list images), and rewrite the `render()` binding block. Keep all verbatim
   zones unchanged. Preserve the bleed CSS structure (§6.3).
5. **Externalize content** into `data.json` (the real values from the PDF, including
   fixed render-only strings) and define the editable subset in `schema.json` with
   accurate `constraints` (compute image `aspect`/`minPx` per §3). **Tag image fields
   for the listing flow:** `role:"property"` + `classifyHints` on every photo that
   should fill from an MLS listing; `brandingAsset:true` + `role:"branding"` on the
   headshot/logo (§3, §5.5). On a **cobranded** design (step 3b) with a
   confident candidate, that includes `photos.agentLogo` — `required:false` unless
   you have real default artwork (§5.6).
6. **Author `rules.json`** — especially a thorough `pageIntent` list and any
   `subsetFonts` declaration.
7. **Author `mapping.json`** (§5.5) unless the template is branding-only — map the
   listing-derived text keys (address, city, stats, description) to `${RESO}` tokens,
   and the `agent` (+ `coAgent`) branding map. `"photos.agentLogo": "logo"` goes in
   the `agent` map ONLY on a confident cobrand tag (§5.6).
   Skipping this is the #1 reason a finished template "fills nothing from a listing."
8. **Write `manifest.json`** (§2). Ensure `id` == folder name. On a cobranded
   design, `"cobrand": true` — emitted whether or not the block got tagged.
9. **Self-check** (§9), then produce `thumbnail.jpg`.

---

## 9. Self-verification before you call it done

**Two modes (see `preflight` MODE line).** Checks 2–7 below are **structural/content
checks that need no browser** — always run them. Check 1 (rendering the live HTML) and
the pixel-accurate screenshot/compare need a headless browser:
- **full mode:** do everything, including the live render + source-vs-render compare.
- **no-browser mode** (e.g. a Claude Cowork session — no Chromium): you cannot rasterize
  the template's HTML. Substitute for check 1 by rendering the **SOURCE** PDF
  (`render.mjs`/mupdf — browser-free), reading it directly, and cross-checking each
  element's measured position/font (from `probe.mjs`) against your template's absolute
  `.sheet` pt coordinates (same coordinate space) and `data.json` content. `selfcheck`
  catches missing assets on disk and overflow-by-length; `fontcheck` catches blank-glyph
  risk. Then **flag in your report that a pixel-accurate visual pass in a browser env is
  still pending** — that residual is what the no-browser path can't fully cover.

Run these and fix anything that fails:

1. **It renders standalone.** Serve the folder over HTTP and open `template.html`
   (it will `fetch("./data.json")`); confirm it looks like the source PDF, with no
   blank glyphs, no missing images, no overflowing text. (Opening via `file://`
   blocks the fetch — use a local web server, or temporarily inline
   `window.__FLYER_DATA__ = {…}` before the script to test.)
2. **Four-way sync.** For every `schema.json` key: a matching path exists in
   `data.json`, a node with that `data-field` (+`data-index` for list images) exists
   in the DOM, and a `render()` line binds it. No editable node lacks a schema entry.
3. **Constraints hold.** Every `required` field has a default in `data.json`; every
   text default fits its `maxChars`/`maxLines`; every image default meets `minPx`
   (or is flagged as a known low-res default).
4. **Self-containment.** `template.html` references only relative `fonts/…` and
   `assets/…` paths — no external URLs, no absolute paths.
5. **Render-path name.** `window.renderFlyer` is assigned and `render` is pure
   (calling it twice with the same data yields identical DOM).
6. **Thumbnail.** Render page 1 (e.g. headless screenshot at the trim size) and save
   it as `thumbnail.jpg`; set `manifest.thumbnail` to that file name.
7. **Listing autofill is wired (unless branding-only).** `mapping.json` exists; every
   key in it is a text/richText key present in `schema.json`; every photo meant to
   fill from a listing carries `role:"property"`. `selfcheck.mjs` enforces all of
   this — a real-estate template that passes structural sync but has no `mapping.json`
   or no `role:"property"` photos will "render fine and fill nothing."
8. **Cobrand, if you asked and got a yes** (§5.6). `manifest.cobrand` is `true`, and
   either `photos.agentLogo` is tagged and mapped to the `logo` token, or it is
   deliberately untagged and your report says so. `selfcheck.mjs` WARNs on the
   untagged case — that warning is informational, not a failure to "fix" by guessing
   at a block.

Deliver the complete folder. State clearly any place you had to substitute a
subset font, use a low-resolution default image, or guess a measurement — and, for a
listing template, **list the template's agent-branding keys and note that a developer
must register them in the app branding map (§5.5)** — those are the things a human
must confirm before the template ships.


## Turned pages (mixed orientation)

A postcard whose front is portrait and back landscape is ONE piece of paper.
The template keeps ONE print trim and turns the odd page:

- `manifest.trim` is the PRINT orientation — the landscape size for a postcard
  (e.g. `10.5 × 5.5 in`). It is what the print PDF's every page is and what
  Finished Size says.
- `manifest.pageRotation` names each page authored the OTHER way, page number →
  turn: `{"1": -90}`. `-90` = head-to-head (the default): the portrait page's top
  lands on the LEFT edge of the print sheet. `90` = its top on the RIGHT edge.
  Nothing else is allowed — no other angles, no other per-page sizes.
- The template authors that page at the swapped size with ONE rule, in exactly
  this form, in the editable CSS zone:

  ```css
  #page1{ --trim-w:5.5in; --trim-h:10.5in; }
  ```

  Custom properties inherit, so `.page`/`.sheet`/bleed work unchanged on that
  page. Never CSS-rotate the page or its content: the editor shows it upright,
  and the app's PDF export turns it (a real content rotation, no `/Rotate`).
- Both import doors refuse a bundle whose `#pageN` size rule and `pageRotation`
  disagree. An admin can change the turn's direction later in the template
  config editor ("Turned pages"), but not invent a turn the CSS doesn't author.
