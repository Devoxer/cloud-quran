/**
 * Player route URL — the ONE place that builds `/player?…` and the ONE place that reads
 * the launch marker back out. Bug fix 2026-08-19 ("Resuming a book while something else
 * plays").
 *
 * ## Why a launch MARKER exists
 *
 * The player is the documented owner of starting audio for a navigate-first launch
 * (Story 17.17): *Continue reading* and the collection playlist only navigate — the routed
 * player is what calls `play()` / `playQueueItem()` and seeks to the saved position. So the
 * player has to answer "am I being asked to START this, or just to SHOW what is already
 * playing?" — and a route that carries only `?bookId=…&section=…` cannot tell the two apart.
 *
 * The first attempt at this fix inferred it: a launch param naming a book the active queue
 * does NOT contain was treated as an explicit request. That is unsound, and provably so —
 * `features/feed/hooks/useFeedQueue.ts` builds the for-you radio as "the full shuffled
 * catalog", every book with one random section. During the radio EVERY book is a member, so
 * the inference collapsed to "the queue always wins" and the reported bug survived its own
 * repro. A guess about intent cannot be repaired; it has to be stated.
 *
 * So the launcher states it, the way `initialMode=read` and `source=collection` already do,
 * and the DECISION still lives in the player (the spec's "fix belongs in the one consumer,
 * not at each launcher" holds — launchers state a fact, they do not branch on it).
 *
 * ## Who marks, and who must not
 *
 * MARK (`launch: true`) — the launcher means "start this specific thing now" and starts
 * nothing itself:
 *   - `features/library/ContinueReadingSection` — the reported entry point.
 *   - `app/…/book/[id]`'s auto-open push — the only route into the player for
 *     `playlist/[collectionId]`, which sets the queue and navigates without ever calling
 *     `play()`, and for a `/book/x?section=y` deep link.
 *
 * DO NOT MARK — the launcher owns its own playback, so a second start would race it:
 *   - `(tabs)/(feed)/feed.tsx` — `await playQueueItem(item)` right after navigating, which
 *     threads `startFromZero` (Story 17.16) that a plain section load would lose.
 *   - `book/[id]`'s Play button — `togglePlay()` before `openFullPlayer`, so the engine is
 *     already 'loading' by the time the player mounts.
 *   - `book/[id]`'s "Show more" — read mode starts no audio at all.
 *   - the mini-player — it opens on whatever is playing and must never reload it.
 */

/** The launch marker's query key. Present-and-`'1'` means "start this target". */
const LAUNCH_PARAM = 'launch';

export interface PlayerRouteOptions {
  /** The book to show — and, with `launch`, to start. */
  bookId: string;
  /** The section TYPE (e.g. `summaryBrief`), never a book id. */
  sectionType: string;
  /** Open in read mode: silent, no audio. */
  initialMode?: 'read';
  /**
   * Mark this open as an explicit LAUNCH: "start this book + section now, even over
   * whatever is currently playing". Omit it whenever the caller establishes playback
   * itself — see the file docblock for the full who-marks list.
   */
  launch?: boolean;
}

/**
 * Build the `/player` href. The only builder — see the docblock for why.
 *
 * Returns expo-router's typed-route literal so `router.push` / `router.navigate` accept it
 * without a cast (the router's `Href` union admits `/player?${string}`).
 */
export function playerRoute({
  bookId,
  sectionType,
  initialMode,
  launch,
}: PlayerRouteOptions): `/player?${string}` {
  const query = [
    `section=${encodeURIComponent(sectionType)}`,
    `bookId=${encodeURIComponent(bookId)}`,
  ];
  if (initialMode) query.push(`initialMode=${initialMode}`);
  if (launch) query.push(`${LAUNCH_PARAM}=1`);
  return `/player?${query.join('&')}` as `/player?${string}`;
}

/**
 * Read the marker back. The single predicate both halves of the fix consume: the player
 * route decides display precedence with it, and hands the (latched) answer to `AudioPlayer`
 * as a prop — so the two can never drift into disagreeing about what a launch is.
 *
 * A launch must name its target, hence the `bookId` requirement: a marker with no book
 * says "start" without saying what.
 */
export function isPlayerLaunch(params: { launch?: string; bookId?: string }): boolean {
  return params[LAUNCH_PARAM] === '1' && !!params.bookId;
}
