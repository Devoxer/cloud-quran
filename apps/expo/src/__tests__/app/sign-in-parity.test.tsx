/**
 * SIGN-IN PARITY — the amended spec's one hard rule, asserted on every platform.
 *
 * ⚠️ "ALL THREE METHODS EVERYWHERE" IS THE KIND OF RULE THAT DECAYS ONE `Platform.OS` AT A TIME,
 * and every decay looks reasonable at the diff. This screen shipped with `Platform.OS === 'ios'`
 * around the Apple button and a Google gate keyed on the iOS client id — so the web build offered
 * exactly one method and nothing anywhere said that was wrong. A platform branch may change HOW a
 * method runs (native sheet vs OAuth redirect, `lib/auth.ts`'s job); it may never remove one.
 *
 * ⚠️ NO `resetModules`, AND THAT IS WHY BOTH GATES MOVED TO RENDER TIME. Re-requiring the screen
 * in a fresh registry gives it a DIFFERENT React than the one RNTL captured, and rendering it
 * throws "Cannot read properties of null (reading 'useContext')" — which reads like a broken
 * screen rather than two copies of React. Both inputs are therefore observable at render: the
 * platform through a `Platform.OS` proxy, and the Google client ids through `lib/config` (they
 * cannot be read from `process.env` here at all — `babel-preset-expo` inlines `EXPO_PUBLIC_*` at
 * transform time, so a runtime assignment changes nothing).
 *
 * ⚠️ THIS FILE LIVES UNDER `src/__tests__/app/`, NOT BESIDE THE ROUTE. `web.output: "static"`
 * filesystem-scans the route tree and Metro's blockList does not filter that scan, so a
 * co-located `sign-in.test.tsx` becomes a phantom route (`route-integrity.test.ts` asserts it).
 */

let mockPlatformOS = 'ios';
let mockGoogleIds = { webClientId: '', iosClientId: '' };

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  // A proxy rather than a spread: spreading react-native READS every export, and the deprecation
  // getters among them warn and drag the list-virtualisation stack in before a test can run.
  return new Proxy(actual, {
    get(target, prop, receiver) {
      if (prop === 'Platform') {
        return new Proxy(target.Platform, {
          get: (p: object, key: string | symbol) =>
            key === 'OS' ? mockPlatformOS : Reflect.get(p, key),
        });
      }
      return Reflect.get(target, prop, receiver);
    },
  });
});

jest.mock('@/lib/config', () => ({
  config: {
    api: { baseUrl: 'http://localhost:8787' },
    sentry: { dsn: '' },
    content: { baseUrl: '' },
    get google() {
      return mockGoogleIds;
    },
  },
  validateConfig: () => [],
}));

// `Stack.Screen` needs a navigator context ("Couldn't find a route object"), and standing one up
// would mean rendering the whole router to count three buttons. The navigator is not what this
// file is about, and it is not unguarded either: `route-integrity.test.ts` owns every screen
// registration in the tree.
jest.mock('expo-router', () => {
  const Stack = Object.assign(() => null, { Screen: () => null });
  return {
    Stack,
    useRouter: () => ({ back: () => {}, canGoBack: () => true, replace: () => {}, push: () => {} }),
  };
});

// The native Apple button is an iOS-only native view; elsewhere the screen renders its own
// Pressable. Stubbing it keeps this file about WHICH buttons exist, not how they are drawn.
/**
 * The auth client, stubbed at module scope.
 *
 * ⚠️ A `jest.doMock` INSIDE A TEST IS TOO LATE HERE — the screen imports `@/lib/auth` statically,
 * so the real module is already cached and the mock never takes. The symptom is subtle: the REAL
 * `signInWithApple` runs, throws because the native module is absent, and `runProvider`'s catch
 * paints the very error banner the test is asserting is absent.
 */
const mockProviderResult = {
  current: { status: 'cancelled' } as { status: string; code?: string },
};
jest.mock('@/lib/auth', () => ({
  signInWithApple: async () => mockProviderResult.current,
  signInWithGoogle: async () => mockProviderResult.current,
  requestEmailCode: async () => ({ status: 'code-sent' }),
  verifyEmailCode: async () => ({ status: 'signed-in' }),
}));

jest.mock('expo-apple-authentication', () => {
  const react = require('react');
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) =>
      react.createElement(
        Pressable,
        { onPress, accessibilityRole: 'button', testID: 'apple-native-button' },
        react.createElement(Text, null, 'Continue with Apple')
      ),
    AppleAuthenticationButtonType: { CONTINUE: 0 },
    AppleAuthenticationButtonStyle: { BLACK: 0 },
  };
});

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import SignInScreen from '@/app/(tabs)/(profile)/sign-in';
import { privacyStore } from '@/lib/privacyPrefs';

// ⚠️ NOTHING IS RECORDED FIRST ANY MORE, AND THE ABSENCE IS THE POINT. This block used to call
// `recordSyncConsent()`, because for one day `sign-in.tsx` redirected an unconsented reader to
// `/consent` and rendered null — so without it every case below counted buttons on an empty screen
// and passed for the wrong reason. That gate is gone (see `sign-in-disclosure.test.tsx`): the
// screen renders for everybody, and the store is cleared only so no other suite's writes leak in.
beforeEach(() => {
  privacyStore.clearAll();
});

