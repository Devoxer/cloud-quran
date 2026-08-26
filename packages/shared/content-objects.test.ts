// Story 32.2 — the shared key/row derivation is the security hinge: these tests pin the
// non-derivability invariant (AC-7) and the kind-in-sourceKey disambiguation. If either drifts,
// a key becomes guessable or the bijection collapses two rows into one.
// (Story 24.30 deleted the pool subscheme along with the pre-built quiz pool itself; story 5-2
// deleted the tier stamp along with the premium tier.)
import { describe, expect, it } from 'vitest';
import {
  buildContentObjectRow,
  deriveSourceKey,
  keyLeaksIdentity,
  type ObjectIdentity,
  randomOpaqueKey,
} from './content-objects.js';

describe('randomOpaqueKey', () => {
  it('mints a ≥128-bit key (64 hex chars) that is unique across calls and carries no identity', () => {
    const keys = new Set(Array.from({ length: 500 }, () => randomOpaqueKey()));
    expect(keys.size).toBe(500); // no collisions
    for (const k of keys) expect(k).toMatch(/^[0-9a-f]{64}$/); // 32 bytes = 256 bits ≥ 128
  });
});

describe('deriveSourceKey — kind disambiguates the natural key', () => {
  it('audio and blocks of the SAME (book,section,voice,lang) get DISTINCT sourceKeys', () => {
    const base = {
      bookId: 'b1',
      sectionType: 'summaryCore',
      voiceId: 'af_heart',
      language: 'en',
    } as const;
    const audio = deriveSourceKey({ ...base, kind: 'audio' });
    const blocks = deriveSourceKey({ ...base, kind: 'blocks' });
    expect(audio).not.toBe(blocks);
    expect(audio).toBe('b1:summaryCore:audio:af_heart:en');
    expect(blocks).toBe('b1:summaryCore:blocks:af_heart:en');
  });
  it('a voiceless text object uses the "-" voice sentinel', () => {
    expect(
      deriveSourceKey({ bookId: 'b1', sectionType: 'faq', kind: 'text', language: 'en' })
    ).toBe('b1:faq:text:-:en');
  });
});

describe('keyLeaksIdentity — the AC-7 non-derivability invariant', () => {
  // Realistic corpus identity: a UUID bookId (hyphens), an underscored voiceId, a word-cased
  // section, language 'en' (contains non-hex 'n') — NONE of these substrings can occur in a
  // 64-char lowercase-hex random key, which is exactly why the opaque scheme is non-derivable.
  const id: ObjectIdentity = {
    bookId: '0c59fcd7-6495-4145-824d-36794bd592a5',
    sectionType: 'summaryCore',
    kind: 'audio',
    voiceId: 'af_heart',
    language: 'en',
  };
  it('a random opaque key does NOT contain any identity substring (over 500 keys)', () => {
    for (let i = 0; i < 500; i++) expect(keyLeaksIdentity(randomOpaqueKey(), id)).toBe(false);
  });
  it('a legacy deterministic key DOES leak identity (guards the test itself)', () => {
    expect(keyLeaksIdentity(`audio/${id.bookId}/${id.voiceId}/${id.sectionType}.mp3`, id)).toBe(
      true
    );
  });
});

describe('buildContentObjectRow', () => {
  it('builds a book/section row with a derived sourceKey and passes through the minted key', () => {
    const bookId = '0c59fcd7-6495-4145-824d-36794bd592a5';
    const r2Key = randomOpaqueKey();
    const identity = {
      bookId,
      sectionType: 'summaryBrief',
      kind: 'audio',
      voiceId: 'af_heart',
      language: 'en',
    } as const;
    const row = buildContentObjectRow({
      identity,
      r2Key,
      contentType: 'audio/mpeg',
      ext: 'mp3',
      byteLength: 12345,
      durationMs: 60000,
    });
    expect(row).toMatchObject({
      bookId,
      kind: 'audio',
      r2Key,
      ext: 'mp3',
      byteLength: 12345,
      durationMs: 60000,
      revision: 1,
      sourceKey: `${bookId}:summaryBrief:audio:af_heart:en`,
    });
    expect(keyLeaksIdentity(row.r2Key, identity)).toBe(false);
  });
  it('a text object omits voiceId', () => {
    const text = buildContentObjectRow({
      identity: { bookId: 'b1', sectionType: 'faq', kind: 'text', language: 'en' },
      r2Key: randomOpaqueKey(),
      contentType: 'application/json',
      ext: 'json',
      byteLength: 10,
    });
    expect(text.voiceId).toBeUndefined();
  });

  // story 5-2: the row carried a `tier` ('free' | 'premium') stamped from the section, and the
  // vendor's RLS gate read it. There is no premium tier, so a row that grew one back would be a
  // monetization concept returning by accident.
  it('stamps no tier on the row', () => {
    const row = buildContentObjectRow({
      identity: { bookId: 'b1', sectionType: 'faq', kind: 'text', language: 'en' },
      r2Key: randomOpaqueKey(),
      contentType: 'application/json',
      ext: 'json',
      byteLength: 10,
    });
    expect(row).not.toHaveProperty('tier');
  });
});
