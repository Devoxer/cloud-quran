import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import { mmkv } from './mmkv';

const FIVE_MINUTES = 5 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: FIVE_MINUTES,
      refetchInterval: false, // NO automatic polling — drains mobile battery
      refetchOnReconnect: true,
      refetchOnWindowFocus: true, // Requires AppState integration on React Native
    },
  },
});

/**
 * MMKV-backed persister for React Query cache.
 * Survives app restarts — serves cached data instantly while revalidating.
 */
export const queryPersister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => {
      const value = mmkv.getString(key);
      return Promise.resolve(value ?? null);
    },
    setItem: (key, value) => {
      mmkv.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      mmkv.remove(key);
      return Promise.resolve();
    },
  },
  key: 'REACT_QUERY_CACHE',
});

/**
 * Set up AppState listener so React Query knows when the app comes to foreground.
 * React Query's focusManager doesn't work with React Native out of the box.
 * Must be called once at app startup.
 */
export function setupReactQueryFocusManager() {
  if (Platform.OS === 'web') return; // Web handles focus natively

  const { focusManager } = require('@tanstack/react-query');

  focusManager.setEventListener((handleFocus: (focused: boolean) => void) => {
    const subscription = AppState.addEventListener('change', (state) => {
      handleFocus(state === 'active');
    });
    return () => subscription.remove();
  });
}
