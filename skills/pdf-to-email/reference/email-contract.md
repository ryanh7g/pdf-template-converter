# PDF → Marketing-Builder Email Kit — the contract

> This is the authoritative reference for the `pdf-to-email` skill, the email
> analog of `pdf-to-template/reference/contract.md`. Reproduce it faithfully —
> the platform's email compiler (`lib/emailCompile.ts`) and editor both depend
> on the exact shapes and escaping rules below, several of which are
> non-obvious. **Do not "improve" or restructure the contract.**

Everything here mirrors the live marketing-builder runtime:
`lib/types.ts` (`EmailKit`, `BlockDef`, `SchemaField`, `KitStructure`,
`EmailTheme`, `BlockInstance`, `Composition`), `lib/emailBlocks.ts`
(`renderDataDrivenBlock`, `safeUrl`, `richTextToHtml`, `escapeHtml`, the coded
block catalog), `lib/emailCompile.ts` (`compileComposition` → `mjml2html`), and
`lib/branding.ts` (`BRANDING_TOKENS`). Those files are the ground truth if this
document and the code ever disagree — re-read them.

---

## 1. What a "kit" is — the folder contract

A kit is **one folder** named with a lowercase, hyphenated id that **must
equal** `kit.json`'s own `"id"` field (identical discipline to print's
`manifest.id == folder name` — `lib/registry.ts`'s disk-kit scan keys off the
folder name).

```
<id>/                     # FOLDER NAME MUST EXACTLY EQUAL kit.json's "id"
├── kit.json              # theme + blocks (with data-driven mjml) + structure   (§2-3)
├── thumbnail.jpg         # gallery preview image                                (optional but expected)
└── assets/               # default photos, logos, headshot
    └── *.jpg | *.png
```

There is **no** `manifest.json`, `schema.json`, `data.json`, `rules.json`,
`template.html`, or `fonts/` — those are the print-family contract. An email
kit is entirely described by `kit.json`; there is no separate default-content
file because `structure.defaultComposition` (inside `kit.json`) carries the
default content, and there is no `fonts/` because email never bundles a font
file (§5).

**Self-containment still applies to images**: every asset a block's default
`data` references travels inside `assets/` and is referenced by a **relative**
path (`assets/…`), never a CDN or absolute external URL.

---

## 2. `kit.json` top level — `EmailKit`

Exact shape (TypeScript, for precision — emit plain JSON):

```ts
interface EmailKit {
  id: string;              // == folder name, lowercase-hyphenated
  name: string;             // human gallery title
  description: string;      // one line for the gallery card
  theme: EmailTheme;
  blocks: BlockDef[];
  primitives: string[];     // structural block types implicitly available (see below)
  structure: KitStructure;
}

interface EmailTheme {
  brandColor: string;        // primary brand hex, e.g. "#1b2a4a"
  accent: string;            // accent/CTA hex, e.g. "#c9a24b"
  fontFamily: string;        // EMAIL-SAFE SYSTEM STACK, never a single custom face
  textColor: string;         // base body text color
  backgroundColor: string;   // page background behind the centered column
  contentWidth?: number;     // px, defaults to 600 if omitted
}
```

- `primitives` is a fixed list every kit may reference even though they are
  not authored per-kit: `["spacer", "divider", "text", "button", "image"]` —
  copy this array verbatim unless you have a specific reason to omit one.
  These are structural/coded blocks (`lib/emailBlocks.ts`); you do not need to
  (and should not) author `BlockDef`s or `mjml` for them.
- `fontFamily` MUST be a CSS font **stack** (comma-separated fallbacks ending
  in a generic family), never a single custom/branded typeface. See §5.

---

## 3. `BlockDef` — one block type, with data-driven `mjml`

```ts
interface BlockDef {
  type: string;          // unique within the kit, e.g. "hero", "listing-card"
  label: string;          // human label shown in the block palette
  min?: number;           // instance-count lower bound in a composition
  max?: number;           // instance-count upper bound
  fields: SchemaField[];  // this block's editable fields (see §4 below for labels)
  mjml?: string;          // the data-driven MJML fragment (THIS is what you author)
}
```

