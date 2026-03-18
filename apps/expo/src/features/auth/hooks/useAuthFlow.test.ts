// Mock react hooks
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useCallback: (fn: unknown) => fn,
}));

// Mock expo modules
jest.mock('expo-linking', () => ({
  parse: jest.fn((url: string) => {
    const match = url.match(/[?&]token=([^&]+)/);
    return { queryParams: match ? { token: match[1] } : {} };
  }),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

// Mock stores
const mockSetUser = jest.fn();
const mockMigrateData = jest.fn().mockResolvedValue(undefined);

jest.mock('@/features/auth', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ setUser: mockSetUser }),
}));

jest.mock('./useDataMigration', () => ({
  useDataMigration: () => ({ migrateData: mockMigrateData, isMigrating: false }),
}));

// Mock services
const mockMagicLink = jest.fn().mockResolvedValue(undefined);
const mockSocial = jest.fn();
const mockVerify = jest.fn();

jest.mock('@/services/auth-client', () => ({
  authClient: {
    signIn: {
      magicLink: (...args: unknown[]) => mockMagicLink(...args),
      social: (...args: unknown[]) => mockSocial(...args),
    },
    magicLink: {
      verify: (...args: unknown[]) => mockVerify(...args),
    },
  },
}));

const mockSetAuthToken = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/secure-store', () => ({
  setAuthToken: (...args: unknown[]) => mockSetAuthToken(...args),
}));

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    set: jest.fn(),
    getString: jest.fn(),
    getBoolean: jest.fn(),
    remove: jest.fn(),
  }),
}));

import { useAuthFlow } from './useAuthFlow';

describe('useAuthFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('signInWithMagicLink', () => {
    test('calls authClient.signIn.magicLink with email', async () => {
      const { signInWithMagicLink } = useAuthFlow();
      await signInWithMagicLink('user@example.com');
      expect(mockMagicLink).toHaveBeenCalledWith({ email: 'user@example.com' });
    });

    test('does not call setUser or migrateData (user must tap email link)', async () => {
      const { signInWithMagicLink } = useAuthFlow();
      await signInWithMagicLink('user@example.com');
      expect(mockSetUser).not.toHaveBeenCalled();
      expect(mockMigrateData).not.toHaveBeenCalled();
    });
  });

  describe('handleMagicLinkCallback', () => {
    test('verifies token and completes sign-in on success', async () => {
      mockVerify.mockResolvedValue({
        data: {
          user: { id: 'u1', email: 'user@example.com', name: 'Test' },
          session: { token: 'session-tok' },
        },
      });

      const { handleMagicLinkCallback } = useAuthFlow();
      await handleMagicLinkCallback('cloud-quran://auth/callback?token=magic-tok');

      expect(mockVerify).toHaveBeenCalledWith({ token: 'magic-tok' });
      expect(mockSetAuthToken).toHaveBeenCalledWith('session-tok');
      expect(mockMigrateData).toHaveBeenCalled();
      expect(mockSetUser).toHaveBeenCalledWith({
        userId: 'u1',
        email: 'user@example.com',
        displayName: 'Test',
      });
    });

    test('does nothing when URL has no token param', async () => {
      const { handleMagicLinkCallback } = useAuthFlow();
      await handleMagicLinkCallback('cloud-quran://some/path');

      expect(mockVerify).not.toHaveBeenCalled();
      expect(mockSetUser).not.toHaveBeenCalled();
    });

    test('does not complete sign-in when verify returns no data', async () => {
      mockVerify.mockResolvedValue({ data: null });

      const { handleMagicLinkCallback } = useAuthFlow();
      await handleMagicLinkCallback('cloud-quran://auth?token=bad-tok');

      expect(mockVerify).toHaveBeenCalledWith({ token: 'bad-tok' });
      expect(mockSetUser).not.toHaveBeenCalled();
    });
  });

  describe('signInWithGoogle', () => {
    test('completes sign-in on success', async () => {
      mockSocial.mockResolvedValue({
        data: {
          user: { id: 'g1', email: 'g@gmail.com', name: 'Google User' },
          session: { token: 'g-tok' },
        },
        error: null,
      });

      const { signInWithGoogle } = useAuthFlow();
      await signInWithGoogle();

      expect(mockSocial).toHaveBeenCalledWith({ provider: 'google' });
      expect(mockSetAuthToken).toHaveBeenCalledWith('g-tok');
      expect(mockMigrateData).toHaveBeenCalled();
      expect(mockSetUser).toHaveBeenCalledWith({
        userId: 'g1',
        email: 'g@gmail.com',
        displayName: 'Google User',
      });
    });

    test('throws on error response', async () => {
      mockSocial.mockResolvedValue({
        data: null,
        error: { message: 'OAuth cancelled' },
      });

      const { signInWithGoogle } = useAuthFlow();
      await expect(signInWithGoogle()).rejects.toThrow('OAuth cancelled');
      expect(mockSetUser).not.toHaveBeenCalled();
    });

    test('throws when both data and error are null', async () => {
      mockSocial.mockResolvedValue({ data: null, error: null });

      const { signInWithGoogle } = useAuthFlow();
      await expect(signInWithGoogle()).rejects.toThrow('no response from server');
    });
  });

  describe('signInWithApple', () => {
    test('completes sign-in on success', async () => {
      mockSocial.mockResolvedValue({
        data: {
          user: { id: 'a1', email: null, name: null },
          session: { token: 'a-tok' },
        },
        error: null,
      });

      const { signInWithApple } = useAuthFlow();
      await signInWithApple();

      expect(mockSocial).toHaveBeenCalledWith({ provider: 'apple' });
      expect(mockSetAuthToken).toHaveBeenCalledWith('a-tok');
      expect(mockSetUser).toHaveBeenCalledWith({
        userId: 'a1',
        email: null,
        displayName: null,
      });
    });

    test('throws on error response', async () => {
      mockSocial.mockResolvedValue({
        data: null,
        error: { message: 'Apple auth failed' },
      });

      const { signInWithApple } = useAuthFlow();
      await expect(signInWithApple()).rejects.toThrow('Apple auth failed');
    });

    test('throws when both data and error are null', async () => {
      mockSocial.mockResolvedValue({ data: null, error: null });

      const { signInWithApple } = useAuthFlow();
      await expect(signInWithApple()).rejects.toThrow('no response from server');
    });
  });

  describe('completeSignIn flow', () => {
    test('runs migrateData BEFORE setUser (keeps loading indicator visible)', async () => {
      const callOrder: string[] = [];
      mockMigrateData.mockImplementation(async () => {
        callOrder.push('migrateData');
      });
      mockSetUser.mockImplementation(() => {
        callOrder.push('setUser');
      });

      mockSocial.mockResolvedValue({
        data: {
          user: { id: 'u1', email: 'a@b.com', name: 'U' },
          session: { token: 't' },
        },
        error: null,
      });

      const { signInWithGoogle } = useAuthFlow();
      await signInWithGoogle();

      expect(callOrder).toEqual(['migrateData', 'setUser']);
    });

    test('skips setAuthToken when session has no token', async () => {
      mockSocial.mockResolvedValue({
        data: {
          user: { id: 'u1', email: 'a@b.com', name: 'U' },
          session: {},
        },
        error: null,
      });

      const { signInWithGoogle } = useAuthFlow();
      await signInWithGoogle();

      expect(mockSetAuthToken).not.toHaveBeenCalled();
      expect(mockSetUser).toHaveBeenCalled();
    });
  });
});
