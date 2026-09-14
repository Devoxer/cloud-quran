/**
 * The numeral-system preference (2026-09-14) — the THIRD state of a decision that has reversed
 * twice, so the cases here are written against the reversals rather than against the getter.
 *
 * ⚠️ WHAT THIS SUITE MUST BE ABLE TO CATCH. `lib/numerals.ts` records three states: Western-always
 * (8-1), Arabic-Indic-whenever-the-UI-is-Arabic (2026-09-13), and a device preference defaulting
 * to Western in every language (now). A test that only asserted `set('arabic-indic') → '٣'` would
 * stay green under EITHER of the retired states, so the load-bearing cases are the DEFAULT one
 * and the one that pins the preference has nothing to do with the language. The rendering half
 * lives in `lib/format.test.ts` § formatQuranNumber, which carries the cross cases.
 */

import { act, renderHook } from '@testing-library/react-native';

import i18n from '@/i18n';
import {
  DEFAULT_NUMERAL_SYSTEM,
  getNumeralSystem,
  isNumeralSystem,
  NUMERAL_SYSTEMS,
  numeralSampleLabel,
  setNumeralSystem,
  useNumeralSystem,
} from './numerals';

afterEach(async () => {
  setNumeralSystem(DEFAULT_NUMERAL_SYSTEM);
  await i18n.changeLanguage('en');
});

describe('the preference', () => {
  it('ships exactly two systems, and Western is the default', () => {
    expect(NUMERAL_SYSTEMS).toEqual(['western', 'arabic-indic']);
    expect(DEFAULT_NUMERAL_SYSTEM).toBe('western');
  });

  it('answers the default with nothing stored — a fresh install is Western', () => {
    expect(getNumeralSystem()).toBe('western');
  });

  /**
   * ⚠️ THE CASE THAT REDS FOR A RE-COUPLING. State 2 lives on in one obvious "simplification":
   * default to Arabic-Indic when the interface is Arabic. This asserts a fresh Arabic install is
   * still Western — the owner's whole point, that the language does not decide this.
   */
  it('is Western under an ARABIC interface too, with nothing stored', async () => {
    await i18n.changeLanguage('ar');
    expect(getNumeralSystem()).toBe('western');
  });

  it('persists a choice and reads it back', () => {
    setNumeralSystem('arabic-indic');
    expect(getNumeralSystem()).toBe('arabic-indic');
    setNumeralSystem('western');
    expect(getNumeralSystem()).toBe('western');
  });

  it('falls back to the default for a value this build does not know', () => {
    // MMKV is a device store: a retired value from an older build, or a hand edit, is reachable.
    // There is deliberately NO migration table — the guard is the migration.
    setNumeralSystem('devanagari' as never);
    expect(getNumeralSystem()).toBe('western');
    expect(isNumeralSystem('devanagari')).toBe(false);
    expect(isNumeralSystem(undefined)).toBe(false);
    expect(isNumeralSystem('arabic-indic')).toBe(true);
  });
});

describe('useNumeralSystem', () => {
  /**
   * ⚠️ THIS IS WHY THE HOOK EXISTS AT ALL. Unlike the LANGUAGE — committed by a full app reload,
   * so nothing has to react to it — this preference moves under a mounted tree: the reader is in
   * Settings while the mushaf sits in another tab, still mounted. A getter alone leaves the old
   * digits on screen. MUTATION: replace the body with `getNumeralSystem()` and this case reds
   * while every other case in both suites stays green.
   */
  it('re-renders its caller when the preference moves', () => {
    const { result } = renderHook(() => useNumeralSystem());
    expect(result.current).toBe('western');
    act(() => setNumeralSystem('arabic-indic'));
    expect(result.current).toBe('arabic-indic');
    act(() => setNumeralSystem('western'));
    expect(result.current).toBe('western');
  });

  it('applies the same unknown-value guard as the getter', () => {
    setNumeralSystem('devanagari' as never);
    const { result } = renderHook(() => useNumeralSystem());
    expect(result.current).toBe('western');
  });
});

describe('numeralSampleLabel', () => {
  it('shows the glyphs themselves, so the row is decidable without reading the label', () => {
    expect(numeralSampleLabel('western')).toBe('0 1 2 3');
    expect(numeralSampleLabel('arabic-indic')).toBe('٠ ١ ٢ ٣');
  });

  it('is the SAME sample in every UI language — it is script, not copy', async () => {
    const enSample = numeralSampleLabel('arabic-indic');
    await i18n.changeLanguage('ar');
    expect(numeralSampleLabel('arabic-indic')).toBe(enSample);
  });
});
