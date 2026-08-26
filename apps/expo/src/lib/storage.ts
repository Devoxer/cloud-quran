/**
 * Offline Storage Helpers
 *
 * Story 11.1: Create Offline Books Schema and Storage Helpers
 * Epic 11: Offline Access
 * Story 20.6: every offline file carries its LANGUAGE.
 *
 * Provides file system operations for offline book storage using expo-file-system.
 * Audio and content files are stored in the document directory for persistence.
 *
 * ## The on-disk layout (Story 20.6 § D4)
 *
 * ```
 * {OFFLINE_DIR}{bookId}/
 *   {sectionType}_{language}_{voiceId}.{ext}          ← audio
 *   {sectionType}_{language}_{voiceId}.blocks.json    ← per-voice blocks + durationMs
 *   {sectionType}_{language}.json                     ← voice-independent text
 *   meta_{language}.json                              ← localized title/author + section list
 *   cover.{ext}                                       ← language-neutral, shared
 * ```
 *
 * A download belongs to the language it was fetched in, and **several languages' files can sit in
 * one book directory** (Story 24.27 — a language switch no longer deletes anything, and a
 * device-locale change never did). The layout stays FLAT anyway: because the language is already
 * unambiguous in the filename, every dir-scan helper keeps working with only a filename-pattern
 * change, whereas a directory-per-language layout would add a level to every read path
 * ({@link getOfflineDir} callers, {@link getDownloadedBookIds}'s per-book scan) and buy nothing.
 *
 * ⚠️ The language is in the FILENAME precisely BECAUSE files from other languages are expected to
 * be sitting right beside the current ones. Another language's file must be **unresolvable**, not
 * merely unlikely: every read builds the current language's exact name and simply doesn't find it.
 * That property is what lets the other language's downloads survive harmlessly — and it means the
 * filename is the ONLY record of a file's language: never infer it from `voiceId` (two languages
 * are free to share a voice id; nothing enforces otherwise) and never from the directory.
 *
 * ⚠️ `{sectionType}` and `{language}` must contain no `_` (section types are camelCase; BCP-47
 * separates subtags with `-`). `{voiceId}` MAY (`en_f`), which is why the parser
 * {@link offlineAudioFileLanguage} splits from the LEFT and reads index 1.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import {
  OFFLINE_CONTENT_VERSION,
  type OfflineBookMeta,
  type OfflineText,
  type OfflineVoiceData,
  type ResolvedOfflineBookMeta,
} from '@/types/offline';

const isWeb = Platform.OS === 'web';

/**
 * Base directory for offline book storage
 * Uses documentDirectory which persists across app updates
 */
export const OFFLINE_DIR = `${FileSystem.documentDirectory}offline/`;

/**
 * Get the directory path for a specific book's offline files
 * @param bookId - The book's unique identifier
 * @returns Full path to the book's offline directory
 */
export function getOfflineDir(bookId: string): string {
  if (isWeb) return '';
  return `${OFFLINE_DIR}${bookId}/`;
}

/**
 * Ensure the offline directory exists for a book
 * Creates the directory structure if it doesn't exist
 * @param bookId - The book's unique identifier
 */
