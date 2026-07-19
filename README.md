# pdf-template-converter

A Claude **plugin** that turns a print-ready PDF (flyer, business card, postcard,
brochure page, listing email design) into a self-contained *Marketing Builder*
artifact — with automated geometry probing, asset extraction, and browser-free
or visual self-verification. It contains **two skills** that share one probing/
rendering engine but emit different output contracts:

- **`pdf-to-template`** — PDF → a fixed-layout **print** template folder
  (`manifest.json`, `schema.json`, `data.json`, `rules.json`, `template.html`,
  `fonts/`, `assets/`, `thumbnail.jpg`), with `mapping.json` for MLS autofill +
  config-driven agent/co-agent branding + photo role tags.
- **`pdf-to-email`** — PDF → a data-driven **email** kit (`kit.json`: theme +
  per-block MJML fragments + structure), with the SAME listing/branding
  labels (`listingField` ${Reso} tokens, `brandingToken`/`brandingAgent`,
  `role:"property"`+`classifyHints`) carried inline on the kit's block fields
  instead of a separate mapping file.

## What it contains
```
pdf-template-converter/
├── .claude-plugin/plugin.json          # plugin manifest (both skills registered)
├── skills/pdf-to-template/
│   ├── SKILL.md                        # the print playbook Claude follows
│   ├── reference/
│   │   ├── contract.md                 # the print template-folder contract (source of truth)
│   │   └── template-skeleton.html      # the verbatim platform HTML skeleton
│   └── scripts/                        # the SHARED engine (Node) — also used by pdf-to-email
│       ├── package.json                # pinned dependencies
│       ├── preflight.mjs               # checks/install deps + headless browser
│       ├── probe.mjs                   # geometry + text + font inventory
│       ├── render.mjs                  # page → PNG (mupdf)
│       ├── images.mjs                  # raster image placements
│       ├── crop.mjs / sample.mjs       # crop vector marks / sample colors (sharp)
│       ├── fontcheck.mjs               # glyph coverage (fontkit)
│       ├── selfcheck.mjs               # four-way sync + constraints (print)
│       ├── verbatim-diff.mjs           # contract JS zone unchanged (print)
│       ├── shoot.mjs / export-pdf.mjs  # screenshot + bleed PDF (puppeteer)
│       ├── compare.mjs                 # source-vs-render diff image
│       └── serve.cjs                   # static server for self-checks
└── skills/pdf-to-email/
    ├── SKILL.md                        # the email playbook Claude follows
    ├── reference/
    │   └── email-contract.md           # the EmailKit/BlockDef/labeling contract (source of truth)
    └── scripts/                        # email-ONLY additions (probe/render/crop are shared — see SKILL.md)
        ├── package.json                # pins mjml (compile-safety gate)
        └── email-selfcheck.mjs         # kit.json structural + MJML compile-safety check
```

`pdf-to-email` has no probe/render/crop/fontcheck/preflight of its own — it
invokes the sibling `pdf-to-template/scripts/*` by relative path (both skills
ship in the same plugin folder, so the sibling is always present). Only what's
unique to email (`email-selfcheck.mjs` + its `mjml` dependency) lives under
`pdf-to-email/scripts/`. See `skills/pdf-to-email/SKILL.md` §"Shared engine"
for why a symlink or a code-shared-module approach wasn't used.

## Requirements
- **Node.js 18+** and **npm** on the user's machine.
- A **headless browser** for print self-checks/thumbnail/export. `preflight.mjs`
  installs `puppeteer`, which downloads its own Chromium; if that's blocked on a
  locked-down machine, install Chrome and set `CHROME_BIN`. `pdf-to-email` does
  NOT require a browser — its compile-safety gate (`mjml2html`) is pure Node.
- Internet access on first run (to install npm packages and download
  open-licensed fonts for print; email never bundles a font).

## Install (team distribution)
1. Push this folder to a Git repo your staff can read (a private marketplace).
2. In Claude Code: `/plugin marketplace add <your-repo>` then `/plugin install pdf-template-converter`.
3. First conversion: the relevant skill runs `preflight.mjs` (print) or
   `npm install` in its own `scripts/` (email) once to set up dependencies.

## Use
Give Claude a PDF and ask to convert it:
- *"Turn this flyer into a template"* → `pdf-to-template`: preflight → probe →
  render/measure → extract assets → **font decision (it will ask you about
  commercial fonts)** → build the folder → self-verify → report. Output is a
  ready-to-ship print template folder.
- *"Turn this listing email design into an email kit"* → `pdf-to-email`:
  preflight (shared) → probe/render (shared, reframed as a single-column email)
  → extract assets → author `theme` + per-block `mjml` + listing/branding
  labels → `email-selfcheck.mjs` → report. Output is a ready-to-ship
  `kit.json` folder for the email builder.

## Note on Claude Cowork
This is packaged as a Claude Code plugin/skill. **Claude Code** (CLI/VS Code)
runs it directly. Whether **Claude Cowork** (the desktop autonomous-work app)
loads Code plugins the same way was not confirmed at authoring time — verify with
your Anthropic contact before standardizing on Cowork. The skill itself is
product-agnostic; only the install/distribution mechanism may differ.

## Note on fonts & licensing
The converter never bundles a commercial font on its own. When a source PDF uses
one (common for brand type like BentonSans), it asks you to either supply a
licensed file or pick a free substitute, and records the license in the manifest.
Confirm embedding/redistribution rights before any template ships externally.
