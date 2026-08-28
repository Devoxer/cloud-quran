/**
 * Jest setup file for Expo SDK 54+
 * Provides necessary polyfills and mocks for the test environment
 */

// Polyfill structuredClone if not available (Node < 17)
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// Mock the __ExpoImportMetaRegistry global that causes issues
if (typeof global.__ExpoImportMetaRegistry === 'undefined') {
  global.__ExpoImportMetaRegistry = {
    get: () => ({}),
    set: () => {},
  };
}

// story 5-2: an `EXPO_PUBLIC_INSTANT_APP_ID = 'test-app-id'` fallback was set here, because
// `lib/instantdb.ts` THREW at module load without it. Both are gone with the vendor. Do not add a
// placeholder env var back for a module that no longer reads one.

// ──────────────────────────────────────────────
// Native module mocks (alphabetical)
// These prevent crashes when native modules are
// transitively imported during Jest module resolution.
// ──────────────────────────────────────────────

// react-native-worklets — SDK 55 bumped worklets 0.5.1 → 0.7.4, whose NativeWorklets
// constructor now throws "Native part of Worklets doesn't seem to be initialized" the
// moment it's imported under Jest (reanimated 4.2's initializers import it eagerly). Swap
// in the package's own Jest mock (the WorkletAPI stub: makeShareable/runOnJS/RuntimeKind/…
// + the rAF override) so REAL reanimated still runs its JS path — the intended reanimated-4
// Jest setup. (reanimated's own `./mock` is unusable here: it re-imports the real index,
// which re-imports worklets native and throws.) The mock lives at an internal build path
// because worklets ships no `./mock` export; Jest's transformed resolver handles its
// extensionless ESM imports (raw Node can't).
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));

// react-native-keyboard-controller — native module (Story 17.6). The package ships
// its own documented Jest mock: KeyboardProvider → a host stub, KeyboardAwareScrollView
// → a real RN ScrollView, all hooks/modules stubbed. Use it so the form render-smokes
// mount the provider + KeyboardAwareScrollView without the native side.
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest')
);

// story 5-2: the `@instantdb/react-native` and `@instantdb/react-native-mmkv` mocks stood here —
// 68 lines of fake db/auth/tx surface plus the schema-builder stubs `instant.schema.ts` needed at
// import time. Both packages are uninstalled.

// react-native-mmkv — importing the real package boots react-native-nitro-modules
// (TurboModuleRegistry.getEnforcing) at module load, which throws in Jest. Provide a
// reactive in-memory mock so lib/theme.ts (createMMKV + useMMKVString) works in tests
// that exercise the real theme hook. createMMKV's own isTest() mock can't help because
// the static getMMKVFactory import crashes before it runs.
jest.mock('react-native-mmkv', () => {
  const React = require('react');
  const stores = new Map(); // id -> { data: Map<string,string>, listeners: Set<fn> }
  const getStore = (id) => {
    if (!stores.has(id)) stores.set(id, { data: new Map(), listeners: new Set() });
    return stores.get(id);
  };
  const createMMKV = (config = { id: 'mmkv.default' }) => {
    const store = getStore(config.id);
    const notify = (key) => store.listeners.forEach((l) => l(key));
    return {
      id: config.id,
      set: (k, v) => {
        store.data.set(k, String(v));
        notify(k);
      },
      getString: (k) => (store.data.has(k) ? store.data.get(k) : undefined),
      getBoolean: (k) => (store.data.has(k) ? store.data.get(k) === 'true' : undefined),
      getNumber: (k) => (store.data.has(k) ? Number(store.data.get(k)) : undefined),
      contains: (k) => store.data.has(k),
      // react-native-mmkv v3 (nitro) exposes `remove`; keep `delete` too for the
      // useMMKV* hook mock's clear path and any older callers.
      remove: (k) => {
        store.data.delete(k);
        notify(k);
      },
      delete: (k) => {
        store.data.delete(k);
        notify(k);
      },
      getAllKeys: () => Array.from(store.data.keys()),
      clearAll: () => store.data.clear(),
      addOnValueChangedListener: (listener) => {
        store.listeners.add(listener);
        return { remove: () => store.listeners.delete(listener) };
      },
    };
  };
  const defaultInstance = createMMKV();
  const createMMKVHook = (getter) => (key, instance) => {
    const mmkv = instance || defaultInstance;
    const [value, setValue] = React.useState(() => getter(mmkv, key));
    React.useEffect(() => {
      setValue(getter(mmkv, key));
      const sub = mmkv.addOnValueChangedListener((changedKey) => {
        if (changedKey === key) setValue(getter(mmkv, key));
      });
      return () => sub.remove();
    }, [key, mmkv]);
    const setter = React.useCallback(
      (next) => {
        const resolved = typeof next === 'function' ? next(getter(mmkv, key)) : next;
        if (resolved == null) mmkv.delete(key);
        else mmkv.set(key, resolved);
      },
      [key, mmkv]
    );
    return [value, setter];
  };
  return {
    createMMKV,
    useMMKV: (config) => (config ? createMMKV(config) : defaultInstance),
    useMMKVString: createMMKVHook((m, k) => m.getString(k)),
    useMMKVBoolean: createMMKVHook((m, k) => m.getBoolean(k)),
    useMMKVNumber: createMMKVHook((m, k) => m.getNumber(k)),
  };
});

