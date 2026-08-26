/**
 * Narration voice preference tests (Story 22.12; language-scoped in Story 20.6) — the
 * getter/setter + reactive hook over MMKV `'playback-prefs'`, including the
 * "stale voice → THIS LANGUAGE's default" normalization (AC-9).
 *
 * ⚠️ THIS IS THE ONE CONSUMER SUITE THAT DOES NOT MOCK `@/lib/language` — it drives the real
 * thing. Story 24.18 therefore changed how it must drive the language: the readers moved off the
 * MMKV preference onto the COMMITTED language, so a bare `LANGUAGE_KEY` write no longer moves
 * anything (and the AC-11 case below asserted precisely the re-render 24.18 abolishes). The
 * properties are unchanged — the voice follows the language, and an un-exposed language
 * self-repairs — so every case drives `i18n.changeLanguage` instead, which is what boot performs
 * on the fresh context after a switch restarts the app.
 */

import { getDefaultVoiceForLanguage, getVoiceIdsForLanguage } from '@cloudquran/shared';
import { act, renderHook } from '@testing-library/react-native';
import i18n from 'i18next';
import * as languageConstants from '@/constants/language';
import { createAppMMKV } from './mmkv';
import { getVoicePreference, setVoicePreference, useVoicePreference } from './voicePreference';

const EN_DEFAULT = getDefaultVoiceForLanguage('en');
const EN_OTHER = getVoiceIdsForLanguage('en').find((v) => v !== EN_DEFAULT) as string;
const FR_DEFAULT = getDefaultVoiceForLanguage('fr');

// Story 24.13 — the language PREFERENCE now normalizes against the compile-time
// `EXPOSED_LANGUAGES`, which ships as `['en']`. The tests below that drive a real French selection
// must therefore expose `fr`, or the stored value resolves straight back to `en` and they assert
// nothing. (A plain assignment, not `jest.mock` — see `language.test.ts` for why.)
const REAL_EXPOSED = languageConstants.EXPOSED_LANGUAGES;
function setExposed(codes: readonly string[]): void {
  (languageConstants as { EXPOSED_LANGUAGES: readonly string[] }).EXPOSED_LANGUAGES = codes;
}

beforeEach(async () => {
  createAppMMKV('playback-prefs').clearAll();
  createAppMMKV('language-prefs').clearAll();
  setExposed(REAL_EXPOSED);
  // The i18next singleton is module state and SURVIVES between tests — a case that switches to
  // `fr` would otherwise leave the next one resolving against a language it never set.
  await i18n.changeLanguage('en');
});

afterEach(async () => {
  setExposed(REAL_EXPOSED);
  await i18n.changeLanguage('en');
});

describe('getVoicePreference / setVoicePreference', () => {
  it("defaults to the language's own default when nothing is stored", () => {
    expect(getVoicePreference('en')).toBe(EN_DEFAULT);
  });

  it('round-trips a valid voice OF THAT LANGUAGE', () => {
    setVoicePreference(EN_OTHER);
    expect(getVoicePreference('en')).toBe(EN_OTHER);
  });

  it("falls back to the language's default for a voice it doesn't offer", () => {
    setVoicePreference('zz_removed_voice');
    expect(getVoicePreference('en')).toBe(EN_DEFAULT);
  });

  describe('AC-9 — never another language’s voice, never a global default', () => {
    it("normalizes a voice from ANOTHER language to THIS language's default", () => {
      // The one MMKV key holds the choice across languages by design (a per-language voice memory
      // would be state nobody asked for), so a leftover `en_f` after a switch to French MUST
      // normalize to French's own default. Serving `en_f` would resolve English audio under a
      // French request — and, before 20.6, `pickVoicePair` matched no `fr` row at all, so every
      // French section fell through to the whole-section `en` fallback, silently.
      setVoicePreference(EN_DEFAULT);
      expect(getVoicePreference('fr')).toBe(FR_DEFAULT);
      expect(getVoicePreference('fr')).not.toBe(EN_DEFAULT);
    });

    it('reads the CURRENT language when none is passed', async () => {
      setExposed(['en', 'fr']);
      await i18n.changeLanguage('fr');
      setVoicePreference(EN_DEFAULT);
      // No explicit language → the resolvers' contract: read the COMMITTED language at call time
      // (Story 24.18 — `getLanguage()` reads i18next, not the stored preference).
      expect(getVoicePreference()).toBe(FR_DEFAULT);
    });

    it('a disabled voice is not selectable even though it is in the registry', () => {
      // `fr_m` is recorded but NOT rolled out (24.7 AC-2 — pass 2 flips its `enabled` flag).
      // `getVoicesForLanguage` filters on `enabled`, so storing it must not stick.
      setVoicePreference('fr_m');
      expect(getVoicePreference('fr')).toBe(FR_DEFAULT);
    });
  });
});

describe('useVoicePreference', () => {
  it('reflects the stored voice and updates reactively on set', () => {
    const { result } = renderHook(() => useVoicePreference());
    expect(result.current.voiceId).toBe(EN_DEFAULT);

    act(() => result.current.setVoiceId(EN_OTHER));
    expect(result.current.voiceId).toBe(EN_OTHER);
  });

  it('normalizes a stale stored voice to the default', () => {
    setVoicePreference('zz_removed_voice');
    const { result } = renderHook(() => useVoicePreference());
    expect(result.current.voiceId).toBe(EN_DEFAULT);
  });

  it('re-renders onto the new language’s default when the language changes (AC-11)', async () => {
    setExposed(['en', 'fr']);
    setVoicePreference(EN_DEFAULT);
    const { result } = renderHook(() => useVoicePreference());
    expect(result.current.voiceId).toBe(EN_DEFAULT);

    // The hook reads the language reactively, so the picker cannot keep showing a voice the
    // selected language does not offer. Driven through i18next since Story 24.18: a bare
    // `LANGUAGE_KEY` write moves no reader any more, and this case used to assert exactly that
    // re-render.
    await act(async () => {
      await i18n.changeLanguage('fr');
    });
    expect(result.current.voiceId).toBe(FR_DEFAULT);
  });
});

describe('Story 24.13 — an UN-EXPOSED language self-repairs', () => {
  it("keeps the voice on `en`'s default when the current language is not exposed by this build", async () => {
    // A language this build does NOT expose resolves to `en`, and the voice must follow the
    // RESOLVED language, not the raw one — otherwise it requests French audio in a build that
    // never offers French. `fr` IS exposed in the shipped set now, so un-expose it to exercise the
    // rule (a kill-switch pull, or a language dropped by a future release).
    //
    // ⚠️ Driven through i18next (Story 24.18). Written against MMKV it still PASSED, but
    // vacuously: nothing read that key, so `getVoicePreference()` was answering for a plain `en`
    // session and never exercised the normalization the test is named after.
    setExposed(['en']);
    await i18n.changeLanguage('fr');
    setVoicePreference(EN_DEFAULT);
    expect(getVoicePreference()).toBe(EN_DEFAULT);
    expect(getVoicePreference()).not.toBe(FR_DEFAULT);
  });
});
