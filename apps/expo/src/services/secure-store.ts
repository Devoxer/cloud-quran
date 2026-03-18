import { Platform } from 'react-native';

const AUTH_TOKEN_KEY = 'cloud-quran-auth-token';

// On web, Better Auth handles session cookies — no token storage needed.
// On native, we store the session token in Keychain (iOS) / Keystore (Android).

let cachedModule: typeof import('expo-secure-store') | null | undefined;

function getSecureStoreModule(): typeof import('expo-secure-store') | null {
  if (cachedModule !== undefined) return cachedModule;
  if (Platform.OS === 'web') {
    cachedModule = null;
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  cachedModule = require('expo-secure-store');
  return cachedModule;
}

export async function getAuthToken(): Promise<string | null> {
  const store = getSecureStoreModule();
  if (!store) return null;
  return store.getItemAsync(AUTH_TOKEN_KEY);
}

export async function setAuthToken(token: string): Promise<void> {
  const store = getSecureStoreModule();
  if (!store) return;
  await store.setItemAsync(AUTH_TOKEN_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  const store = getSecureStoreModule();
  if (!store) return;
  await store.deleteItemAsync(AUTH_TOKEN_KEY);
}

/** @internal Reset cached module — only for tests that switch Platform.OS */
export function _resetModuleCacheForTesting(): void {
  cachedModule = undefined;
}
