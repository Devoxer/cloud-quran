/**
 * SecureStore wrapper (Story 17.9)
 *
 * The canonical home for any future app-managed secret.
 * - Native: encrypted Keychain (iOS) / Keystore (Android) via expo-secure-store.
 * - Web: SecureStore has no implementation, so we fall back to `localStorage`,
 *   which is UNENCRYPTED. Never persist a real secret on web without an
 *   additional encryption layer.
 *
 * NOTE: there is no app-managed secret today. The InstantDB SDK persists its
 * own auth/refresh token inside its MMKV `Store` adapter (`lib/instantdb.ts`) —
 * the app never reads or writes that token here (Story 17.9 auth-path audit).
 *
 * iOS Keychain values are limited to ~2 KB per key.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

/** Minimal localStorage shape — avoids depending on the DOM lib in TS config. */
interface WebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function webStorage(): WebStorage | null {
  return (globalThis as unknown as { localStorage?: WebStorage }).localStorage ?? null;
}

let warnedWebFallback = false;
function warnWebFallbackOnce(): void {
  if (__DEV__ && !warnedWebFallback) {
    warnedWebFallback = true;
    console.warn(
      'secureStore: SecureStore is unavailable on web — falling back to ' +
        'localStorage (UNENCRYPTED). Do not persist real secrets on web.'
    );
  }
}

/** Reads a value, or `null` if absent. */
export async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    warnWebFallbackOnce();
    try {
      return webStorage()?.getItem(key) ?? null;
    } catch {
      // Best-effort web-storage read (private mode / disabled storage): treat as absent.
      // NOT a capture path — a missing token just re-auths (Story 26.11 swallow policy).
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

/** Writes a value. */
export async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    warnWebFallbackOnce();
    try {
      webStorage()?.setItem(key, value);
    } catch {
      // private mode / storage full — best effort
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

/** Removes a value. No-op if the key is absent. */
export async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    warnWebFallbackOnce();
    try {
      webStorage()?.removeItem(key);
    } catch {
      // best effort
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
