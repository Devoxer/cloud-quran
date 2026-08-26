/**
 * Network Connectivity Detection
 *
 * Story 11.1: Create Offline Books Schema and Storage Helpers
 * Epic 11: Offline Access
 *
 * Provides hooks and utilities for detecting network connectivity state.
 *
 * Online/offline is standardized on `@react-native-community/netinfo`.
 *
 * ⚠️ story 5-6 CORRECTED THE RATIONALE THAT STOOD HERE, BOTH HALVES OF WHICH HAD GONE STALE. It
 * said netinfo was in the tree because `@instantdb/react-native` hard-imports it as a required
 * peer, and that `expo-network` was "intentionally NOT used" as redundant with that mandatory
 * peer. Story 5-2 deleted the vendor, so netinfo is now a DIRECT dependency held on its own
 * merits; story 5-5 added `expo-network` as a Better Auth peer, so it is in the tree regardless.
 *
 * The reason to stay on netinfo is what is left once both premises are removed: it reports
 * `isInternetReachable` (a real reachability probe) as well as `isConnected`, and story 5-6's
 * outbox drain acts on the difference — a device attached to a captive-portal wifi is "connected"
 * and cannot reach the worker.
 *
 * ⚠️ THE FIRST DRAFT OF THIS PARAGRAPH NAMED `useNetworkFallback` AS THE OTHER CONSUMER. There is
 * no such hook anywhere in this repo — one stale premise was replaced with another, in the very
 * edit that was correcting a stale premise. If a justification names a caller, grep for it.
 *
 * ⚠️ AND THERE IS NO SINGLE SOURCE OF TRUTH FOR ONLINE/OFFLINE HERE, WHICH THAT DRAFT ALSO
 * CLAIMED. Three readers of netinfo exist and two of them disagree with this module:
 *   • `useConnectivity` / `checkConnectivity` (here) expose BOTH flags and let the caller decide.
 *   • `isOffline()` (here) looks at `isConnected` ALONE, so it answers "online" behind a portal.
 *   • `lib/sync.ts`'s `startSyncManagers` inlines its own predicate over both flags, because
 *     `onlineManager` wants one boolean.
 * That is a real inconsistency, recorded rather than papered over: `isOffline` has no caller in
 * the tree today, so tightening it is a change with no subject, and inventing a shared predicate
 * for one live consumer is a worse trade than the honest note.
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/**
 * Connectivity state returned by useConnectivity hook
 */
export interface ConnectivityState {
  /** Whether device is connected to a network (null if unknown) */
  isConnected: boolean | null;
  /** Whether device can reach the internet (null if unknown) */
  isInternetReachable: boolean | null;
}

/**
 * Hook for monitoring network connectivity
 *
 * Subscribes to network state changes and provides real-time updates.
 * Components can react to connectivity changes to show appropriate UI.
 *
 * @returns Current connectivity state with isConnected and isInternetReachable
 *
 * @example
 * const { isConnected, isInternetReachable } = useConnectivity();
 * if (!isConnected) {
 *   return <OfflineBanner />;
 * }
 */
export function useConnectivity(): ConnectivityState {
  const [state, setState] = useState<ConnectivityState>({
    isConnected: null,
    isInternetReachable: null,
  });

  useEffect(() => {
    // `NetInfo.fetch()` runs a real reachability probe, so it can still be in flight when the
    // listener delivers a CHANGE — and netinfo only emits on change, so whatever lands last is what
    // the app believes until the next transition. Resolving a stale snapshot on top of a fresh event
    // therefore pins the hook to the pre-change value indefinitely: drop the wifi during the probe
    // and `useNetworkFallback` keeps reporting online, so playback never falls back to the offline
    // file. The seed exists only to answer "what is the state before any event arrives", so once an
    // event HAS arrived it has nothing left to contribute — and it must not fire after unmount
    // (§ "Async-effect cleanup is mandatory", stack/conventions.md).
    let superseded = false;

    const unsubscribe = NetInfo.addEventListener((netState: NetInfoState) => {
      superseded = true;
      setState({
        isConnected: netState.isConnected,
        isInternetReachable: netState.isInternetReachable,
      });
    });

    // Seed the initial state for a screen mounted over an already-established connection, which
    // emits no event of its own.
    NetInfo.fetch().then((netState: NetInfoState) => {
      if (superseded) return;
      setState({
        isConnected: netState.isConnected,
        isInternetReachable: netState.isInternetReachable,
      });
    });

    return () => {
      superseded = true;
      unsubscribe();
    };
  }, []);

  return state;
}

/**
 * Check current network connectivity (one-time check)
 *
 * Use this for imperative connectivity checks before operations.
 * For reactive UI updates, prefer useConnectivity hook.
 *
 * @returns Promise resolving to current connectivity state
 *
 * @example
 * const { isConnected } = await checkConnectivity();
 * if (!isConnected) {
 *   throw new Error('No network connection');
 * }
 */
export async function checkConnectivity(): Promise<ConnectivityState> {
  const netState = await NetInfo.fetch();
  return {
    isConnected: netState.isConnected,
    isInternetReachable: netState.isInternetReachable,
  };
}

/**
 * Check if device is currently offline
 *
 * Convenience function for quick offline check.
 *
 * @returns Promise resolving to true if device is offline
 *
 * @example
 * if (await isOffline()) {
 *   // Use cached data
 * }
 */
export async function isOffline(): Promise<boolean> {
  const { isConnected } = await checkConnectivity();
  return isConnected === false;
}
