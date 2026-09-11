/**
 * useDownloadReciterId — the voice a download would be filed under, or `null` while nobody knows
 * yet (story 7-5 review, P10).
 *
 * ⚠️ `resolveReciterId(undefined)` IS `alafasy`, AND THAT IS THE WRONG ANSWER FOR A *DOWNLOAD*.
 * The engine is right to default: it has to play something, and a preference that resolves later
 * changes the next track. A download is not like that — it writes a 3 MB file into
 * `{document}/audio/{reciterId}/`, and a file written under the default while the reader's real
 * choice was still in flight is a download they will never see, under a voice they never picked,
 * that only `deleteOrphanedDownloads` can ever reach. Same pending-row race the reading position
 * was fixed for. So: no preference row, no control.
 *
 * In practice the row is seeded synchronously from MMKV (`lib/sync.ts`'s `initialData`), so a
 * returning reader never sees the absence. It is a cold first launch, and the window between
 * boot and the first sync read, that this closes.
 */

import { usePreferences } from '@/lib/sync';
import { resolveReciterId } from '../data/reciters';

export function useDownloadReciterId(): string | null {
  const { data } = usePreferences();
  // ⚠️ `undefined` IS "NOT RESOLVED"; `null` IS A RESOLVED EMPTY ROW. The query hands back
  // `undefined` while nothing is known and `null` for a reader who has no preferences row yet —
  // the second is a real answer, and the default is the right one for it.
  if (data === undefined) return null;
  return resolveReciterId(data?.reciterId);
}
