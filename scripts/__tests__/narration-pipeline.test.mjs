/**
 * Self-test for the narration half of `scripts/prepare-audio.ts` and the QuranEnc helpers it and
 * `prepare-packs.ts` share (story 8-4).
 *
 * ⚠️ THE COMPLETENESS REFUSAL IS THE PROPERTY UNDER TEST. A narration is published only when all
 * 6,236 source ayat fetch AND decode; one missing ayah refuses the whole edition and NAMES it. That
 * is a control-flow property — one inverted comparison and the pipeline publishes a voice with a
 * hole in it, with typecheck and Biome both green — so the pure gate is asserted here with literal
 * expectations, including the `abdulkareem` shape (a file present but undecodable, measured 0).
 */

import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { missingAyat } from '../prepare-audio.ts';
import {
  assertPinned,
  attributionOf,
  LANGUAGE_NAMES,
  LANGUAGE_NAMES_ENGLISH,
  languageNameOf,
  packIdOf,
} from '../quranenc.ts';

/** Every ayah of the book with a positive measured duration. */
function completeDurations() {
  const counts = [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
    112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89,
    59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30,
    52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15,
    21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
  ];
  const durations = new Map();
  counts.forEach((count, i) => {
    for (let verse = 1; verse <= count; verse++) durations.set(`${i + 1}:${verse}`, 1000);
  });
  return durations;
}

describe('missingAyat — the narration completeness gate', () => {
  it('passes an edition whose 6,236 ayat all measured', () => {
    const durations = completeDurations();
    strictEqual(durations.size, 6236);
    deepStrictEqual(missingAyat(durations), []);
  });

  it('names an ayah that never downloaded', () => {
    const durations = completeDurations();
    durations.delete('2:255');
    deepStrictEqual(missingAyat(durations), ['2:255']);
  });

  it('names a file that is present but undecodable (measured 0ms) — the abdulkareem shape', () => {
    const durations = completeDurations();
    durations.set('2:56', 0);
    durations.set('26:200', 0);
    durations.delete('30:12');
    deepStrictEqual(missingAyat(durations), ['2:56', '26:200', '30:12']);
  });

  it('refuses an empty measurement outright rather than passing vacuously', () => {
    strictEqual(missingAyat(new Map()).length, 6236);
  });
});

describe('QuranEnc helpers', () => {
  it("derives pack ids that keep story 8-2's French id stable", () => {
    strictEqual(
      packIdOf({ key: 'french_rashid', language_iso_code: 'fr' }),
      'translation-fr-rashid'
    );
    strictEqual(
      packIdOf({ key: 'spanish_montada_latin', language_iso_code: 'es' }),
      'translation-es-montada-latin'
    );
    strictEqual(
      packIdOf({ key: 'ankobambara_dayyan', language_iso_code: 'nqo' }),
      'translation-nqo-dayyan'
    );
    throws(() => packIdOf({ key: 'nokey', language_iso_code: 'xx' }), /no edition suffix/);
  });

  it('states the title, QuranEnc and the version in the credit line', () => {
    strictEqual(
      attributionOf('اردو ترجمہ - محمد جوناگڑھی', '1.1.3'),
      'اردو ترجمہ - محمد جوناگڑھی · QuranEnc.com · v1.1.3'
    );
  });

  it('names every language in both tables, and refuses one it has never heard of', () => {
    deepStrictEqual(Object.keys(LANGUAGE_NAMES).sort(), Object.keys(LANGUAGE_NAMES_ENGLISH).sort());
    // QuranEnc's 56, plus the four the tafsir packs add (story 8-5: ar, bn, it, ru).
    strictEqual(Object.keys(LANGUAGE_NAMES).length, 60);
    deepStrictEqual(languageNameOf('ar'), { native: 'العربية', english: 'Arabic' });
    deepStrictEqual(languageNameOf('ur'), { native: 'اردو', english: 'Urdu' });
    throws(() => languageNameOf('xx'), /No language name recorded for "xx"/);
  });

  it('refuses an unpinned edition and a drifted one, and passes the pinned version', () => {
    const pins = new Map([['french_rashid', '1.0.3']]);
    assertPinned({ key: 'french_rashid', version: '1.0.3' }, pins, 'quranenc-republication');
    throws(
      () =>
        assertPinned({ key: 'french_rashid', version: '1.0.4' }, pins, 'quranenc-republication'),
      /upstream is now v1\.0\.4, the ledger pins v1\.0\.3/
    );
    throws(
      () =>
        assertPinned({ key: 'urdu_junagarhi', version: '1.1.3' }, pins, 'quranenc-republication'),
      /is not pinned/
    );
  });
});
