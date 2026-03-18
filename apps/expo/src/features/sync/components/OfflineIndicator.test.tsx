// Mock react-native-mmkv
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    set: jest.fn(),
    getString: jest.fn(() => undefined),
    remove: jest.fn(),
    getBoolean: () => false,
  }),
}));

// Mock NetInfo
let mockIsConnected = true;
let mockNetInfoCallback: ((state: { isConnected: boolean }) => void) | null = null;
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: (callback: (state: { isConnected: boolean }) => void) => {
      mockNetInfoCallback = callback;
      callback({ isConnected: mockIsConnected });
      return () => {
        mockNetInfoCallback = null;
      };
    },
  },
}));

// Mock react — useState tracks updates from NetInfo callback
let mockConnectedState = true;
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: (initial: unknown) => {
    if (typeof initial === 'boolean') {
      // This is the isConnected state — return current mock value
      return [
        mockConnectedState,
        (val: unknown) => {
          if (typeof val === 'boolean') mockConnectedState = val;
        },
      ];
    }
    return [initial, jest.fn()];
  },
  useEffect: (fn: () => void) => fn(),
}));

// Auth store mock
let mockIsAuthenticated = true;
jest.mock('@/features/auth/useAuthStore', () => {
  const store = (selector: (s: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: mockIsAuthenticated });
  store.getState = () => ({ isAuthenticated: mockIsAuthenticated });
  store.subscribe = jest.fn(() => jest.fn());
  return { useAuthStore: store };
});

// Theme mock
jest.mock('@/theme/ThemeProvider', () => {
  const { themes } = jest.requireActual('@/theme/tokens');
  return {
    useTheme: () => ({ tokens: themes.light, themeName: 'light' as const }),
  };
});

jest.mock('@/services/mmkv', () => ({
  mmkvStorage: {
    setItem: jest.fn(),
    getItem: jest.fn(() => null),
    removeItem: jest.fn(),
  },
}));

import { OfflineIndicator } from './OfflineIndicator';

describe('OfflineIndicator', () => {
  beforeEach(() => {
    mockIsConnected = true;
    mockConnectedState = true;
    mockIsAuthenticated = true;
    mockNetInfoCallback = null;
  });

  test('returns null when online and authenticated', () => {
    mockIsConnected = true;
    mockConnectedState = true;
    const result = OfflineIndicator();
    expect(result).toBeNull();
  });

  test('returns null when offline but not authenticated', () => {
    mockIsConnected = false;
    mockConnectedState = false;
    mockIsAuthenticated = false;
    const result = OfflineIndicator();
    expect(result).toBeNull();
  });

  test('returns a component when offline and authenticated', () => {
    mockIsConnected = false;
    mockConnectedState = false;
    mockIsAuthenticated = true;
    const result = OfflineIndicator();
    expect(result).not.toBeNull();
  });

  test('registers NetInfo listener', () => {
    mockIsConnected = true;
    mockConnectedState = true;
    OfflineIndicator();
    expect(mockNetInfoCallback).not.toBeNull();
  });
});
