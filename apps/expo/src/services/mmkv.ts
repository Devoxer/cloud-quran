import { createMMKV } from 'react-native-mmkv';

import type { StateStorage } from 'zustand/middleware';

export const mmkv = createMMKV();

export const MMKV_KEYS = {
  GDPR_CONSENT: 'gdpr-consent-accepted',
} as const;

export const mmkvStorage: StateStorage = {
  setItem: (name, value) => mmkv.set(name, value),
  getItem: (name) => mmkv.getString(name) ?? null,
  removeItem: (name) => mmkv.remove(name),
};
