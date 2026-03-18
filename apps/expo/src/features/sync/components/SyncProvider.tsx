import { useSyncEngine } from '../useSyncEngine';
import { useSyncPull } from '../useSyncPull';

/**
 * Invisible provider that activates the sync engine.
 * Mount once in the root layout inside QueryClientProvider.
 *
 * - Push: subscribes to store changes and debounces uploads (2s)
 * - Pull: React Query hook auto-refetches on foreground + reconnect
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  useSyncEngine();
  useSyncPull();
  return <>{children}</>;
}