// @shopify/flash-list — FlashList uses native recycling; mock as a simple FlatList wrapper
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { FlatList } = require('react-native');
  const FlashList = React.forwardRef((props, ref) => {
    // Strip FlashList-specific props that FlatList doesn't understand
    const {
      estimatedItemSize,
      drawDistance,
      getItemType,
      overrideItemLayout,
      estimatedListSize,
      estimatedFirstItemOffset,
      renderScrollComponent,
      ...flatListProps
    } = props;
    return React.createElement(FlatList, { ...flatListProps, ref });
  });
  FlashList.displayName = 'FlashList';
  return {
    __esModule: true,
    FlashList,
    MasonryFlashList: FlashList,
  };
});

// @react-native-async-storage/async-storage
// (was required by the retired sync SDK; kept — it is still a declared dependency)
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// @react-native-community/netinfo
// Read by lib/connectivity.ts
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
  useNetInfo: jest.fn(() => ({
    isConnected: true,
    isInternetReachable: true,
  })),
}));

// @react-native-google-signin/google-signin
// The package is still installed for story 5-5's Better Auth native-idToken flow; story 5-2
// deleted its only caller (lib/googleAuth.ts), so this mock currently guards nothing that runs.
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({ data: { idToken: 'mock-token' } })),
    signOut: jest.fn(() => Promise.resolve()),
    revokeAccess: jest.fn(() => Promise.resolve()),
    isSignedIn: jest.fn(() => Promise.resolve(false)),
    getCurrentUser: jest.fn(() => Promise.resolve(null)),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
  isErrorWithCode: jest.fn(() => false),
}));

// story 5-2: the `react-native-purchases` (RevenueCat) mock stood here. The package is
// uninstalled — Cloud Quran has no monetization surface.

