/**
 * BookCover — the single book-cover rendering primitive (Story 31.1).
 *
 * Before this, ~15 components hand-rolled the same `expo-image` block: a local
 * `IMAGE_TRANSITION_MS`, `PLACEHOLDER_COVER = require('icon.png')`, an `imageError`
 * `useState` + `handleImageError`, and the `imageError || !coverUrl ? placeholder : { uri }`
 * source dance — each a copy that drifted. This owns all of it in one place:
 *
 * - **WebP-preferred URL selection** (AC-4): render `coverWebpUrl` when present, else the
 *   canonical `coverUrl` (JPEG). A single choice — no double-fetch, no onError format probing.
 * - **Per-book blurhash placeholder** (AC-11): `placeholder={{ blurhash }}` (source-object form),
 *   paired with `placeholderContentFit` matching the site's `contentFit` so the blur doesn't jump
 *   when the real cover cross-fades in. Served synchronously/offline from InstantDB's local cache
 *   (the blurhash is a column on the `books` row every surface already queries). Falls back to the
 *   `icon.png` placeholder for books without a blurhash yet.
 * - **`recyclingKey`** (AC-3, Story 18.9): a stable per-book key so a recycled `FlashList` cell
 *   doesn't keep showing the previous book's cover until the new one loads.
 * - **error-state reset on book change** (AC-3): reset the internal `imageError` when the resolved
 *   book/uri changes (prev-key ref → reset during render), so a prior book's load error doesn't leak
 *   a placeholder onto a recycled row.
 * - **hard-error fallback** (AC-3): on a real load error, swap `source` → `icon.png` (the local
 *   `require` loads instantly and covers any blurhash). A hard error means the asset is unavailable,
 *   so the neutral icon is the honest fallback — the blurhash is dropped on error by design.
 *
 * The primitive stays dumb + surface-agnostic: layout lives at the call site via `style`; only the
 * per-site `contentFit` (default `fill`) and an optional `priority` vary. It accepts a `book` (a
 * full `Book` satisfies the structural `BookCoverSource`) OR the loose cover fields — quote covers
 * pass `{ coverUrl }` and degrade to jpeg + icon (the WebP/blurhash fields live on `books`, not
 * quotes).
 */
import { Image, type ImageContentFit } from 'expo-image';
import { memo, useRef, useState } from 'react';
import type { ImageStyle, StyleProp } from 'react-native';

/** Cross-fade duration when the real cover swaps in (was a per-file const in every cover site). */
const IMAGE_TRANSITION_MS = 200;

/** Neutral local fallback shown when a cover is missing or fails to load. Loads instantly. */
const PLACEHOLDER_COVER = require('@/assets/images/icon.png');

/**
 * The minimal cover-bearing shape the primitive needs. A full `Book` satisfies it structurally;
 * a quote passes just `{ coverUrl }`. All fields optional so any caller shape works.
 */
export interface BookCoverSource {
  /** Stable identity for `recyclingKey` + error-reset (the book id). Absent for quote covers. */
  id?: string;
  /** Canonical JPEG cover URL — the guaranteed fallback. */
  coverUrl?: string | null;
  /** Optimized WebP variant (Story 31.1) — preferred when present. */
  coverWebpUrl?: string | null;
  /** ~30-char blurhash string for the instant/offline blur-up placeholder (Story 31.1). */
  coverBlurhash?: string | null;
}

export interface BookCoverProps {
  /** The book (or loose `{ id?, coverUrl?, coverWebpUrl?, coverBlurhash? }`) to render. */
  book: BookCoverSource;
  /** Layout style — the call site owns sizing/rounding; the primitive never restyles. */
  style?: StyleProp<ImageStyle>;
  /**
   * Per-site fit — default `fill` (the fixed-aspect cards). Heroes pass `cover`. Also drives
   * `placeholderContentFit` so the blurhash renders at the same fit as the cover (no jump).
   */
  contentFit?: ImageContentFit;
  /** Load priority — `high` for the detail hero / above-the-fold, default `normal` elsewhere. */
  priority?: 'low' | 'normal' | 'high';
  /**
   * Override the `recyclingKey`. Omit (default) to derive it from the book id (falling back to the
   * resolved uri) — the right choice for recycled `FlashList` cells. Pass an explicit key when the
   * caller owns the identity (e.g. a collection slot keyed by `book.id ?? slot.id`), or pass `null`
   * to opt OUT of recycle-clearing so the previous cover lingers until the next loads (the quiz
   * header, which re-renders with a new — already-prefetched — cover on advance and wants no flash).
   */
  recyclingKey?: string | null;
  /** Test id forwarded to the underlying image. */
  testID?: string;
  /**
   * Accessibility label. Covers are usually decorative (the surrounding Pressable owns the a11y
   * label), so this is optional — pass it only for a standalone cover with no labelled ancestor.
   */
  accessibilityLabel?: string;
}

export const BookCover = memo(function BookCover({
  book,
  style,
  contentFit = 'fill',
  priority = 'normal',
  recyclingKey,
  testID,
  accessibilityLabel,
}: BookCoverProps) {
  const [imageError, setImageError] = useState(false);

  // WebP-preferred, JPEG-fallback (AC-4). Stable per book — a hard error swaps `source` to the
  // placeholder, it never mutates this resolved uri, so it's a safe identity key too.
  const resolvedUri = book.coverWebpUrl ?? book.coverUrl ?? undefined;

  // Identity of the currently-shown book: book id, falling back to the resolved uri for id-less
  // callers (quote covers). Drives the derived recyclingKey (a stable per-cell identity).
  const identityKey = book.id ?? resolvedUri;

  // error-state reset (AC-3, Story 18.9): reset `imageError` when the book id OR the resolved uri
  // changes. Both matter: a recycled cell keeps its `imageError` otherwise (leaking a prior book's
  // failure onto the new one — id change), AND a still-mounted cell whose row is live-updated
  // jpeg→webp (e.g. `optimize-covers` stamps `coverWebpUrl`) after a hard error would stay pinned
  // to the icon forever (uri change, same id). Reset during render, per the BookCard pattern.
  const resetKey = `${book.id ?? ''}\0${resolvedUri ?? ''}`;
  const prevKeyRef = useRef(resetKey);
  if (prevKeyRef.current !== resetKey) {
    prevKeyRef.current = resetKey;
    setImageError(false);
  }

  // Explicit override wins (incl. `null` = opt out of recycle-clear); otherwise derive from identity.
  const resolvedRecyclingKey = recyclingKey !== undefined ? recyclingKey : identityKey;

  const source = imageError || !resolvedUri ? PLACEHOLDER_COVER : { uri: resolvedUri };
  // Drop the blurhash on error so only the instant icon shows (AC-3 decided behavior — no
  // blurhash-on-error). `undefined` when absent → expo-image just uses `source`.
  const placeholder =
    !imageError && book.coverBlurhash ? { blurhash: book.coverBlurhash } : undefined;

  return (
    <Image
      source={source}
      placeholder={placeholder}
      placeholderContentFit={contentFit}
      recyclingKey={resolvedRecyclingKey ?? null}
      style={style}
      contentFit={contentFit}
      transition={IMAGE_TRANSITION_MS}
      priority={priority}
      cachePolicy="memory-disk"
      onError={() => setImageError(true)}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    />
  );
});
