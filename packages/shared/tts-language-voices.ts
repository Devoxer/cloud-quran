/**
 * The per-language TTS engine + voice registry — the SINGLE source of truth for
 * "which voices does language X have, and which engine narrates them" (Story 24.7; unified and
 * made language-complete in Story 20.6).
 *
 * Story 20.6 deleted `kokoro-voices.ts` (a 67-voice VENDOR CATALOG across 9 accents/languages
 * whose `enabled` flag meant "eligible for random selection", not "rolled out") and folded the
 * only two voices the app has ever shipped into this registry as the `en` entry. That removes
 * the last global voice axis: there is no `FLAGSHIP_VOICE_IDS`, no `DEFAULT_VOICE_ID` — every
 * voice question is asked OF A LANGUAGE.
 *
 * **Public voice ids follow `{bcp47}_{f|m}`** (Story 20.6 D2) — `en_f`, `fr_f`, `es-419_m`. The
 * BCP-47 head may carry region/script subtags (`es-419`, `es-ES`, `en-GB`, `zh-Hans`) — see the
 * registry's own note on region below.
 * The id is a STORAGE KEY (`audioFiles.voiceId`, `contentObjects.voiceId`, the offline filename),
 * so it must be stable and must leak neither the engine nor its provenance: Kokoro's own catalog
 * ids (`af_heart` = "American female Heart") survive ONLY as the private {@link
 * LanguageVoice.engineVoiceId} the pipeline hands the Kokoro shim. Display names are the owner's
 * ("Aria", "Miles", "Juliette"), never the vendor's.
 *
 * Story 24.8 decided the per-language narration engines on the home GPU box: Qwen3-TTS (Base
 * VoiceClone, `Qwen/Qwen3-TTS-12Hz-1.7B-Base`) for its 10 languages, or Chatterbox Multilingual
 * (per-block clone) for a language Qwen doesn't cover (Arabic today) — full record in
 * `_bmad-output/planning-artifacts/24-8-tts-engine-decision.md`. English stays on the
 * pre-existing self-hosted Kokoro server.
 *
 * The orchestrator (`local-tts.ts`) never hardcodes a per-language branch; it looks up this
 * registry and dispatches to whichever engine shim the entry names. Adding a language (once the
 * owner supplies a studio VO reference) is a data change here, not a new code path.
 */

/** The narration engines this stack drives. `kokoro` is the self-hosted English server; the
 * other two are Story 24.8's cloned-voice engines. */
export type TTSEngine = 'kokoro' | 'qwen3-tts' | 'chatterbox';

/** One voice a language offers. */
export interface LanguageVoice {
  /**
   * PUBLIC voice identifier, `{bcp47}_{f|m}` (Story 20.6 D2). Stable across runs — it is the
   * storage key in `audioFiles.voiceId` / `contentObjects.voiceId` / the offline filename, so it
   * must never leak the engine or the vendor's own catalog id.
   */
  id: string;
  /** Human-readable display name shown in the voice picker (e.g. "Aria", "Juliette"). */
  name: string;
  /** Voice gender. */
  gender: 'male' | 'female';
  /**
   * The id the ENGINE knows this voice by, when it differs from the public {@link id} — today
   * only Kokoro, whose catalog ids (`af_heart`, `am_michael`) are what its HTTP shim expects.
   * Absent for cloned voices, which the shim identifies by the reference clip it was baked with,
   * so the public id is sent verbatim. Never written to a DB row, a filename, or a log.
   */
  engineVoiceId?: string;
  /**
   * Reference-audio filename, relative to `tools/content-pipeline/references/voice-refs/`
   * (local-only, gitignored — 24.8 §5.39; owner-supplied studio VO, licensing handled by the
   * owner). Silence-trimmed to ~10-12s per the reference-prep recipe (AC-4) — never the raw clip.
   * Absent for Kokoro voices, which are model-baked and clone nothing.
   */
  referenceFile?: string;
  /**
   * Engine-side narration-rate tuning, when the engine has one. Kokoro does (per-voice, graded by
   * ear during Story 22.12's audition — `en_f` reads fast enough to need 0.9), and the value is
   * forwarded verbatim in the synth request. CLONED voices (Qwen/Chatterbox) have none: 24.8 never
   * explored a rate knob, and a clone should read at its reference's natural pace — so they omit
   * this and default to `1.0`. Never a DB row or a filename; a pure generation-time parameter.
   */
  speed?: number;
  /**
   * Whether this voice has been ROLLED OUT. Story 24.8 §8.1c decided a breadth-first rollout:
   * ship ONE voice per language first, then a second pass adds a second voice per language — so
   * an entry may carry a second, recorded-but-not-enabled voice (e.g. `fr_m`) ready for pass 2
   * with zero code change. English is the exception: BOTH its voices shipped in Story 22.12.
   */
  enabled: boolean;
}

