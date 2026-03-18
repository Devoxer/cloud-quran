// Jest setup file for Cloud Quran tests
// This file runs after the test framework is installed but before tests run.

// Global react-native mock — string-type components for manual tree walking tests
jest.mock('react-native', () => ({
  View: 'View',
  ScrollView: 'ScrollView',
  Text: 'Text',
  FlatList: 'FlatList', // legacy — kept for non-migrated components
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  Modal: 'Modal',
  TextInput: 'TextInput',
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

// FlashList mock — string-type for manual tree walking tests
jest.mock('@shopify/flash-list', () => ({
  FlashList: 'FlashList',
}));

// NetInfo mock — prevents native module errors in tests that transitively import it
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
}));

// Silence React Native warnings in test output
jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('Animated') || msg.includes('NativeModule')) return;
  console.warn(...args);
});
