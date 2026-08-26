import * as SecureStore from 'expo-secure-store';
import { deleteItem, getItem, setItem } from './secureStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

describe('secureStore (native)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getItem delegates to SecureStore.getItemAsync', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('token-123');
    await expect(getItem('k')).resolves.toBe('token-123');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('k');
  });

  it('setItem delegates to SecureStore.setItemAsync', async () => {
    await setItem('k', 'v');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('k', 'v');
  });

  it('deleteItem delegates to SecureStore.deleteItemAsync', async () => {
    await deleteItem('k');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('k');
  });
});

/**
 * Web platform guard: `isWeb` is evaluated at module load, so reset modules and
 * mutate Platform.OS on the (preset-mocked) react-native instance before
 * requiring — same pattern as storage.test.ts (Story 16.9, jest-expo 56).
 */
describe('secureStore (web fallback)', () => {
  let webSecureStore: typeof import('./secureStore');
  let webSecureStoreModule: typeof import('expo-secure-store');
  let store: Record<string, string>;
  let originalPlatformOS: string;

  beforeAll(() => {
    jest.resetModules();
    const RN = require('react-native');
    originalPlatformOS = RN.Platform.OS;
    RN.Platform.OS = 'web';

    store = {};
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: jest.fn((k: string) => (k in store ? store[k] : null)),
      setItem: jest.fn((k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: jest.fn((k: string) => {
        delete store[k];
      }),
    };

    webSecureStore = require('./secureStore');
    webSecureStoreModule = require('expo-secure-store');
  });

  afterAll(() => {
    require('react-native').Platform.OS = originalPlatformOS;
    (globalThis as { localStorage?: unknown }).localStorage = undefined;
    jest.resetModules();
  });

  it('round-trips via localStorage', async () => {
    await webSecureStore.setItem('web-key', 'web-val');
    await expect(webSecureStore.getItem('web-key')).resolves.toBe('web-val');
    await webSecureStore.deleteItem('web-key');
    await expect(webSecureStore.getItem('web-key')).resolves.toBeNull();
  });

  it('never touches the native SecureStore on web', async () => {
    await webSecureStore.setItem('k', 'v');
    await webSecureStore.getItem('k');
    expect(webSecureStoreModule.getItemAsync).not.toHaveBeenCalled();
    expect(webSecureStoreModule.setItemAsync).not.toHaveBeenCalled();
    expect(webSecureStoreModule.deleteItemAsync).not.toHaveBeenCalled();
  });
});