`min`/`max` plus `structure.singleton` are the only insert-gating
mechanism — there is no separate `repeatable` flag. A block with neither `min`
nor `max` set is unbounded (like `listing-card` in the shipped kit, `max: 6`).

### 3.1 The `mjml` fragment — convention

`mjml` is a **section-level MJML fragment** — one or more `mj-section`
elements (NOT a full `<mjml>`/`<mj-body>` document; `lib/emailCompile.ts`
assembles that around every block's fragment). It contains `{{key}}`
interpolation holes:

- `{{fieldKey}}` — `fieldKey` must be a `key` from this SAME block's
  `fields[]` array. Dot-paths are allowed if your field key itself is a
  dot-path (rare for email blocks; the shipped kit uses flat keys).
- `{{theme.<token>}}` — `<token>` must be one of `brandColor`, `accent`,
  `fontFamily`, `textColor`, `backgroundColor`, `contentWidth`.

**Every hole must resolve.** At runtime (`renderDataDrivenBlock` in
`lib/emailBlocks.ts`), a `{{key}}` that matches neither a field nor a theme
token is a **compile error** — the substituted output is `""` (never the
literal `{{key}}` text) and an error is pushed onto `CompileResult.errors`.
`email-selfcheck.mjs` (§6) statically catches this before it ever reaches a
real composition.

### 3.2 Type-aware escaping — you must NOT pre-escape

The runtime escapes every interpolated value **by that field's declared
`type`**, and you author the raw template string assuming that escaping will
happen — never add your own:

| field `type` | how the runtime escapes it | where you may place the hole |
|---|---|---|
| `text` | `escapeHtml()` — `& < > " '` entity-escaped | anywhere in MJML markup/body text |
| `richText` | `richTextToHtml()` — HTML-escaped, THEN paragraphized (blank-line-separated `<p>`, single `\n` → `<br/>`) | inside an `mj-text` body (produces its own `<p>` tags — don't wrap it in another `<p>`) |
| `image` | `safeUrl()` — accepts only an absolute `http(s)://` URL or a root-relative `/…` path; anything else (`javascript:`, `data:`, protocol-relative `//host`, a bare string) resolves to `""` | **only** inside `mj-image src="…"` (or another URL-only attribute, e.g. `mj-image href=`) — never inside body text, never concatenated into a larger string |

Concretely: if a block has `{ "key": "image", "type": "image", ... }`, your
`mjml` may contain `<mj-image src="{{image}}" .../>` but must never contain
`{{image}}` anywhere else (e.g. inside a caption's text) — the value is a URL,
not display text, and would render as a raw (safe-ified, but still wrong)
string.

`richText` is **not** user-supplied HTML with an allowlist — it is plain text
that gets HTML-escaped and then mechanically wrapped into paragraphs. There is
nothing to sanitize because no raw markup is ever accepted from the field
value; do not design around an HTML-allowlist mental model for it.

### 3.3 Email-safety rules for the `mjml` fragment itself

- **`mj-*` components only.** No raw `<div>`/`<table>` unless wrapped by an
  MJML raw-HTML escape hatch you have a specific reason to use (avoid it —
  the coded renderers never need one and neither should you).
- **Single column, ≤600px total.** Match `theme.contentWidth` (default 600).
  Use `mj-column`/`mj-group` for a genuine side-by-side region, but keep the
  combined width within the body width — MJML/the email clients that matter
  do not reliably support wider layouts.
- **No `@font-face`, no custom font file.** See §5 — reference only
  `theme.fontFamily` (a system stack) via `{{theme.fontFamily}}` or rely on
  the document-level `mj-attributes` (`lib/emailCompile.ts` already sets
  `mj-all font-family="<theme stack>"` around every block, so you often don't
  need to reference it explicitly at all).
- **Compile-safety is the real gate**: after interpolation, the assembled
  document must produce **zero errors** from `mjml2html(..., {validationLevel:
  "soft"})`. `email-selfcheck.mjs` runs exactly this check per block with
  sample field values (§6).

---

## 4. The labeling vocabulary — the email analog of print's `mapping.json` §5.5

Print autofills a design from an MLS listing via a separate `mapping.json`
(`fields`/`agent`/`coAgent` maps). Email carries the **same labels inline on
each block field** in `kit.json` (LISTING-EMAIL-AUTOFILL-PLAN.md A1 — a
separate email mapping file was explicitly rejected because it can't address
block *instances* cleanly). The whole `SchemaField` shape (`lib/types.ts`) is
shared with print, so these properties are literally the same fields:

```ts
interface SchemaField {
  key: string;
  type: "text" | "richText" | "image" | "enum" | "list";
  itemType?: FieldType;         // for list fields
  label: string;
  description: string;
  required: boolean;
  brandingAsset?: boolean;       // headshot/logo — relaxes any resolution gate
  role?: "property" | "branding"; // image fields only
  classifyHints?: string[];       // "property" images only
  brandingAgent?: "primary" | "secondary";
  brandingToken?: string;         // must be in BRANDING_TOKENS (below)
  listingField?: string;          // "${Reso}" template string — NEW for email
  constraints?: FieldConstraints;
}
```

### 4.1 `listingField` — listing text (`${Reso}` tokens)

For every `text`/`richText` field whose value should come from an MLS
listing, set `listingField` to a `${Token}` template string — **identical in
syntax and interpolation to the RHS of print's `mapping.json` `fields`**.
Multiple tokens and literal text may combine in one string (e.g.
`"${City}, ${StateOrProvince} ${PostalCode}"`).

| Token | Meaning |
|---|---|
| `StreetNumber`, `StreetName` | street address parts |
| `City`, `StateOrProvince`, `PostalCode` | city / state / zip |
| `BedroomsTotal` | beds |
| `BathroomsTotalInteger` | baths |
| `LivingArea` | interior sq ft |
| `LotSizeSquareFeet` | lot sq ft |
| `ListPriceUSD` | list price, **pre-formatted** `"$940,000"` — prefer this for any displayed price |
| `ListPrice` | list price as a raw number (`940000`) — only if you format it yourself |
| `PublicRemarks` | the listing's marketing description |
| `OpenHouse` | open-house line, when present |

Do **not** set `listingField` on creative copy with no listing source (a
tagline, a CTA button label), on agent/branding fields (§4.2), or on image
fields (§4.3 — photos never use `listingField`).

### 4.2 `brandingToken` + `brandingAgent` — agent/co-agent branding

For every field (text or image) whose value should come from the signed-in
agent's directory profile (or a picked co-agent, for a two-agent layout), set:

- `brandingToken` — one of `BRANDING_TOKENS` (`lib/branding.ts`, the **only**
  valid values):

  | Token | Resolves to | Shape |
  |---|---|---|
  | `name` | agent full name | text |
  | `title` | agent title, ® stripped | text |
  | `phone` | agent phone | text |
  | `email` | agent SG email | text |
  | `dre` | `DRE #<number>` | text |
  | `office` | brokerage/office name | text |
  | `website` | placeholder `"www.web.site"` (no directory field yet) | text |
  | `headshot` | agent headshot | image `{src}` |
  | `logo` | agent personal logo | image `{src}` |
  | `creds` | composite `[title, office]` | **list** of text |
  | `contact` | composite `[phone, email]` | **list** of text |

- `brandingAgent` — `"primary"` for the hosting (signed-in) agent, or
  `"secondary"` for a co-agent, **only** on a genuine two-agent layout (two
  headshots/contact blocks). A single-agent kit uses `"primary"` everywhere it
  brands.

Rules: `creds`/`contact` are **list-typed composites** — only put them on a
field of `type: "list"`; for a single-line field use the atomic tokens
(`title`, `office`, `phone`, `email`) instead. Image tokens (`headshot`,
`logo`) belong only on `image`-typed fields that also carry
`brandingAsset: true` + `role: "branding"`.

### 4.3 `role` + `classifyHints` — listing photos vs. branding images

Every `image`-typed field must be tagged one of two ways:

- **A property/listing photo** (should be filled from an MLS listing's
  photos): `role: "property"` + `classifyHints: [...]` keywords the photo
  classifier matches against (`["exterior","front","facade"]` for a hero,
  `["interior","kitchen"]` etc. for an interior shot). Without `role:
  "property"` the field is invisible to listing-photo placement and keeps its
  default forever.
- **An agent headshot or brokerage/agent logo**: `brandingAsset: true` +
  `role: "branding"` (its value comes from `brandingToken`/`brandingAgent`
  above, not from a listing).

Never combine `role: "property"` with a `brandingToken` on the same field —
they are mutually exclusive fill sources.

---

## 5. Email-safety rules (kit-wide)

- **`mj-*` only** in every block's `mjml` (§3.3).
- **Single centered column, ≤600px** (`theme.contentWidth`, default 600) — the
  same convention `lib/emailCompile.ts`'s `mj-body width="${width}px"` bakes
  in for every kit.
- **`fontFamily` is a system stack, never `@font-face`.** Outlook and older
  rendering engines silently fail on `@font-face`; the platform's own fallback
  (`lib/emailCompile.ts`'s `FALLBACK_FONT_STACK`) is `"Arial, Helvetica,
  sans-serif"` — use that or a comparable stack (`Georgia, 'Times New Roman',
  Times, serif` for a serif brand voice, etc). Do not ship a font file in
  `assets/` for this purpose.
- **Inline-safe styling** — MJML attributes (`padding`, `background-color`,
  `border-radius`, etc.) compile to inline styles automatically; don't fight
  this by trying to inject a `<style>` block into a fragment.
- **All interpolation is auto-escaped by field `type`** (§3.2) — never
  pre-escape, never place an `image` field outside a URL attribute.

---

## 6. The selfcheck contract (`email-selfcheck.mjs`)

Run `node ${CLAUDE_SKILL_DIR}/scripts/email-selfcheck.mjs <kitDir>` before
declaring a kit done. It asserts, in order:

1. `kit.json` parses and matches the `EmailKit` shape — required top-level
   keys present (`id, name, description, theme, blocks, primitives,
   structure`), and **`id` == the kit folder's basename**.
2. `theme` has all five required keys (`brandColor, accent, fontFamily,
   textColor, backgroundColor`) as non-empty strings.
3. Every `blocks[].type` is **unique**.
4. Every `{{key}}` in every block's `mjml` resolves to either a `key` in that
   block's own `fields[]` or a valid `theme.<token>` — **FAILS** on any
   dangling reference (the #1 authoring error this whole check exists for).
5. Every `listingField` string's `${Token}`s are checked against the known
   `${Reso}` token vocabulary (§4.1) — **warns** (does not fail) on an
   unrecognized token, since the RESO record may legitimately carry fields
   this reference doesn't enumerate.
6. Every `brandingToken` is in `BRANDING_TOKENS`, has a `brandingAgent` set,
   and (for `creds`/`contact`) targets a `type: "list"` field, and (for
   `headshot`/`logo`) targets an `image`-typed field — **fails** otherwise.
7. Every `role: "property"` field is `image`-typed (or `list` with
   `itemType: "image"`) — **fails** otherwise; warns if it has no
   `classifyHints`.
8. `structure.required` and `structure.singleton` reference real block types
   (or a listed `primitives` entry); `structure.defaultComposition`'s block
   `type`s all exist in `blocks`/`primitives`, and every block type listed in
   `required` appears at least once in `defaultComposition` — **fails**
   otherwise (an unsatisfiable structure).
9. **Compile-safety**: for every block, builds a one-block composition with
   sample values, runs it through `mjml2html` (soft validation, same call
   `lib/emailCompile.ts` makes) and **FAILS on any MJML error**. If `mjml` is
   not installed, this step is skipped with an explicit "install mjml to
   enable" notice — the run still reports the structural checks (1–8) as
   pass/fail, but is NOT a substitute for the compile check; say so in your
   report.

---

## 7. Worked example — a complete listing-email `kit.json`

This reproduces the shipped reference kit's shape (`header, hero, listing-card,
text, cta-button, agent-signature, footer`), but every block now carries an
authored `mjml` fragment plus the listing/branding labels, so it is what
`pdf-to-email` should emit for an equivalent PDF.

```json
{
  "id": "sample-listing-email",
  "name": "Sample Listing Email",
  "description": "Single-listing announcement email: header, hero, one listing card, agent signature, footer.",
  "theme": {
    "brandColor": "#1b2a4a",
    "accent": "#c9a24b",
    "fontFamily": "Georgia, 'Times New Roman', Times, serif",
    "textColor": "#333333",
    "backgroundColor": "#f4f4f4",
    "contentWidth": 600
  },
  "blocks": [
    {
      "type": "header",
      "label": "Header",
      "min": 1,
      "max": 1,
      "fields": [
        { "key": "logo", "type": "image", "label": "Logo",
          "description": "Brokerage logo, centered in the header band.",
          "required": false, "brandingAsset": true, "role": "branding",
          "brandingToken": "logo", "brandingAgent": "primary" },
        { "key": "tagline", "type": "text", "label": "Tagline",
          "description": "Small line under the logo.",
          "required": false, "constraints": { "maxChars": 60, "maxLines": 1 } }
      ],
      "mjml": "<mj-section background-color=\"{{theme.brandColor}}\" padding=\"20px 24px\"><mj-column><mj-image src=\"{{logo}}\" alt=\"Logo\" width=\"160px\" padding=\"0 0 8px\" /><mj-text align=\"center\" color=\"#ffffff\" font-size=\"12px\" letter-spacing=\"1px\" padding=\"0\">{{tagline}}</mj-text></mj-column></mj-section>"
    },
    {
      "type": "hero",
      "label": "Hero",
      "min": 1,
      "max": 1,
      "fields": [
        { "key": "image", "type": "image", "label": "Hero photo",
          "description": "Full-width exterior photo at the top of the email.",
          "required": true, "role": "property",
          "classifyHints": ["exterior", "front", "facade"] },
        { "key": "headline", "type": "text", "label": "Headline",
          "description": "Large headline under the hero photo.",
          "required": true, "constraints": { "maxChars": 60, "maxLines": 1 },
          "listingField": "${StreetNumber} ${StreetName}" },
        { "key": "subheadline", "type": "text", "label": "Subheadline",
          "description": "Smaller supporting line under the headline.",
          "required": false, "constraints": { "maxChars": 100, "maxLines": 2 },
          "listingField": "${City}, ${StateOrProvince}" }
      ],
      "mjml": "<mj-section padding=\"0\" background-color=\"{{theme.backgroundColor}}\"><mj-column><mj-image src=\"{{image}}\" alt=\"{{headline}}\" padding=\"0\" /></mj-column></mj-section><mj-section background-color=\"{{theme.backgroundColor}}\" padding=\"20px 24px 4px\"><mj-column><mj-text align=\"center\" color=\"{{theme.textColor}}\" font-size=\"24px\" font-weight=\"700\" padding=\"0\">{{headline}}</mj-text><mj-text align=\"center\" color=\"{{theme.textColor}}\" font-size=\"15px\" padding=\"4px 0 0\">{{subheadline}}</mj-text></mj-column></mj-section>"
    },
    {
      "type": "listing-card",
      "label": "Listing card",
      "min": 0,
      "max": 6,
      "fields": [
        { "key": "image", "type": "image", "label": "Photo",
          "description": "Listing photo at the top of the card.",
          "required": true, "role": "property", "classifyHints": ["interior", "kitchen"] },
        { "key": "address", "type": "text", "label": "Address",
          "description": "Street address.",
          "required": true, "constraints": { "maxChars": 60, "maxLines": 1 },
          "listingField": "${StreetNumber} ${StreetName}" },
        { "key": "city", "type": "text", "label": "City",
          "description": "City / state / zip line.",
          "required": false, "constraints": { "maxChars": 40, "maxLines": 1 },
          "listingField": "${City}, ${StateOrProvince} ${PostalCode}" },
        { "key": "price", "type": "text", "label": "Price",
          "description": "List price.",
          "required": true, "constraints": { "maxChars": 20, "maxLines": 1 },
          "listingField": "${ListPriceUSD}" },
        { "key": "beds", "type": "text", "label": "Beds", "description": "Bedroom count.",
          "required": false, "constraints": { "maxChars": 10, "maxLines": 1 },
          "listingField": "${BedroomsTotal}" },
        { "key": "baths", "type": "text", "label": "Baths", "description": "Bathroom count.",
          "required": false, "constraints": { "maxChars": 10, "maxLines": 1 },
          "listingField": "${BathroomsTotalInteger}" },
        { "key": "sqft", "type": "text", "label": "Square feet", "description": "Interior sq ft.",
          "required": false, "constraints": { "maxChars": 12, "maxLines": 1 },
          "listingField": "${LivingArea}" },
        { "key": "description", "type": "richText", "label": "Description",
          "description": "Short blurb under the stats.",
          "required": false, "constraints": { "maxChars": 600, "maxLines": 6 },
          "listingField": "${PublicRemarks}" },
        { "key": "ctaLabel", "type": "text", "label": "Button label",
          "description": "Call-to-action button text.",
          "required": false, "placeholder": "View Listing",
          "constraints": { "maxChars": 30, "maxLines": 1 } },
        { "key": "ctaUrl", "type": "text", "label": "Button link",
          "description": "Listing page URL.",
          "required": false, "constraints": { "maxChars": 300, "maxLines": 1 } }
      ],
      "mjml": "<mj-section background-color=\"#ffffff\" padding=\"16px 24px\"><mj-column><mj-image src=\"{{image}}\" alt=\"{{address}}\" padding=\"0 0 12px\" border-radius=\"4px\" /><mj-text color=\"{{theme.textColor}}\" font-size=\"18px\" font-weight=\"700\" padding=\"0\">{{address}}</mj-text><mj-text color=\"{{theme.textColor}}\" font-size=\"13px\" padding=\"2px 0 0\">{{city}}</mj-text><mj-text color=\"{{theme.accent}}\" font-size=\"16px\" font-weight=\"700\" padding=\"8px 0 0\">{{price}}</mj-text><mj-text color=\"{{theme.textColor}}\" font-size=\"13px\" padding=\"6px 0 0\">{{beds}} Beds &nbsp;|&nbsp; {{baths}} Baths &nbsp;|&nbsp; {{sqft}} Sqft</mj-text><mj-text color=\"{{theme.textColor}}\" font-size=\"13px\" line-height=\"1.5\" padding=\"8px 0 0\">{{description}}</mj-text><mj-button background-color=\"{{theme.brandColor}}\" color=\"#ffffff\" href=\"{{ctaUrl}}\" border-radius=\"4px\" padding=\"12px 0 0\">{{ctaLabel}}</mj-button></mj-column></mj-section>"
    },
    {
      "type": "agent-signature",
      "label": "Agent signature",
      "min": 1,
      "max": 1,
      "fields": [
        { "key": "headshot", "type": "image", "label": "Headshot",
          "description": "Agent portrait.",
          "required": false, "brandingAsset": true, "role": "branding",
          "brandingToken": "headshot", "brandingAgent": "primary" },
        { "key": "name", "type": "text", "label": "Agent name", "description": "Full name.",
          "required": true, "constraints": { "maxChars": 60, "maxLines": 1 },
          "brandingToken": "name", "brandingAgent": "primary" },
        { "key": "brokerage", "type": "text", "label": "Brokerage", "description": "Brokerage name.",
          "required": false, "constraints": { "maxChars": 80, "maxLines": 1 },
          "brandingToken": "office", "brandingAgent": "primary" },
        { "key": "phone", "type": "text", "label": "Phone", "description": "Agent phone.",
          "required": false, "constraints": { "maxChars": 30, "maxLines": 1 },
          "brandingToken": "phone", "brandingAgent": "primary" },
        { "key": "email", "type": "text", "label": "Email", "description": "Agent email.",
          "required": false, "constraints": { "maxChars": 60, "maxLines": 1 },
          "brandingToken": "email", "brandingAgent": "primary" }
      ],
      "mjml": "<mj-section background-color=\"{{theme.backgroundColor}}\" padding=\"20px 24px\"><mj-column width=\"25%\"><mj-image src=\"{{headshot}}\" alt=\"Agent headshot\" border-radius=\"50%\" width=\"72px\" padding=\"0\" /></mj-column><mj-column width=\"75%\"><mj-text color=\"{{theme.textColor}}\" font-size=\"15px\" font-weight=\"700\" padding=\"0\">{{name}}</mj-text><mj-text color=\"{{theme.textColor}}\" font-size=\"12px\" padding=\"2px 0 0\">{{brokerage}}</mj-text><mj-text color=\"{{theme.textColor}}\" font-size=\"12px\" padding=\"2px 0 0\">{{phone}}</mj-text><mj-text color=\"{{theme.textColor}}\" font-size=\"12px\" padding=\"2px 0 0\">{{email}}</mj-text></mj-column></mj-section>"
    },
    {
      "type": "footer",
      "label": "Footer",
      "min": 1,
      "max": 1,
      "fields": [
        { "key": "brokerageLine", "type": "text", "label": "Brokerage line",
          "description": "Brokerage name + DRE line.",
          "required": false, "constraints": { "maxChars": 120, "maxLines": 1 } },
        { "key": "address", "type": "text", "label": "Office address",
          "description": "Brokerage office address.",
          "required": false, "constraints": { "maxChars": 160, "maxLines": 1 } },
        { "key": "disclaimer", "type": "richText", "label": "Disclaimer",
          "description": "Legal fine print.",
          "required": false, "constraints": { "maxChars": 600, "maxLines": 6 } }
      ],
      "mjml": "<mj-section background-color=\"{{theme.brandColor}}\" padding=\"20px 24px\"><mj-column><mj-text align=\"center\" color=\"#ffffff\" font-size=\"12px\" font-weight=\"700\" padding=\"0\">{{brokerageLine}}</mj-text><mj-text align=\"center\" color=\"#ffffff\" font-size=\"11px\" padding=\"4px 0 0\">{{address}}</mj-text><mj-text align=\"center\" color=\"#cccccc\" font-size=\"10px\" line-height=\"1.4\" padding=\"8px 0 0\">{{disclaimer}}</mj-text></mj-column></mj-section>"
    }
  ],
  "primitives": ["spacer", "divider", "text", "button", "image"],
  "structure": {
    "required": ["header", "footer"],
    "singleton": ["header", "hero", "footer", "agent-signature"],
    "defaultComposition": [
      { "id": "b1", "type": "header",
        "data": { "logo": "/templates/sample-listing-email/assets/logo-top.png", "tagline": "SEVEN GABLES REAL ESTATE" } },
      { "id": "b2", "type": "hero",
        "data": { "image": "/templates/sample-listing-email/assets/hero.jpg",
                  "headline": "Just Listed in Claremont",
                  "subheadline": "Claremont, CA" } },
      { "id": "b3", "type": "listing-card",
        "data": { "image": "/templates/sample-listing-email/assets/interior-top.jpg",
                  "address": "1526 Lynoak Drive", "city": "Claremont, CA 91711",
                  "price": "$940,000", "beds": "3", "baths": "1.75", "sqft": "1,651",
                  "description": "Gleaming red oak hardwood floors, a versatile sunroom, and a pool-sized lot just under 10,000 sqft.",
                  "ctaLabel": "View Listing", "ctaUrl": "https://example.com/listings/1526-lynoak-drive" } },
      { "id": "b4", "type": "agent-signature",
        "data": { "headshot": "/templates/sample-listing-email/assets/headshot.jpg",
                  "name": "Adriana Donofrio", "brokerage": "Seven Gables Real Estate",
                  "phone": "626.926.9700", "email": "AdrianaD@SevenGables.com" } },
      { "id": "b5", "type": "footer",
        "data": { "brokerageLine": "Seven Gables Real Estate DRE #00745605",
                  "address": "700 E Colorado Blvd, Pasadena, CA 91101",
                  "disclaimer": "Information deemed reliable but not guaranteed. Not intended as a solicitation of another broker's listing." } }
    ]
  }
}
```

Note every `{{key}}` used above is either a field on that SAME block (`image`,
`headline`, `subheadline`, `address`, `city`, `price`, `beds`, `baths`,
`sqft`, `description`, `ctaLabel`, `ctaUrl`, `logo`, `tagline`, `headshot`,
`name`, `brokerage`, `phone`, `email`, `brokerageLine`, `disclaimer`) or a
`theme.*` token — nothing dangles. This is exactly what
`email-selfcheck.mjs` check #4 verifies mechanically.
