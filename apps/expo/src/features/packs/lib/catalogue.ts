/**
 * catalogue — what the CDN says is on offer (story 8-2).
 *
 * ⚠️ THE CATALOGUE IS AN ENHANCEMENT, NOT A DEPENDENCY. Offline-first is this app's default path,
 * so an unreachable or malformed catalogue degrades to "installed only" — the reader still sees
 * every pack they have, and every one of them still reads. It NEVER produces an error screen and
 * it never throws: `fetchCatalogue` answers `null` for "could not say", which is not the same
 * answer as `[]` ("nothing is offered"). That distinction is `audioDownloads.ts:29`'s recorded
 * lesson, where conflating the two threw away a gigabyte of correct state on one transient error.
 *
 * ⚠️ EVERY FIELD IS VALIDATED BEFORE A SINGLE BYTE IS FETCHED ON ITS WORD. A pack's `digest` and
 * `rows` are the two integrity facts the installer checks against, so a catalogue entry missing
 * either is worse than no entry at all: it would install something nothing could verify. A
 * malformed ENTRY is dropped and its siblings are kept — one bad line must not take the shelf down.
 *
 * `lint:layers` rule 2: a feature `lib/` — pure logic, no UI, no routes.
 */

import { Platform } from 'react-native';

import { PACK_CATALOGUE_URL, PACK_CDN_BASE } from '@/constants/packs';

/** One offered pack, exactly as `scripts/prepare-packs.ts` writes it into `index.json`. */
export interface CataloguePack {
  id: string;
  /** Bumped when the bytes change. A new version is a new FILE — see `packFileName`. */
  packVersion: number;
  /** `translation` today; `tafsir`, `asbab` and the rest are stories 8-4 onward. */
  type: string;
  /** BCP-47 language of the CONTENT (not of the interface). */
  language: string;
  /** The language's own name, for a reader who does not read the interface language. */
  languageName: string;
  title: string;
  source: string;
  /** The upstream edition's version. QuranEnc's grant requires it to be stated. */
  sourceVersion: string;
  /** The entry in `packages/quran-data/data/packs/LICENCES.md` this pack's rights come from. */
  licenceId: string;
  /** Rendered in the UI beside the pack. Required by the grant; never a buried credit. */
  attribution: string;
  url: string;
  bytes: number;
  rows: number;
  digest: string;
}

/** How long the catalogue fetch may take before the shelf falls back to "installed only". */
const CATALOGUE_TIMEOUT_MS = 10_000;

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/**
 * A SHA-256 digest, as the catalogue records it: exactly 64 lowercase hex characters.
 *
 * ⚠️ NON-EMPTY IS NOT THE SAME AS VALID, AND THE DIFFERENCE COSTS A READER A DOWNLOAD. A truncated
 * or mistyped digest passes a `length > 0` check, so the pack fetches its megabytes, fails the
 * comparison, and lands on a retry button that can never succeed. A malformed digest is a
 * malformed ENTRY: refuse it on the shelf rather than at the end of a transfer.
 * (Story 8-2 review, S5.)
 */
const isDigest = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

/**
 * The catalogue's own version. Emitted by `scripts/prepare-packs.ts` and checked here.
 *
 * ⚠️ A FIELD NOBODY READS IS NOT A VERSION, IT IS DECORATION. It was written and ignored, so a
 * future format change had no way to be refused by an older build. One is the only shape this
 * parser understands; anything else is a document from the future and is not guessed at.
 * (Story 8-2 review, S8.)
 */
export const SUPPORTED_CATALOGUE_VERSION = 1;
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Narrow one raw entry, or answer `null`.
 *
 * ⚠️ THE URL MUST BE ON OUR OWN CDN. A catalogue is a remote document; if it could name any host,
 * a compromised or mistaken one could redirect a reader's fetch to a third party that then learns
 * what they study. Reading position and study material are special-category data, and Cloudflare
 * is the only processor the privacy disclosure names. The host check is what makes the catalogue
 * data rather than instruction.
 */
