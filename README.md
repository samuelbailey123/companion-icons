# Companion Icons

![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)

An icon library for a [Bitfocus Companion](https://bitfocus.io/companion) v5 Stream Deck + rig,
delivered as a `.companionconfig` that loads into Companion's image library without touching a
single button.

## Why

The rig it replaces had icons authored at 32×25 and 25×25 pixels, upscaled onto 120×120 keys and a
200×100 touchstrip. One of them — a white glyph on a `#DADADA` background — was effectively
invisible and had been shipping that way unnoticed.

So this project treats legibility as a test, not a judgement call. Every icon is rasterised through
**Companion's own bundled Skia binary** at both real surface sizes and checked for ink coverage and
contrast against the background it will actually sit on. The defect above is encoded as a failing
case so it cannot come back.

## How it works

Companion v5 publishes every image library entry as a variable, `$(image:<name>)`, which a button's
image layer references. That means:

- **One asset, many buttons.** Editing a library image updates everything using it.
- **Icons can be dynamic.** Names like `battery-0`…`battery-4` are index-suffixed on purpose, so
  `$(image:battery-$(shure:tx1_bars))` resolves — a mic key can show its own battery draining.

Glyphs are authored once as monochrome path data in a `0 0 120 120` viewBox. A variants map assigns
each icon name a (shape, colour) pair, so `power-on` and `power-off` share one drawing.

## Usage

```bash
npm install
npm test          # unit + render tests
npm run coverage  # coverage report, 99% threshold enforced
npm run build     # → dist/svg/ and dist/library.companionconfig
```

## Importing into Companion

1. **Take a full backup first** — Settings → Export → Full backup.
2. Import `dist/library.companionconfig`.
3. Set **buttons → `unchanged`** and **imageLibrary → `reset-and-import`**.

Only the library is touched. Rollback is re-importing the backup.

## Requirements

- Node 25.4.0 (pinned via asdf)
- Companion 5.0.1 installed at `/Applications/Companion.app` — the render tests require its bundled
  `@napi-rs/canvas` directly, so tests exercise the exact renderer the deck uses
