/**
 * Layout DIRECTION — the platform floor, the boot reconcile, and the two things only a source
 * scan can see (story 8-1).
 *
 * ⚠️ `I18nManager.forceRTL` has no readable effect inside jest — `NativeI18nManager` is absent, so
 * RN's own wrapper returns early and `isRTL` stays `false`. That is exactly why the assertions
 * here are about WHAT WE DECIDE and WHO CALLS IT rather than about a rendered mirror: a device
 * smoke can only ever observe one direction at a time, and never the web floor at all.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { I18nManager, Platform } from 'react-native';

import * as languageConstants from '@/constants/language';
import { LANGUAGE_KEY } from './language';
import { createAppMMKV } from './mmkv';
import {
  applyDirectionForLanguage,
  applyStoredDirection,
  isRTL,
  isRTLLanguage,
  RECONCILED_KEY,
  RTL_LANGUAGES,
  resolveDirection,
} from './rtl';

// The reload is stubbed on `globalThis.expo` in `jest.setup.js` — `expo`'s `reloadAppAsync` is a
// one-liner over this global, so the real function runs and lands on the stub. See
// `lib/language.test.ts` for the three forms that were tried and rejected.
const mockReloadAppAsync = (globalThis as unknown as { expo: { reloadAppAsync: jest.Mock } }).expo
  .reloadAppAsync;

const languageStorage = createAppMMKV('language-prefs');
const directionStorage = createAppMMKV('direction');
const SRC = join(__dirname, '..');
const ORIGINAL_PLATFORM = Platform.OS;

let allowSpy: jest.SpyInstance;
let forceSpy: jest.SpyInstance;

/** `Platform.OS` is a plain mutable property under jest — the idiom `lib/storage.test.ts` uses. */
function setPlatform(os: string): void {
  (Platform as { OS: string }).OS = os;
}

beforeEach(() => {
  jest.clearAllMocks();
  languageStorage.clearAll();
  directionStorage.clearAll();
  setPlatform(ORIGINAL_PLATFORM);
  allowSpy = jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => {});
  forceSpy = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {});
});

afterEach(() => {
  allowSpy.mockRestore();
  forceSpy.mockRestore();
  setPlatform(ORIGINAL_PLATFORM);
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

  it('is the SCRIPT question, and stays platform-blind', () => {
    // It must NOT learn about web — `resolveDirection` is where the floor goes, and keeping this
    // one pure is what lets the floor be asserted separately below.
    setPlatform('web');
    expect(isRTLLanguage('ar')).toBe(true);
  });
});

describe('resolveDirection — the web floor', () => {
  /**
   * ⚠️ WITHOUT THIS FLOOR THE MUSHAF TURNS PAGES BACKWARDS ON WEB, WITH NO NATIVE DEVICE INVOLVED.
   * MMKV is localStorage-backed on web, so a web reader who picks Arabic persists `language=ar`
   * like anyone else. `react-native-web`'s `I18nManager` is a stub whose `isRTL` is a hardcoded
   * `false` and whose `forceRTL` returns immediately — and FlashList reads that same stub. So an
   * unfloored `isRTL()` would hand `pagerData(true)` UNREVERSED data to a list doing LTR maths.
   */
  it('floors Arabic to LTR on web', () => {
    setPlatform('web');
    expect(resolveDirection('ar')).toBe(false);
  });

  it('keeps Arabic RTL on every native platform', () => {
    for (const os of ['ios', 'android']) {
      setPlatform(os);
      expect(resolveDirection('ar')).toBe(true);
    }
  });

  it('answers false for a left-to-right language on every platform', () => {
    for (const os of ['ios', 'android', 'web']) {
      setPlatform(os);
      expect(resolveDirection('en')).toBe(false);
      expect(resolveDirection(undefined)).toBe(false);
    }
  });
});

