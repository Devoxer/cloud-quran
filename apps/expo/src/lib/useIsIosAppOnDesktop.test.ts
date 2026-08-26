import { isIosAppOnDesktop, useIsIosAppOnDesktop } from './useIsIosAppOnDesktop';

/**
 * Both branches of the one signal that identifies "the iPhone build on an Apple-silicon Mac".
 *
 * ⚠️ THE MOCK DEFINES `deviceType` AS A GETTER, AND THAT IS THE WHOLE POINT OF THE FILE.
 * `jest.setup.js` mocks `expo-device` suite-wide with a hardcoded `deviceType: 1` (PHONE), so
 * without a per-file override the DESKTOP branch is unreachable and the test proves only that a
 * phone is not a desktop. A plain per-file value would be no better than the setup one — it fixes
 * the answer for the whole file. A getter is what lets one test move it between cases.
 *
 * ⚠️ WHAT ACTUALLY BREAKS THE GETTER, MEASURED IN THIS REPO RATHER THAN ASSUMED. It is NOT Babel's
 * ESM→CJS interop: `_interopRequireWildcard` copies property DESCRIPTORS, so an accessor stays an
 * accessor, and a named import (`import { deviceType } from 'expo-device'`) compiles to a member
 * access on the namespace and tracks the getter perfectly — swapping the module under test to that
 * form leaves every assertion below green. The one form that breaks is `const { deviceType } =
 * Device` at module scope: ordinary destructuring of an accessor, which invokes the getter ONCE at
 * module-evaluation time and freezes this suite's default. Verified both directions by mutation.
 */

let mockDeviceType = 1; // DeviceType.PHONE — the suite-wide default, restated per test anyway.
let mockPlatformOS = 'ios';

jest.mock('expo-device', () => ({
  get deviceType() {
    return mockDeviceType;
  },
  DeviceType: { UNKNOWN: 0, PHONE: 1, TABLET: 2, DESKTOP: 3, TV: 4 },
}));

// Only `Platform.OS` is replaced; the rest of react-native stays real. A PROXY, not a spread —
// reading every export touches deprecation getters that warn and pull half the list-virtualisation
// stack in before a single test runs (the idiom `lib/auth.test.ts` documents).
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return new Proxy(actual, {
    get(target, prop, receiver) {
      if (prop === 'Platform') {
        return new Proxy(target.Platform, {
          get: (p, key) => (key === 'OS' ? mockPlatformOS : Reflect.get(p, key)),
        });
      }
      return Reflect.get(target, prop, receiver);
    },
  });
});

describe('isIosAppOnDesktop', () => {
  beforeEach(() => {
    mockDeviceType = 1;
    mockPlatformOS = 'ios';
  });

  it('is TRUE on iOS reporting DeviceType.DESKTOP — the Mac runtime, which Platform cannot see', () => {
    mockDeviceType = 3; // DESKTOP — logged from the owner's Mac, where Platform says `pad`/iPadOS.
    expect(isIosAppOnDesktop()).toBe(true);
  });

  it('is FALSE on a real iPhone and a real iPad', () => {
    mockDeviceType = 1; // PHONE
    expect(isIosAppOnDesktop()).toBe(false);
    mockDeviceType = 2; // TABLET — the runtime this one is most often confused with.
    expect(isIosAppOnDesktop()).toBe(false);
  });

  it('is FALSE off iOS, even reporting DESKTOP — an Android tablet or the web export', () => {
    mockDeviceType = 3;
    mockPlatformOS = 'android';
    expect(isIosAppOnDesktop()).toBe(false);
    mockPlatformOS = 'web';
    expect(isIosAppOnDesktop()).toBe(false);
  });

  it('the hook returns the same answer as the function it wraps', () => {
    mockDeviceType = 3;
    expect(useIsIosAppOnDesktop()).toBe(true);
    mockDeviceType = 1;
    expect(useIsIosAppOnDesktop()).toBe(false);
  });
});