/** One language's engine + voice configuration. */
export interface LanguageVoiceConfig {
  /** BCP-47 language code — matches `translate-content.ts`'s `LANGUAGE_NAMES`/`isKnownLanguage`
   * allow-list (this registry is TTS-side; that one is translation-side; both key on the same
   * codes so a language's text and audio never drift onto different code spellings). */
  language: string;
  /** The engine this language's voice(s) run on. */
  engine: TTSEngine;
  /** The voice(s) configured for this language, in picker order. */
  voices: LanguageVoice[];
  /**
   * Whether generated clips for this language's engine require the ASR QA loop (AC-7/8) — the
   * ONE place this decision lives, never a scattered per-engine `if` at a call site. `true` for
   * Chatterbox (confirmed truncation via force-EOS repetition-guard + token-cap saturation, 24.8
   * §5.8). `false` for Qwen3-TTS (24.8 §6/§5.11 — no truncation observed across 10 languages,
   * durations plausible throughout) and for Kokoro (years of English output, no truncation class).
   */
  asrQaRequired: boolean;
}

/**
 * The per-language registry. Only languages with a TTS decision appear here — an unlisted
 * language (e.g. a `translate-content.ts` target with no TTS decision yet, like `'nl'`) has no
 * entry at all, which `getLanguageVoiceConfig` surfaces as `undefined` rather than a silent
 * fallback.
 *
 * **English is the shipped corpus** — both voices rolled out in Story 22.12, re-keyed to the
 * `{bcp47}_{f|m}` convention in Story 20.6 (`af_heart` → `en_f`, `am_michael` → `en_m`; the DB
 * rows were re-keyed by that story's one-time backfill). The display names are the owner's own; the Kokoro
 * catalog names ("Heart", "Michael") are gone from every surface.
 *
 * **French is Story 24.7's rollout:** `qwen3-tts`, voice `fr_f` ("Juliette", cloned from the
 * owner-cut `fr_f` reference — 24.8 §8.1b/§8.1c) enabled. The second French voice (`fr_m` clone)
 * is recorded but NOT rolled out (24.7 AC-2) — pass 2 flips its `enabled` flag, no code change.
 *
 * **Spanish is Story 36.1's rollout**, and it is exactly what 24.7 predicted adding a language
 * would cost: `qwen3-tts`, one voice `es-419_m` ("Mateo", cloned from the owner's Latin American
 * reference), no new code path anywhere. Breadth-first pass 1 ships ONE voice per language, so
 * there is no second Spanish voice yet.
 *
 * **REGION lives in the voice id, never in the registry key** (Story 36.1). `es-419_m` is Latin
 * American; a Castilian voice later is `es-ES_f` — a SECOND VOICE inside this same `es` entry, not
 * a second entry. The registry key is the CONTENT language and must keep matching
 * `translate-content.ts`'s `LANGUAGE_NAMES`: there is one Spanish corpus, narrated two ways. The
 * same shape covers `en-GB_f` beside today's American `en_f`, and `pt-BR` beside `pt-PT`.
 *
 * ⚠️ **The four ids that shipped BEFORE this rule keep their region-less spelling** — `en_f`/`en_m`
 * (American), `fr_f`/`fr_m` (metropolitan). A voice id is a live STORAGE KEY in two places: the
 * `audioFiles.voiceId` / `contentObjects.voiceId` columns (and the `sourceKey` derived from the
 * latter), and the offline filenames already on users' devices
 * (`{sectionType}_{language}_{voiceId}.{ext}`). Re-keying them for tidiness would rewrite ~47k rows
 * and orphan every offline download on a LIVE app, to change nothing a user can hear. Read a
 * region-less id as "the original region for that language".
 *
 * (NOT a third place: R2 objects are addressed by an opaque random `contentObjects.r2Key` since
 * Story 34.3 deleted the `audio/{bookId}/{voiceId}/…` path scheme — see `worker/src/constants.ts`'s
 * `VOICE_ID_REGEX` gravestone. No R2 copy is involved in a re-key.)
 *
 * **Every REMAINING Qwen-covered language is a STUB** (24.7 AC-2): engine decided, no voice
 * configured yet. Configuring one is adding a `voices` entry + flipping `enabled`, once the
 * owner supplies that language's studio VO reference.
 *
 * **Arabic is a registry STUB on Chatterbox, explicitly not enabled** (24.7 AC-18) — gated on RTL
 * chrome (SKIPPED as Story 20.5 — re-adoption opens a FRESH story; see epics.md Epic 20 § 20.5) and the deferred context-aware pausal-tashkeel diacritizer (24.8 §8.1c).
 */
