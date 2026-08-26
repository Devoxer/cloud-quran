/**
 * Download cancellation signal (Story 20.6) — the ONE registry both download paths poll.
 *
 * Lifted out of `features/library/lib/downloadRunner.ts` so the `lib/` layer can reach it:
 * `lib/offlineTeardown.ts` must abort every in-flight download BEFORE it sweeps the disk, and
 * `lib/` must never import a feature. Relocating the existing signal is deliberately preferred
 * over minting a second cancellation path — two independent "is this cancelled?" answers is
 * exactly how a download ends up writing files behind the sweep that was supposed to remove them
 * (AC-14).
 *
 * Two levers, one predicate:
 *  • {@link requestCancel} — per-book, what the user's Cancel button has always done.
 *  • {@link cancelAllDownloads} — global, fired by the "Delete all downloads" sweep. (The
 *    committed language switch fired it too until Story 24.27, which stopped the switch destroying
 *    anything; it now restarts the app instead, which ends every download loop with the JS context
 *    rather than through this registry.) It bumps a monotonic GENERATION rather than setting a
 *    boolean, so a download STARTED AFTER the sweep (the user re-taps download two seconds later)
 *    is not retroactively cancelled by a flag nobody cleared. Each loop captures
 *    {@link currentCancelGeneration} when it starts and compares; a mismatch means "a cancel-all
 *    happened while I was running".
 *
 * No React, no feature imports — a leaf over nothing.
 */

/** Book ids whose download has been asked to cancel individually. */
const cancelled = new Set<string>();

/** Monotonic cancel-all generation. Bumped by {@link cancelAllDownloads}; never reset. */
let cancelAllGeneration = 0;

/** Ask one book's download to stop (the per-book Cancel affordance). */
export function requestCancel(bookId: string): void {
  cancelled.add(bookId);
}

/** Clear a book's cancel request (after the loop has honoured it, or on retry/re-enqueue). */
export function clearCancel(bookId: string): void {
  cancelled.delete(bookId);
}

/** Whether a book has an outstanding per-book cancel request. */
export function isCancelRequestedForBook(bookId: string): boolean {
  return cancelled.has(bookId);
}

/**
 * Abort EVERY in-flight download — the delete-all teardown's first act (AC-14). Downloads poll
 * this through {@link isCancelRequested}; nothing here touches files or rows, so the caller still
 * owns the sweep.
 */
export function cancelAllDownloads(): void {
  cancelAllGeneration++;
}

/** The generation a download loop must capture when it starts, to pass back to
 * {@link isCancelRequested}. */
export function currentCancelGeneration(): number {
  return cancelAllGeneration;
}

/**
 * The single cancellation predicate every download loop polls: this book was cancelled
 * individually, OR a cancel-all landed since `startedAtGeneration` was captured.
 */
export function isCancelRequested(bookId: string, startedAtGeneration: number): boolean {
  return cancelled.has(bookId) || cancelAllGeneration !== startedAtGeneration;
}

/** Test-only: drop every per-book request (the generation is deliberately left monotonic). */
export function __resetDownloadCancellationForTests(): void {
  cancelled.clear();
}
