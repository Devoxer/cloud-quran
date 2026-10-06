/** Arabic defaults and durable numeral overrides; samples stay in numeric order. */

import { act, renderHook } from '@testing-library/react-native';

import i18n from '@/i18n';
import { createAppMMKV } from './mmkv';
import {
  DEFAULT_NUMERAL_SYSTEM,
  getNumeralSystem,
  isNumeralSystem,
  NUMERAL_SYSTEMS,
  numeralSampleLabel,
  setNumeralSystem,
  useNumeralSystem,
} from './numerals';

beforeEach(async () => {
  createAppMMKV('numerals').clearAll();
  await i18n.changeLanguage('en');
});

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

  it('defaults an unset Arabic preference to Arabic-Indic', async () => {
    await i18n.changeLanguage('ar');
    expect(getNumeralSystem()).toBe('arabic-indic');
  });

  it('keeps an explicit Western choice in Arabic', async () => {
    setNumeralSystem('western');
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
    expect(numeralSampleLabel('western')).toBe('\u20660 1 2 3\u2069');
    expect(numeralSampleLabel('arabic-indic')).toBe('\u2066٠ ١ ٢ ٣\u2069');
  });

  it('is the SAME sample in every UI language — it is script, not copy', async () => {
    const enSample = numeralSampleLabel('arabic-indic');
    await i18n.changeLanguage('ar');
    expect(numeralSampleLabel('arabic-indic')).toBe(enSample);
  });
});