export async function ensureOfflineDir(bookId: string): Promise<void> {
  if (isWeb) return;
  const dir = getOfflineDir(bookId);
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

/**
 * Audio container extensions we may store offline. Since Story 22.9 audio is `.wav`
 * (Kokoro default) OR `.mp3` (encoded), decided per-object at generation — so the
 * offline path must carry the REAL extension, not a hardcoded one (a `.wav` written
 * under a `.mp3` name mis-decodes on platforms that sniff by extension).
 */
const AUDIO_EXTENSIONS: readonly string[] = ['mp3', 'wav', 'm4a', 'aac', 'ogg'];

/**
 * Derive the real audio extension from a (signed) URL's last path segment.
 * Strips query/fragment; defaults to `mp3` when the URL has no known audio extension.
 * String-based (no `new URL`) so it's safe on the RN runtime.
 */
export function audioExtFromUrl(url: string): string {
  const path = url.split(/[?#]/)[0];
  const ext = path.split('/').pop()?.split('.').pop()?.toLowerCase();
  if (ext && AUDIO_EXTENSIONS.includes(ext)) return ext;
  return 'mp3';
}

/**
 * The LANGUAGE an offline audio filename records, or `null` when the name is not an offline audio
 * file at all (a `.json` sidecar, the cover, anything unrecognized).
 *
 * `{sectionType}_{language}_{voiceId}.{ext}` — split from the LEFT and take index 1, because the
 * voice id may itself contain `_` (`en_f`) while the section type and language may not. A naive
 * `name.includes('_' + language + '_')` would false-positive: `summaryBrief_fr_en_f.mp3` contains
 * `_en_` yet is a FRENCH file.
 */
function offlineFileLanguage(fileName: string): string | null {
  // Cut at the FIRST dot so a `.blocks.json` sidecar reads the same as its `.mp3`, then split from
  // the LEFT (index 1) for the same reason {@link offlineAudioFileLanguage} does. Covers every
  // artefact the download writes — `{sectionType}_{language}_{voiceId}.{ext}`,
  // `{sectionType}_{language}.json`, `{sectionType}_{language}_{voiceId}.blocks.json` and
  // `meta_{language}.json` — and correctly returns `null` for the language-BLIND `cover.{ext}`.
  return fileName.split('.')[0].split('_')[1] ?? null;
}

function offlineAudioFileLanguage(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return null;
  if (!AUDIO_EXTENSIONS.includes(fileName.slice(dot + 1).toLowerCase())) return null;
  const parts = fileName.slice(0, dot).split('_');
  return parts.length >= 3 ? parts[1] : null;
}

/**
 * Get the local file path for an offline audio file, per (LANGUAGE, VOICE) — Story 22.12 voice
 * split, Story 20.6 language dimension. Filename `{sectionType}_{language}_{voiceId}.{ext}`.
 * @param ext - container extension (default `mp3`). Writers pass the real extension
 *   derived from the source URL; readers should prefer {@link findOfflineAudioPath},
 *   which resolves whatever extension is actually on disk.
 */
export function getOfflineAudioPath(
  bookId: string,
  sectionType: string,
  language: string,
  voiceId: string,
  ext = 'mp3'
): string {
  if (isWeb) return '';
  return `${getOfflineDir(bookId)}${sectionType}_${language}_${voiceId}.${ext}`;
}

/**
 * Resolve the on-disk audio file for a (section, language, voice), whatever its extension
 * (`.wav`/`.mp3`/…), or `null` if that combination isn't downloaded. Use this on the READ path —
 * a hardcoded `.mp3` lookup misses a `.wav` download. The match is EXACT, so neither another
 * voice's file nor another LANGUAGE's file can ever be returned (Story 20.6 § D4 — that is what
 * makes another language's downloads safe to leave on disk; Story 24.27).
 */
export async function findOfflineAudioPath(
  bookId: string,
  sectionType: string,
  language: string,
  voiceId: string
): Promise<string | null> {
  if (isWeb) return null;
  const dir = getOfflineDir(bookId);
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) return null;
  const files = await FileSystem.readDirectoryAsync(dir);
  const match = files.find((f) =>
    AUDIO_EXTENSIONS.some((ext) => f === `${sectionType}_${language}_${voiceId}.${ext}`)
  );
  return match ? `${dir}${match}` : null;
}

/**
 * Get the local file path for the voice-INDEPENDENT offline TEXT JSON (Story 22.12 split).
 * `{sectionType}_{language}.json` — one per (book, section, language); the section text is shared
 * across voices but NOT across languages (Story 20.6).
 */
export function getOfflineTextPath(bookId: string, sectionType: string, language: string): string {
  return `${getOfflineDir(bookId)}${sectionType}_${language}.json`;
}

/**
 * Get the local file path for the PER-VOICE offline data JSON (`{ blocks, durationMs }`) —
 * Story 22.12 split. `{sectionType}_{language}_{voiceId}.blocks.json`, alongside its audio.
 */
export function getOfflineVoiceDataPath(
  bookId: string,
  sectionType: string,
  language: string,
  voiceId: string
): string {
  return `${getOfflineDir(bookId)}${sectionType}_${language}_${voiceId}.blocks.json`;
}

/**
 * Image container extensions we may store a downloaded cover under. The cover URL is a
 * PUBLIC CDN/R2 url (covers render unauthed in discover/library/feed), so no signing —
 * but the real extension still varies, so the offline path must carry it (mirrors
 * {@link audioExtFromUrl}).
 */
const IMAGE_EXTENSIONS: readonly string[] = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];

/**
 * Derive the real image extension from a cover URL's last path segment. Strips
 * query/fragment; defaults to `jpg` when the URL has no known image extension.
 * String-based (no `new URL`) so it's safe on the RN runtime.
 */
export function imageExtFromUrl(url: string): string {
  const path = url.split(/[?#]/)[0];
  const ext = path.split('/').pop()?.split('.').pop()?.toLowerCase();
  if (ext && IMAGE_EXTENSIONS.includes(ext)) return ext;
  return 'jpg';
}

/** Local path for a book's offline cover image (Story 22.19 §A). */
export function getOfflineCoverPath(bookId: string, ext = 'jpg'): string {
  if (isWeb) return '';
  return `${getOfflineDir(bookId)}cover.${ext}`;
}

/**
 * Local path for a book's offline display-metadata JSON (Story 22.19 §A), per LANGUAGE — the
 * record holds the LOCALIZED title/author the offline player chrome and lock screen render, so it
 * is exactly as language-bound as the audio it describes (Story 20.6).
 */
export function getOfflineMetaPath(bookId: string, language: string): string {
  return `${getOfflineDir(bookId)}meta_${language}.json`;
}

/**
 * Resolve the on-disk cover file for a book, whatever its extension (`.jpg`/`.png`/…),
 * or `null` if none exists. Read-path resolver (a hardcoded `.jpg` lookup misses a
 * `.webp` download). Lives under the book dir, so it never collides with the
 * `{sectionType}.{audioExt}` / `{sectionType}.json` section files.
 */
export async function findOfflineCoverPath(bookId: string): Promise<string | null> {
  if (isWeb) return null;
  const dir = getOfflineDir(bookId);
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) return null;
  const files = await FileSystem.readDirectoryAsync(dir);
  const match = files.find((f) => IMAGE_EXTENSIONS.some((ext) => f === `cover.${ext}`));
  return match ? `${dir}${match}` : null;
}

/**
 * Download a book's cover image to local disk for offline lock-screen + player chrome
 * (Story 22.19 §A). BEST-EFFORT: a cover failure must NOT fail the book download (audio
 * is the point) — returns the local path on success, or `null` on any failure (web /
 * missing url / download error), swallowing the error so the caller's download loop is
 * never interrupted. The lock screen degrades to no-art gracefully when null.
 */
export async function saveCoverImage(bookId: string, coverUrl?: string): Promise<string | null> {
  if (isWeb || !coverUrl) return null;
  try {
    await ensureOfflineDir(bookId);
    const filePath = getOfflineCoverPath(bookId, imageExtFromUrl(coverUrl));
    // Drop any prior cover under a different extension so a re-download doesn't leave a
    // stale file findOfflineCoverPath could resolve instead.
    const stale = await findOfflineCoverPath(bookId);
    if (stale && stale !== filePath) {
      await FileSystem.deleteAsync(stale, { idempotent: true });
    }
    const downloadResumable = FileSystem.createDownloadResumable(coverUrl, filePath, {});
    const result = await downloadResumable.downloadAsync();
    if (!result) return null;
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    return fileInfo.exists ? filePath : null;
  } catch {
    return null;
  }
}

/**
 * Persist a book's display metadata (title/author/section list) as `meta.json` for
 * offline player chrome (Story 22.19 §A). Lives under the book dir, so `deleteOfflineBook`
 * (whole-dir delete) removes it with the rest. Display-only — the InstantDB `offlineBooks`
 * rows stay the source of truth for "what's downloaded".
 */
export async function saveBookMeta(
  bookId: string,
  language: string,
  meta: OfflineBookMeta
): Promise<void> {
  if (isWeb) return;
  await ensureOfflineDir(bookId);
  await FileSystem.writeAsStringAsync(getOfflineMetaPath(bookId, language), JSON.stringify(meta));
}

/** Read a book's persisted offline metadata for a language, or `null` if absent / corrupt.
 *  Local-only. */
export async function loadBookMeta(
  bookId: string,
  language: string
): Promise<OfflineBookMeta | null> {
  if (isWeb) return null;
  const filePath = getOfflineMetaPath(bookId, language);
  const fileInfo = await FileSystem.getInfoAsync(filePath);
  if (!fileInfo.exists) return null;
  try {
    return JSON.parse(await FileSystem.readAsStringAsync(filePath)) as OfflineBookMeta;
  } catch {
    return null;
  }
}

/**
 * Resolve a downloaded book's display metadata + local cover for the player/engine
 * (Story 22.19 §A). Reads ONLY local disk — safe on a cold offline start (no `useQuery`,
 * no network), mirroring {@link resolveOfflineSource}'s offline-first contract. Returns
 * `null` when the book isn't downloaded (no meta.json).
 */
export async function resolveOfflineBookMeta(
  bookId: string,
  language: string
): Promise<ResolvedOfflineBookMeta | null> {
  if (isWeb) return null;
  const meta = await loadBookMeta(bookId, language);
  if (!meta) return null;
  const coverPath = await findOfflineCoverPath(bookId);
  return {
    title: meta.title,
    author: meta.author,
    coverUri: coverPath ? `file://${coverPath}` : undefined,
    sectionTypes: meta.sectionTypes,
  };
}

/**
 * Download and save an audio file for offline access
 * @param bookId - The book's unique identifier
 * @param sectionType - The section type (summaryBrief, aboutBook, etc.)
 * @param audioUrl - The remote URL to download from
 * @param onProgress - Optional callback for download progress (0-100)
 * @param ext - The audio container extension. Story 32.5: content lives under OPAQUE
 *   random keys (no extension in the URL), so the caller passes the `contentObjects`
 *   row's `ext`; when omitted it falls back to deriving from the URL (legacy/test paths).
 * @returns Object containing the local file path and size in bytes
 */
export async function saveAudioFile(
  bookId: string,
  sectionType: string,
  language: string,
  voiceId: string,
  audioUrl: string,
  onProgress?: (progress: number) => void,
  ext?: string
): Promise<{ filePath: string; sizeBytes: number }> {
  if (isWeb) throw new Error('Offline downloads are not available on web');
  await ensureOfflineDir(bookId);
  // Persist the REAL extension (row-supplied, else URL-derived) so the file plays correctly
  // offline and the read path can resolve it (findOfflineAudioPath). Per (language, voice) key
  // (22.12 + 20.6).
  const resolvedExt = ext && AUDIO_EXTENSIONS.includes(ext) ? ext : audioExtFromUrl(audioUrl);
  const filePath = getOfflineAudioPath(bookId, sectionType, language, voiceId, resolvedExt);

  // Remove any prior audio file for this (section, language, voice) under a DIFFERENT extension,
  // so a re-download (e.g. .mp3 → .wav) doesn't leave a stale file that findOfflineAudioPath
  // could resolve instead of the fresh one. Scoped to THIS language deliberately — another
  // language's files are that language's downloads, still wanted, and unresolvable from here
  // regardless (Story 24.27).
  const stale = await findOfflineAudioPath(bookId, sectionType, language, voiceId);
  if (stale && stale !== filePath) {
    await FileSystem.deleteAsync(stale, { idempotent: true });
  }

  const downloadResumable = FileSystem.createDownloadResumable(
    audioUrl,
    filePath,
    {},
    (downloadProgress) => {
      const progress =
        (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100;
      onProgress?.(progress);
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result) {
    throw new Error('Download failed: No result returned');
  }

  const fileInfo = await FileSystem.getInfoAsync(filePath);
  const size = fileInfo.exists ? fileInfo.size : 0;

  return {
    filePath,
    sizeBytes: size,
  };
}

/**
 * Save the voice-INDEPENDENT section TEXT for offline access (Story 22.12 split).
 * One file per (book, section); the text is shared across voices.
 * @returns Object containing the local file path and size in bytes
 */
export async function saveOfflineText(
  bookId: string,
  sectionType: string,
  language: string,
  data: Omit<OfflineText, 'version'>
): Promise<{ filePath: string; sizeBytes: number }> {
  if (isWeb) throw new Error('Offline downloads are not available on web');
  await ensureOfflineDir(bookId);
  const filePath = getOfflineTextPath(bookId, sectionType, language);

  const payload: OfflineText = { ...data, version: OFFLINE_CONTENT_VERSION };
  await FileSystem.writeAsStringAsync(filePath, JSON.stringify(payload));

  const fileInfo = await FileSystem.getInfoAsync(filePath);
  return { filePath, sizeBytes: fileInfo.exists ? fileInfo.size : 0 };
}

/**
 * Save the PER-VOICE offline data (`{ blocks, durationMs }`) for a section (Story 22.12
 * split) — keyed by voice alongside the per-voice audio.
 * @returns Object containing the local file path and size in bytes
 */
export async function saveOfflineVoiceData(
  bookId: string,
  sectionType: string,
  language: string,
  voiceId: string,
  data: Omit<OfflineVoiceData, 'version'>
): Promise<{ filePath: string; sizeBytes: number }> {
  if (isWeb) throw new Error('Offline downloads are not available on web');
  await ensureOfflineDir(bookId);
  const filePath = getOfflineVoiceDataPath(bookId, sectionType, language, voiceId);

  const payload: OfflineVoiceData = { ...data, version: OFFLINE_CONTENT_VERSION };
  await FileSystem.writeAsStringAsync(filePath, JSON.stringify(payload));

  const fileInfo = await FileSystem.getInfoAsync(filePath);
  return { filePath, sizeBytes: fileInfo.exists ? fileInfo.size : 0 };
}

/**
 * Delete all offline files for a book — the whole directory, LANGUAGE-BLIND.
 *
 * ⚠️ That means "remove download" on a book you downloaded in two languages removes BOTH, without
 * saying so. Deliberate, and the counterpart of Story 24.27's bargain: a language switch keeps
 * every language's files, so the user's own explicit delete is the only thing that removes them —
 * and a language-scoped delete would leave bytes behind that the current language's UI cannot see
 * or reclaim (exactly the phantom-entry state `isBookDownloaded` is scoped to avoid). The copy
 * promises that *switching* is non-destructive, never that deleting is per-language.
 *
 * @param bookId - The book's unique identifier
 */
export async function deleteOfflineBook(bookId: string): Promise<void> {
  if (isWeb) return;
  const dir = getOfflineDir(bookId);
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (dirInfo.exists) {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  }
}

/**
 * Delete only ONE LANGUAGE's offline files for a book, leaving every other language's intact.
 *
 * ⚠️ Story 24.27 Step I — this exists because the language-BLIND {@link deleteOfflineBook} is the
 * right answer for a delete the USER asked for and the wrong one for an automatic cleanup. Once a
 * switch stopped destroying downloads (AC-9), a book downloaded in `en` survives into a French
 * session, where the language-scoped library legitimately shows it as not downloaded and offers
 * Download again — so a French download that then fails, is cancelled or is retried ran the
 * whole-directory cleanup over the user's COMPLETE English copy. Silent, on an ordinary path, and
 * the exact opposite of the promise the switch now makes ("switching back brings them right
 * back"). Cleanup must therefore remove only what the failed run could have written.
 *
 * Deletes the directory outright when nothing language-bearing remains, so a failed FIRST download
 * leaves no orphan dir behind the shared `cover.{ext}` — the state {@link isBookDownloaded} is
 * scoped to avoid.
 */
export async function deleteOfflineBookLanguage(bookId: string, language: string): Promise<void> {
  if (isWeb) return;
  const dir = getOfflineDir(bookId);
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) return;

  const files = await FileSystem.readDirectoryAsync(dir);
  for (const file of files.filter((f) => offlineFileLanguage(f) === language)) {
    await FileSystem.deleteAsync(`${dir}${file}`, { idempotent: true });
  }

  const remaining = await FileSystem.readDirectoryAsync(dir);
  if (!remaining.some((f) => offlineFileLanguage(f) !== null)) {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  }
}

/**
 * Check if a book has any PLAYABLE offline files IN THIS LANGUAGE.
 *
 * ⚠️ Story 20.6 AC-24 — this MUST be language-scoped, and that is a correctness fix, not polish.
 * A book directory routinely holds files no read path can resolve: another language's downloads
 * (the ordinary case since Story 24.27 — the language is in the filename), or a half-swept
 * leftover from a best-effort "Delete all". A language-blind extension scan would count, size and
 * label such a book as "Downloaded" while nothing in it can play — a phantom entry the user can
 * only clear by deleting a book they cannot use. Scoping the scan to the language makes the
 * offline UI agree with what the player can actually resolve.
 *
 * @param bookId - The book's unique identifier
 * @param language - The language whose downloads count
 * @returns True if at least one audio file for this language exists
 */
export async function isBookDownloaded(bookId: string, language: string): Promise<boolean> {
  if (isWeb) return false;
  const dir = getOfflineDir(bookId);
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) return false;

  // At least one audio file for THIS language (any container extension, not just .mp3).
  const files = await FileSystem.readDirectoryAsync(dir);
  return files.some((f) => offlineAudioFileLanguage(f) === language);
}

/**
 * Check if a specific section is downloaded for a book, in this (language, voice).
 * @returns True if BOTH the audio file and its per-voice data exist
 */
export async function isSectionDownloaded(
  bookId: string,
  sectionType: string,
  language: string,
  voiceId: string
): Promise<boolean> {
  if (isWeb) return false;
  // Per (language, voice) — Story 22.12 + 20.6: require BOTH the audio AND its
  // `{blocks,durationMs}` data — a dir with audio but no voice-data is a half-written download
  // (the content fetch failed/was interrupted); treating it as complete would leave it
  // permanently degraded (blocks: [], no self-heal). Resolve the real audio extension (.wav/.mp3).
  const audioPath = await findOfflineAudioPath(bookId, sectionType, language, voiceId);
  if (!audioPath) return false;
  const dataInfo = await FileSystem.getInfoAsync(
    getOfflineVoiceDataPath(bookId, sectionType, language, voiceId)
  );
  return dataInfo.exists;
}

/**
 * Load the voice-INDEPENDENT offline TEXT for a section (Story 22.12 split), or `null` if
 * absent/corrupt.
 */
export async function loadOfflineText(
  bookId: string,
  sectionType: string,
  language: string
): Promise<OfflineText | null> {
  if (isWeb) return null;
  const filePath = getOfflineTextPath(bookId, sectionType, language);
  const fileInfo = await FileSystem.getInfoAsync(filePath);
  if (!fileInfo.exists) return null;
  try {
    return JSON.parse(await FileSystem.readAsStringAsync(filePath)) as OfflineText;
  } catch {
    return null;
  }
}

/**
 * Load the PER-VOICE offline data (`{ blocks, durationMs }`) for a (section, voice) — Story
 * 22.12 split. `null` if that voice isn't downloaded or the file is corrupt.
 */
export async function loadOfflineVoiceData(
  bookId: string,
  sectionType: string,
  language: string,
  voiceId: string
): Promise<OfflineVoiceData | null> {
  if (isWeb) return null;
  const filePath = getOfflineVoiceDataPath(bookId, sectionType, language, voiceId);
  const fileInfo = await FileSystem.getInfoAsync(filePath);
  if (!fileInfo.exists) return null;
  try {
    return JSON.parse(await FileSystem.readAsStringAsync(filePath)) as OfflineVoiceData;
  } catch {
    return null;
  }
}

/**
 * Every book DIRECTORY under the offline root — language-blind, exactly as it sits on disk.
 *
 * This is the sweep/size primitive, NOT the "what is downloaded" answer: a directory routinely
 * holds several languages' files (Story 24.27), and "Delete all downloads"
 * (`lib/offlineTeardown.ts`) needs to find all of them precisely BECAUSE the ones outside the
 * current language are unresolvable to every read path. UI must use {@link getDownloadedBookIds}
 * instead.
 */
export async function listOfflineBookDirs(): Promise<string[]> {
  if (isWeb) return [];
  const dirInfo = await FileSystem.getInfoAsync(OFFLINE_DIR);
  if (!dirInfo.exists) return [];

  return FileSystem.readDirectoryAsync(OFFLINE_DIR);
}

/**
 * Get the list of book IDs that have PLAYABLE offline content in this language (Story 20.6
 * AC-24 — the language-scoped twin of {@link isBookDownloaded}; a directory left behind by a
 * partially-failed language sweep is correctly NOT reported as downloaded).
 *
 * @param language - The language whose downloads count
 * @returns Array of book IDs with at least one resolvable audio file in that language
 */
export async function getDownloadedBookIds(language: string): Promise<string[]> {
  if (isWeb) return [];
  const bookIds = await listOfflineBookDirs();
  const results = await Promise.all(
    bookIds.map(async (bookId) => ((await isBookDownloaded(bookId, language)) ? bookId : null))
  );
  return results.filter((id): id is string => id !== null);
}

// `formatBytes` MOVED to `lib/format.ts` (Story 24.19). It lived here as a `toFixed` plus a
// hardcoded `['B','KB','MB','GB']` table — both halves locale data, both rendered in English under
// French chrome at all seven of its render sites. This module is about the filesystem; RENDERING a
// size for a human is the format module's job, and `lint:i18n` sink (a) now enforces that a
// locale-sensitive formatter appears nowhere else.
