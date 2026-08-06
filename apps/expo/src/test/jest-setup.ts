// Jest setup file for Cloud Quran tests
// This file runs after the test framework is installed but before tests run.

// Global react-native mock — string-type components for manual tree walking tests
jest.mock('react-native', () => ({
  View: 'View',
  ScrollView: 'ScrollView',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  Modal: 'Modal',
  TextInput: 'TextInput',
  Switch: 'Switch',
  Animated: {
    View: 'Animated.View',
    Value: class {
      _value?: number;
      constructor(v?: number) {
        if (v !== undefined) this._value = v;
      }
    },
    timing: () => ({ start: (cb?: () => void) => cb?.() }),
  },
  StyleSheet: {
    create: <T extends Record<string, unknown>>(styles: T) => styles,
    absoluteFillObject: {},
    hairlineWidth: 1,
  },
  I18nManager: { isRTL: false },
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  useWindowDimensions: () => ({ width: 375, height: 812 }),
  useColorScheme: () => 'light',
  Alert: { alert: jest.fn() },
  Platform: { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios },
  NativeModules: {},
}));

// FlashList mock — string-type component matching existing test pattern
jest.mock('@shopify/flash-list', () => ({
  FlashList: 'FlashList',
}));

// Global InstantDB mock — prevents transitive imports from loading native modules
jest.mock('@/services/instantdb', () => ({
  db: {
    useAuth: jest.fn(() => ({ isLoading: false, user: { id: 'test-guest', isGuest: true }, error: null })),
    useQuery: jest.fn(() => ({ data: null, isLoading: false, error: null })),
    transact: jest.fn(),
    auth: {
      signInAsGuest: jest.fn(),
      sendMagicCode: jest.fn(() => Promise.resolve()),
      signInWithMagicCode: jest.fn(() => Promise.resolve()),
      signInWithIdToken: jest.fn(() => Promise.resolve()),
      exchangeOAuthCode: jest.fn(() => Promise.resolve()),
      signOut: jest.fn(() => Promise.resolve()),
      issuerURI: jest.fn(() => 'https://auth.instantdb.com'),
    },
    queryOnce: jest.fn(() => Promise.resolve({ data: {} })),
    tx: new Proxy(
      {},
      {
        get: () =>
          new Proxy(
            {},
            {
              get: () => ({
                update: jest.fn(),
                delete: jest.fn(),
              }),
            },
          ),
      },
    ),
  },
  id: jest.fn(() => 'mock-id'),
  useBookmarks: jest.fn(() => ({ bookmarks: [], isLoading: false, error: null })),
  useReadingPosition: jest.fn(() => ({ position: null, isLoading: false, error: null })),
  usePreferences: jest.fn(() => ({ preferences: null, isLoading: false, error: null })),
  useAudioPosition: jest.fn(() => ({ audioPosition: null, isLoading: false, error: null })),
}));

// Auth dependency mocks
jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButton: 'AppleAuthenticationButton',
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationButtonStyle: { BLACK: 0 },
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({ data: { idToken: 'mock-google-token' } })),
  },
  GoogleSigninButton: 'GoogleSigninButton',
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'https://localhost/redirect'),
  useAuthRequest: jest.fn(() => [null, null, jest.fn()]),
  useAutoDiscovery: jest.fn(() => ({})),
  AuthSession: { startAsync: jest.fn() },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'mock-uuid'),
}));

jest.mock('react-native-mmkv', () => ({
  createMMKV: jest.fn(() => ({
    set: jest.fn(),
    getString: jest.fn(),
    getBoolean: jest.fn(() => false),
    remove: jest.fn(),
  })),
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  })),
  useLocalSearchParams: jest.fn(() => ({})),
  Stack: { Screen: 'Stack.Screen' },
  Tabs: { Screen: 'Tabs.Screen' },
  Link: 'Link',
}));

// Silence React Native warnings in test output
jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('Animated') || msg.includes('NativeModule')) return;
  console.warn(...args);
});
