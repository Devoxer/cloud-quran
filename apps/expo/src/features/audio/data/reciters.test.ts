/**
 * The reciter catalogue (story 7-2).
 *
 * ⚠️ EVERY EXPECTATION HERE IS A LITERAL, AND THAT IS THE ENTIRE POINT OF THE FILE. The catalogue
 * is a claim about what the CDN publishes: forty ids, each of which must have a manifest and 114
 * MP3s under `AUDIO_CDN_BASE`. A test that derived its expectation from `RECITERS` — counting the
 * array, mapping its own styles, asking it for the default — would agree with the array whatever
 * the array said, including after a rename that silently points the app at a voice the pipeline
 * has never published. So the forty ids are written out by hand: adding or renaming one has to be
 * a deliberate edit HERE too, made by whoever also ran the pipeline.
 */

import { DEFAULT_PREFERENCES } from '@/lib/sync';
import {
  DEFAULT_RECITER_ID,
  RECITER_STYLES,
  RECITERS,
  type ReciterStyle,
  resolveReciterId,
} from './reciters';

/**
 * The published ids, in catalogue order — murattal first (alphabetical by English name), then
 * mujawwad, then muallim. Verified against the live CDN on 2026-09-08: all forty return
 * `manifest.json` 200 and `001.mp3` 200, and all forty parse to 6,236 usable verse windows.
 */
const PUBLISHED_IDS = [
  'abdulbasit',
  'sudais',
  'basfar',
  'matroud',
  'shatri',
  'ajmi',
  'neana',
  'alaqimy',
  'hudhaify',
  'suesy',
  'jaber',
  'sowaid',
  'alili',
  'abbad',
  'rifai',
  'akhdar',
  'mansoori',
  'qahtanee',
  'tunaiji',
  'banna',
  'husary',
  'alafasy',
  'minshawi',
  'tablawi',
  'abdulkareem',
  'ayyoub',
  'jibreel',
  'qasim',
  'qatami',
  'shuraym',
  'ghamidi',
  'sahl',
  'bukhatir',
  'budair',
  'salamah',
  'dussary',
  'abdulbasit-mujawwad',
  'husary-mujawwad',
  'minshawi-mujawwad',
  'husary-muallim',
];

describe('the catalogue names exactly what the pipeline publishes', () => {
  it('holds the forty published ids, in order', () => {
    expect(RECITERS.map((reciter) => reciter.id)).toEqual(PUBLISHED_IDS);
  });

  it('never names the same voice twice', () => {
    // A duplicate id would render two identical rows and make the selected-row check ambiguous.
    expect(new Set(PUBLISHED_IDS).size).toBe(40);
  });

  it('offers exactly three styles, in the order the picker groups them', () => {
    expect(RECITER_STYLES).toEqual(['murattal', 'mujawwad', 'muallim']);
  });

  it('gives every reciter a known style and both names', () => {
    const known = new Set<string>(['murattal', 'mujawwad', 'muallim']);
    for (const reciter of RECITERS) {
      expect(known.has(reciter.style)).toBe(true);
      expect(reciter.nameEnglish.length).toBeGreaterThan(0);
      expect(reciter.nameArabic.length).toBeGreaterThan(0);
    }
  });

  it('carries the three styles in the counts the CDN publishes', () => {
    const count = (style: ReciterStyle) => RECITERS.filter((r) => r.style === style).length;
    expect(count('murattal')).toBe(36);
    expect(count('mujawwad')).toBe(3);
    expect(count('muallim')).toBe(1);
  });

  /**
   * ⚠️ THE DELETED FLAG MUST STAY DELETED. `hasTimingData` was `true` on all forty rows, read by
   * nothing, and false on two of them in reality; the data was repaired instead. Re-adding it
   * would re-create a hand-maintained assertion beside `isSurahTimed`, which measures.
   */
  it('carries no hasTimingData flag', () => {
    for (const reciter of RECITERS) {
      expect(Object.hasOwn(reciter, 'hasTimingData')).toBe(false);
    }
  });
});

describe('resolveReciterId — an unknown stored id never reaches the CDN', () => {
  it('is the same voice the preferences default names', () => {
    // The two are duplicated on purpose (see the constant's docblock); this is the pin.
    expect(DEFAULT_RECITER_ID).toBe('alafasy');
    expect(DEFAULT_PREFERENCES.reciterId).toBe(DEFAULT_RECITER_ID);
  });

  it('passes a published id straight through', () => {
    expect(resolveReciterId('husary-mujawwad')).toBe('husary-mujawwad');
    expect(resolveReciterId('alafasy')).toBe('alafasy');
  });

  it('falls back for an id no build of this app publishes', () => {
    // A row written by another device, an older build, or a withdrawn voice.
    expect(resolveReciterId('nope')).toBe('alafasy');
    expect(resolveReciterId('Husary')).toBe('alafasy');
  });

  it('falls back for the empty, null and absent cases', () => {
    expect(resolveReciterId('')).toBe('alafasy');
    expect(resolveReciterId(null)).toBe('alafasy');
    expect(resolveReciterId(undefined)).toBe('alafasy');
  });
});
