// Mock expo-secure-store
const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();

jest.mock('expo-secure-store', () => ({
  getItemAsync: mockGetItemAsync,
  setItemAsync: mockSetItemAsync,
  deleteItemAsync: mockDeleteItemAsync,
}));

import { Platform } from 'react-native';
import { clearAuthToken, getAuthToken, setAuthToken, _resetModuleCacheForTesting } from './secure-store';

describe('secure-store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetModuleCacheForTesting();
  });

  describe('native platform', () => {
    beforeEach(() => {
      (Platform as any).OS = 'ios';
    });

    test('getAuthToken reads from expo-secure-store', async () => {
      mockGetItemAsync.mockResolvedValue('test-token-123');
      const token = await getAuthToken();
      expect(token).toBe('test-token-123');
      expect(mockGetItemAsync).toHaveBeenCalledWith('cloud-quran-auth-token');
    });

    test('getAuthToken returns null when no token stored', async () => {
      mockGetItemAsync.mockResolvedValue(null);
      const token = await getAuthToken();
      expect(token).toBeNull();
    });

    test('setAuthToken writes to expo-secure-store', async () => {
      mockSetItemAsync.mockResolvedValue(undefined);
      await setAuthToken('new-token');
      expect(mockSetItemAsync).toHaveBeenCalledWith('cloud-quran-auth-token', 'new-token');
    });

    test('clearAuthToken deletes from expo-secure-store', async () => {
      mockDeleteItemAsync.mockResolvedValue(undefined);
      await clearAuthToken();
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('cloud-quran-auth-token');
    });
  });

  describe('web platform', () => {
    beforeEach(() => {
      (Platform as any).OS = 'web';
    });

    afterAll(() => {
      (Platform as any).OS = 'ios';
    });

    test('getAuthToken returns null on web', async () => {
      const token = await getAuthToken();
      expect(token).toBeNull();
      expect(mockGetItemAsync).not.toHaveBeenCalled();
    });

    test('setAuthToken is a no-op on web', async () => {
      await setAuthToken('token');
      expect(mockSetItemAsync).not.toHaveBeenCalled();
    });

    test('clearAuthToken is a no-op on web', async () => {
      await clearAuthToken();
      expect(mockDeleteItemAsync).not.toHaveBeenCalled();
    });
  });
});