// @sentry/react-native — ESM module that Jest can't transform
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  // `close()` flushes then disables the client. Added by the story 5-2 review: withdrawing
  // crash-reporting consent calls it (lib/privacyPrefs.ts) so telemetry stops immediately rather
  // than at the next launch. A mock missing a method the real SDK has is the classic silent
  // divergence — the call throws only in tests, so keep this list in step with what we call.
  close: jest.fn(() => Promise.resolve(true)),
  wrap: jest.fn((component) => component),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  captureEvent: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  setContext: jest.fn(),
  setExtra: jest.fn(),
  setExtras: jest.fn(),
  setTags: jest.fn(),
  addBreadcrumb: jest.fn(),
  addIntegration: jest.fn(),
  Scope: jest.fn(),
  getActiveSpan: jest.fn(),
  getRootSpan: jest.fn(),
  startSpan: jest.fn(),
  startInactiveSpan: jest.fn(),
  startSpanManual: jest.fn(),
  withActiveSpan: jest.fn(),
  suppressTracing: jest.fn(),
  spanToJSON: jest.fn(),
  spanIsSampled: jest.fn(),
  setMeasurement: jest.fn(),
  getCurrentScope: jest.fn(() => ({ setTag: jest.fn() })),
  getGlobalScope: jest.fn(() => ({ setTag: jest.fn() })),
  getIsolationScope: jest.fn(() => ({ setTag: jest.fn() })),
  getClient: jest.fn(),
  setCurrentClient: jest.fn(),
  addEventProcessor: jest.fn(),
  lastEventId: jest.fn(),
  captureFeedback: jest.fn(),
}));

// `reloadAppAsync` — `lib/language.ts` restarts the app on a committed language switch (Story
// 24.27). Three suites drive the real `setLanguage` (`lib/language.test.ts`,
// `useStreakReminder.i18n.test.ts`, `useLocalizedNotificationChannels.test.ts`), so it must be a
// no-op here, and `lib/language.test.ts` asserts against this very `jest.fn`.
//
// ⚠️ Stub the GLOBAL, not the `expo` module. Three cheaper-looking options are all wrong:
//   • `jest.mock('expo', …)` in a TEST FILE is inert — this file loads `@/i18n` → `lib/language` →
//     `expo` at setup time, so the binding resolves before a test's factory can register.
//   • `jest.spyOn(expo, 'reloadAppAsync')` cannot work — `expo`'s re-exports compile to
//     getter-only properties.
//   • `jest.mock('expo', …)` HERE breaks the suite two ways: a bare `{ reloadAppAsync }`
//     replacement fails 83 `@expo/ui` suites (`requireNativeView is not a function`), and adding
//     `...jest.requireActual('expo')` runs `expo/Expo.fx`'s global side effects at setup time —
//     far earlier than in any real run — which silently broke an unrelated screen test.
// The real `reloadAppAsync` is a one-liner over `globalThis.expo?.reloadAppAsync(reason)`, so
// stubbing that leaves the `expo` module itself completely untouched. SPREAD what jest-expo already
// installed rather than replacing the object — the rest of it (EventEmitter, NativeModule, the
// native-modules proxy) is load-bearing.
globalThis.expo = {
  ...(globalThis.expo ?? {}),
  reloadAppAsync: jest.fn(() => Promise.resolve()),
};

// expo-audio — native module not available in Jest
jest.mock('expo-audio', () => {
  const mockPlayer = {
    id: 'mock-player',
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn(),
    setPlaybackRate: jest.fn(),
    volume: 1,
    currentTime: 0,
    duration: 0,
    playing: false,
    muted: false,
    loop: false,
    isLoaded: false,
    shouldCorrectPitch: true,
    currentStatus: {},
    replace: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };

  return {
    useAudioPlayer: jest.fn(() => mockPlayer),
    createAudioPlayer: jest.fn(() => mockPlayer),
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
    AudioPlayer: jest.fn(),
    AudioStatus: {},
  };
});

// expo-apple-authentication
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: jest.fn(),
  isAvailableAsync: jest.fn(() => Promise.resolve(false)),
  AppleAuthenticationCredentialState: {
    REVOKED: 0,
    AUTHORIZED: 1,
    NOT_FOUND: 2,
    TRANSFERRED: 3,
  },
}));

// expo-application — native constants/async getters (Story 17.9). Mocked so
// lib/deviceContext.ts (→ errors.ts/analytics.ts, widely imported) loads in Jest.
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '42',
  applicationId: 'com.nobleachievements.cloudquran',
  applicationName: 'Cloud Quran',
  getInstallationTimeAsync: jest.fn(() => Promise.resolve(new Date('2026-01-01T00:00:00.000Z'))),
}));

