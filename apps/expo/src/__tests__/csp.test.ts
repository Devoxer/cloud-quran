/**
 * The deployed web build's Content-Security-Policy (`public/_headers`) must admit every origin the
 * app actually requests from.
 *
 * ⚠️ NOTHING ELSE CAN SEE THIS FAILURE. Native runs no CSP and a local dev server serves no
 * `_headers`, so a missing origin passes every test, every emulator run and every localhost smoke,
 * and is refused only on the deployed site. `cdn.nobleachievements.com` was missing from 2026-08
 * to 2026-09-30: audio, the mushaf's CDN faces and every content pack were blocked on the web.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AUDIO_CDN_BASE } from '@/constants/audio';
import { MUSHAF_FONT_CDN_BASE } from '@/constants/mushaf';
import { PACK_CATALOGUE_URL, PACK_CDN_BASE } from '@/constants/packs';

function directives(): Map<string, string[]> {
  const headers = readFileSync(resolve(__dirname, '../../public/_headers'), 'utf8');
  const line = headers.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:'));
  if (!line) throw new Error('public/_headers declares no Content-Security-Policy');
  const policy = line.slice(line.indexOf(':') + 1);
  return new Map(
    policy
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter((tokens) => tokens[0])
      .map(([name, ...sources]) => [name, sources])
  );
}

const originOf = (url: string) => new URL(url).origin;

it('lets the page fetch the pack catalogue and pack files', () => {
  const connect = directives().get('connect-src') ?? [];
  expect(connect).toContain(originOf(PACK_CATALOGUE_URL));
  expect(connect).toContain(originOf(PACK_CDN_BASE));
});

it('lets the page play recitation and narration audio', () => {
  expect(directives().get('media-src') ?? []).toContain(originOf(AUDIO_CDN_BASE));
});

it('lets the page load the mushaf faces the CDN serves', () => {
  expect(directives().get('font-src') ?? []).toContain(originOf(MUSHAF_FONT_CDN_BASE));
});

it('fetches audio manifests from the same allowed origin', () => {
  expect(directives().get('connect-src') ?? []).toContain(originOf(AUDIO_CDN_BASE));
});
