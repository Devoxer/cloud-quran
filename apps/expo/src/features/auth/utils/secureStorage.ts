import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'auth-extra-token';

export async function getSecureToken(key: string = TOKEN_KEY): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  return SecureStore.getItemAsync(key);
}

export async function setSecureToken(value: string, key: string = TOKEN_KEY): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.setItemAsync(key, value);
}

export async function deleteSecureToken(key: string = TOKEN_KEY): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(key);
}