describe('applyStoredDirection', () => {
  it('allows RTL and forces it ON for a stored Arabic preference', () => {
    languageStorage.set(LANGUAGE_KEY, 'ar');
    applyStoredDirection();
    expect(allowSpy).toHaveBeenCalledWith(true);
    expect(forceSpy).toHaveBeenCalledWith(true);
    expect(isRTL()).toBe(true);
  });

  it('forces RTL OFF for English — the switch BACK, which a sticky native flag would eat', () => {
    languageStorage.set(LANGUAGE_KEY, 'en');
    applyStoredDirection();
    expect(allowSpy).toHaveBeenCalledWith(true);
    expect(forceSpy).toHaveBeenCalledWith(false);
    expect(isRTL()).toBe(false);
  });

  it('forces RTL OFF with nothing stored at all', () => {
    applyStoredDirection();
    expect(forceSpy).toHaveBeenCalledWith(false);
  });

  it('floors an unexposed stored code instead of honouring it', () => {
    // `getStoredLanguage()` normalizes against `EXPOSED_LANGUAGES`, so a preference naming a
    // language this build does not offer must not decide the layout either — the alternative is
    // a mirrored interface rendering English.
    languageStorage.set(LANGUAGE_KEY, 'he');
    applyStoredDirection();
    expect(forceSpy).toHaveBeenCalledWith(false);
  });

  it('floors to LTR on web even with Arabic stored', () => {
    setPlatform('web');
    languageStorage.set(LANGUAGE_KEY, 'ar');
    applyStoredDirection();
    expect(forceSpy).toHaveBeenCalledWith(false);
    expect(isRTL()).toBe(false);
  });
});

describe('applyStoredDirection — the boot reconcile', () => {
  /**
   * ⚠️ THIS IS THE SPEC'S I/O MATRIX ROW 1, AND IT IS REACHED WITH NO USER ACTION. A fresh install
   * on an Arabic device seeds `ar` from the device locale, so the FIRST session wants RTL — while
   * RN's `I18nManager` captured `isRTL` at module-evaluation time, long before `_layout.tsx` ran,
   * and answers `false` for the whole session. That is the measured blank-mushaf state. Nobody
   * touches the picker, so nothing else would ever put the framework in step.
   */
  it('reloads ONCE when the framework disagrees with the language', () => {
    languageStorage.set(LANGUAGE_KEY, 'ar'); // wants RTL; I18nManager.isRTL is false under jest
    applyStoredDirection();
    expect(mockReloadAppAsync).toHaveBeenCalledTimes(1);
    expect(directionStorage.getString(RECONCILED_KEY)).toBe('true');
  });

  it('does NOT reload again on the next boot — the guard is durable, not module state', () => {
    // ⚠️ An unguarded "reload until they agree" is an infinite BOOT LOOP on any platform that
    // fails to honour the pref — the worst thing this file could ship. The marker has to outlive
    // the reload it is guarding against, which is why it is in MMKV and not a `let`.
    languageStorage.set(LANGUAGE_KEY, 'ar');
    applyStoredDirection();
    applyStoredDirection();
    applyStoredDirection();
    expect(mockReloadAppAsync).toHaveBeenCalledTimes(1);
  });

  it('does not reload when the framework already agrees, and clears the marker', () => {
    directionStorage.set(RECONCILED_KEY, 'false');
    languageStorage.set(LANGUAGE_KEY, 'en'); // wants LTR; I18nManager.isRTL is false — agreed
    applyStoredDirection();
    expect(mockReloadAppAsync).not.toHaveBeenCalled();
    // Cleared so a LATER genuine change still gets its one reload.
    expect(directionStorage.getString(RECONCILED_KEY)).toBeUndefined();
  });

  it('never reloads on web, where the stub can never agree by any other route', () => {
    setPlatform('web');
    languageStorage.set(LANGUAGE_KEY, 'ar');
    applyStoredDirection();
    expect(mockReloadAppAsync).not.toHaveBeenCalled();
  });
});

