# pdf-template-converter

A Claude **plugin** that turns a print-ready PDF (flyer, business card, postcard,
brochure page) into a self-contained *Marketing Builder* template folder —
`manifest.json`, `schema.json`, `data.json`, `rules.json`, `template.html`,
`fonts/`, `assets/`, `thumbnail.jpg` — with automated geometry probing, asset
extraction, and visual self-verification.

## What it contains
```
pdf-template-converter/
├── .claude-plugin/plugin.json          # plugin manifest
└── skills/pdf-to-template/
    ├── SKILL.md                        # the playbook Claude follows
    ├── reference/
    │   ├── contract.md                 # the template-folder contract (source of truth)
    │   └── template-skeleton.html      # the verbatim platform HTML skeleton
    └── scripts/                        # the engine (Node)
        ├── package.json                # pinned dependencies
        ├── preflight.mjs               # checks/install deps + headless browser
        ├── probe.mjs                   # geometry + text + font inventory
        ├── render.mjs                  # page → PNG (mupdf)
        ├── images.mjs                  # raster image placements
        ├── crop.mjs / sample.mjs       # crop vector marks / sample colors (sharp)
        ├── fontcheck.mjs               # glyph coverage (fontkit)
        ├── selfcheck.mjs               # four-way sync + constraints
        ├── verbatim-diff.mjs           # contract JS zone unchanged
        ├── shoot.mjs / export-pdf.mjs  # screenshot + bleed PDF (puppeteer)
        ├── compare.mjs                 # source-vs-render diff image
        └── serve.cjs                   # static server for self-checks
```

## Requirements
- **Node.js 18+** and **npm** on the user's machine.
- A **headless browser** for self-checks/thumbnail/export. `preflight.mjs`
  installs `puppeteer`, which downloads its own Chromium; if that's blocked on a
  locked-down machine, install Chrome and set `CHROME_BIN`.
- Internet access on first run (to install npm packages and download
  open-licensed fonts).

## Install (team distribution)
1. Push this folder to a Git repo your staff can read (a private marketplace).
2. In Claude Code: `/plugin marketplace add <your-repo>` then `/plugin install pdf-template-converter`.
3. First conversion: the skill runs `preflight.mjs` once to set up dependencies.

## Use
Give Claude a PDF and ask to convert it, e.g. *"Turn this flyer into a template."*
The skill walks through: preflight → probe → render/measure → extract assets →
**font decision (it will ask you about commercial fonts)** → build the folder →
self-verify → report. The output is a ready-to-ship template folder.

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
