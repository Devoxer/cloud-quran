import { db } from '@/services/instantdb';

export function useAuth() {
  const { isLoading, user, error } = db.useAuth();

  return {
    isLoading,
    user,
    error,
    isAuthenticated: !!user && !user.isGuest,
    isGuest: !!user?.isGuest,
  };
}
