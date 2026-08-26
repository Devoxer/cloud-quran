// Story 32.2 — the ONE place that mints random opaque R2 keys and derives the content-object
// row shape (bookId/sectionType/kind/language/sourceKey…). Every key-emitting surface goes
// through THESE pure functions so they can't drift on the sourceKey formula or the row contract —
// the "one deterministic pure function shared between writers" cheat-sheet pattern. Identity comes
// from the row's columns, NEVER from the key (an invariant test asserts r2Key is non-derivable
// from the identity tuple).
//
// ⚠️ story 5-2 removed the TIER axis — `ContentTier`, `tierForSection`, and the `tier` column on
// the row. It stamped a row 'free' or 'premium' from `FREE_CONTENT_SECTIONS`, and the vendor's RLS
// gate read it. Cloud Quran has no premium tier, so the column has nothing to express. This module
// also left the package barrel in the same pass: it has no importer in this tree, and story 5-4
// decides whether D1's writers want it back.
//
// Web Crypto only (globalThis.crypto) so it runs identically in Node 24 (pipeline), the Cloudflare
// Worker, and tests — no node:crypto import.

/**
 * The corpus language stamped on every `contentObjects` / `audioFiles` row and baked into every
 * `sourceKey` (§4.4 — explicit, never parsed from content).
 *
 * ONE constant for every writer AND the reader (Story 34.1 round-2 review). It previously existed
 * as FIVE private copies — `content-sidecar`'s `CONTENT_LANGUAGE`, `publish-staged`'s
 * `PUBLISH_LANGUAGE`, an injectable-but-unwired `processLocalTTS` option, the `publish-staged` CLI's
 * literal `'en'` (found round 11), and `generate-initial-content`'s `POOL_LANGUAGE` (found round 12,
 * after round 11 had declared the fourth to be the last). Both stragglers were sourceKey-forming,
 * which is exactly why the count kept being wrong: a private literal is invisible until someone
 * greps for the VALUE rather than the constant. Because `language`
 * is part of the sourceKey, any drift between a writer and the reader is silent: rows land under a
 * key the reader never resolves, and every section then fails as "empty source text".
 *
 * ⚠️ IT IS THE BASE CORPUS'S LANGUAGE, NOT "THE" LANGUAGE. This used to say "going multi-language is
 * a corpus-wide change through this constant, not a per-call knob", which stopped being true as
 * translated content landed: `translate-content` writes target-language rows, and since Story 24.25
 * the pre-generated `--build-quote-bundle` artifact takes a `--language` MODIFIER and defaults to
 * this. So the rule is narrower than it reads: every writer of the BASE corpus stamps this constant
 * — nobody re-derives `'en'` privately — while a per-language build passes its own code down one
 * explicit path (`readContentSidecarWith`). The failure mode the paragraph above describes is
 * unchanged; only "there is exactly one language" is gone.
 */
export const CORPUS_LANGUAGE = 'en';

// Story 24.30 deleted the pre-built quiz pool, so `'pool'` lost its producer and is gone from the
// union too — a cross-book round is now assembled live from the per-book `quizQuestions` banks.
// (Story 32.10 had already retired the `'pool'` TIER for the same reason: no producer.) The live
// `kind:'pool'` rows are dropped one-shot by `cleanup-quiz-pool-rows-24-30.ts`, which reads raw
// rows and so needs no union member.
export type ContentKind = 'audio' | 'text' | 'blocks';

/** Byte length of the random component of an opaque key (32 bytes = 256 bits, well over the
 * ≥128-bit floor §4.7). getRandomValues is a CSPRNG — never Math.random(), never a timestamp,
 * never a keyed hash/per-book salt (all of which would make the key derivable → a public leak). */
const KEY_BYTES = 32;

// Web Crypto is a global in Node 24, Cloudflare Workers, and the browser, but `typeof globalThis`
// doesn't declare `crypto` uniformly across the app/worker/pipeline tsconfigs — reference it
// through a minimal typed view so this one shared module typechecks in every consumer.
const webCrypto = (
  globalThis as unknown as {
    crypto: { getRandomValues<T extends ArrayBufferView>(array: T): T };
  }
).crypto;

