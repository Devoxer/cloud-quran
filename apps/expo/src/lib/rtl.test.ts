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
  isRTLContentLanguage,
  isRTLLanguage,
  RECONCILED_KEY,
  RTL_LANGUAGES,
  resolveDirection,
  TEXT_ALIGN_END,
  TEXT_ALIGN_START,
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
    'features/search/components/SearchResultRow.tsx',
    'app/(tabs)/(profile)/appearance.tsx',
    // ⚠️ story 8-3: the study sheet draws BOTH the Quran and a pack's own text in one row, and
    // takes the second one's direction from the PACK's language — a French translation ranges
    // left beside Arabic that ranges right, in the same list, on the same screen.
    'features/study/components/StudySheet.tsx',
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

/**
 * START-EDGE TEXT ALIGNMENT — the source half of the 2026-09-14 fix. The RENDERED half lives in
 * `components/ui/text-start-alignment.test.tsx`; what only a scan can see is the two ways the fix
 * gets undone later, neither of which any render assertion would catch.
 */
describe('start-edge text alignment', () => {
  /** Every shipped source file, tests excluded — the same walk the content scan above implies. */
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') sourceFiles(full, out);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  /**
   * The surfaces that draw QURAN CONTENT and right-align it. They set `textAlign: 'right'`
   * themselves and must KEEP it whatever the interface language does — content direction is not
   * UI direction, which is the contract the describe above pins from the other side.
   *
   * ⚠️ `MushafPage` is a CONTENT file and is deliberately NOT here: a mushaf line is
   * `writingDirection: 'rtl'` + `textAlign: 'center'`, because the facsimile justifies its lines
   * across the column rather than ranging them. It is listed in that describe's `CONTENT_FILES`,
   * where the assertion is about `writingDirection`, which it does set.
   */
  const CONTENT_ALLOWED = [
    'features/reading/components/VerseRow.tsx',
    'features/bookmarks/BookmarkRow.tsx',
    'features/search/components/SearchResultRow.tsx',
    'app/(tabs)/(profile)/appearance.tsx',
  ];

  /**
   * ⚠️ THE WRONG FIX, WHICH LOOKS LIKE THE RIGHT ONE. "The Arabic UI is left-aligned, so align it
   * right" reds nothing: RN SWAPS `left`↔`right` for `textAlign` under an RTL layout direction on
   * both platforms, so `'right'` is the END edge under Arabic and the END edge under English —
   * correct nowhere, and invisible to an LTR test renderer. The only legitimate `'right'` in this
   * tree is on Quran content, which is right-to-left for reasons that have nothing to do with the
   * interface.
   */
  it('no UI surface sets `textAlign: right` — only the content ones may', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => /textAlign:\s*'right'/.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(SRC, file));
    expect(offenders.sort()).toEqual(CONTENT_ALLOWED.sort());
  });

  /**
   * ⚠️ AND THE NEWER CONTENT SITES USE NEITHER LITERAL — they call `contentTextAlign`, which picks
   * between them at runtime (story 8-3, after the owner found a French paragraph set ragged-left
   * in the Arabic build). They are therefore CORRECTLY absent from `CONTENT_ALLOWED` above; this
   * case is what stops that absence reading as "nobody thought about them".
   */
  it('the pack-content surfaces choose their edge at RUNTIME, not with a literal', () => {
    for (const file of [
      'features/study/components/StudySheet.tsx',
      'app/(tabs)/(profile)/content.tsx',
    ]) {
      const code = stripComments(readFileSync(join(SRC, file), 'utf8'));
      expect(code).toMatch(/textAlign:\s*contentTextAlign\(false\)/);
      expect(code).toMatch(/textAlign:\s*contentTextAlign\(true\)/);
      expect(code).not.toMatch(/textAlign:\s*'(right|auto)'/);
    }
  });

  /**
   * ⚠️ AND THE OTHER WAY IT ROTS: a hand-written `textAlign: 'left'` beside the constant. It
   * behaves identically today, which is the problem — the reason the word `left` means START
   * lives in `TEXT_ALIGN_START`'s docblock and nowhere else, so a literal copy is the version a
   * later reader "corrects" to `'right'`.
   */
  it('every start alignment goes through TEXT_ALIGN_START, never a bare literal', () => {
    expect(TEXT_ALIGN_START).toBe('left');
    const offenders = sourceFiles(SRC)
      .filter((file) => relative(SRC, file) !== 'lib/rtl.ts')
      .filter((file) => /textAlign:\s*'left'/.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  /** Anti-vacuity: the walk really reaches the tree, so an empty result means something. */
  it('the scan sees the whole source tree', () => {
    const files = sourceFiles(SRC).map((f) => relative(SRC, f));
    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain('components/ui/ListRow.tsx');
    expect(files).toContain('features/reading/components/VerseRow.tsx');
  });
});

/**
 * CONTENT DIRECTION IS DECIDED BY THE PACK'S OWN LANGUAGE, NOT BY THE INTERFACE'S (story 8-3
 * review, S6).
 *
 * ⚠️ THE MUTATION THIS EXISTS TO REDDEN IS A ONE-WORD ONE, AND IT SHIPPED. Both content draw sites
 * called `isRTLLanguage` — the set of INTERFACE locales, which is `['ar']` — on a value that is a
 * CONTENT language. It was correct for exactly as long as Arabic was the only right-to-left thing
 * in the catalogue. Story 8-4 ships Urdu, Persian and Pashto, and `rtl.test.ts`'s other scans
 * cannot see this: a call to the wrong list has no `I18nManager` and no `isRTL` in it.
 */
describe('content direction', () => {
  it('covers the scripts epic 8 is heading for, not just the interface locales', () => {
    // A LITERAL list of what story 8-4 will publish, not a re-read of the constant under test.
    for (const code of ['ar', 'fa', 'ur', 'ps', 'sd', 'ckb', 'ug', 'he']) {
      expect(isRTLContentLanguage(code)).toBe(true);
    }
    // …and the UI list is NOT the answer for any of them but Arabic, which is the whole defect.
    expect(RTL_LANGUAGES).toEqual(['ar']);
    for (const code of ['fa', 'ur', 'ps']) expect(isRTLLanguage(code)).toBe(false);
  });

  it('reads the PRIMARY subtag and an explicit script subtag, so a regional tag still resolves', () => {
    expect(isRTLContentLanguage('ur-PK')).toBe(true);
    expect(isRTLContentLanguage('fa_IR')).toBe(true);
    // Punjabi is Gurmukhi (LTR) unless it names the Arabic script — the script wins.
    expect(isRTLContentLanguage('pa')).toBe(false);
    expect(isRTLContentLanguage('pa-Arab-PK')).toBe(true);
  });

  it('answers false for left-to-right content and for nothing at all', () => {
    for (const code of ['fr', 'en', 'id', 'tr', 'sw', '', null, undefined]) {
      expect(isRTLContentLanguage(code)).toBe(false);
    }
  });
});

/**
 * `contentTextAlign` — the four combinations, from the emulator (story 8-3, owner-found).
 *
 * ⚠️ THE MUTATION IS "JUST USE `TEXT_ALIGN_START`", WHICH IS WHAT SHIPPED. It follows the
 * INTERFACE, so in the Arabic build a French translation came out flush right and ragged left —
 * a Latin paragraph set the way no Latin paragraph is ever set. `'auto'` is the same bug wearing
 * a better name: on Android it resolves against the view's layout direction, not the text's.
 */
describe('contentTextAlign', () => {
  /**
   * A FRESH module per case: `isRTL()` memoises the process direction on first read (it has to —
   * the framework captures `isRTL` once at module evaluation), so a test that merely rewrote the
   * stored language would be asking a question the module had already answered.
   */
  function alignFor(language: string, contentIsRTL: boolean): string {
    languageStorage.set(LANGUAGE_KEY, language);
    let answer = '';
    jest.isolateModules(() => {
      const rtl = require('./rtl') as typeof import('./rtl');
      answer = rtl.contentTextAlign(contentIsRTL);
    });
    return answer;
  }

  it('aligns to START when the content and the interface agree', () => {
    expect(alignFor('en', false)).toBe(TEXT_ALIGN_START);
    expect(alignFor('ar', true)).toBe(TEXT_ALIGN_START);
  });

  it('…and to END when they differ — which is the whole defect', () => {
    // A French translation in the Arabic build: END resolves to physical LEFT, measured on device.
    expect(alignFor('ar', false)).toBe(TEXT_ALIGN_END);
    // The mirror case, correct since 8-1: Quran text under an English interface.
    expect(alignFor('en', true)).toBe(TEXT_ALIGN_END);
  });

  it('the two literals are not the same value — anti-vacuity', () => {
    expect(TEXT_ALIGN_START).not.toBe(TEXT_ALIGN_END);
  });
});

/**
 * START-EDGE TEXT ALIGNMENT — the source half of the 2026-09-14 fix. The RENDERED half lives in
 * `components/ui/text-start-alignment.test.tsx`; what only a scan can see is the two ways the fix
 * gets undone later, neither of which any render assertion would catch.
 */
describe('start-edge text alignment', () => {
  /** Every shipped source file, tests excluded — the same walk the content scan above implies. */
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') sourceFiles(full, out);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  /**
   * The surfaces that draw QURAN CONTENT and right-align it. They set `textAlign: 'right'`
   * themselves and must KEEP it whatever the interface language does — content direction is not
   * UI direction, which is the contract the describe above pins from the other side.
   *
   * ⚠️ `MushafPage` is a CONTENT file and is deliberately NOT here: a mushaf line is
   * `writingDirection: 'rtl'` + `textAlign: 'center'`, because the facsimile justifies its lines
   * across the column rather than ranging them. It is listed in that describe's `CONTENT_FILES`,
   * where the assertion is about `writingDirection`, which it does set.
   */
  const CONTENT_ALLOWED = [
    'features/reading/components/VerseRow.tsx',
    'features/bookmarks/BookmarkRow.tsx',
    'features/search/components/SearchResultRow.tsx',
    'app/(tabs)/(profile)/appearance.tsx',
  ];

  /**
   * ⚠️ THE WRONG FIX, WHICH LOOKS LIKE THE RIGHT ONE. "The Arabic UI is left-aligned, so align it
   * right" reds nothing: RN SWAPS `left`↔`right` for `textAlign` under an RTL layout direction on
   * both platforms, so `'right'` is the END edge under Arabic and the END edge under English —
   * correct nowhere, and invisible to an LTR test renderer. The only legitimate `'right'` in this
   * tree is on Quran content, which is right-to-left for reasons that have nothing to do with the
   * interface.
   */
  it('no UI surface sets `textAlign: right` — only the content ones may', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => /textAlign:\s*'right'/.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(SRC, file));
    expect(offenders.sort()).toEqual(CONTENT_ALLOWED.sort());
  });

  /**
   * ⚠️ AND THE NEWER CONTENT SITES USE NEITHER LITERAL — they call `contentTextAlign`, which picks
   * between them at runtime (story 8-3, after the owner found a French paragraph set ragged-left
   * in the Arabic build). They are therefore CORRECTLY absent from `CONTENT_ALLOWED` above; this
   * case is what stops that absence reading as "nobody thought about them".
   */
  it('the pack-content surfaces choose their edge at RUNTIME, not with a literal', () => {
    for (const file of [
      'features/study/components/StudySheet.tsx',
      'app/(tabs)/(profile)/content.tsx',
    ]) {
      const code = stripComments(readFileSync(join(SRC, file), 'utf8'));
      expect(code).toMatch(/textAlign:\s*contentTextAlign\(false\)/);
      expect(code).toMatch(/textAlign:\s*contentTextAlign\(true\)/);
      expect(code).not.toMatch(/textAlign:\s*'(right|auto)'/);
    }
  });

  /**
   * ⚠️ AND THE OTHER WAY IT ROTS: a hand-written `textAlign: 'left'` beside the constant. It
   * behaves identically today, which is the problem — the reason the word `left` means START
   * lives in `TEXT_ALIGN_START`'s docblock and nowhere else, so a literal copy is the version a
   * later reader "corrects" to `'right'`.
   */
  it('every start alignment goes through TEXT_ALIGN_START, never a bare literal', () => {
    expect(TEXT_ALIGN_START).toBe('left');
    const offenders = sourceFiles(SRC)
      .filter((file) => relative(SRC, file) !== 'lib/rtl.ts')
      .filter((file) => /textAlign:\s*'left'/.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  /** Anti-vacuity: the walk really reaches the tree, so an empty result means something. */
  it('the scan sees the whole source tree', () => {
    const files = sourceFiles(SRC).map((f) => relative(SRC, f));
    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain('components/ui/ListRow.tsx');
    expect(files).toContain('features/reading/components/VerseRow.tsx');
  });
});

/**
 * CONTENT DIRECTION IS DECIDED BY THE PACK'S OWN LANGUAGE, NOT BY THE INTERFACE'S (story 8-3
 * review, S6).
 *
 * ⚠️ THE MUTATION THIS EXISTS TO REDDEN IS A ONE-WORD ONE, AND IT SHIPPED. Both content draw sites
 * called `isRTLLanguage` — the set of INTERFACE locales, which is `['ar']` — on a value that is a
 * CONTENT language. It was correct for exactly as long as Arabic was the only right-to-left thing
 * in the catalogue. Story 8-4 ships Urdu, Persian and Pashto, and `rtl.test.ts`'s other scans
 * cannot see this: a call to the wrong list has no `I18nManager` and no `isRTL` in it.
 */
describe('content direction', () => {
  it('covers the scripts epic 8 is heading for, not just the interface locales', () => {
    // A LITERAL list of what story 8-4 will publish, not a re-read of the constant under test.
    for (const code of ['ar', 'fa', 'ur', 'ps', 'sd', 'ckb', 'ug', 'he']) {
      expect(isRTLContentLanguage(code)).toBe(true);
    }
    // …and the UI list is NOT the answer for any of them but Arabic, which is the whole defect.
    expect(RTL_LANGUAGES).toEqual(['ar']);
    for (const code of ['fa', 'ur', 'ps']) expect(isRTLLanguage(code)).toBe(false);
  });

  it('reads the PRIMARY subtag and an explicit script subtag, so a regional tag still resolves', () => {
    expect(isRTLContentLanguage('ur-PK')).toBe(true);
    expect(isRTLContentLanguage('fa_IR')).toBe(true);
    // Punjabi is Gurmukhi (LTR) unless it names the Arabic script — the script wins.
    expect(isRTLContentLanguage('pa')).toBe(false);
    expect(isRTLContentLanguage('pa-Arab-PK')).toBe(true);
  });

  it('answers false for left-to-right content and for nothing at all', () => {
    for (const code of ['fr', 'en', 'id', 'tr', 'sw', '', null, undefined]) {
      expect(isRTLContentLanguage(code)).toBe(false);
    }
  });
});
