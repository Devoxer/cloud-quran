/**
 * Tests for the per-language TTS engine + voice registry (Story 24.7; unified in Story 20.6).
 */

import { describe, expect, it } from 'vitest';
import {
  getDefaultVoiceForLanguage,
  getLanguageVoiceConfig,
  getVoiceById,
  getVoiceIdsForLanguage,
  getVoicesForLanguage,
  isTtsRolledOut,
  type LanguageVoice,
  requiresAsrQa,
  TTS_LANGUAGE_REGISTRY,
  voiceDisplayName,
} from './tts-language-voices';

/** Story 20.6 D2 — the public voice-id convention: `{bcp47}_{f|m}`. The BCP-47 head carries the
 * script/region subtags a voice may need (`zh-Hans_f`, `en-GB_m`), but never an engine-flavored id.
 *
 * Story 36.1 admitted DIGITS to the subtag: UN M49 region codes are numeric, and `es-419` (Latin
 * America) is the correct BCP-47 spelling for the Spanish narrator — `es-MX` would have named a
 * country the clip does not claim. */
const VOICE_ID_CONVENTION = /^[a-z]{2}(-[A-Za-z0-9]+)*_[fm]$/;

describe('tts-language-voices', () => {
  describe('TTS_LANGUAGE_REGISTRY shape', () => {
    it('every entry has a valid engine', () => {
      for (const [code, cfg] of Object.entries(TTS_LANGUAGE_REGISTRY)) {
        expect(cfg.language).toBe(code);
        expect(['kokoro', 'qwen3-tts', 'chatterbox']).toContain(cfg.engine);
      }
    });

    it('every voice has a unique id within its language', () => {
      for (const cfg of Object.values(TTS_LANGUAGE_REGISTRY)) {
        const ids = cfg.voices.map((v: LanguageVoice) => v.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });

    it('every voice id is globally unique across languages', () => {
      const ids = Object.values(TTS_LANGUAGE_REGISTRY).flatMap((cfg) =>
        cfg.voices.map((v) => v.id)
      );
      expect(new Set(ids).size).toBe(ids.length);
    });

    // Story 20.6 AC-6. Scoped to THIS registry — the retired Kokoro vendor catalog's ids
    // (`af_alloy`, `bm_fable`, …) never matched and never will; they were deleted, not renamed.
    it('every voice id follows the {bcp47}_{f|m} convention and leaks no engine id', () => {
      for (const cfg of Object.values(TTS_LANGUAGE_REGISTRY)) {
        for (const voice of cfg.voices) {
          expect(voice.id, `${voice.id} must match ${VOICE_ID_CONVENTION}`).toMatch(
            VOICE_ID_CONVENTION
          );
          // The id's language head must be the entry's own language — either bare (`fr_f`) or
          // carrying a region/script subtag (`es-419_m`, `en-GB_f`). A REGION never moves the
          // voice to another registry entry: the key is the CONTENT language, and one Spanish
          // corpus is narrated by both `es-419_m` and a future `es-ES_f` (36.1).
          expect(
            voice.id.startsWith(`${cfg.language}_`) || voice.id.startsWith(`${cfg.language}-`),
            `${voice.id} must be a voice of "${cfg.language}"`
          ).toBe(true);
          // The gender suffix must agree with the declared gender.
          expect(voice.id.endsWith(voice.gender === 'female' ? '_f' : '_m')).toBe(true);
        }
      }
    });

    it('every voice has a display name and a gender', () => {
      for (const cfg of Object.values(TTS_LANGUAGE_REGISTRY)) {
        for (const voice of cfg.voices) {
          expect(voice.name.length).toBeGreaterThan(0);
          expect(['male', 'female']).toContain(voice.gender);
        }
      }
    });

    it('cloned-voice engines carry a referenceFile; Kokoro carries an engineVoiceId instead', () => {
      for (const cfg of Object.values(TTS_LANGUAGE_REGISTRY)) {
        for (const voice of cfg.voices) {
          if (cfg.engine === 'kokoro') {
            expect(voice.engineVoiceId?.length ?? 0).toBeGreaterThan(0);
            expect(voice.referenceFile).toBeUndefined();
          } else {
            expect(voice.referenceFile?.length ?? 0).toBeGreaterThan(0);
          }
        }
      }
    });

    // Story 36.1 AC-5. `run-shim-supervised.sh:25` derives the reference path from the VOICE ID
    // (`…/user-trimmed/${VOICE_ID}.wav`), never from this field — so a `referenceFile` that does
    // not match its own id would send the registry and the supervisor at two different clips, and
    // nothing else in the tree checks it.
    it("every cloned voice's referenceFile is the path the shim supervisor derives from its id", () => {
      for (const cfg of Object.values(TTS_LANGUAGE_REGISTRY)) {
        for (const voice of cfg.voices) {
          if (!voice.referenceFile) continue;
          expect(voice.referenceFile).toBe(`user-trimmed/${voice.id}.wav`);
        }
      }
    });

    it("every language's default is one of its OWN voices", () => {
      for (const [code, cfg] of Object.entries(TTS_LANGUAGE_REGISTRY)) {
        if (cfg.voices.every((v) => !v.enabled)) continue; // stub — see the base-fallback test
        expect(getVoiceIdsForLanguage(code)).toContain(getDefaultVoiceForLanguage(code));
      }
    });
  });

  describe('English (Story 20.6 — the shipped corpus, re-keyed off Kokoro ids)', () => {
    it('is a kokoro entry with both voices rolled out', () => {
      const en = getLanguageVoiceConfig('en');
      expect(en?.engine).toBe('kokoro');
      expect(en?.asrQaRequired).toBe(false);
      expect(getVoiceIdsForLanguage('en')).toEqual(['en_f', 'en_m']);
      expect(isTtsRolledOut('en')).toBe(true);
    });

    it('keeps the Kokoro catalog ids as PRIVATE engineVoiceIds only', () => {
      expect(getVoiceById('en_f')?.engineVoiceId).toBe('af_heart');
      expect(getVoiceById('en_m')?.engineVoiceId).toBe('am_michael');
      // …and no Kokoro id is ever a PUBLIC id.
      expect(getVoiceById('af_heart')).toBeUndefined();
      expect(getVoiceById('am_michael')).toBeUndefined();
    });

    it('renders the OWNER display names, never Kokoro voice names', () => {
      expect(voiceDisplayName('en_f')).toBe('Aria');
      expect(voiceDisplayName('en_m')).toBe('Miles');
    });

    it('defaults to en_f', () => {
      expect(getDefaultVoiceForLanguage('en')).toBe('en_f');
    });
  });

  describe('French rollout (24.7 AC-2, AC-17)', () => {
    it('is configured on qwen3-tts with asrQaRequired false', () => {
      const fr = getLanguageVoiceConfig('fr');
      expect(fr).toBeDefined();
      expect(fr?.engine).toBe('qwen3-tts');
      expect(fr?.asrQaRequired).toBe(false);
    });

    it('has exactly one rolled-out voice — Juliette (fr_f) — breadth-first pass 1', () => {
      const enabled = getVoicesForLanguage('fr');
      expect(enabled).toHaveLength(1);
      expect(enabled[0].id).toBe('fr_f');
      expect(enabled[0].name).toBe('Juliette');
      expect(getDefaultVoiceForLanguage('fr')).toBe('fr_f');
    });

    it('records fr_m as NOT rolled out (pass 2 material)', () => {
      const fr = getLanguageVoiceConfig('fr');
      const frM = fr?.voices.find((v) => v.id === 'fr_m');
      expect(frM).toBeDefined();
      expect(frM?.enabled).toBe(false);
    });

    it('isTtsRolledOut("fr") is true', () => {
      expect(isTtsRolledOut('fr')).toBe(true);
    });
  });

  describe('Spanish rollout (36.1)', () => {
    it('is configured on qwen3-tts with asrQaRequired false', () => {
      const es = getLanguageVoiceConfig('es');
      expect(es).toBeDefined();
      expect(es?.engine).toBe('qwen3-tts');
      expect(es?.asrQaRequired).toBe(false);
    });

    it('has exactly one rolled-out voice — Mateo (es-419_m) — breadth-first pass 1', () => {
      const enabled = getVoicesForLanguage('es');
      expect(enabled).toHaveLength(1);
      expect(enabled[0].id).toBe('es-419_m');
      expect(enabled[0].name).toBe('Mateo');
      expect(getDefaultVoiceForLanguage('es')).toBe('es-419_m');
    });

    // A region belongs in the VOICE id, never in the registry key: adding Castilian later must be
    // a second voice inside this same `es` entry, because there is one Spanish text corpus
    // (`translate-content.ts`'s `LANGUAGE_NAMES`) narrated two ways. An `es-419`/`es-ES` REGISTRY
    // key would fork the content pipeline and strand rows under a code no client resolves.
    it('carries its region in the voice id, and keeps ONE `es` registry entry', () => {
      expect(getVoiceById('es-419_m')?.name).toBe('Mateo');
      expect(Object.keys(TTS_LANGUAGE_REGISTRY).filter((c) => c.startsWith('es'))).toEqual(['es']);
    });

    it('isTtsRolledOut("es") is true', () => {
      expect(isTtsRolledOut('es')).toBe(true);
    });
  });

  describe('stub languages (24.7 AC-2)', () => {
    it('every remaining qwen3-tts language is a stub with no rolled-out voice', () => {
      for (const code of ['de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko']) {
        expect(isTtsRolledOut(code), `${code} must not be rolled out yet`).toBe(false);
        expect(getVoicesForLanguage(code)).toHaveLength(0);
      }
    });

    it(
      'a voiceless language falls back to the BASE language default — the only voice its ' +
        'sections can actually resolve through (whole-section `en` fallback)',
      () => {
        expect(getDefaultVoiceForLanguage('de')).toBe('en_f');
        expect(getDefaultVoiceForLanguage('xx')).toBe('en_f');
      }
    );
  });

  describe('Arabic — explicitly out of scope (24.7 AC-18)', () => {
    it('is a chatterbox stub, not rolled out', () => {
      const ar = getLanguageVoiceConfig('ar');
      expect(ar?.engine).toBe('chatterbox');
      expect(isTtsRolledOut('ar')).toBe(false);
    });

    it('requires the ASR QA loop even though it is not rolled out (registry decision stands on its own)', () => {
      expect(requiresAsrQa('ar')).toBe(true);
    });
  });

  describe('getLanguageVoiceConfig', () => {
    it('returns undefined for a language with no TTS decision', () => {
      expect(getLanguageVoiceConfig('nl')).toBeUndefined();
      expect(getLanguageVoiceConfig('xx')).toBeUndefined();
    });
  });

  describe('requiresAsrQa', () => {
    it('is false for qwen3-tts and kokoro languages', () => {
      expect(requiresAsrQa('fr')).toBe(false);
      expect(requiresAsrQa('en')).toBe(false);
    });

    it('is true (Chatterbox) where configured', () => {
      expect(requiresAsrQa('ar')).toBe(true);
    });

    it('fails CLOSED (true) for an unknown language rather than silently skipping QA', () => {
      expect(requiresAsrQa('xx')).toBe(true);
    });
  });

  describe('getVoicesForLanguage', () => {
    it('returns an empty array (not throw) for an unknown language', () => {
      expect(getVoicesForLanguage('xx')).toEqual([]);
    });
  });

  describe('voiceDisplayName', () => {
    it('falls back to the id itself for an unknown voice, never blank', () => {
      expect(voiceDisplayName('zz_f')).toBe('zz_f');
    });
  });
});
