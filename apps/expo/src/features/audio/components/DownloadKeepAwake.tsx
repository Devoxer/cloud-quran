/**
 * DownloadKeepAwake — the screen stays lit while a download the reader is WATCHING runs.
 *
 * ⚠️ IT IS MOUNTED ON ONE SURFACE ONLY: the Quran index, which is where the per-surah percentage
 * is drawn. A wake lock is a promise about attention, not about work — the reciter settings block
 * shows counts moving and holds nothing, because "the reader is looking at a number that changes"
 * is the whole justification and only the percentage is that number. A lock held from a screen
 * nobody is on is just a flat battery.
 *
 * ⚠️ AND IT IS THE MOUNT THAT IS CONDITIONAL, NOT THE HOOK. `useKeepAwake` activates for as long
 * as its owner is mounted and has no "off" argument, so the only honest way to hold it *while
 * something is downloading* is to mount an owner then and unmount it after. That also makes the
 * release unmissable: navigating away, a cancel, the last surah landing — each unmounts the
 * owner, and there is no path where an early return or a thrown render leaves the lock held.
 *
 * The predicate is the reciter's `active` count (queued OR in flight), not `downloading` alone: a
 * serial queue is between files for a tick after every surah, and a lock that dropped there would
 * let the screen dim 114 times during a "download all".
 */

import { useKeepAwake } from 'expo-keep-awake';

import { useReciterDownloadSummary } from '@/stores/downloadQueueStore';
import { DOWNLOADS_SUPPORTED } from '../lib/audioDownloads';

export interface DownloadKeepAwakeProps {
  /** The voice whose queue this watches — downloads are per reciter. */
  reciterId: string;
}

/**
 * The tag the lock is held under.
 *
 * Named rather than default, so it cannot be released by something else calling
 * `deactivateKeepAwake()` with no argument — the default tag is shared by every caller.
 */
const TAG = 'cloud-quran-audio-download';

export function DownloadKeepAwake({ reciterId }: DownloadKeepAwakeProps) {
  const { active } = useReciterDownloadSummary(reciterId);
  // Web downloads nothing (`DOWNLOADS_SUPPORTED`), so `active` can never be non-zero there —
  // the guard is belt-and-braces against a wake lock the browser would prompt about.
  return DOWNLOADS_SUPPORTED && active > 0 ? <ScreenAwake /> : null;
}

/** Renders nothing; exists only so that being mounted holds the lock. */
function ScreenAwake() {
  useKeepAwake(TAG);
  return null;
}
