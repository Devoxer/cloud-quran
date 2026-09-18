/**
 * The catalogue, and the ways it is allowed to fail (story 8-2).
 *
 * The frozen matrix says an unreachable or malformed catalogue degrades to "installed only" and
 * NEVER to an error screen, so every case here asserts a VALUE rather than a rejection. The
 * mutation it exists to catch is the obvious one: a `throw` (or an unchecked `response.json()`)
 * added anywhere on this path turns an offline launch of the content screen into a crash.
 *
 * It also pins the host check. A catalogue is a remote document; if it could name any host, one
 * mistaken entry would send a reader's fetch to a third party that then learns what they study.
 */

import { PACK_CATALOGUE_URL } from '@/constants/packs';
import { fetchCatalogue, parseCatalogue, parseCataloguePack } from './catalogue';

const VALID = {
  id: 'translation-fr-rashid',
  packVersion: 1,
  type: 'translation',
  language: 'fr',
  languageName: 'Français',
  title: 'Le Noble Coran — Rachid Maach',
  source: 'QuranEnc',
  sourceVersion: '1.0.3',
  licenceId: 'quranenc-republication',
  attribution: 'Traduction française : Rachid Maach. Source : QuranEnc.com (v1.0.3).',
  url: 'https://cdn.nobleachievements.com/packs/translation-fr-rashid-v1.db',
  bytes: 1_425_408,
  rows: 6236,
  digest: '142dedef190bb94180bbbba6f78f86d70077396732d9df130bf27505a3b4b37c',
};

describe('parsing one entry', () => {
  it('accepts a complete entry unchanged', () => {
    expect(parseCataloguePack(VALID)).toEqual(VALID);
  });

  it.each([
    ['no digest — nothing could verify the download', { digest: '' }],
    ['no row count — the half of the check a digest cannot do', { rows: 0 }],
    ['no size', { bytes: 0 }],
    ['no licence id', { licenceId: '' }],
    ['no attribution — the grant requires one', { attribution: '' }],
    ['a fractional pack version', { packVersion: 1.5 }],
  ])('refuses an entry with %s', (_label, patch) => {
    expect(parseCataloguePack({ ...VALID, ...patch })).toBeNull();
  });

  it("refuses an entry served from anywhere but the app's own CDN", () => {
    expect(
      parseCataloguePack({ ...VALID, url: 'https://cdn.jsdelivr.net/packs/fr.db' })
    ).toBeNull();
    // Not even a lookalike prefix: the check is on the exact base plus a separator.
    expect(
      parseCataloguePack({ ...VALID, url: 'https://cdn.nobleachievements.com.evil/packs/fr.db' })
    ).toBeNull();
  });
});

describe('parsing a catalogue', () => {
  it('keeps the good entries and drops only the bad one', () => {
    const parsed = parseCatalogue({ catalogueVersion: 1, packs: [VALID, { id: 'broken' }] });
    expect(parsed).toEqual([VALID]);
  });

  it('answers `null` for a body that is not a catalogue at all', () => {
    expect(parseCatalogue(null)).toBeNull();
    expect(parseCatalogue({})).toBeNull();
    expect(parseCatalogue('<html>error</html>')).toBeNull();
    // A `packs` array with no version is not a catalogue this build understands.
    expect(parseCatalogue({ packs: [VALID] })).toBeNull();
  });

  it('refuses a catalogue from a FUTURE format rather than half-reading it', () => {
    // ⚠️ A version field nobody reads is decoration. Refusing an unknown one is what lets the
    // format change at all: an older build degrades to installed-only instead of guessing.
    expect(parseCatalogue({ catalogueVersion: 2, packs: [VALID] })).toBeNull();
  });

  it('answers an empty array for a catalogue that genuinely offers nothing', () => {
    // ⚠️ `[]` and `null` are DIFFERENT answers here: "nothing on offer" is a shelf, "could not
    // say" is a network state, and the screen renders them differently.
    expect(parseCatalogue({ catalogueVersion: 1, packs: [] })).toEqual([]);
  });
});

describe('fetching', () => {
  const originalFetch = global.fetch;
  /** Every url the module asked for — a literal assertion, never a mock-call index. */
  const requested: string[] = [];
  afterEach(() => {
    global.fetch = originalFetch;
    requested.length = 0;
  });

  it('reads the catalogue from the CDN', async () => {
    const mockFetch = jest.fn((url: string) => {
      requested.push(url);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ catalogueVersion: 1, packs: [VALID] }),
      });
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(fetchCatalogue()).resolves.toEqual([VALID]);
    expect(requested).toEqual([PACK_CATALOGUE_URL]);
    expect(PACK_CATALOGUE_URL).toBe('https://cdn.nobleachievements.com/packs/index.json');
  });

  it('answers `null` when the network refuses, rather than throwing', async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new Error('Network request failed'))
    ) as unknown as typeof fetch;

    await expect(fetchCatalogue()).resolves.toBeNull();
  });

  it('answers `null` on an HTTP error, so a 404 is not an error screen', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
    ) as unknown as typeof fetch;

    await expect(fetchCatalogue()).resolves.toBeNull();
  });

  it('answers `null` on a 200 whose body is not JSON — the jsDelivr failure shape', async () => {
    // A host can answer HTTP 200 with a plain-text error body. Nothing may treat that as data.
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('Unexpected token')) })
    ) as unknown as typeof fetch;

    await expect(fetchCatalogue()).resolves.toBeNull();
  });
});
