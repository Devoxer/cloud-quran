/**
 * audioSource — where a track's audio comes from (story 7-5). ONE door, local first.
 *
 * ⚠️ THIS IS A NAMED FUNCTION RATHER THAN AN `if` INSIDE THE ENGINE, AND THE REASON IS THE
 * CRITERION. "A downloaded surah plays from disk with zero network calls" is the epic's promise,
 * and a branch buried in `buildSources`' loop has nowhere to be tested — the engine's suite can
 * only observe the URIs the playlist was handed, which is one indirection too far from the rule.
 * `surahAudioUrl` has two callers now — this module and nothing else on the playback path — so
 * the resolver and the `if` are the same size; only one of them is a thing you can point at.
 *
 * ⚠️ THE LOCAL FILE WINS BEFORE ANY PLATFORM OR NETWORK BRANCH, on every platform — the shape
 * `mushafFonts.ts` uses for its patched faces. Web simply never has one (`localSurahUri` answers
 * null there), so web falls through to the CDN by the same line rather than by a special case.
 *
 * ⚠️ A MISSING FILE FALLS BACK SILENTLY, WITH NO ERROR SURFACE. The frozen matrix's row is "file
 * missing at play time → fall back to the CDN, silently": a reader whose download was deleted by
 * the OS, or who is playing a surah they never kept, wants the recitation — not a dialog about
 * storage. The only visible difference is that it needs the network, which the existing playback
 * error surface already reports when there isn't any.
 *
 * ⚠️ THE ENGINE USES THE *RANGE* FORM, AND THAT IS A MEASURED COST, NOT A STYLE. `buildSources`
 * builds surahs n…114, so the single-surah resolver put up to 114 synchronous `file.exists` stats
 * on the JS thread between the reader's press and the first note. One directory listing answers
 * all of them. It degrades to the per-surah stat only when the listing itself fails, which is the
 * one case where "unknown" must not be read as "nothing is local". (Story 7-5 review, P13.)
 */

import { surahAudioUrl } from '@/constants/audio';
import { downloadedSurahSet, localSurahUri } from './audioDownloads';

/**
 * The uri to hand the native player for `(reciterId, surah)` — the downloaded file if it is on
 * disk, otherwise the CDN URL, unchanged.
 */
export function resolveSurahUri(reciterId: string, surah: number): string {
  return localSurahUri(reciterId, surah) ?? surahAudioUrl(reciterId, surah);
}

/**
 * The same answer for a contiguous run of surahs, from ONE directory listing.
 *
 * `endSurah` is inclusive. A listing that cannot be read falls back to `resolveSurahUri` per
 * surah rather than declaring everything remote — see the header.
 */
export function resolveSurahUris(
  reciterId: string,
  startSurah: number,
  endSurah: number
): string[] {
  const kept = downloadedSurahSet(reciterId);
  const uris: string[] = [];
  for (let surah = startSurah; surah <= endSurah; surah++) {
    if (kept === null) {
      uris.push(resolveSurahUri(reciterId, surah));
    } else if (kept.has(surah)) {
      uris.push(localSurahUri(reciterId, surah) ?? surahAudioUrl(reciterId, surah));
    } else {
      uris.push(surahAudioUrl(reciterId, surah));
    }
  }
  return uris;
}
