<div align="center">

<!-- Replace with actual logo when available -->
<img src="apps/expo/assets/images/icon.png" alt="Cloud Quran" width="120" height="120" style="border-radius: 24px;" />

# Cloud Quran

**Beautiful reading experience, zero tracking.**

Free, open-source, cross-platform Quran companion with Uthmani typography,
verse-by-verse audio highlighting, cross-device sync, and full offline support.

Zero ads. Zero tracking. Zero data collection. Sustained as waqf/sadaqah jariyah.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platforms-iOS%20%7C%20Android%20%7C%20Web%20%7C%20macOS%20%7C%20Windows-brightgreen.svg)](#platforms)
[![Expo SDK](https://img.shields.io/badge/Expo%20SDK-55-000020.svg)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6.svg)](https://typescriptlang.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

[Download](#download) · [Features](#features) · [Getting Started](#getting-started) · [Contributing](#contributing)

</div>

---

## Overview

Cloud Quran is built on a simple conviction: the best Quran app should also be the most private. No account required, no analytics SDK phoning home, no ads interrupting your reading. Every feature works offline, and your data never leaves your device unless you explicitly enable cross-device sync.

The project is sustained as **waqf** (charitable endowment) and **sadaqah jariyah** (ongoing charity). It will remain free and open-source forever.

## Screenshots

<!-- Add screenshots here -->
<div align="center">
<table>
<tr>
<td align="center"><em>Reading Mode</em></td>
<td align="center"><em>Mushaf Mode</em></td>
<td align="center"><em>Audio Player</em></td>
<td align="center"><em>Search</em></td>
</tr>
<tr>
<td><code>screenshot</code></td>
<td><code>screenshot</code></td>
<td><code>screenshot</code></td>
<td><code>screenshot</code></td>
</tr>
</table>
</div>

## Features

### Dual Reading Mode

- **Text-first Reading Mode** --- clean, scrollable interface optimized for reading and study
- **Traditional Mushaf Mode** --- page-accurate scans matching the printed Mushaf layout

### Audio-First Design

- Verse-by-verse highlighting synchronized with recitation
- Lock-screen controls and background playback (iOS & Android)
- Multiple reciters to choose from
- Download audio for offline listening

### Cross-Device Sync

- Optional sync powered by Cloudflare Workers + D1
- Bookmarks, reading position, and preferences travel with you
- Works without an account --- sync is entirely opt-in

### Offline-First

- Every feature works without an internet connection
- Quran text ships with the app, verified against Tanzil.net with SHA-256 checksums
- Audio can be downloaded per surah or per juz

### Privacy by Design

- Zero third-party SDKs --- no Firebase, no Amplitude, no Sentry, nothing
- GDPR Article 9 compliant for religious data
- No telemetry, no crash reporting, no usage analytics
- Your reading habits are yours alone

### Personalization

- 3 themes (Light, Dark, Sepia)
- Adjustable Arabic font size
- Translation font customization

### Study & Learning

- Tafsir (exegesis) integration
- Transliteration toggle for learners
- Verse-level bookmarking and notes

## Platforms

| Platform | Minimum Version | Status |
|----------|----------------|--------|
| iOS      | 15.0+          | In development |
| Android  | 8.0+ (API 26)  | In development |
| Web      | Modern browsers | In development |
| macOS    | Via Electron    | In development |
| Windows  | Via Electron    | In development |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Mobile & Web** | Expo (React Native 0.83.2), React 19.2.0, TypeScript 5.9 |
| **Navigation** | Expo Router (file-based, typed routes) |
| **Desktop** | Electron (macOS & Windows) |
| **Marketing Site** | Astro v6 |
| **API** | Hono on Cloudflare Workers |
| **Database** | Cloudflare D1 (sync), SQLite via expo-sqlite (local) |
| **Audio Storage** | Cloudflare R2 |
| **Auth** | Better Auth |
| **Local State** | MMKV |
| **Data Fetching** | React Query |
| **Quran Text** | Tanzil.net (verified), QUL / Quran Foundation API |
| **Arabic Fonts** | KFGQPC Uthmanic Script HAFS |
| **Linting** | Biome |
| **Testing** | Jest |
| **Package Manager** | Bun (workspaces) |

## Architecture

Cloud Quran follows a **local-first, sync-second** architecture. The app is fully functional without any network connectivity.

```
┌─────────────────────────────────────────────────────────┐
│                      Client Device                       │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │  Expo Router │    │  React Query │    │   MMKV    │  │
│  │  (UI Layer)  │◄──►│  (Data Layer)│◄──►│  (State)  │  │
│  └──────┬───────┘    └──────┬───────┘    └───────────┘  │
│         │                   │                            │
│  ┌──────▼───────┐    ┌──────▼───────┐                   │
│  │  expo-audio  │    │  expo-sqlite │                   │
│  │  (Playback)  │    │  (Quran DB) │                   │
│  └──────────────┘    └──────────────┘                   │
│                             │                            │
│                    ┌────────▼────────┐                   │
│                    │   Sync Engine   │                   │
│                    │  (opt-in only)  │                   │
│                    └────────┬────────┘                   │
└─────────────────────────────┼───────────────────────────┘
                              │ HTTPS (optional)
                    ┌─────────▼─────────┐
                    │  Cloudflare Edge  │
                    │                   │
                    │  ┌─────────────┐  │
                    │  │ Hono Worker │  │
                    │  └──────┬──────┘  │
                    │    ┌────┴────┐    │
                    │    │        │    │
                    │  ┌─▼──┐  ┌─▼──┐  │
                    │  │ D1 │  │ R2 │  │
                    │  └────┘  └────┘  │
                    └───────────────────┘
```

**Key architectural decisions:**

- **Dual rendering engines** --- text mode uses React Native components; Mushaf mode renders page scans
- **SHA-256 text verification** --- every Quran text chunk is verified against known checksums to guarantee accuracy
- **Audio pipeline** --- download-to-cache strategy with streaming fallback; background playback via native audio session APIs
- **Sync is additive** --- the sync layer never overwrites local data without explicit user action

## Project Structure

```
cloud-quran/
├── apps/
│   ├── expo/              # Mobile + Web app (Expo Router)
│   │   ├── src/
│   │   │   ├── app/       # File-based routes
│   │   │   ├── components/
│   │   │   ├── features/  # Feature modules
│   │   │   ├── hooks/
│   │   │   ├── services/
│   │   │   ├── theme/
│   │   │   └── data/      # Local Quran database
│   │   └── assets/
│   ├── desktop/           # Electron wrapper (macOS/Windows)
│   ├── api/               # Hono API on Cloudflare Workers
│   │   ├── src/
│   │   └── drizzle/       # D1 migrations
│   └── marketing/         # Astro SEO website
├── packages/
│   ├── quran-data/        # Quran text, metadata, utilities
│   └── shared/            # Shared types, constants, helpers
├── scripts/               # Data preparation & verification
├── biome.json
├── tsconfig.base.json
└── package.json           # Bun workspace root
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.2+
- [Node.js](https://nodejs.org) v20+ (required by some Expo tooling)
- iOS: Xcode 16+ and CocoaPods
- Android: Android Studio with SDK 26+

### Installation

```bash
# Clone the repository
git clone https://github.com/ilyassrachedine/cloud-quran.git
cd cloud-quran

# Install dependencies
bun install

# Prepare Quran data (downloads and verifies text)
bun run prepare-data

# Verify Quran text integrity
bun run verify
```

### Running the Apps

```bash
# Mobile/Web (Expo)
bun run dev:expo

# Desktop (Electron)
bun run dev:desktop

# Sync API (Cloudflare Workers)
bun run dev:api

# Marketing website (Astro)
bun run dev:website
```

### Other Commands

```bash
# Lint & format
bun run lint
bun run format

# Type checking across all packages
bun run typecheck

# Run tests
bun run test

# Build desktop app
bun run build:desktop

# Deploy sync API
bun run deploy:api

# Build marketing site
bun run build:website
```

## Contributing

Contributions are welcome and appreciated. Whether it is fixing a typo, improving accessibility, adding a translation, or building a feature, every contribution counts as sadaqah jariyah.

### How to Contribute

1. **Fork** the repository
2. **Create a branch** for your change (`git checkout -b feature/my-change`)
3. **Make your changes** and ensure `bun run lint` and `bun run typecheck` pass
4. **Write tests** if applicable
5. **Submit a pull request** with a clear description of the change

### Areas Where Help Is Needed

- Translations (UI strings and Quran translations)
- Accessibility improvements
- Performance optimization
- Desktop app polish
- Documentation

### Code Style

This project uses [Biome](https://biomejs.dev) for linting and formatting. Run `bun run format` before submitting.

## Privacy

Cloud Quran is designed with a strict privacy-first approach:

- **No analytics** --- we do not collect usage data of any kind
- **No third-party SDKs** --- no Firebase, no Sentry, no Amplitude, no ad networks
- **No tracking** --- no cookies, no fingerprinting, no identifiers
- **No data collection** --- your reading history, bookmarks, and preferences stay on your device
- **Optional sync** --- if you enable cross-device sync, data is encrypted in transit and stored on Cloudflare infrastructure. You can delete your sync data at any time.
- **GDPR Article 9** --- religious data (which surahs you read, your bookmarks) is treated as special-category data under GDPR. We handle this by simply not collecting it.

## Data Sources & Acknowledgments

Cloud Quran stands on the shoulders of incredible open projects and institutions:

- **[Tanzil.net](https://tanzil.net)** --- verified Quran text with diacritical marks. The gold standard for digital Quran text accuracy.
- **[Quran Foundation](https://quran.foundation) / [QUL API](https://quran.api-docs.io)** --- translations, tafsir, and audio metadata.
- **[KFGQPC](https://fonts.qurancomplex.gov.sa)** --- King Fahd Glorious Quran Printing Complex. The official Uthmanic Script HAFS font used for Arabic rendering.
- **[Every Ayah](https://everyayah.com)** --- recitation audio files from renowned reciters.

We are deeply grateful to these organizations for making their work freely available.

## Related Projects

- **[Cloud Adhan](https://github.com/ilyassrachedine/cloud-adhan)** --- accurate prayer time calculations and beautiful adhan notifications.

## License

This project is open-source and available under the [MIT License](LICENSE).

---

<div align="center">

Built with sincerity as **waqf** and **sadaqah jariyah**.

May it benefit anyone who reads, listens to, or studies the Quran.

</div>
