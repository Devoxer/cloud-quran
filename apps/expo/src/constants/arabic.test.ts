/**
 * The Arabic rendering tokens (story 6-1) — every one of which is a platform trap or a bound.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE THREE THINGS IN `arabic.ts` WERE DELETABLE WITH EVERY GATE GREEN.
 *
 *   1. **The Android family branch.** Replacing the whole `Platform.select` with the iOS spelling
 *      passed 104 suites, because the one case that read it (`read-screen.test.tsx`) compared the
 *      rendered style against `UTHMANI_FONT_FAMILY` — the same constant the component read. A
 *      test that asserts `x === x` cannot see a wrong `x`. And the failure is silent on a device:
 *      Android's `Typeface.create` falls back to the system font rather than throwing, so wrong
 *      means Arabic in Roboto, which still looks like Arabic to anything automated.
 *   2. **The web `useFonts` registration.** `jest.setup.js` mocked `useFonts` discarding its
 *      argument, so no suite could observe the map — and that map is the ONLY thing that loads
 *      this face on the platform the Electron desktop shell wraps.
 *   3. **`clampArabicFontSize`.** Untested outright: every screen case mocked `usePreferences` as
 *      `{ data: null }`, so only the default branch ever ran, and min/max/NaN/null — the entire
 *      reason the function exists — were covered by nothing.
 *
 * ⚠️ THE `Platform` PROXY IS THE PATTERN `lib/auth.test.ts` AND `sign-in-parity.test.tsx` ALREADY
 * USE, PLUS ONE ADDITION THEY DID NOT NEED. Those two move `Platform.OS` only. `arabic.ts` calls
 * `Platform.select`, and RN's `select` is a per-platform implementation that hardcodes its own
 * branch (`Platform.ios.js` returns `spec.ios` whatever `OS` says), so moving `OS` alone changes
 * nothing at all — the Android case would pass while asserting the iOS value. The proxy replaces
 * both, and `select` is re-implemented against the mocked `OS` with RN's own precedence
 * (`<platform>` → `native` → `default`).
 *
 * ⚠️ A PROXY, NOT A SPREAD: `{ ...require('react-native') }` READS every export, and several are
 * deprecation getters that warn and drag the list-virtualisation stack in the moment they are
 * touched. A proxy forwards lazily, so only `Platform` is ever resolved.
 */

let mockPlatformOS = 'ios';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return new Proxy(actual, {
    get(target, prop, receiver) {
      if (prop === 'Platform') {
        return new Proxy(target.Platform, {
          get: (p: object, key: string | symbol) => {
            if (key === 'OS') return mockPlatformOS;
            if (key === 'select') {
              return (spec: Record<string, unknown>) => {
                if (mockPlatformOS in spec) return spec[mockPlatformOS];
                if (mockPlatformOS !== 'web' && 'native' in spec) return spec.native;
                return spec.default;
              };
            }
            return Reflect.get(p, key);
          },
        });
      }
      return Reflect.get(target, prop, receiver);
    },
  });
});

/**
 * Re-require the module under a given platform. ⚠️ `UTHMANI_FONT_FAMILY` and `UTHMANI_WEB_FONT`
 * are both resolved at MODULE SCOPE, so the platform has to be set before the import runs —
 * which means a fresh registry per platform. Safe here because `arabic.ts` pulls in no React:
 * `jest.resetModules` is what breaks `sign-in-parity.test.tsx` (two copies of React), and there
 * is no component in this file to break.
 */
function arabicOn(platform: string): typeof import('./arabic') {
  mockPlatformOS = platform;
  let mod: typeof import('./arabic') = {} as never;
  jest.isolateModules(() => {
    mod = require('./arabic');
  });
  return mod;
}

afterEach(() => {
  mockPlatformOS = 'ios';
});

describe('the Uthmani family name differs per platform, and both spellings are traps', () => {
  it('is the font’s INTERNAL family name on iOS — not the filename', () => {
    // The expo-font config plugin adds the file to the Xcode target and lists it in `UIAppFonts`,
    // so UIKit registers it under the `name` table's family record. Recorded in
    // `epic-1-retro-2026-03-20.md:117`, where it cost a story.
    const { UTHMANI_FONT_FAMILY } = arabicOn('ios');
    expect(UTHMANI_FONT_FAMILY).toBe('KFGQPC HAFS Uthmanic Script');
  });

  it('is the ASSET FILENAME on Android — the exact opposite, and the retro does not say so', () => {
    // MUTATION: collapse `Platform.select` to the iOS spelling. It passed 104 suites. RN's
    // `ReactFontManager` resolves `fontFamily` by looking for `fonts/<fontFamily>.ttf` in the
    // Android assets, so the iOS name finds nothing — and `Typeface.create` falls back to the
    // system font SILENTLY. Wrong here is Arabic rendered in Roboto, with no error anywhere.
    const { UTHMANI_FONT_FAMILY } = arabicOn('android');
    expect(UTHMANI_FONT_FAMILY).toBe('KFGQPCUthmanicScriptHAFS');
  });

  it('takes the iOS spelling on web, which is what the web `useFonts` key registers', () => {
    const arabic = arabicOn('web');
    expect(arabic.UTHMANI_FONT_FAMILY).toBe(arabic.UTHMANI_FONT_FAMILY_IOS);
  });

  it('the two spellings are genuinely different — anti-vacuity for the cases above', () => {
    const { UTHMANI_FONT_FAMILY_IOS, UTHMANI_FONT_FAMILY_ANDROID } = arabicOn('ios');
    expect(UTHMANI_FONT_FAMILY_IOS).not.toBe(UTHMANI_FONT_FAMILY_ANDROID);
  });
});

