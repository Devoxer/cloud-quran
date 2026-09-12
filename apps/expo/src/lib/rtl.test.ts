/**
 * Layout DIRECTION — the boot application, and the two things only a source scan can see.
 *
 * Story 8-1. `I18nManager.forceRTL` is a native preference write with no readable effect inside
 * jest (`NativeI18nManager` is absent, so RN's own wrapper returns early and `isRTL` stays
 * `false`), which is precisely why the interesting assertions here are about WHO CALLS IT and
 * WHICH SOURCE FILES ASK ABOUT DIRECTION — questions a render cannot answer and a device smoke
 * answers for one direction at a time.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { I18nManager } from 'react-native';

import * as languageConstants from '@/constants/language';
import { LANGUAGE_KEY } from './language';
import { createAppMMKV } from './mmkv';
import {
  applyDirectionForLanguage,
  applyStoredDirection,
  isRTL,
  isRTLLanguage,
  RTL_LANGUAGES,
} from './rtl';

const storage = createAppMMKV('language-prefs');
const SRC = join(__dirname, '..');

let allowSpy: jest.SpyInstance;
let forceSpy: jest.SpyInstance;

beforeEach(() => {
  storage.clearAll();
  allowSpy = jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => {});
  forceSpy = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {});
});

afterEach(() => {
  allowSpy.mockRestore();
  forceSpy.mockRestore();
});

describe('isRTLLanguage', () => {
  it('names Arabic and nothing else the app ships', () => {
    expect(isRTLLanguage('ar')).toBe(true);
    expect(isRTLLanguage('en')).toBe(false);
    expect(isRTLLanguage('fr')).toBe(false);
  });

  it('answers false for an absent code rather than throwing', () => {
    expect(isRTLLanguage(undefined)).toBe(false);
    expect(isRTLLanguage(null)).toBe(false);
    expect(isRTLLanguage('')).toBe(false);
  });

  it('only claims a direction for languages the build can actually render', () => {
    // Anti-vacuity in the other direction: an RTL code with no bundle would force a mirrored
    // layout around English copy, because `getStoredLanguage()` floors the unshipped code to `en`
    // while this set would still answer `true` for it.
    for (const code of RTL_LANGUAGES) {
      expect(languageConstants.EXPOSED_LANGUAGES).toContain(code);
    }
  });
});

describe('applyStoredDirection', () => {
  it('allows RTL and forces it ON for a stored Arabic preference', () => {
    storage.set(LANGUAGE_KEY, 'ar');
    applyStoredDirection();
    expect(allowSpy).toHaveBeenCalledWith(true);
    expect(forceSpy).toHaveBeenCalledWith(true);
  });

  it('forces RTL OFF for English — the switch BACK, which a sticky native flag would eat', () => {
    storage.set(LANGUAGE_KEY, 'en');
    applyStoredDirection();
    expect(allowSpy).toHaveBeenCalledWith(true);
    expect(forceSpy).toHaveBeenCalledWith(false);
  });

  it('forces RTL OFF with nothing stored at all', () => {
    applyStoredDirection();
    expect(forceSpy).toHaveBeenCalledWith(false);
  });

  it('floors an unexposed stored code instead of honouring it', () => {
    // `getStoredLanguage()` normalizes against `EXPOSED_LANGUAGES`, so a preference naming a
    // language this build does not offer must not decide the layout either — the alternative is
    // a mirrored interface rendering English.
    storage.set(LANGUAGE_KEY, 'he');
    applyStoredDirection();
    expect(forceSpy).toHaveBeenCalledWith(false);
  });
});

describe('applyDirectionForLanguage — the pre-reload write', () => {
  /**
   * ⚠️ THIS EXISTS BECAUSE THE POST-RELOAD WRITE IS TOO LATE, and the cost was a blank home
   * surface — see `rtl.ts`'s header for the measurement. What a test can hold is the narrower
   * claim: the function takes the language as an ARGUMENT rather than reading the store, which is
   * what lets the picker call it for a code it has not persisted yet.
   */
  it('answers the CODE it is given, not what MMKV holds', () => {
    storage.set(LANGUAGE_KEY, 'en');
    applyDirectionForLanguage('ar');
    expect(allowSpy).toHaveBeenCalledWith(true);
    expect(forceSpy).toHaveBeenCalledWith(true);
    expect(isRTL()).toBe(true);

    applyDirectionForLanguage('en');
    expect(forceSpy).toHaveBeenLastCalledWith(false);
    expect(isRTL()).toBe(false);
  });

  it('treats an absent or unknown code as left to right', () => {
    applyDirectionForLanguage(undefined);
    expect(forceSpy).toHaveBeenLastCalledWith(false);
    expect(isRTL()).toBe(false);
  });
});

