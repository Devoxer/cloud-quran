/**
 * Reciter downloads — one voice's book, surah by surah (2026-09-11).
 *
 * Thin by design: the screen is `features/audio`'s own component, and the header comes from the
 * `(profile)` layout's `TITLE_KEYS` (`titles.reciterDownloads`). A leaf with no entry there
 * silently renders the Account title, which is why the key is added in the same change.
 *
 * ⚠️ THE RECITER ARRIVES AS A QUERY PARAM, NOT AS A DYNAMIC SEGMENT. `(profile)/_layout.tsx`
 * resolves its header title from the focused LEAF segment, so `reciter/[id].tsx` would look up
 * the literal `[id]` — a title key that cannot exist. A flat route keeps the layout's one
 * mechanism working and costs nothing: the id is data either way.
 *
 * An absent or unknown id is not an error surface. `resolveReciterId` downstream answers the
 * default, which is the same thing the picker does with a stored preference it does not
 * recognise.
 */

import { useLocalSearchParams } from 'expo-router';

import { ReciterSurahDownloads } from '@/features/audio';

export default function ReciterDownloadsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <ReciterSurahDownloads reciterId={id ?? ''} />;
}
