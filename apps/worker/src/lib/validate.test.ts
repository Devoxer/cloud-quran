/**
 * Bounds the retired vendor schema documented in comments and never enforced. A `fontSize` of
 * 4000 or a `speedRate` of 50 was accepted by the old layer; the point of validating in the
 * worker is that there is now exactly one place a bad value can enter.
 */
import { describe, expect, it } from 'vitest';
import {
  parseAudioPosition,
  parseBookmark,
  parsePreferences,
  parseReadingPosition,
} from './validate';

const position = { surah: 2, verse: 255, page: 42, mode: 'reading', updatedAt: 1_700_000_000_000 };
const prefs = {
  theme: 'sepia',
  fontSize: 28,
  reciterId: 'alafasy',
  readingMode: 'mushaf',
  translationId: null,
  speedRate: 1.25,
  transliteration: false,
  updatedAt: 1_700_000_000_000,
};

describe('parseReadingPosition', () => {
  it('accepts the valid shape', () => {
    expect(parseReadingPosition(position).ok).toBe(true);
  });

  it('rejects a surah outside 1-114, a page outside 1-604, and an unknown mode', () => {
    expect(parseReadingPosition({ ...position, surah: 115 }).ok).toBe(false);
    expect(parseReadingPosition({ ...position, surah: 0 }).ok).toBe(false);
    expect(parseReadingPosition({ ...position, page: 605 }).ok).toBe(false);
    // 'verse' was story 4-0's default and is not one of this app's two modes.
    expect(parseReadingPosition({ ...position, mode: 'verse' }).ok).toBe(false);
  });

  it('rejects a non-integer, zero or absurd-future updatedAt', () => {
    expect(parseReadingPosition({ ...position, updatedAt: 0 }).ok).toBe(false);
    expect(parseReadingPosition({ ...position, updatedAt: 1.5 }).ok).toBe(false);
    // A clock skewed far into the future would pin the LWW row forever.
    expect(parseReadingPosition({ ...position, updatedAt: 9e15 }).ok).toBe(false);
  });

  it('rejects non-objects', () => {
    for (const body of [null, undefined, 3, 'x', []]) {
      expect(parseReadingPosition(body).ok).toBe(false);
    }
  });
});

describe('parsePreferences', () => {
  it('accepts the valid shape and normalises a missing translationId to null', () => {
    const { translationId: _omitted, ...withoutTranslation } = prefs;
    const parsed = parsePreferences(withoutTranslation);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.translationId).toBeNull();
  });

  it('enforces fontSize 20-44 and speedRate 0.5-2.0', () => {
    expect(parsePreferences({ ...prefs, fontSize: 19 }).ok).toBe(false);
    expect(parsePreferences({ ...prefs, fontSize: 45 }).ok).toBe(false);
    expect(parsePreferences({ ...prefs, fontSize: 4000 }).ok).toBe(false);
    expect(parsePreferences({ ...prefs, speedRate: 0.4 }).ok).toBe(false);
    expect(parsePreferences({ ...prefs, speedRate: 2.1 }).ok).toBe(false);
  });

  it('rejects an unknown theme and a non-boolean transliteration', () => {
    expect(parsePreferences({ ...prefs, theme: 'midnight' }).ok).toBe(false);
    expect(parsePreferences({ ...prefs, transliteration: 'yes' }).ok).toBe(false);
  });

  it('requires updatedAt — the field without which LWW is not LWW', () => {
    const { updatedAt: _dropped, ...withoutTimestamp } = prefs;
    expect(parsePreferences(withoutTimestamp).ok).toBe(false);
  });
});

describe('parseAudioPosition / parseBookmark', () => {
  it('audio position needs a reciterId', () => {
    expect(parseAudioPosition({ surah: 1, verse: 1, reciterId: 'a', updatedAt: 1 }).ok).toBe(true);
    expect(parseAudioPosition({ surah: 1, verse: 1, reciterId: '', updatedAt: 1 }).ok).toBe(false);
  });

  it('bookmark label is optional but bounded; id is required', () => {
    expect(parseBookmark({ id: 'b1', surah: 1, verse: 1, createdAt: 1 }).ok).toBe(true);
    expect(
      parseBookmark({ id: 'b1', surah: 1, verse: 1, label: 'x'.repeat(201), createdAt: 1 }).ok
    ).toBe(false);
    expect(parseBookmark({ surah: 1, verse: 1, createdAt: 1 }).ok).toBe(false);
  });
});