describe('isRTL', () => {
  it('follows the direction the boot call resolved', () => {
    storage.set(LANGUAGE_KEY, 'ar');
    applyStoredDirection();
    expect(isRTL()).toBe(true);

    storage.set(LANGUAGE_KEY, 'en');
    applyStoredDirection();
    expect(isRTL()).toBe(false);
  });

  it('does NOT read `I18nManager.isRTL`, which is stale for one process after a switch', () => {
    // The regression that decided the design: RN captures its flag at module-evaluation time, so
    // in the session right after a switch it still reports the OLD direction. Keying the pager off
    // it parked the mushaf 868320px off-screen (see the file header). Asserting the two can
    // DISAGREE is what makes this more than a restatement.
    storage.set(LANGUAGE_KEY, 'ar');
    applyStoredDirection();
    expect(isRTL()).toBe(true);
    expect(I18nManager.isRTL).toBe(false); // the spies keep the native flag untouched
  });
});

/**
 * Source with its comments removed.
 *
 * ⚠️ EVERY SCAN BELOW RUNS ON THIS, NOT ON THE RAW TEXT. Three files NAME `forceRTL` in prose —
 * the call site's own explanation in `app/_layout.tsx`, the picker's docblock, and `VerseRow`'s
 * warning about the anti-pattern — and that prose is the most valuable thing in each of them. A
 * gate that reds on a file explaining itself teaches people to stop explaining.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Every `.ts`/`.tsx` under `src/`, excluding tests and this file's own scanner. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.(test|type-assertions)\.tsx?$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

describe('one place applies direction', () => {
  it('calls `forceRTL` from `lib/rtl.ts` and nowhere else', () => {
    /**
     * ⚠️ THE DAMAGE OF A SECOND CALLER IS SILENT AND LASTS BEYOND THE SESSION. `forceRTL` writes a
     * NATIVE preference that outlives the JS context, so a screen that flips it "just for itself"
     * leaves every later launch mirrored — and neither tsc, Biome nor a render can see it, because
     * in jest and on web the call is a no-op that returns immediately.
     */
    const offenders = sourceFiles(SRC)
      .filter((file) => /\bforceRTL\b/.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual(['lib/rtl.ts']);
  });
});

describe('content direction is not UI direction', () => {
  /**
   * The Quran text, its mushaf lines, the bookmark previews and the appearance screen's Arabic
   * sample set direction LOCALLY (`writingDirection: 'rtl'` + `textAlign: 'right'`), and always
   * did — they were right-to-left while the interface was English-only, and they must not change
   * when the interface language does. Four suites already assert the resolved styles; what they
   * cannot assert is the shape `VerseRow`'s own docblock warns about —
   * `textAlign: I18nManager.isRTL ? 'left' : 'right'` — which is correct-looking, passes those
   * assertions under an LTR test renderer, and silently left-aligns the Quran in Arabic.
   */
  const CONTENT_FILES = [
    'features/reading/components/VerseRow.tsx',
    'features/reading/mushaf/MushafPage.tsx',
    'features/bookmarks/BookmarkRow.tsx',
    'app/(tabs)/(profile)/appearance.tsx',
  ];

  it.each(CONTENT_FILES)('%s never derives its direction from the UI', (file) => {
    const path = join(SRC, file);
    expect(existsSync(path)).toBe(true); // anti-vacuity: a renamed file must red, not pass
    const code = stripComments(readFileSync(path, 'utf8'));
    expect(code).toMatch(/writingDirection:\s*'rtl'/);
    expect(code).not.toMatch(/I18nManager/);
    expect(code).not.toMatch(/\bisRTL\b/);
  });
});