// expo-clipboard — native module (Story 17.9)
jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn(() => Promise.resolve('')),
  setStringAsync: jest.fn(() => Promise.resolve(true)),
}));

// expo-device — native constants + DeviceType enum (Story 17.9). Defaults to a
// physical phone; lib/deviceContext.ts reads isDevice/deviceType/totalMemory.
jest.mock('expo-device', () => ({
  isDevice: true,
  deviceType: 1, // DeviceType.PHONE
  totalMemory: 4 * 1024 * 1024 * 1024,
  modelName: 'iPhone Test',
  DeviceType: { UNKNOWN: 0, PHONE: 1, TABLET: 2, DESKTOP: 3, TV: 4 },
}));

// expo-localization — synchronous locale/calendar readers (Story 17.9). Returns
// a non-empty tuple like the real API. lib/localization.ts reads [0].
jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [
    {
      languageTag: 'en-US',
      languageCode: 'en',
      languageScriptCode: 'Latn',
      regionCode: 'US',
      textDirection: 'ltr',
    },
  ]),
  getCalendars: jest.fn(() => [{ timeZone: 'America/Los_Angeles', uses24hourClock: false }]),
}));

// expo-secure-store — native Keychain/Keystore (Story 17.9). lib/secureStore.ts
// wraps these on native; the web branch uses localStorage instead.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

// expo-sharing — native share sheet (Story 17.9)
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

// expo-asset — requires expo-modules-core native proxy
// Asset must be a class (not a plain object) because expo-font uses `source instanceof Asset`
jest.mock('expo-asset', () => {
  class Asset {
    constructor() {
      this.localUri = 'file:///mock/asset.mp3';
      this.uri = 'https://mock/asset.mp3';
    }
    downloadAsync() {
      return Promise.resolve(this);
    }
    static fromModule() {
      return new Asset();
    }
    static loadAsync() {
      return Promise.resolve();
    }
  }
  return { Asset };
});

// expo-constants — native module not available in Jest
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        eas: {
          projectId: 'test-project-id',
        },
      },
    },
    appOwnership: null,
    executionEnvironment: 'bare',
  },
}));

// expo-file-system — requires expo-modules-core native proxy
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///mock/documents/',
  cacheDirectory: 'file:///mock/cache/',
  readAsStringAsync: jest.fn(() => Promise.resolve('')),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: false, isDirectory: false, size: 0 })),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  moveAsync: jest.fn(() => Promise.resolve()),
  copyAsync: jest.fn(() => Promise.resolve()),
  downloadAsync: jest.fn(() => Promise.resolve({ uri: 'file:///mock/downloaded', status: 200 })),
  createDownloadResumable: jest.fn(() => ({
    downloadAsync: jest.fn(() => Promise.resolve({ uri: 'file:///mock/downloaded', status: 200 })),
    pauseAsync: jest.fn(),
    resumeAsync: jest.fn(),
    savable: jest.fn(),
  })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  FileSystemSessionType: { BACKGROUND: 0, FOREGROUND: 1 },
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
}));

// story 5-2: the `posthog-react-native` mock stood here. The package is uninstalled — zero
// third-party analytics, advertising or tracking SDKs (PRD NFR8).

// expo-notifications — native module not available in Jest
// constants/notifications.ts imports AndroidImportance from this package
jest.mock('expo-notifications', () => ({
  AndroidImportance: {
    DEFAULT: 3,
    HIGH: 4,
    LOW: 2,
    MAX: 5,
    MIN: 1,
    NONE: 0,
  },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[mock]' })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
}));

// @expo/vector-icons — renders actual font glyphs which need native font loading
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const MockIcon = React.forwardRef((props, ref) =>
    React.createElement(Text, { ...props, ref }, props.name || '')
  );
  MockIcon.displayName = 'MockIcon';
  return {
    __esModule: true,
    Ionicons: MockIcon,
    MaterialIcons: MockIcon,
    MaterialCommunityIcons: MockIcon,
    FontAwesome: MockIcon,
    Feather: MockIcon,
    AntDesign: MockIcon,
    Entypo: MockIcon,
    default: MockIcon,
  };
});

