/** Quran structure numerals: Arabic-Indic by default in Arabic; an explicit device preference wins. */
import { useMMKVString } from 'react-native-mmkv';

import { getLanguage } from './language';
import { createAppMMKV } from './mmkv';

/** The numeral systems the app can draw a Quran structure number in. */
export const NUMERAL_SYSTEMS = ['western', 'arabic-indic'] as const;

export type NumeralSystem = (typeof NUMERAL_SYSTEMS)[number];

export const DEFAULT_NUMERAL_SYSTEM: NumeralSystem = 'western';

/** Language only seeds an unset preference; switching language never overwrites an explicit choice. */
export function defaultNumeralSystem(): NumeralSystem {
  return getLanguage() === 'ar' ? 'arabic-indic' : DEFAULT_NUMERAL_SYSTEM;
}

/** MMKV key for the numeral-system preference. */
export const NUMERAL_SYSTEM_KEY = '@cloudquran/numeralSystem';

/** Keep an explicit choice independent of the language preference. */
const storage = createAppMMKV('numerals');

/** Whether an unknown stored value is one this build can render. */
export function isNumeralSystem(value: unknown): value is NumeralSystem {
  return typeof value === 'string' && (NUMERAL_SYSTEMS as readonly string[]).includes(value);
}

/**
 * The committed numeral system. Synchronous, and untrusted-input safe: MMKV is a device store a
 * previous build (or a hand edit) can have left anything in, and an unrecognized value falls back
 * to the default rather than rendering nothing. Same guard, same reason, as `lib/theme.ts`'s
 * `isPaletteName` — and like it, there is NO migration table for a retired value.
 */
export function getNumeralSystem(): NumeralSystem {
  const stored = storage.getString(NUMERAL_SYSTEM_KEY);
  return isNumeralSystem(stored) ? stored : defaultNumeralSystem();
}

/** Persist the numeral system. Reactive — every {@link useNumeralSystem} consumer re-renders. */
export function setNumeralSystem(system: NumeralSystem): void {
  storage.set(NUMERAL_SYSTEM_KEY, system);
}

/** The committed numeral system, re-rendering the caller when it changes. */
export function useNumeralSystem(): NumeralSystem {
  const [stored] = useMMKVString(NUMERAL_SYSTEM_KEY, storage);
  return isNumeralSystem(stored) ? stored : defaultNumeralSystem();
}

/**
 * A four-digit SAMPLE of a numeral system — what the picker's row shows under its label.
 *
 * ⚠️ NOT TRANSLATED, AND THAT IS THE SAME CALL `uiLanguageLabel` MAKES FOR ENDONYMS. `٠ ١ ٢ ٣` is
 * `٠ ١ ٢ ٣` in every UI language: these are the glyphs themselves, not a description of them, and
 * a translator has nothing to do here. It is also what makes the row decidable by a reader who
 * cannot read the label — which is the whole job of a writing-system picker.
 */
// lint-i18n-ok: digit samples are the glyphs themselves, identical in every locale by design
export function numeralSampleLabel(system: NumeralSystem): string {
  return system === 'arabic-indic' ? '\u2066٠ ١ ٢ ٣\u2069' : '\u20660 1 2 3\u2069';
}
