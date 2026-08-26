/**
 * Story 24.35 — the shared `audioFiles` row pick.
 *
 * The chain under test: rows OF THE LANGUAGE → preferred voice → that language's default voice →
 * any row of the language. Every case here reds against the pre-24.35 first-row-wins read the Feed
 * used, or against a chain missing the arm it names.
 */

import { pickAudioHintRow } from './audioHint';

interface Row {
  language?: string;
  voiceId?: string;
  durationMs: number;
}

// Two orderings are load-bearing here, and neither is incidental:
//  • `fr` FIRST — under a first-row-wins read (what the Feed did before this story) the French row
//    is what comes back, so a cross-language case can actually fail.
//  • `en_m` BEFORE `en_f` — `en_f` is English's DEFAULT voice, so with it first the "default voice"
//    arm and the "any row of the language" arm return the same row and neither can be told from
//    the other. Reversed, dropping the default-voice arm reds.
const ROWS: Row[] = [
  { language: 'fr', voiceId: 'fr_f', durationMs: 900 },
  { language: 'en', voiceId: 'en_m', durationMs: 200 },
  { language: 'en', voiceId: 'en_f', durationMs: 100 },
];

describe('pickAudioHintRow', () => {
  it('returns the row for the requested language AND voice', () => {
    expect(pickAudioHintRow(ROWS, 'en', 'en_m')?.durationMs).toBe(200);
    expect(pickAudioHintRow(ROWS, 'fr', 'fr_f')?.durationMs).toBe(900);
  });

  it("falls back to the LANGUAGE's default voice, never another language's row", () => {
    // `en`'s default is `en_f` — not the `fr_f` row that sits first in the array, and not the
    // `en_m` row that is merely the first ENGLISH one.
    expect(pickAudioHintRow(ROWS, 'en', 'no_such_voice')?.durationMs).toBe(100);
    // `fr_m` is registered but not rolled out, so no row carries it; `fr`'s default is `fr_f`.
    expect(pickAudioHintRow(ROWS, 'fr', 'fr_m')?.durationMs).toBe(900);
  });

  it('falls back to ANY row of the language when neither voice matches', () => {
    const rows: Row[] = [
      { language: 'fr', voiceId: 'fr_f', durationMs: 900 },
      { language: 'en', voiceId: 'legacy_voice', durationMs: 300 },
    ];
    expect(pickAudioHintRow(rows, 'en', 'en_m')?.durationMs).toBe(300);
  });

  it('returns undefined when the language has no row — it never crosses languages', () => {
    expect(pickAudioHintRow(ROWS, 'de', 'de_f')).toBeUndefined();
    expect(
      pickAudioHintRow([{ language: 'fr', voiceId: 'fr_f', durationMs: 900 }], 'en', 'en_f')
    ).toBeUndefined();
  });

  it('treats a row with no `language` as the base language', () => {
    const rows: Row[] = [
      { language: 'fr', voiceId: 'fr_f', durationMs: 900 },
      { voiceId: 'en_f', durationMs: 400 },
    ];
    expect(pickAudioHintRow(rows, 'en', 'en_f')?.durationMs).toBe(400);
    // …and it is NOT a candidate for a non-base language.
    expect(pickAudioHintRow([{ voiceId: 'en_f', durationMs: 400 }], 'fr', 'fr_f')).toBeUndefined();
  });

  it('treats an EMPTY-STRING `language` as the base language too', () => {
    // The column is `.optional()`, so `''` is representable. Under `??` it would match no
    // language at all and the row would be invisible to every reader.
    const rows: Row[] = [{ language: '', voiceId: 'en_f', durationMs: 400 }];
    expect(pickAudioHintRow(rows, 'en', 'en_f')?.durationMs).toBe(400);
    expect(pickAudioHintRow(rows, 'fr', 'fr_f')).toBeUndefined();
  });

  it('accepts an empty or absent candidate set', () => {
    expect(pickAudioHintRow([], 'en', 'en_f')).toBeUndefined();
    expect(pickAudioHintRow(undefined, 'en', 'en_f')).toBeUndefined();
  });
});
