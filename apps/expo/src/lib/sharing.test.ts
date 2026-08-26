/**
 * `saveDocument` — the delivery half of the data export (story 5-7, FR29).
 *
 * ⚠️ IT IS TESTED SEPARATELY FROM `exportMyData` ON PURPOSE. `lib/sync.ts` owns the fetch and the
 * serialization (rule 7 makes it the only module allowed to reach the worker) and mocks this
 * module, so these cases are the only place the FILE and the SHARE SHEET are asserted. Without
 * them, "the reader receives their data" would be proven only up to a function call.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { saveDocument } from './sharing';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock/cache/',
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
}));

const writeAsStringAsync = FileSystem.writeAsStringAsync as jest.Mock;
const deleteAsync = FileSystem.deleteAsync as jest.Mock;
const shareAsync = Sharing.shareAsync as jest.Mock;
const isAvailableAsync = Sharing.isAvailableAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  isAvailableAsync.mockResolvedValue(true);
});

describe('saveDocument on native', () => {
  it('writes the document to the cache directory and opens the share sheet', async () => {
    await expect(saveDocument('export.json', '{"a":1}', 'application/json')).resolves.toBe(
      'shared'
    );

    expect(writeAsStringAsync).toHaveBeenCalledWith('file:///mock/cache/export.json', '{"a":1}');
    // ⚠️ THE CACHE DIRECTORY, NOT THE DOCUMENT DIRECTORY. The copy the reader keeps is the one the
    // share sheet produced; leaving a second permanent copy of their entire personal data on disk,
    // outside any lifecycle, is the opposite of what this feature is for. The system reclaims it.
    const [uri, options] = shareAsync.mock.calls[0];
    expect(uri).toBe('file:///mock/cache/export.json');
    // Both type identifiers: `UTI` is what iOS uses to decide which apps may open the file,
    // `mimeType` is the Android half. One without the other narrows the sheet on one platform.
    expect(options).toEqual({ mimeType: 'application/json', UTI: 'public.json' });
  });

  it('DELETES the file once the sheet is done — it is the reader entire personal data', async () => {
    // ⚠️ NOT HOUSEKEEPING. `contents` is everything this project holds about someone, written to a
    // predictable cache path; leaving it there is a second copy of the export sitting on disk
    // indefinitely, readable by anything with access to the container. `shareAsync` resolves once
    // the sheet is dismissed, so the copy the reader keeps is already made.
    await saveDocument('export.json', '{"a":1}', 'application/json');
    expect(deleteAsync).toHaveBeenCalledWith('file:///mock/cache/export.json', {
      idempotent: true,
    });
  });

  it('deletes it on the UNAVAILABLE path too, where the sheet never opened', async () => {
    // The branch that is easiest to forget and worst to leave: the file was written, nothing was
    // shared, and without this it stays behind for a delivery that never happened.
    isAvailableAsync.mockResolvedValue(false);
    await saveDocument('export.json', '{}', 'application/json');
    expect(deleteAsync).toHaveBeenCalled();
  });

  it('deletes the PARTIAL file when the write itself fails', async () => {
    // ⚠️ THE PATH WHERE THE `finally` NEVER RUNS. `writeAsStringAsync` is not atomic: a full disk
    // or a revoked container can leave a TRUNCATED copy of the reader's complete personal data at
    // a predictable path, and the share is never attempted, so nothing downstream cleans it up.
    // The caller sees the same error either way; what changes is what is left on disk.
    writeAsStringAsync.mockRejectedValueOnce(new Error('no space left on device'));

    await expect(saveDocument('export.json', '{}', 'application/json')).rejects.toThrow(
      /no space left/
    );

    expect(deleteAsync).toHaveBeenCalledWith('file:///mock/cache/export.json', {
      idempotent: true,
    });
    // And nothing was handed to the sheet — there is no document to hand over.
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it('does NOT turn a cleanup failure into a failed export', async () => {
    // The reader's copy is already made. A cleanup that throws must not surface as "the export
    // did not work" — the one thing worse than a stale file is a false failure.
    deleteAsync.mockRejectedValueOnce(new Error('busy'));
    await expect(saveDocument('export.json', '{}', 'application/json')).resolves.toBe('shared');
  });

  it('reports `unavailable` — not a failure — when the platform has no share sheet', async () => {
    // Retrying does nothing here, so the screen says what happened rather than inviting a re-tap.
    isAvailableAsync.mockResolvedValue(false);
    await expect(saveDocument('export.json', '{}', 'application/json')).resolves.toBe(
      'unavailable'
    );
    // The file was still written before the check — harmless, and it keeps the two concerns from
    // needing to know about each other.
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it('refuses rather than writing to a null directory', async () => {
    // `cacheDirectory` is null on any platform with no filesystem. Concatenating it produces the
    // path `nullexport.json`, which succeeds at being a string and fails at everything after.
    const legacy = FileSystem as unknown as { cacheDirectory: string | null };
    const original = legacy.cacheDirectory;
    legacy.cacheDirectory = null;
    try {
      await expect(saveDocument('export.json', '{}', 'application/json')).resolves.toBe(
        'unavailable'
      );
      expect(writeAsStringAsync).not.toHaveBeenCalled();
    } finally {
      legacy.cacheDirectory = original;
    }
  });
});

describe('saveDocument on web', () => {
  // The browser has neither a cache directory nor a share sheet, so the delivery is the browser's
  // own download: an object URL and a synthetic click, which is what every "save this file" button
  // on the web is underneath.
  const originalOS = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  /** Stand a minimal DOM up on `globalThis`, and take it down again whatever the case does. */
  function withBrowserGlobals(run: () => Promise<void> | void) {
    const anchor = { href: '', download: '', style: { display: '' }, click: jest.fn() };
    const appendChild = jest.fn();
    const removeChild = jest.fn();
    const createObjectURL = jest.fn(() => 'blob:mock');
    const revokeObjectURL = jest.fn();
    const g = globalThis as unknown as Record<string, unknown>;
    const saved = { URL: g.URL, Blob: g.Blob, document: g.document };
    g.URL = { createObjectURL, revokeObjectURL };
    g.Blob = function Blob() {} as unknown;
    g.document = { createElement: () => anchor, body: { appendChild, removeChild } };
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    return {
      anchor,
      appendChild,
      removeChild,
      revokeObjectURL,
      finish: async () => {
        try {
          await run();
        } finally {
          Object.assign(g, saved);
        }
      },
    };
  }

  it('hands the document to the browser download', async () => {
    const dom = withBrowserGlobals(async () => {
      await expect(saveDocument('export.json', '{"a":1}', 'application/json')).resolves.toBe(
        'downloaded'
      );
    });
    await dom.finish();
    expect(dom.anchor.download).toBe('export.json');
    expect(dom.anchor.href).toBe('blob:mock');
    expect(dom.anchor.click).toHaveBeenCalled();
    // Never the native path — `writeAsStringAsync` would throw against a null directory.
    expect(writeAsStringAsync).not.toHaveBeenCalled();
  });

  it('APPENDS the anchor to the document and removes it — Firefox ignores a detached click', async () => {
    // ⚠️ THE "CLEAN" VERSION OF THIS CODE (create, set, click, never append) SILENTLY DOWNLOADS
    // NOTHING IN FIREFOX. Neither a mocked DOM nor a Chromium smoke can see that, so the mechanic
    // is asserted directly: appended before the click, removed after it.
    const dom = withBrowserGlobals(async () => {
      await saveDocument('export.json', '{}', 'application/json');
    });
    await dom.finish();
    expect(dom.appendChild).toHaveBeenCalledWith(dom.anchor);
    expect(dom.removeChild).toHaveBeenCalledWith(dom.anchor);
    expect(dom.anchor.style.display).toBe('none');
  });

  it('does NOT revoke the object URL synchronously — that cancels the download', async () => {
    // ⚠️ `click()` only SCHEDULES the transfer; Safari and Firefox fetch the blob afterwards, so
    // revoking in a `finally` can cancel it mid-handover. The revoke is on a timer instead, which
    // is why an un-revoked URL (pinned only until the page unloads) is the smaller failure.
    jest.useFakeTimers();
    try {
      let revokedBeforeTimers = true;
      const dom = withBrowserGlobals(async () => {
        await saveDocument('export.json', '{}', 'application/json');
        revokedBeforeTimers = (dom.revokeObjectURL as jest.Mock).mock.calls.length > 0;
        jest.runAllTimers();
      });
      await dom.finish();
      expect(revokedBeforeTimers).toBe(false);
      expect(dom.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    } finally {
      jest.useRealTimers();
    }
  });
});