export const TTS_LANGUAGE_REGISTRY: Readonly<Record<string, LanguageVoiceConfig>> = {
  en: {
    language: 'en',
    engine: 'kokoro',
    voices: [
      {
        id: 'en_f',
        name: 'Aria',
        gender: 'female',
        engineVoiceId: 'af_heart',
        speed: 0.9,
        enabled: true,
      },
      {
        id: 'en_m',
        name: 'Miles',
        gender: 'male',
        engineVoiceId: 'am_michael',
        speed: 1.0,
        enabled: true,
      },
    ],
    asrQaRequired: false,
  },
  fr: {
    language: 'fr',
    engine: 'qwen3-tts',
    voices: [
      {
        id: 'fr_f',
        name: 'Juliette',
        gender: 'female',
        referenceFile: 'user-trimmed/fr_f.wav',
        enabled: true,
      },
      {
        id: 'fr_m',
        name: 'Antoine',
        gender: 'male',
        referenceFile: 'user-trimmed/fr_m.wav',
        enabled: false,
      },
    ],
    asrQaRequired: false,
  },
  es: {
    language: 'es',
    engine: 'qwen3-tts',
    voices: [
      {
        id: 'es-419_m',
        name: 'Mateo',
        gender: 'male',
        referenceFile: 'user-trimmed/es-419_m.wav',
        enabled: true,
      },
    ],
    asrQaRequired: false,
  },
  de: { language: 'de', engine: 'qwen3-tts', voices: [], asrQaRequired: false },
  it: { language: 'it', engine: 'qwen3-tts', voices: [], asrQaRequired: false },
  pt: { language: 'pt', engine: 'qwen3-tts', voices: [], asrQaRequired: false },
  ru: { language: 'ru', engine: 'qwen3-tts', voices: [], asrQaRequired: false },
  zh: { language: 'zh', engine: 'qwen3-tts', voices: [], asrQaRequired: false },
  ja: { language: 'ja', engine: 'qwen3-tts', voices: [], asrQaRequired: false },
  ko: { language: 'ko', engine: 'qwen3-tts', voices: [], asrQaRequired: false },
  // Chatterbox — the only engine that requires the ASR QA loop (24.7 AC-7).
  ar: { language: 'ar', engine: 'chatterbox', voices: [], asrQaRequired: true },
} as const;