/** Every platform the app ships on. Desktop is the web export, so it renders as `web`. */
const PLATFORMS = ['ios', 'android', 'web'] as const;

function renderAs(platform: string, google = { webClientId: '', iosClientId: '' }) {
  mockPlatformOS = platform;
  mockGoogleIds = google;
  return render(<SignInScreen />);
}

/** Either the native Apple button or the styled fallback — the OFFER, whichever chrome it wears. */
const appleButton = () =>
  screen.queryByTestId('apple-native-button') ?? screen.queryByTestId('apple-sign-in-button');

afterEach(() => {
  mockPlatformOS = 'ios';
  mockGoogleIds = { webClientId: '', iosClientId: '' };
});

describe('every platform offers all three sign-in methods', () => {
  for (const platform of PLATFORMS) {
    it(`${platform}: Apple, Google and email are all present`, () => {
      // Google's gate is a CONFIG gate, so give the build a client id — the point of this case is
      // that no PLATFORM hides a button, which is a different question from whether a deployment
      // has credentials.
      renderAs(platform, { webClientId: 'web.apps.googleusercontent.com', iosClientId: '' });

      expect(appleButton()).toBeTruthy();
      expect(screen.getByTestId('google-sign-in-button')).toBeTruthy();
      expect(screen.getByTestId('email-input')).toBeTruthy();
      expect(screen.getByTestId('send-code-button')).toBeTruthy();
    });
  }

  it('web offers Apple with NO Google credentials at all', () => {
    // ⚠️ Anti-vacuity for the loop above, and the regression that actually shipped: Apple was
    // `Platform.OS === 'ios'`, so this exact render offered email only.
    renderAs('web');
    expect(appleButton()).toBeTruthy();
    expect(screen.getByTestId('email-input')).toBeTruthy();
  });

  it('android offers Apple too — there is no native Apple sheet there, only a redirect', () => {
    // The mechanism differs (Android has no Sign in with Apple sheet), the OFFER does not.
    renderAs('android');
    expect(screen.getByTestId('apple-sign-in-button')).toBeTruthy();
  });

  it('iOS uses the NATIVE Apple button, not the styled fallback', () => {
    // Apple's guidelines want their own button where it exists; the fallback is for the platforms
    // where that native view renders nothing at all.
    renderAs('ios');
    expect(screen.getByTestId('apple-native-button')).toBeTruthy();
    expect(screen.queryByTestId('apple-sign-in-button')).toBeNull();
  });
});

describe('the Google gate is about CREDENTIALS, never about the platform', () => {
  it('web shows Google with no client ids — the worker holds the redirect credentials', () => {
    // The redirect leg needs nothing on the client. Requiring a client id there would hide a
    // button that works.
    renderAs('web');
    expect(screen.getByTestId('google-sign-in-button')).toBeTruthy();
  });

  it('android shows Google on the WEB client id — the native SDK uses it off iOS', () => {
    // ⚠️ The bug this replaces: the gate read the iOS id only, so a correctly configured Android
    // build hid the button. Android is the platform this repo cannot smoke, which is exactly
    // where a wrong condition survives.
    renderAs('android', { webClientId: 'web.apps.googleusercontent.com', iosClientId: '' });
    expect(screen.getByTestId('google-sign-in-button')).toBeTruthy();
  });

  it('iOS hides Google when the build carries no client id anywhere', () => {
    // Anti-vacuity: the gate must still be capable of answering no, or the cases above prove
    // nothing. A native sign-in with no client id cannot be verified by the worker.
    renderAs('ios');
    expect(screen.queryByTestId('google-sign-in-button')).toBeNull();
    // ...and the other two methods are still offered, so a dark Google is not a dark screen.
    expect(appleButton()).toBeTruthy();
    expect(screen.getByTestId('email-input')).toBeTruthy();
  });
});

describe('a cancelled provider sheet is not a failure', () => {
  // ⚠️ THE I/O MATRIX SAYS "return to app, session unchanged" — and the screen said the opposite.
  // `finish()` routed `cancelled` through the same red `InlineError` slot as a genuine failure,
  // so tapping back out of Apple's sheet, a deliberate and successful action, reported that
  // something had gone wrong.

  const pressApple = async () => {
    renderAs('ios', { webClientId: 'web.apps.googleusercontent.com', iosClientId: '' });
    await act(async () => {
      fireEvent.press(screen.getByTestId('apple-native-button'));
    });
  };

  it('paints no error banner when the user backs out', async () => {
    mockProviderResult.current = { status: 'cancelled' };
    await pressApple();
    expect(screen.queryByTestId('sign-in-error')).toBeNull();
  });

  it('DOES paint one for a real failure — anti-vacuity for the case above', async () => {
    // Without this, "no banner" would also pass on a screen that can never show one.
    mockProviderResult.current = { status: 'failed', code: 'OAUTH_LINK_ERROR' };
    await pressApple();
    expect(screen.getByTestId('sign-in-error')).toBeTruthy();
  });
});
