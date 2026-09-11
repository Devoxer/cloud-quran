/**
 * The local-first resolver (story 7-5) — the whole of "a downloaded surah plays from disk with
 * ZERO network calls", in one function.
 *
 * ⚠️ THIS IS THE TEST THE CRITERION EXISTS FOR, which is why the resolver is a named function
 * rather than an `if` inside the engine's playlist builder. The engine's own suite can only
 * observe the URIs the playlist was handed; these three cases observe the RULE.
 *
 * `audioDownloads` is mocked rather than the filesystem: the question here is "which of the two
 * answers wins", and mocking one level down would re-test the disk lookup that
 * `audioDownloads.test.ts` already owns.
 */

const mockLocalSurahUri = jest.fn<string | null, [string, number]>(() => null);

jest.mock('./audioDownloads', () => ({
  localSurahUri: (reciterId: string, surah: number) => mockLocalSurahUri(reciterId, surah),
}));

import { surahAudioUrl } from '@/constants/audio';
import { resolveSurahUri } from './audioSource';

beforeEach(() => {
  jest.clearAllMocks();
  mockLocalSurahUri.mockReturnValue(null);
});

it('prefers the local file when the surah is on disk', () => {
  mockLocalSurahUri.mockReturnValue('file:///documents/audio/husary/018.mp3');
  const uri = resolveSurahUri('husary', 18);

  expect(uri).toBe('file:///documents/audio/husary/018.mp3');
  // The whole promise: nothing about the CDN appears in a downloaded surah's track.
  expect(uri).not.toContain('http');
  expect(uri).not.toContain('cdn.nobleachievements.com');
});

it('falls back to the CDN, silently, when the file is not there', () => {
  expect(resolveSurahUri('husary', 18)).toBe(
    'https://cdn.nobleachievements.com/audio/husary/018.mp3'
  );
});

it('leaves the CDN URL exactly as `surahAudioUrl` builds it', () => {
  // A literal, not a re-derivation: the zero-padding rule is the thing under test, and
  // `toBe(surahAudioUrl(...))` would agree with itself whatever the padding became.
  expect(resolveSurahUri('alafasy', 1)).toBe(
    'https://cdn.nobleachievements.com/audio/alafasy/001.mp3'
  );
  expect(resolveSurahUri('alafasy', 114)).toBe(
    'https://cdn.nobleachievements.com/audio/alafasy/114.mp3'
  );
  // …and it really is the same string the rest of the app streams from.
  expect(resolveSurahUri('alafasy', 1)).toBe(surahAudioUrl('alafasy', 1));
});

it('asks about the surah it was given, per reciter', () => {
  resolveSurahUri('husary', 18);
  expect(mockLocalSurahUri).toHaveBeenCalledWith('husary', 18);
});
