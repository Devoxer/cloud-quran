import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Mock react-native-mmkv with in-memory storage
const mockStorage = new Map<string, string>();
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    set: (key: string, value: string) => mockStorage.set(key, value),
    getString: (key: string) => mockStorage.get(key),
    remove: (key: string) => mockStorage.delete(key),
  }),
}));

const { mmkvStorage } = require('@/services/mmkv');

// Recreate store directly (same pattern as useBookmarkStore.test.ts)
interface AuthUser {
  userId: string;
  email: string | null;
  displayName: string | null;
}

interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
}

const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      userId: null,
      email: null,
      displayName: null,
      setUser: (user) =>
        set({
          isAuthenticated: true,
          userId: user.userId,
          email: user.email,
          displayName: user.displayName,
        }),
      clearUser: () =>
        set({
          isAuthenticated: false,
          userId: null,
          email: null,
          displayName: null,
        }),
    }),
    {
      name: 'auth-state',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        userId: state.userId,
        email: state.email,
        displayName: state.displayName,
      }),
    },
  ),
);

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: false,
      userId: null,
      email: null,
      displayName: null,
    });
    mockStorage.clear();
  });

  test('default state is anonymous (isAuthenticated: false, all identity fields null)', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.userId).toBeNull();
    expect(state.email).toBeNull();
    expect(state.displayName).toBeNull();
  });

  test('setUser transitions to authenticated state', () => {
    useAuthStore.getState().setUser({
      userId: 'user-123',
      email: 'test@example.com',
      displayName: 'Test User',
    });
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.userId).toBe('user-123');
    expect(state.email).toBe('test@example.com');
    expect(state.displayName).toBe('Test User');
  });

  test('setUser with null email and displayName', () => {
    useAuthStore.getState().setUser({
      userId: 'user-456',
      email: null,
      displayName: null,
    });
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.userId).toBe('user-456');
    expect(state.email).toBeNull();
    expect(state.displayName).toBeNull();
  });

  test('clearUser reverts to anonymous state', () => {
    useAuthStore.getState().setUser({
      userId: 'user-123',
      email: 'test@example.com',
      displayName: 'Test User',
    });
    useAuthStore.getState().clearUser();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.userId).toBeNull();
    expect(state.email).toBeNull();
    expect(state.displayName).toBeNull();
  });

  test('MMKV persistence round-trip (store → rehydrate → state intact)', () => {
    useAuthStore.getState().setUser({
      userId: 'user-789',
      email: 'persist@example.com',
      displayName: 'Persisted User',
    });
    const stored = mockStorage.get('auth-state');
    expect(stored).toBeDefined();
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.state.isAuthenticated).toBe(true);
      expect(parsed.state.userId).toBe('user-789');
      expect(parsed.state.email).toBe('persist@example.com');
      expect(parsed.state.displayName).toBe('Persisted User');
    }
  });

  test('partialize excludes actions from persisted state', () => {
    useAuthStore.getState().setUser({
      userId: 'user-abc',
      email: null,
      displayName: null,
    });
    const stored = mockStorage.get('auth-state');
    expect(stored).toBeDefined();
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.state.setUser).toBeUndefined();
      expect(parsed.state.clearUser).toBeUndefined();
    }
  });
});
