# Timewall 2

Timewall 2 is a copied baseline of Timewall 1 and remains a color-first daily reflection wall. Each day is divided into eight three-hour blocks, and each block can be marked with one of four colors. The product is intentionally low-friction: no writing required, no account required.

## Current Product Stage

This version is a lightweight publishable product:

- Works without login.
- Stores records locally in the browser.
- Supports day, week, month, year, and weekly report views.
- Supports local backup export/import through JSON.
- Supports weekly report text copy and SVG export.
- Includes a PWA manifest for install-like behavior on supported browsers.

## Privacy Model

Timewall currently does not upload user data. Records live in the user's browser storage only. Clearing browser data will remove the wall unless the user exports a backup first.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production Build

```bash
npm run build
npm run start
```

This project can be deployed as a static GitHub Pages site.

## Product Roadmap

The recommended next step is not a full backend immediately. First validate whether users actually keep using the local version.

1. Ship the local-first version and collect feedback from real users.
2. If users ask for device switching or data safety, add account-based cloud sync.
3. If users mostly share reports, prioritize share links or image export before accounts.
4. If users request reminders, add notification settings after the core habit loop is validated.

See `docs/backend-roadmap.md` for the suggested backend path.