/** Mint a ≥128-bit CSPRNG opaque key (64 lowercase hex chars). Independently random per object;
 * carries NO identity (no book id, no section, no extension). */
export function randomOpaqueKey(): string {
  const bytes = new Uint8Array(KEY_BYTES);
  webCrypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/** The exact shape `randomOpaqueKey` mints: `KEY_BYTES` bytes as lowercase hex (64 chars for 32 bytes).
 * The ONE predicate that answers "is this bucket key a catalog content object?" — every catalog blob
 * (audio/text/blocks/quiz pool) is opaque-keyed via `randomOpaqueKey`; anything else at the content
 * host root (e.g. an intentionally-PUT `robots.txt`, a future `.well-known/…`) is NOT a catalog object.
 * Destructive reconcilers MUST gate on this so a row-less-but-legitimate object is never mistaken for a
 * crash-stranded catalog orphan and deleted (Epic-34 boundary review). Anchored + length-exact so no
 * longer/prefixed key sneaks through. */
export function isOpaqueContentKey(key: string): boolean {
  return new RegExp(`^[0-9a-f]{${KEY_BYTES * 2}}$`).test(key);
}

/** Identity tuple for a book/section content object (audio | text | blocks). */
export interface ObjectIdentity {
  bookId: string;
  sectionType: string;
  kind: ContentKind;
  voiceId?: string; // present for audio/blocks; absent for text
  language: string;
}

/**
 * The synthesized single-attribute natural key (`.unique()` is single-column in Instant, so
 * composite idempotency is expressed as this one derived string). `kind` IS in the key — audio
 * and its per-voice blocks share (bookId, sectionType, voiceId, language) exactly, so without
 * `kind` the two collide on the natural key and the migration bijection can't tell them apart.
 */
export function deriveSourceKey(id: ObjectIdentity): string {
  return `${id.bookId}:${id.sectionType}:${id.kind}:${id.voiceId ?? '-'}:${id.language}`;
}

/** The full content-object row (minus the store's own row id). `sourceKey`/`r2Key` are unique. */
export interface ContentObjectRow {
  bookId: string;
  sectionType: string;
  kind: ContentKind;
  voiceId?: string;
  language: string;
  r2Key: string;
  contentType: string;
  ext: string;
  byteLength: number;
  durationMs?: number;
  revision: number;
  sourceKey: string;
}

export interface BuildRowInput {
  identity: ObjectIdentity;
  r2Key: string; // caller-minted (randomOpaqueKey) — passed in so the same key is used for upload + row
  contentType: string;
  ext: string;
  byteLength: number; // the read-after-write-verified object size (AC-12 gate reads this)
  durationMs?: number;
  revision?: number;
}

/** Build the content-object row for a book/section object. */
export function buildContentObjectRow(input: BuildRowInput): ContentObjectRow {
  const { identity } = input;
  return {
    bookId: identity.bookId,
    sectionType: identity.sectionType,
    kind: identity.kind,
    ...(identity.voiceId !== undefined ? { voiceId: identity.voiceId } : {}),
    language: identity.language,
    r2Key: input.r2Key,
    contentType: input.contentType,
    ext: input.ext,
    byteLength: input.byteLength,
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    revision: input.revision ?? 1,
    sourceKey: deriveSourceKey(identity),
  };
}

/**
 * Whether an r2Key could have been DERIVED from the identity tuple by any of the retired
 * deterministic templates. The AC-7 invariant test asserts this is false for every minted key —
 * proof the new keys carry no reconstructable structure. (A random 64-hex key contains none of
 * the identity substrings, so this returns false; a legacy `audio/{bookId}/{voiceId}/{section}`
 * key contains them and returns true.)
 */
export function keyLeaksIdentity(r2Key: string, id: ObjectIdentity): boolean {
  const needles = [id.bookId, id.sectionType, id.voiceId, id.language].filter(
    (s): s is string => typeof s === 'string' && s.length > 0
  );
  return needles.some((n) => r2Key.includes(n));
}
