// @cloudquran/shared — the neutral app/worker boundary contract (Story 17.1).
//
// Holds every zod schema + enum that crosses the worker ↔ scripts ↔ app boundary,
// imported by BOTH sides (worker validation + script/app types) so nothing is
// hand-duplicated.
//
// The Hono RPC `AppType` is NOT re-exported here: it is `typeof app`, so it lives
// in the worker package (`wisdomfruits-api`) and consumers import it from there
// directly (apps/expo/src/lib/api.ts + the pre-gen scripts). Re-exporting it here
// would make shared depend on the worker while the worker already depends on shared
// for these schemas — a package cycle Turborepo rejects.
// `.js` extensions: consumed by both bundler-resolution packages (worker/app) AND
// NodeNext-resolution consumers (the tools/ pipeline), which require explicit
// extensions on relative ESM imports.

// Story 17.8 — the rest of the isomorphic data contract relocated here:
//   • Kokoro TTS voice config (pure data + selection helpers)
//   • the prompt contract (SYSTEM_PROMPT / PROMPTS / getSectionPrompt / buildBookContext
//     + the BookContext shape). There is no worker half any more: Story 34.2 deleted the
//     orphaned AI service tree and the model/TTS config this note used to point at.
//   • ProfilePreferences (the profiles.preferences JSON shape) + notification defaults
//   • the block-level audio-sync contract (Story 22.9): the block sidecar schema,
//     `findBlockAtTime`, `parseContent`, and `splitIntoBlocks` (the 1:1 displayed-block
//     ↔ sidecar index hinge shared by the app renderer + the generation writer)
export * from './blocks.js';
// story 5-2 dropped three re-exports from this barrel:
//   • `./content-objects.js` — random opaque key minting + row/sourceKey derivation. The module
//     survives (story 5-4 re-points it at D1), but nothing in this tree imports it, and a barrel
//     line with no consumer is how a dead module stays invisible.
//   • `./free-sections.js` — DELETED outright. It was the free-vs-premium tiering source; Cloud
//     Quran has no premium tier.
//   • `./instant.schema.js` — DELETED with the vendor. Its 837 lines described 23 wisdom-fruits
//     entities and not one Quran concept.
// Story 24.14 — which `books` attribute holds a language's translated title/subtitle, and the
// `fields`-projection helper every books query uses to fetch exactly the active language's pair.
export * from './localized-book.js';
export * from './profile.js';
export * from './prompts.js';
export * from './schemas/index.js';
// Story 26.4 — canonical category taxonomy (single source of truth): the 35-slug canonical set,
// the alias→canonical forward guard, display names + icons, and the slug helpers. Both the expo
// app (via constants/taxonomy.ts re-export) and the pipeline import from here.
export * from './taxonomy.js';
// Story 24.7 (unified in Story 20.6) — the ONE per-language TTS engine + voice registry, keyed
// by BCP-47 language. Replaced the deleted 67-voice `kokoro-voices.ts` vendor catalog and its
// global `FLAGSHIP_VOICE_IDS`/`DEFAULT_VOICE_ID` axis; consumed by both the pipeline and the app.
export * from './tts-language-voices.js';

// NOTE: the per-block TTS/concat/encode helper (`./blockAudio`, which pulls in
// @breezystack/lamejs) is intentionally NOT re-exported through this barrel — only the
// generation writer (tools/content-pipeline) consumes it, via the
// `@cloudquran/shared/blockAudio` subpath, so the app bundle never pulls the encoder.

// Cloud Quran's own domain surface — restored by the 5-1 code review after the seed replaced
// this package wholesale. See quran.ts for why it went missing.
export {
  DEFAULT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  SURAH_COUNT,
  TOTAL_JUZS,
  TOTAL_PAGES,
  TOTAL_SURAHS,
  TOTAL_VERSES,
  toArabicNumber,
} from './quran';
