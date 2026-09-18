/**
 * The web short-circuit (story 8-2).
 *
 * ⚠️ THE SUITE RUNS AS `ios`, SO `PACKS_SUPPORTED` IS `true` IN EVERY OTHER FILE and the web
 * branch — the one that decides whether a browser gets a control that cannot possibly work — is
 * executed by nothing else.
 *
 * ⚠️ THE PLATFORM IS SET BEFORE THE MODULE IS EVER LOADED, AND THAT IS WHY THIS IS ITS OWN FILE.
 * `PACKS_SUPPORTED` is computed once at module scope, deliberately — one fact, read everywhere —
 * so the only way to observe the other value is to have the platform already changed when the
 * module first evaluates. `import` is hoisted and `require` is not, which is the whole trick;
 * each Jest file gets its own module registry, so nothing else in the suite is affected.
 */

import { Platform } from 'react-native';

(Platform as { OS: string }).OS = 'web';

jest.mock('@/lib/quranDb', () => ({
  sqliteDirectoryUri: () => null,
  closePack: jest.fn(() => Promise.resolve()),
  countPackRows: jest.fn(() => Promise.resolve(0)),
}));

const constants = require('@/constants/packs') as typeof import('@/constants/packs');
const packs = require('./packStore') as typeof import('./packStore');

const PACK = {
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
  digest: 'deadbeef',
};

describe('on web', () => {
  it('reports that packs are not supported', () => {
    expect(constants.PACKS_SUPPORTED).toBe(false);
  });

  it('lists nothing and accounts for nothing', () => {
    expect(packs.listInstalledPacks()).toEqual([]);
    expect(packs.installedPackBytes()).toBe(0);
  });

  it('refuses an install outright rather than pretending to start one', async () => {
    // ⚠️ The CONTROL is absent on web, not inert — but the module must still refuse, so a future
    // caller cannot take a reader's press and silently do nothing.
    await expect(packs.installPack(PACK)).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('sweeps nothing, because there is no directory to sweep', () => {
    expect(() => packs.sweepStalePackParts()).not.toThrow();
  });
});