/** The BASE language every voice/language resolution floors to. Mirrors the app's
 * `constants/language.ts` `BASE_LANGUAGE` and `content-objects.ts`'s `CORPUS_LANGUAGE`. */
const BASE_LANGUAGE = 'en';

/** A language's engine/voice config, or `undefined` if it has no TTS decision yet. */
export function getLanguageVoiceConfig(language: string): LanguageVoiceConfig | undefined {
  return TTS_LANGUAGE_REGISTRY[language];
}

/**
 * The ROLLED-OUT voices for a language, in registry (picker) order. Empty for a stub language or
 * one with no `enabled` voice yet — the caller (the CLI's `--language` gate, the client's voice
 * picker) treats that as "no voice here" rather than silently picking a disabled voice or, worse,
 * another language's.
 *
 * This is the ONE lookup that replaces the deleted global `FLAGSHIP_VOICE_IDS` — `en`'s answer is
 * exactly the old flagship set, so English behaviour is unchanged.
 */
export function getVoicesForLanguage(language: string): LanguageVoice[] {
  return (TTS_LANGUAGE_REGISTRY[language]?.voices ?? []).filter((v) => v.enabled);
}

/**
 * The default voice id for a language — its first rolled-out voice (the replacement for the
 * deleted global `DEFAULT_VOICE_ID`).
 *
 * A language with NO rolled-out voice cannot have audio of its own at all: every section resolves
 * through the whole-section base-`en` fallback (`lib/contentRead.ts`), which needs an `en` voice
 * to pick. So that case returns the BASE language's default rather than `undefined` — the only
 * voice that can actually play. It is never another *narrating* language's voice: `en` here means
 * "the fallback the audio will genuinely come from", not a substitute for the requested language.
 */
export function getDefaultVoiceForLanguage(language: string): string {
  const own = getVoicesForLanguage(language)[0];
  if (own) return own.id;
  const base = getVoicesForLanguage(BASE_LANGUAGE)[0];
  if (!base) {
    // Unreachable — `en` always ships two rolled-out voices, and a unit test pins it.
    throw new Error('tts-language-voices: the base language has no rolled-out voice');
  }
  return base.id;
}

/** The rolled-out voice ids for a language, in picker order (the common `.map(v => v.id)`). */
export function getVoiceIdsForLanguage(language: string): string[] {
  return getVoicesForLanguage(language).map((v) => v.id);
}

/** Look a voice up by its PUBLIC id across every language, or `undefined`. Includes voices that
 * are not yet rolled out, so a stored/legacy id still resolves a display name. */
export function getVoiceById(voiceId: string): LanguageVoice | undefined {
  for (const cfg of Object.values(TTS_LANGUAGE_REGISTRY)) {
    const match = cfg.voices.find((v) => v.id === voiceId);
    if (match) return match;
  }
  return undefined;
}

/** The display name for a voice id, falling back to the id itself so a row/log never renders
 * blank. This is what the picker + the player's voice indicator show. */
export function voiceDisplayName(voiceId: string): string {
  return getVoiceById(voiceId)?.name ?? voiceId;
}

/** Whether a language has at least one rolled-out voice — the "is `--language x` actually
 * runnable" gate, distinct from `translate-content.ts`'s `isKnownLanguage` (which only asks
 * whether the language is nameable to the translation model, not whether audio can be generated
 * for it yet). */
export function isTtsRolledOut(language: string): boolean {
  return getVoicesForLanguage(language).length > 0;
}

/** Whether an engine's clips must pass the ASR QA loop (24.7 AC-7) before being accepted — reads
 * the SAME registry entry `getVoicesForLanguage` does, so the two can never disagree about a
 * given language's engine. `undefined` (unknown language) is treated as requiring QA — fail
 * closed rather than silently skipping a safety gate for a language not yet in the registry. */
export function requiresAsrQa(language: string): boolean {
  return TTS_LANGUAGE_REGISTRY[language]?.asrQaRequired ?? true;
}