describe('applyDirectionForLanguage — the pre-reload write', () => {
  /**
   * ⚠️ THIS EXISTS BECAUSE THE POST-RELOAD WRITE IS TOO LATE, and the cost was a blank home
   * surface — see `rtl.ts`'s header for the measurement. What a test can hold is the narrower
   * claim: it takes the language as an ARGUMENT rather than reading the store, which is what lets
   * the picker call it for a code it has not persisted yet.
   */
  it('answers the CODE it is given, not what MMKV holds', () => {
    languageStorage.set(LANGUAGE_KEY, 'en');
    applyDirectionForLanguage('ar');
    expect(allowSpy).toHaveBeenCalledWith(true);
    expect(forceSpy).toHaveBeenCalledWith(true);
  });

  it('takes the SAME web floor — a web picker tap must not write RTL either', () => {
    setPlatform('web');
    applyDirectionForLanguage('ar');
    expect(forceSpy).toHaveBeenCalledWith(false);
  });

  it('treats an absent or unknown code as left to right', () => {
    applyDirectionForLanguage(undefined);
    expect(forceSpy).toHaveBeenLastCalledWith(false);
  });

  it('does NOT move what `isRTL()` answers for the STILL-MOUNTED tree', () => {
    // ⚠️ The tree is live and its native views are still laid out the old way, so every `Icon`
    // that re-renders between the tap and the reload must keep mirroring the way the screen
    // actually looks. This function is about the NEXT process.
    languageStorage.set(LANGUAGE_KEY, 'en');
    applyStoredDirection();
    expect(isRTL()).toBe(false);
    applyDirectionForLanguage('ar');
    expect(isRTL()).toBe(false);
  });

  it('does not reload — the caller owns that, in the order that makes it land', () => {
    applyDirectionForLanguage('ar');
    expect(mockReloadAppAsync).not.toHaveBeenCalled();
  });
});

describe('isRTL vs `I18nManager.isRTL`', () => {
  it('is allowed to disagree ONLY while the framework has not caught up', () => {
    /**
     * ⚠️ BOUNDED ON PURPOSE. An earlier cut of this case asserted the divergence as simply
     * correct, which blessed two real defects: a web reader stuck on `true` forever, and a fresh
     * Arabic-device install stuck on `true` for its whole first session. The divergence is
     * legitimate in exactly ONE window — a native process whose pref was written before this one
     * started, where RN's module-scope capture is the stale value and OURS is the true one. Every
     * other route out of that window is now closed in code: the web floor
     * (`resolveDirection`) and the boot reconcile's one reload.
     */
    languageStorage.set(LANGUAGE_KEY, 'ar');
    applyStoredDirection();

    // The window: we say RTL, the framework still says LTR.
    expect(isRTL()).toBe(true);
    expect(I18nManager.isRTL).toBe(false);

    // …and it is not left standing. The boot path noticed and reloaded exactly once.
    expect(mockReloadAppAsync).toHaveBeenCalledTimes(1);
  });

  it('never diverges on web, because the floor removes the window', () => {
    setPlatform('web');
    languageStorage.set(LANGUAGE_KEY, 'ar');
    applyStoredDirection();
    expect(isRTL()).toBe(I18nManager.isRTL);
    expect(mockReloadAppAsync).not.toHaveBeenCalled();
  });
});

/**
 * Source with its comments removed.
 *
 * ⚠️ EVERY SCAN BELOW RUNS ON THIS, NOT ON THE RAW TEXT. Several files NAME `forceRTL` in prose —
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
     *
     * ⚠️ IT CANNOT SEE A MISSING CALL SITE, which is the other half and a different failure:
     * `root-layout-boot.test.tsx` is what pins that `app/_layout.tsx` still calls
     * `applyStoredDirection()`, and calls it before `initI18n()`.
     */
    const offenders = sourceFiles(SRC)
      .filter((file) => /\bforceRTL\b/.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual(['lib/rtl.ts']);
  });

  // ⚠️ A COMPANION SCAN FOR THE WEB FLOOR WAS TRIED AND DELETED: "any file that names `isRTL` and
  // `Platform.OS` is a second direction authority". It fired on `sign-in.tsx`, which legitimately
  // branches on the platform for the SIGN-IN MECHANISM while reading `isRTL()` for a caption's
  // letter-spacing — two unrelated facts about the same file. A scan on co-occurrence cannot tell
  // a second floor from a coincidence, and a gate with a standing false positive is a gate people
  // allow-list around. The floor is held instead by `resolveDirection`'s own cases above, which
  // redden if the `Platform.OS !== 'web'` clause is deleted.
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