describe('the web-only font registration', () => {
  it('registers the Uthmani face on web, under the family a style asks for', () => {
    // ⚠️ THE ONLY THING THAT LOADS THIS FACE ON WEB. The expo-font config plugin edits the Xcode
    // target and the Android assets and does nothing for `expo export --platform web`, so
    // deleting this map means Arabic in a fallback face on the platform Electron wraps — silently,
    // with no error and nothing failing.
    const arabic = arabicOn('web');
    expect(Object.keys(arabic.UTHMANI_WEB_FONT)).toEqual([arabic.UTHMANI_FONT_FAMILY_IOS]);
    expect(arabic.UTHMANI_WEB_FONT[arabic.UTHMANI_FONT_FAMILY_IOS]).toBeDefined();
  });

  it('is EMPTY on iOS and Android, where the config plugin already installed the face', () => {
    // A 237 KB TTF in the boot-gating font load would slow every native cold launch to fetch
    // something already present in the app bundle.
    expect(arabicOn('ios').UTHMANI_WEB_FONT).toEqual({});
    expect(arabicOn('android').UTHMANI_WEB_FONT).toEqual({});
  });
});

describe('clampArabicFontSize', () => {
  // ⚠️ UNTESTED UNTIL THIS FILE. The whole point of the function is the bounds — a preference
  // written by a future build (story 6.5 owns the picker) must not be able to make the verse
  // unreadably small or put one word on a screen — and the bounds were the part nothing ran.

  it('answers the default for a reader with no preference', () => {
    const { clampArabicFontSize, ARABIC_FONT_SIZE } = arabicOn('ios');
    expect(clampArabicFontSize(undefined)).toBe(ARABIC_FONT_SIZE.default);
    expect(clampArabicFontSize(null)).toBe(ARABIC_FONT_SIZE.default);
  });

  it('answers the default for anything that is not a finite number', () => {
    // `PreferencesBody.fontSize` is typed `number`, and the row comes off the device, so `NaN`
    // and `Infinity` are both reachable — and `Math.min/max` propagate `NaN` rather than clamping
    // it, which would set `fontSize: NaN` on a `Text` and collapse the verse to nothing.
    const { clampArabicFontSize, ARABIC_FONT_SIZE } = arabicOn('ios');
    expect(clampArabicFontSize(Number.NaN)).toBe(ARABIC_FONT_SIZE.default);
    expect(clampArabicFontSize(Number.POSITIVE_INFINITY)).toBe(ARABIC_FONT_SIZE.default);
    expect(clampArabicFontSize('28' as unknown as number)).toBe(ARABIC_FONT_SIZE.default);
  });

  it('clamps to the scale at both ends, and passes a value inside it through', () => {
    const { clampArabicFontSize, ARABIC_FONT_SIZE } = arabicOn('ios');
    expect(clampArabicFontSize(1)).toBe(ARABIC_FONT_SIZE.min);
    expect(clampArabicFontSize(1000)).toBe(ARABIC_FONT_SIZE.max);
    expect(clampArabicFontSize(ARABIC_FONT_SIZE.min)).toBe(ARABIC_FONT_SIZE.min);
    expect(clampArabicFontSize(ARABIC_FONT_SIZE.max)).toBe(ARABIC_FONT_SIZE.max);
    expect(clampArabicFontSize(32)).toBe(32);
  });

  it('bounds the epic’s stated 20–44 Arabic scale, with a legible default inside it', () => {
    const { ARABIC_FONT_SIZE, ARABIC_LINE_HEIGHT } = arabicOn('ios');
    expect(ARABIC_FONT_SIZE.min).toBe(20);
    expect(ARABIC_FONT_SIZE.max).toBe(44);
    expect(ARABIC_FONT_SIZE.default).toBeGreaterThanOrEqual(ARABIC_FONT_SIZE.min);
    expect(ARABIC_FONT_SIZE.default).toBeLessThanOrEqual(ARABIC_FONT_SIZE.max);
    // Much looser than any Latin ratio in `typography.ts`: the KFGQPC face stacks vowel marks and
    // waqf signs well above and below the baseline, and at 1.5 they collide with the next line.
    expect(ARABIC_LINE_HEIGHT).toBeGreaterThan(1.5);
  });
});
