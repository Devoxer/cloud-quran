import { useAuthStore } from './useAuthStore';

export function useIsAuthenticated(): boolean {
  return useAuthStore((s) => s.isAuthenticated);
}
