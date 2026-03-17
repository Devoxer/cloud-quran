# Cloud Quran

Quran reading app — cross-platform (iOS, Android, Web, Desktop).

## Monorepo Structure

```
apps/
  expo/        # Expo app — iOS, Android, AND Web (the actual Quran reading app on ALL platforms)
  marketing/   # Astro marketing/landing page with per-verse SEO pages (NOT the reading app)
  desktop/     # Electron wrapper around the Expo Web build
packages/
  quran-data/  # Shared Quran text, metadata, hashes — no React dependency
  shared/      # Shared utilities and types — no React dependency
scripts/       # Build-time data pipeline and integrity verification
```

**Key distinction:** `apps/expo` produces the web app via Expo Web. `apps/marketing` is a separate Astro site for SEO/download pages. They are not the same thing.

## Tech Stack

- **Runtime:** Expo SDK 55, React Native, TypeScript
- **State:** Zustand (UI state) + MMKV (persistence) + InstantDB (sync, future)
- **Data:** SQLite (bundled Quran text), quran-data package (metadata, hashes)
- **Styling:** React Native StyleSheet with design tokens, 3 themes
- **Fonts:** KFGQPC Uthmani (Arabic), Inter (UI)
- **Package manager:** Bun
- **Testing:** Jest with jest-expo preset, React Native Testing Library

## Commands

```bash
bun run dev:expo      # Start Expo dev server (iOS/Android/Web)
bun run test          # Run all tests (Jest via jest-expo)
bun run typecheck     # TypeScript check across all workspaces
bun run verify        # SHA-256 Quran text integrity check
bun run prepare-data  # Rebuild SQLite DB from Tanzil XML sources
```

## Architecture Decisions

- **Local-first:** All core features work offline. SQLite bundled, no network required for reading.
- **Zero third-party analytics:** No tracking SDKs. Privacy is structural, not opt-out.
- **Quran text integrity:** SHA-256 hash per ayah, verified at build time.
- **Feature modules:** `apps/expo/src/features/` — each feature owns its components, hooks, stores.
- **Service boundary:** Features never call SQLite/InstantDB/MMKV directly — always through `src/services/`.

## Planning Artifacts

- Architecture: `_bmad-output/planning-artifacts/architecture.md`
- PRD: `_bmad-output/planning-artifacts/prd.md`
- Epics & stories: `_bmad-output/planning-artifacts/epics.md`
- Sprint status: `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Story files: `_bmad-output/implementation-artifacts/`
