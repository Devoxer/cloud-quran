/**
 * Block-sidecar resolver tests (Story 22.9; signed-URL gated as of 22.3; text/blocks SPLIT
 * as of 22.12).
 *
 * Focus: `loadSectionBlocks` (per-voice blocks) + `loadSectionText` (voice-independent
 * text) — the PLAYBACK/viewer resolvers that read the SIGNED R2 sidecar first and fall back
 * to the on-disk offline cache. The fallback is the 22.2-regression guard: a cold offline
 * start has no signed URL and can't reach R2, so the cached `OfflineContent` persisted at
 * download time keeps text + block highlighting working (STACK-CHEAT-SHEET § InstantDB
 * "Moving data OFF a row… DROPS the offline cache").
 */

import type { BlockRange } from '@cloudquran/shared';

const mockLoadOfflineText = jest.fn();
const mockLoadOfflineVoiceData = jest.fn();
jest.mock('./storage', () => ({
  loadOfflineText: (...args: unknown[]) => mockLoadOfflineText(...args),
  loadOfflineVoiceData: (...args: unknown[]) => mockLoadOfflineVoiceData(...args),
}));

const VOICE = 'en_f';
/** Story 20.6: offline reads are keyed by LANGUAGE as well as voice — a `_fr_` file must never
 *  answer an `en` read (AC-12/AC-17), so every loader below takes and forwards it. */
const LANG = 'en';

import { fetchBlockSidecarFromUrl, loadSectionBlocks, loadSectionText } from './blockSidecar';

global.fetch = jest.fn();

const SIGNED_URL =
  'https://acct.r2.cloudflarestorage.com/bucket/content/book-1/summaryCore.json?X-Amz-Signature=abc';
const RANGES: BlockRange[] = [
  { startMs: 0, endMs: 500 },
  { startMs: 500, endMs: 1200 },
];

beforeEach(() => {
  (global.fetch as jest.Mock).mockReset();
  mockLoadOfflineText.mockReset();
  mockLoadOfflineVoiceData.mockReset();
});

describe('fetchBlockSidecarFromUrl', () => {
  it('returns the validated block ranges on a successful fetch', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ blocks: RANGES }),
    });
    await expect(fetchBlockSidecarFromUrl(SIGNED_URL)).resolves.toEqual(RANGES);
    expect(global.fetch).toHaveBeenCalledWith(SIGNED_URL);
  });

  it('returns [] for an empty/undefined URL (no fetch)', async () => {
    await expect(fetchBlockSidecarFromUrl(null)).resolves.toEqual([]);
    await expect(fetchBlockSidecarFromUrl('')).resolves.toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns [] on a network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    await expect(fetchBlockSidecarFromUrl(SIGNED_URL)).resolves.toEqual([]);
  });

  it('returns [] on a non-ok response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    await expect(fetchBlockSidecarFromUrl(SIGNED_URL)).resolves.toEqual([]);
  });

  it('returns [] on a malformed (schema-invalid) body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sentences: RANGES }), // wrong shape — corrupted/legacy sidecar
    });
    await expect(fetchBlockSidecarFromUrl(SIGNED_URL)).resolves.toEqual([]);
  });
});

describe('loadSectionBlocks (per-voice — Story 22.12)', () => {
  it('uses the signed sidecar when it has ranges (no offline read)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ blocks: RANGES }),
    });
    await expect(
      loadSectionBlocks(SIGNED_URL, 'book-1', 'summaryCore', LANG, VOICE)
    ).resolves.toEqual(RANGES);
    expect(mockLoadOfflineVoiceData).not.toHaveBeenCalled();
  });

  it('falls back to the PER-VOICE offline data when the signed fetch yields [] (cold offline)', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    mockLoadOfflineVoiceData.mockResolvedValue({ blocks: RANGES });
    await expect(
      loadSectionBlocks(SIGNED_URL, 'book-1', 'summaryCore', LANG, VOICE)
    ).resolves.toEqual(RANGES);
    expect(mockLoadOfflineVoiceData).toHaveBeenCalledWith('book-1', 'summaryCore', LANG, VOICE);
  });

  it('reads the per-voice offline data directly when there is NO signed URL (no fetch)', async () => {
    mockLoadOfflineVoiceData.mockResolvedValue({ blocks: RANGES });
    await expect(loadSectionBlocks(null, 'book-1', 'summaryCore', LANG, VOICE)).resolves.toEqual(
      RANGES
    );
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockLoadOfflineVoiceData).toHaveBeenCalledWith('book-1', 'summaryCore', LANG, VOICE);
  });

  it('returns [] when both the signed fetch and the offline cache are empty', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    mockLoadOfflineVoiceData.mockResolvedValue(null);
    await expect(
      loadSectionBlocks(SIGNED_URL, 'book-1', 'summaryCore', LANG, VOICE)
    ).resolves.toEqual([]);
  });

  it('returns [] when the per-voice offline data has no blocks', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    mockLoadOfflineVoiceData.mockResolvedValue({ blocks: [] });
    await expect(
      loadSectionBlocks(SIGNED_URL, 'book-1', 'summaryCore', LANG, VOICE)
    ).resolves.toEqual([]);
  });

  it('returns [] when the offline read throws', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    mockLoadOfflineVoiceData.mockRejectedValue(new Error('fs error'));
    await expect(
      loadSectionBlocks(SIGNED_URL, 'book-1', 'summaryCore', LANG, VOICE)
    ).resolves.toEqual([]);
  });
});

describe('loadSectionText (Story 22.12 split — voice-independent text)', () => {
  const TEXT_URL =
    'https://acct.r2.cloudflarestorage.com/bucket/content/book-1/summaryCore.json?X-Amz-Signature=abc';

  it('uses the signed content sidecar text when present (no offline read)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'the section text', blocks: [] }),
    });
    await expect(loadSectionText(TEXT_URL, 'book-1', 'summaryCore', LANG)).resolves.toBe(
      'the section text'
    );
    expect(mockLoadOfflineText).not.toHaveBeenCalled();
  });

  it('falls back to the offline text when the remote has no content (cold offline)', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    mockLoadOfflineText.mockResolvedValue({ text: 'offline text', blocks: [] });
    await expect(loadSectionText(TEXT_URL, 'book-1', 'summaryCore', LANG)).resolves.toBe(
      'offline text'
    );
    expect(mockLoadOfflineText).toHaveBeenCalledWith('book-1', 'summaryCore', LANG);
  });

  it('reads the offline text directly when there is NO signed URL (no fetch)', async () => {
    mockLoadOfflineText.mockResolvedValue({ text: 'offline text', blocks: [] });
    await expect(loadSectionText(null, 'book-1', 'summaryCore', LANG)).resolves.toBe(
      'offline text'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns undefined when neither remote nor offline has text', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ blocks: [] }) });
    mockLoadOfflineText.mockResolvedValue(null);
    await expect(loadSectionText(TEXT_URL, 'book-1', 'summaryCore', LANG)).resolves.toBeUndefined();
  });
});
