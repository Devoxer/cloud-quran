import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { mmkvStorage } from '@/services/mmkv';

export interface AuthUser {
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

/**
 * Auth identity store — manages local authentication state.
 *
 * Default: anonymous mode (isAuthenticated: false, all identity fields null).
 * Anonymous users have NO server presence — all data stays on-device via MMKV.
 *
 * React Query guard pattern for future sync queries (story 4-3):
 *   const { data } = useQuery({
 *     queryKey: ['sync', 'position'],
 *     queryFn: () => api.sync.pull.$get(),
 *     enabled: isAuthenticated, // prevents fetch in anonymous mode
 *   });
 */
export const useAuthStore = create<AuthState>()(
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