export function parseCataloguePack(raw: unknown): CataloguePack | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const entry = raw as Record<string, unknown>;
  if (
    !isDigest(entry.digest) ||
    !text(entry.id) ||
    !text(entry.type) ||
    !text(entry.language) ||
    !text(entry.languageName) ||
    !text(entry.title) ||
    !text(entry.source) ||
    !text(entry.sourceVersion) ||
    !text(entry.licenceId) ||
    !text(entry.attribution) ||
    !text(entry.url)
  ) {
    return null;
  }
  if (!positive(entry.packVersion) || !Number.isInteger(entry.packVersion)) return null;
  if (!positive(entry.bytes) || !positive(entry.rows)) return null;
  /**
   * ⚠️ THE URL MUST BE THIS PACK'S OWN FILE, NOT MERELY A FILE ON OUR CDN. A host check alone lets
   * a catalogue entry point `translation-fr-rashid` v1 at some other edition's object: it
   * downloads, its digest and row count both agree — because they were copied from that other
   * pack — and the reader installs a DIFFERENT edition under the id they asked for, with every
   * integrity check green. The name carries the identity, so the url has to end in it.
   * (Story 8-2 review, S5.)
   */
  const expectedUrl = `${PACK_CDN_BASE}/${entry.id}-v${entry.packVersion}.db`;
  if (entry.url !== expectedUrl) return null;
  return {
    id: entry.id,
    packVersion: entry.packVersion,
    type: entry.type,
    language: entry.language,
    languageName: entry.languageName,
    title: entry.title,
    source: entry.source,
    sourceVersion: entry.sourceVersion,
    licenceId: entry.licenceId,
    attribution: entry.attribution,
    url: entry.url,
    bytes: entry.bytes,
    rows: entry.rows,
    digest: entry.digest,
  };
}

/** Narrow a whole catalogue document. `null` means "this is not a catalogue". */
export function parseCatalogue(body: unknown): CataloguePack[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const version = (body as { catalogueVersion?: unknown }).catalogueVersion;
  // See `SUPPORTED_CATALOGUE_VERSION`: a document this build does not understand is "could not
  // say", which degrades to installed-only — never a half-read shelf.
  if (version !== SUPPORTED_CATALOGUE_VERSION) return null;
  const packs = (body as { packs?: unknown }).packs;
  if (!Array.isArray(packs)) return null;
  const parsed: CataloguePack[] = [];
  for (const raw of packs) {
    const pack = parseCataloguePack(raw);
    // One malformed entry is dropped; its siblings are kept. A catalogue is a shelf, not a
    // transaction — refusing the whole document would take every offer down with one typo.
    if (pack) parsed.push(pack);
  }
  return parsed;
}

/**
 * Fetch and validate the catalogue. `null` is "could not say" — offline, HTTP error, timeout, or
 * a body that is not a catalogue. Never throws.
 */
export async function fetchCatalogue(signal?: AbortSignal): Promise<CataloguePack[] | null> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), CATALOGUE_TIMEOUT_MS);
  const forward = () => timeout.abort();
  signal?.addEventListener('abort', forward);
  try {
    const response = await fetch(PACK_CATALOGUE_URL, {
      /**
       * ⚠️ THE CATALOGUE IS THE ONE OBJECT WHOSE CONTENT CHANGES UNDER A STABLE KEY. Every pack
       * key carries its version, so only this document can go stale in a cache in front of a
       * newly published pack.
       *
       * ⚠️ AND THE FRESHNESS IS ASKED FOR DIFFERENTLY ON EACH PLATFORM, WHICH IS A CORS FACT AND
       * NOT A STYLE ONE (story 8-3, measured in WebKit 2026-09-19). A `cache-control` REQUEST
       * HEADER is not a CORS-safelisted header, so sending it turns this into a preflighted
       * cross-origin request — and R2 answers the `OPTIONS` without the matching
       * `Access-Control-Allow-Headers`, so the whole fetch rejects with `TypeError: Load failed`.
       * The shelf then degraded to "the catalogue could not be reached" on web, permanently, with
       * a perfectly good connection. `cache: 'no-store'` is the same intent expressed as a fetch
       * OPTION, which is not a header and triggers no preflight; React Native's fetch ignores the
       * option entirely, which is why native keeps the header. Measured both ways: the pack file
       * itself is a simple GET and was reachable throughout.
       */
      ...(Platform.OS === 'web'
        ? { cache: 'no-store' as const }
        : { headers: { 'cache-control': 'no-cache' } }),
      signal: timeout.signal,
    });
    if (!response.ok) return null;
    return parseCatalogue(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forward);
  }
}