// @expo/vector-icons/Ionicons — some files import from sub-path
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const MockIcon = React.forwardRef((props, ref) =>
    React.createElement(Text, { ...props, ref }, props.name || '')
  );
  MockIcon.displayName = 'MockIonicons';
  return MockIcon;
});

// expo-symbols — <SymbolView> renders native SF/Material symbols (async expo-font
// path on Android/web). Mock as a simple host element so render-smokes can assert
// testID / accessibilityLabel without native font loading. (Story 17.4.2 Thread E.)
jest.mock('expo-symbols', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockSymbol = React.forwardRef((props, ref) => React.createElement(View, { ...props, ref }));
  MockSymbol.displayName = 'MockSymbolView';
  return { __esModule: true, SymbolView: MockSymbol };
});

// expo-font — prevents actual font download attempts in tests
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  loadAsync: jest.fn(() => Promise.resolve()),
  isLoaded: jest.fn(() => true),
}));

// ──────────────────────────────────────────────
// Context provider mocks
// These provide default values for React contexts
// so components can render without wrapping in providers.
// Tests that need specific behavior can override with jest.mock.
// ──────────────────────────────────────────────

// story 5-2: the `@/contexts/AnalyticsContext` mock stood here. The provider was a pass-through
// with no `useAnalytics()` consumer, and `src/contexts/` is gone with it.

// expo-haptics — used by interactive components
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// react-native-safe-area-context — used by layout components
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
}));

// @/features/player/hooks/useAudioPlayerEngine — the boot engine hook (Story 19.2). Mocked
// globally so any component that mounts <AudioPlayerEngineHost /> (e.g. _layout)
// never spins up the real expo-audio player in tests. The playback STATE is now a
// real Zustand store (@/stores/audioPlayerStore) — NOT mocked here; consumers read
// the real store (idle defaults by default; a test drives it via
// useAudioPlayerStore.setState(...) / registers action spies).
// NOTE (story 5-1): the audio-engine mock that lived here named a feature module.
// jest.setup.js runs for every suite and its mock factories resolve eagerly, so once that
// module was deleted EVERY suite failed with "Could not locate module" and zero tests ran —
// including suites that never touch audio. Cloud Quran's own audio engine arrives in epic 7;
// mock it here then, and never point a setup-file mock at a module that may be removed.

// story 5-2: the `@/hooks/auth/useAuth` mock stood here. `db.auth` WAS the auth provider, so the
// hook went with the vendor; story 5-5 rebuilds identity on Better Auth. Note the warning three
// paragraphs up — a setup-file mock resolves eagerly for EVERY suite, so a mock pointing at a
// deleted module fails the whole run, not just the suites that use it.

// @/stores/alertStore — useAlert() for must-acknowledge messages (Story 19.1 —
// migrated from @/contexts/AlertContext; the host is now <AlertHost />).
jest.mock('@/stores/alertStore', () => ({
  useAlert: jest.fn(() => ({
    showAlert: jest.fn(),
  })),
}));

// @/lib/haptics — success/warning/error confirmation (Story 17.13) + the tunable
// impact tier (Story 23.13). Stable jest.fns so tests can `import { haptics }` and
// assert feedback (e.g. the standardized light delete tap / card long-press).
jest.mock('@/lib/haptics', () => ({
  haptics: {
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    selection: jest.fn(),
    impact: jest.fn(),
  },
}));

// story 5-2: the `@/stores/entitlementStore` mock stood here, defaulting every suite to a
// resolved FREE user. There is no entitlement concept to default.

