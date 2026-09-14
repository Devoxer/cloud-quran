/**
 * NUMERAL SYSTEM — which digits the Quran's own structure numbers are drawn in (story 8-1
 * follow-up, 2026-09-14). Device-local, like the palette; nothing crosses the wire.
 *
 * ── ⚠️ THIS DECISION HAS NOW REVERSED TWICE. READ ALL THREE STATES BEFORE MOVING IT AGAIN ────
 *
 *  1. **Story 8-1 shipped "digits stay Western in every language"**, arguing the facsimile
 *     already carries Arabic-Indic numerals so the chrome could stay Latin.
 *  2. **2026-09-13 reversed that to "Arabic-Indic whenever the UI is Arabic"** — measured on the
 *     owner's iPhone, where the QPC font drew the ayah markers `٦ ٧ ٨` and our own page number
 *     underneath them said `3`.
 *  3. **2026-09-14 reverses it again, to what ships now: WESTERN BY DEFAULT IN EVERY LANGUAGE,
 *     WITH A SETTING.** Owner call. Both previous states hard-wired one answer to a question that
 *     has two legitimate ones — an Arabic reader who cross-references Latin-digit sources wants
 *     `3`, and an English-reading hafiz beside a printed mushaf wants `٣`. The language does not
 *     decide it, so the reader does.
 *
 * ⚠️ WHICH IS WHY THIS IS ITS OWN PREFERENCE AND NOT A BRANCH ON `isArabicUi()`. The numeral
 * system is now ORTHOGONAL to the UI language, the way the palette is orthogonal to light/dark:
 * every one of the four combinations is reachable and none of them is a mistake. Re-coupling them
 * would delete the setting rather than default it.
 *
 * ⚠️ AND THE BOUNDARY IS UNCHANGED BY ALL THREE STATES — only the Quran's OWN structure numbers
 * (page, juz', hizb, surah, ayah) are in scope. Durations, byte sizes, dates, playback speed and
 * font size are Western ALWAYS, whatever this setting says, because they are compared against a
 * Latin-digit source outside the app. `lib/format.ts` § `formatQuranNumber` owns that list.
 *
 * ── ⚠️ IT APPLIES LIVE, SO IT MUST BE SUBSCRIBED WHERE THE DIGITS ARE DRAWN ──────────────────
 *
 * Unlike the LANGUAGE — which is committed by a full app reload, so nothing has to react to it —
 * this preference changes under a mounted tree. `formatQuranNumber` reads it per call, which is
 * the correct half; the other half is that a screen sitting in another tab is still mounted and
 * will not re-render on its own. So every surface that DRAWS a structure number uses
 * {@link useQuranNumerals} (via `lib/format.ts`), which subscribes that component through MMKV —
 * the same per-leaf subscription `useThemedStyles` already relies on for the palette, and for the
 * same reason: a subscription at the root cannot re-render a memoized `FlashList` item.
 */

import { useMMKVString } from 'react-native-mmkv';

import { createAppMMKV } from './mmkv';

/** The numeral systems the app can draw a Quran structure number in. */
export const NUMERAL_SYSTEMS = ['western', 'arabic-indic'] as const;

export type NumeralSystem = (typeof NUMERAL_SYSTEMS)[number];

/**
 * ⚠️ `western` IN EVERY LANGUAGE, INCLUDING ARABIC — owner call, and the reversal this module
 * records. A default that varied by language would be state 2 wearing a setting's clothes: an
 * Arabic reader would never see the default they were given, only the one their language picked
 * for them.
 */
export const DEFAULT_NUMERAL_SYSTEM: NumeralSystem = 'western';

/** MMKV key for the numeral-system preference. */
export const NUMERAL_SYSTEM_KEY = '@cloudquran/numeralSystem';

/**
 * Its own MMKV domain rather than `language-prefs`. The numeral system is NOT a language
 * preference — that coupling is precisely what the third state deletes — and an id that said it
 * was would be the first thing a later reader re-derives the coupling from.
 */
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
  return isNumeralSystem(stored) ? stored : DEFAULT_NUMERAL_SYSTEM;
}

/** Persist the numeral system. Reactive — every {@link useNumeralSystem} consumer re-renders. */
export function setNumeralSystem(system: NumeralSystem): void {
  storage.set(NUMERAL_SYSTEM_KEY, system);
}

/** The committed numeral system, re-rendering the caller when it changes. */
export function useNumeralSystem(): NumeralSystem {
  const [stored] = useMMKVString(NUMERAL_SYSTEM_KEY, storage);
  return isNumeralSystem(stored) ? stored : DEFAULT_NUMERAL_SYSTEM;
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
  return system === 'arabic-indic' ? '٠ ١ ٢ ٣' : '0 1 2 3';
}
