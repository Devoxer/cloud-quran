/**
 * `useTabBarHeight` — the offset a screen reserves above the native tab bar (story 6-0).
 *
 * ⚠️ THE CASE THAT MATTERS IS THE iPad ONE, AND IT IS WHY THIS IS A HOOK AT ALL. Shipped first as a
 * module constant, it answered 0 on any iPad running iPadOS 18+ — correct at regular width, where
 * `<NativeTabs sidebarAdaptable>` moves the tabs to the top, and WRONG in Slide Over and in a
 * compact-width Split View, where iPadOS puts the bar back at the bottom. A constant cannot see
 * that: the width changes at runtime when the reader resizes the split. That is the
 * `tab-bar-covers-last-verse` defect, reintroduced by the fix for its sibling.
 *
 * ⚠️ `Platform` IS REPLACED WHOLESALE RATHER THAN HAVING `OS` PROXIED, unlike `tab-chrome.test.tsx`
 * — because this module calls `Platform.select`, and the iOS build of that function is hardcoded to
 * return `spec.ios`. Proxying `OS` alone would leave every case answering 49, including the Android
 * and web ones, and they would still pass. The stand-in below reimplements RN's documented
 * resolution order (`[OS]`, then `native`, then `default`) so the branch under test is the one that
 * runs. jest-expo pins the iPhone iOS preset, so without this every branch but one is unreachable —
 * which is exactly how the constant's iPad version check went untested.
 */

let mockPlatform: { OS: string; isPad: boolean; Version: string | number } = {
  OS: 'ios',
  isPad: false,
  Version: '18.0',
};
let mockWidth = 390;

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return new Proxy(actual, {
    get(target, prop, receiver) {
      if (prop === 'Platform') {
        return {
          get OS() {
            return mockPlatform.OS;
          },
          get isPad() {
            return mockPlatform.isPad;
          },
          get Version() {
            return mockPlatform.Version;
          },
          select: (spec: Record<string, unknown>) =>
            mockPlatform.OS in spec
              ? spec[mockPlatform.OS]
              : 'native' in spec
                ? spec.native
                : spec.default,
        };
      }
      if (prop === 'useWindowDimensions') {
        return () => ({ width: mockWidth, height: 844, scale: 3, fontScale: 1 });
      }
      return Reflect.get(target, prop, receiver);
    },
  });
});

import { renderHook } from '@testing-library/react-native';
import { useTabBarHeight } from './useTabBarHeight';

function heightWith(
  platform: { OS: string; isPad: boolean; Version: string | number },
  width: number
): number {
  mockPlatform = platform;
  mockWidth = width;
  return renderHook(() => useTabBarHeight()).result.current;
}

describe('the phone and web branches', () => {
  it('reserves 49pt on iPhone — NOT 84, which double-counts the home indicator', () => {
    // 84 ≈ 49 + ~34: the previous value summed the home indicator that `insets.bottom` already
    // supplies, so a consumer adding `height + insets.bottom` floated ~34pt too high.
    expect(heightWith({ OS: 'ios', isPad: false, Version: '18.0' }, 390)).toBe(49);
  });

  it('reserves 80dp on Android — Material-3, not Material-2’s 56', () => {
    expect(heightWith({ OS: 'android', isPad: false, Version: 36 }, 412)).toBe(80);
  });

  it('reserves nothing on web, where the chrome is a top pill', () => {
    expect(heightWith({ OS: 'web', isPad: false, Version: '' }, 1280)).toBe(0);
  });
});

describe('the iPad, where the answer depends on the window and not just the device', () => {
  it('reserves nothing at regular width on iPadOS 18+ — the tabs are at the top there', () => {
    expect(heightWith({ OS: 'ios', isPad: true, Version: '18.0' }, 1024)).toBe(0);
  });

  it('STILL reserves 49pt in Slide Over, where the bar comes back', () => {
    // ⚠️ THE CASE THE CONSTANT GOT WRONG. `sidebarAdaptable` moves the tabs off the bottom only in
    // regular horizontal width; a Slide Over window is compact and keeps the bottom bar.
    expect(heightWith({ OS: 'ios', isPad: true, Version: '26.0' }, 375)).toBe(49);
  });

  it('STILL reserves 49pt in a compact-width Split View', () => {
    // A portrait half-split is 507pt and is compact — the widest window that still has a bottom
    // bar, and the reason the threshold sits one point above it.
    expect(heightWith({ OS: 'ios', isPad: true, Version: '18.4' }, 507)).toBe(49);
    expect(heightWith({ OS: 'ios', isPad: true, Version: '18.4' }, 508)).toBe(0);
  });

  it('STILL reserves 49pt on iPadOS 16.4–17, which this app deploys to', () => {
    // `sidebarAdaptable` needs iPadOS 18. The deployment target is 16.4, so this is a real shipping
    // window in which a full-screen iPad renders a bottom bar — a flat `Platform.isPad → 0`
    // under-reserves there and covers the last verse.
    expect(heightWith({ OS: 'ios', isPad: true, Version: '17.5' }, 1024)).toBe(49);
    expect(heightWith({ OS: 'ios', isPad: true, Version: '16.4' }, 1024)).toBe(49);
  });
});