// @/lib/theme — provider-free theme hook (Story 16.6) used by components for colors.
// Mocked globally so most component tests get a fixed light theme without touching MMKV.
// Tests that exercise the real hook (scheme resolution, backfill) jest.unmock('@/lib/theme').
// ⚠️ story 6-5: `palette` / `setPalette` / `separator` JOINED THE SHAPE. The mock predates the
// palette axis, so a component reading `useTheme().palette` got `undefined` and one calling
// `setPalette` threw — which is every consumer of the appearance picker. Extended minimally
// (the module-level `setPalette` export too, since `lib/theme.ts` exports both spellings);
// unrelated dead keys below are left alone deliberately, they are not this story's to audit.
jest.mock('@/lib/theme', () => ({
  setThemeMode: jest.fn(),
  setPalette: jest.fn(),
  useTheme: jest.fn(() => ({
    colorScheme: 'light',
    isDark: false,
    themeMode: 'auto',
    setThemeMode: jest.fn(),
    palette: 'terracotta',
    setPalette: jest.fn(),
    colors: {
      background: { primary: '#FFFBF7', secondary: '#F5EFE9', tertiary: '#EBE3DA' },
      text: { primary: '#1A1612', secondary: '#5C534A', tertiary: '#8C8279', onAccent: '#FFFFFF' },
      // Story 23.8 tinted-badge pair (faint = badge fill, soft = badge glyph) read by SettingsRow
      // + the stats/subscription cards. Mirrors the real ColorTokens so those component tests resolve.
      accent: {
        primary: '#C65D3B',
        secondary: '#E8A87C',
        faint: 'rgba(198, 93, 59, 0.12)',
        soft: '#B14E2F',
      },
      highlight: { sync: '#FFF3CD' },
      // `*Bg` are the real ColorTokens keys (Story 23.8); the legacy `*Background` aliases are
      // kept so any older test reading them still resolves.
      semantic: {
        success: '#4A7C59',
        successBg: '#E8F5E9',
        successBackground: '#E8F5E9',
        warning: '#D4A03D',
        warningBg: '#FDF5E6',
        warningBackground: '#FDF5E6',
        error: '#C44536',
        errorBg: '#FCEEED',
        errorBackground: '#FCEEED',
        info: '#5B8CB8',
        infoBg: '#E3F2FD',
        infoBackground: '#E3F2FD',
      },
      border: '#E5DED6',
      separator: '#ECE5DD',
      shadow: '#000000',
      overlay: {
        dark: 'rgba(26, 22, 18, 0.5)',
        light: 'rgba(255, 251, 247, 0.8)',
        textOnDark: '#FFFFFF',
        textOnDarkSecondary: 'rgba(255, 255, 255, 0.8)',
      },
      tint: '#C65D3B',
      tabIconDefault: '#8C8279',
      tabIconSelected: '#C65D3B',
    },
  })),
}));

// i18n (Story 20.2, AC9): initialize the REAL i18next instance with the `en`
// resources (via initReactI18next, inside src/i18n) so RNTL render-smokes assert
// the real English copy and any missing/renamed/misnamespaced key surfaces at test
// time. Init is synchronous (initAsync:false); getCachedLocale() is null in tests
// (initLocalization isn't run here), so it falls back to lng 'en'. The
// expo-localization mock above is already registered (jest.mock is hoisted).
require('@/i18n').initI18n();

// ⚠️ NAME THE REJECTION THAT KILLS THE EXIT CODE.
//
// The suite can print "277 passed, 0 failed" and still exit 1: Node 24 treats an unhandled
// rejection as fatal, so a promise that rejects AFTER the run finishes overrides jest's verdict.
// It reproduced only on CI's slower Linux runner — on this Mac the same rejection lands inside the
// run and is swallowed — which made it look like a CI quirk rather than a floating promise in app
// code. Whatever is unhandled says so here, with its stack, instead of the process dying mute.
//
// This does NOT swallow anything: the listener only logs. Node still exits non-zero, and the point
// is that the next red run tells you which promise to fix.
process.on('unhandledRejection', (reason) => {
  const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  console.error(
    `\n[jest] UNHANDLED REJECTION — this is what makes a green run exit 1:\n${detail}\n`
  );
});
