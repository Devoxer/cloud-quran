# Cloud Quran

A free, open-source, waqf-funded Quran reading app for iOS, Android, Web and Desktop.

**No ads. No tracking. No monetization.** There is no paywall, no premium tier and no
entitlement concept anywhere in the codebase — if a ported module ever carries one, it is
deleted rather than disabled.

## What it is

- **The complete Quran**, verified. Every ayah's `uthmani_text` is SHA-256 hashed at build
  time against a committed baseline; a mismatch fails the build. No runtime path mutates
  Quran text.
- **Offline-first by default**, not as a fallback. The bundled database is the read path and
  every core feature works with the network off, on a cold launch.
- **Two reading modes** — verse-by-verse, and a mushaf page view using the QPC page fonts.
- **Recitation** with verse highlighting, background playback and offline download, available
  to everyone with no licence check.
- **Optional sync** of exactly four things — reading position, bookmarks, preferences and
  audio position. Sign-in is never required to read, and the sync switch can be turned off on
  the device without signing out or losing anything.

## Privacy

Zero third-party analytics, advertising, attribution or session-replay SDKs. Opt-in,
PII-scrubbed crash reporting is the single exception and ships **off** behind a real gate.

Reading position reveals religious practice — special-category data under GDPR Article 9 — so
the app treats it that way: the sign-in screen discloses what syncs and who processes it
before you press anything, and one screen lets you export everything, delete your synced data
while keeping the account, or delete the account outright.

## Repository layout

```
apps/
  expo/        # The reading app — iOS, Android and Web
  worker/      # Hono on Cloudflare. The data API — D1 + Drizzle + Better Auth
  marketing/   # Astro SEO site
  desktop/     # Electron wrapping the Expo web export
packages/
  quran-data/  # Quran text, metadata, verse↔page map, mushaf layout, SHA-256 hashes
  shared/      # Isomorphic contract — zod schemas shared by app and worker
  config/      # biome / tsconfig bases
scripts/       # Build-time data pipeline, integrity verification, and the lint gates
```

## Getting started

Requires **Node 24+** and **pnpm**. The build-time data pipeline uses `node:sqlite`, which did
not stabilise before Node 24, so the version floor is load-bearing.

```bash
pnpm install
pnpm verify      # SHA-256 Quran text integrity check — run this first
pnpm start       # Expo dev server
```

Checks, all of which also run in CI on every push:

```bash
pnpm lint        # biome + layers, style, i18n, native-patches and header-controls gates
pnpm typecheck
pnpm test
```

## A note on the gates

Several of the checks under `scripts/` guard defects that types, tests and screenshots cannot
see. Each one carries a docblock explaining what bit us and why the rule exists — those
comments are the reasoning, not decoration, and they are the best place to start if a gate
fails and the fix is not obvious.

## Contributing

Issues and pull requests are welcome. Please run `pnpm lint`, `pnpm typecheck` and `pnpm test`
before opening a PR — CI runs all of them and reports every failure in one pass.

This repository is a public mirror, published automatically only after the full verification
workflow passes on `main`.

## Licence

[GPL-3.0](LICENSE).

The Quran text itself is not ours to licence — it is reproduced faithfully and verified, never
modified. Translations and recitations carry their own terms from their respective sources.
