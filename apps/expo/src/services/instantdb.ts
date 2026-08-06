import { init, id } from '@instantdb/react-native';
import Store from '@instantdb/react-native-mmkv';

import schema, { type AppSchema } from '../../instant.schema';

const INSTANT_APP_ID = process.env.EXPO_PUBLIC_INSTANT_APP_ID!;

const db = init<AppSchema>({
  appId: INSTANT_APP_ID,
  schema,
  Store,
});

export function useBookmarks() {
  const { data, isLoading, error } = db.useQuery({
    bookmarks: { $: { order: { createdAt: 'desc' } } },
  });
  return { bookmarks: data?.bookmarks ?? [], isLoading, error };
}

export function useReadingPosition() {
  const { data, isLoading, error } = db.useQuery({
    readingPosition: { $: { limit: 1, order: { updatedAt: 'desc' } } },
  });
  return { position: data?.readingPosition?.[0] ?? null, isLoading, error };
}

export function usePreferences() {
  const { data, isLoading, error } = db.useQuery({
    preferences: { $: { limit: 1 } },
  });
  return { preferences: data?.preferences?.[0] ?? null, isLoading, error };
}

export function useAudioPosition() {
  const { data, isLoading, error } = db.useQuery({
    audioPosition: { $: { limit: 1, order: { updatedAt: 'desc' } } },
  });
  return { audioPosition: data?.audioPosition?.[0] ?? null, isLoading, error };
}

export { db, id };
export type { AppSchema };
