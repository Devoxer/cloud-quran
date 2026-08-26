/**
 * Sharing wrapper (Story 17.9)
 *
 * Thin typed surface over expo-sharing (native share sheet). On Web, sharing is
 * gated on `isAvailable()` — callers must check it before `share()`. Story 5-7 gave it its first
 * consumer: the data export (FR29) is a JSON document the reader has to be able to KEEP, and
 * "hand it to the platform's own save/share sheet" is the only delivery that works without
 * inventing a file browser.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/** Whether the native share sheet is available (false on most web browsers). */
export async function isAvailable(): Promise<boolean> {
  return Sharing.isAvailableAsync();
}

/** Opens the native share sheet for a local file URL. */
export async function share(
  url: string,
  options?: Parameters<typeof Sharing.shareAsync>[1]
): Promise<void> {
  await Sharing.shareAsync(url, options);
}

/**
 * How a document reached the reader, or why it did not.
 *
 * ⚠️ `'unavailable'` IS A REAL OUTCOME, NOT AN ERROR. A device with no share sheet and no writable
 * cache directory is a configuration this app cannot deliver a file on, and the screen has to say
 * so rather than paint a failure that suggests retrying would help.
 */
export type DocumentDelivery = 'shared' | 'downloaded' | 'unavailable';

/**
 * Hand a text document to the reader to keep.
 *
 * ⚠️ TWO MECHANISMS, ONE FUNCTION — the same shape `lib/auth.ts` uses for sign-in. Native writes
 * the file into the CACHE directory and opens the share sheet. Web has neither: `cacheDirectory`
 * is `null` there and `Sharing.isAvailableAsync()` answers false in most browsers, so the
 * browser's own download is the delivery — an object URL and a synthetic click, which is what
 * every "save this file" button on the web is underneath.
 *
 * ⚠️ THE FILE IS DELETED ON EVERY PATH OUT, INCLUDING THE ONE WHERE NOTHING WAS SHARED. `contents`
 * here is the reader's COMPLETE personal data, written to a predictable path — leaving it in the
 * cache means a second copy of everything they asked to be handed, sitting on disk indefinitely,
 * readable by anything with access to the container, for a file the sheet may never even have
 * opened. "The system reclaims it eventually" is not a retention policy. The copy the reader keeps
 * is the one the share sheet produced; this one has no reason to outlive the call.
 *
 * ⚠️ THE DOM IS REACHED THROUGH A CAST, NOT THROUGH `lib.dom`. This workspace's tsconfig has no
 * DOM library (see `redirectCallbackURL` in `lib/auth.ts`, which does the same for `location`), so
 * the alternative to a cast is turning DOM globals on for a react-native app — which would then
 * typecheck `document.querySelector` in a native file.
 */
export async function saveDocument(
  filename: string,
  contents: string,
  mimeType: string
): Promise<DocumentDelivery> {
  if (Platform.OS === 'web') return downloadInBrowser(filename, contents, mimeType);

  // `cacheDirectory` is null on any platform without a filesystem. Refuse rather than write to
  // `nullsomething.json`, which succeeds at producing a path and fails at everything after it.
  const directory = FileSystem.cacheDirectory;
  if (!directory) return 'unavailable';
  const uri = `${directory}${filename}`;
  try {
    await FileSystem.writeAsStringAsync(uri, contents);
  } catch (error) {
    // ⚠️ A FAILED WRITE CAN STILL HAVE CREATED A FILE. `writeAsStringAsync` is not atomic — a full
    // disk or a revoked container leaves a TRUNCATED copy of the reader's complete personal data
    // at a predictable path, and the `finally` below never runs because the share was never
    // attempted. The caller sees the same error either way; what changes is whether a partial
    // export is left on disk for the lifetime of the app.
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    throw error;
  }
  try {
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    // `UTI` is iOS's own type identifier and is what decides which apps offer to open the file;
    // `mimeType` is the Android half. Both are needed, and neither is user-facing copy.
    // `shareAsync` resolves once the sheet is dismissed, so the hand-off is complete by the time
    // the `finally` below runs.
    await Sharing.shareAsync(uri, { mimeType, UTI: 'public.json' });
    return 'shared';
  } finally {
    // Best-effort, and deliberately not awaited into the result: the reader's copy is already made
    // and a cleanup that fails must not turn a completed share into an error.
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}

type BrowserAnchor = { href: string; download: string; style: { display: string }; click(): void };
type BrowserGlobals = {
  URL?: { createObjectURL(blob: unknown): string; revokeObjectURL(url: string): void };
  Blob?: new (parts: string[], options: { type: string }) => unknown;
  document?: {
    createElement(tag: string): BrowserAnchor;
    body?: { appendChild(node: unknown): void; removeChild(node: unknown): void };
  };
};

/** How long to leave the object URL alive after the click. See the note in `downloadInBrowser`. */
const OBJECT_URL_TTL_MS = 60_000;

/**
 * ⚠️ TWO MECHANICS HERE ARE LOAD-BEARING AND BOTH WERE WRONG IN THE FIRST DRAFT, IN A WAY NO TEST
 * WITH A MOCKED `document` CAN SEE.
 *
 *   • **The anchor must be IN the document.** Firefox ignores `click()` on a detached element, so
 *     a download built the "clean" way — create, set, click, never append — silently does nothing
 *     there. Appended hidden, clicked, removed.
 *   • **The object URL must NOT be revoked synchronously.** `click()` only SCHEDULES the download;
 *     Safari and Firefox fetch the blob afterwards, and revoking in a `finally` can cancel the
 *     transfer mid-handover. A timer outlives the hand-off, and an unrevoked URL pins the document
 *     in memory only until the page unloads — the smaller of the two failures by a distance.
 */
function downloadInBrowser(filename: string, contents: string, mimeType: string): DocumentDelivery {
  const g = globalThis as unknown as BrowserGlobals;
  if (!g.Blob || !g.URL || !g.document) return 'unavailable';
  const url = g.URL.createObjectURL(new g.Blob([contents], { type: mimeType }));
  // Captured now rather than looked up when the timer fires: the deferred revoke must not depend
  // on `globalThis.URL` still being the same object a minute later.
  const revoke = g.URL.revokeObjectURL.bind(g.URL);
  const anchor = g.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  g.document.body?.appendChild(anchor);
  try {
    anchor.click();
    return 'downloaded';
  } finally {
    g.document.body?.removeChild(anchor);
    setTimeout(() => revoke(url), OBJECT_URL_TTL_MS);
  }
}
