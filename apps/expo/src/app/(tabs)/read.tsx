import { FlashList, type FlashListRef } from '@shopify/flash-list';
import * as Crypto from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { SURAH_METADATA, type Verse } from 'quran-data';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type ViewToken } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorView } from '@/components/ui';
import { clampArabicFontSize } from '@/constants/arabic';
import { CHROME_BAR_HEIGHT } from '@/constants/navigation';
import { SPACING, screenContentStyle } from '@/constants/spacing';
import { useResumeListening } from '@/features/audio';
import {
  nextSurah,
  prevSurah,
  ReadingChrome,
  SurahNavigator,
  useChromeReveal,
  useSurah,
  useSurfaceTap,
  VerseRow,
} from '@/features/reading';
import { addBookmark, removeBookmark, useBookmarks, usePreferences } from '@/lib/sync';
import { openingPosition, usePosition, verseKey } from '@/lib/usePosition';
import { useThemedStyles } from '@/lib/useThemedStyles';
import {
  useActiveVerseKey,
  useAudioPlayerStore,
  usePlaybackControls,
  usePlaybackStatus,
} from '@/stores/audioPlayerStore';

/**
 * READING MODE — the verse-by-verse surface (story 6-1; a TAB ROUTE since story 6-6).
 *
 * ⚠️ ITS ADDRESS CHANGED IN 6-6 AND ITS IMMERSION DID NOT. This file lives inside `(tabs)` and
 * serves `/read`; the old root-sibling `fullScreenModal` registration is gone. "Immersive" is now
 * a property WE own rather than one inherited from a presentation: the chrome overlays and starts
 * hidden, and the navigator draws no bar and no header of its own (`(tabs)/_layout.tsx` renders a
 * null tab bar — `AppTabBar` is mounted HERE, inside `ReadingChrome`, riding the same reveal as
 * the header, because two mechanisms at two speeds is the recorded `chrome-render-storm` defect).
 *
 * ⚠️ THIS FILE MUST NEVER CONTAIN THE STRING `headerShown`. The tab navigator hides its header
 * per-layout; a local screen-options object putting one back would re-open the native-header
 * question the reserved-words gate exists for. `custom-chrome.test.ts` scans this source for it.
 *
 * ── The five things this screen is careful about ─────────────────────────────────────────────
 *
 * 1. **ONE WRITE PER VERSE CHANGE, ZERO WITHIN A VERSE.** `onViewableItemsChanged` reports the
 *    top visible verse as often as it likes; `usePosition` writes only when the `(surah, verse)`
 *    pair actually differs. The screen holds no comparison — that is the whole design. The
 *    pre-fork build fired a database transaction per scroll tick and burned a day of the
 *    account-wide write budget in 4.6 hours.
 *
 * 2. **NO FIXED HEIGHT AND NO `initialScrollIndex`.** Verse height varies with the Arabic
 *    length, the font size and the width; a fixed estimate accumulated thousands of pixels of
 *    error over Al-Baqarah's 286 verses. The saved position is restored by ONE imperative
 *    `scrollToIndex` after the target surah's rows load, which measures rather than predicts.
 *
 * 3. **THE CHROME OVERLAYS AND NEVER OCCUPIES LAYOUT.** The list reserves padding for both bars
 *    permanently, so revealing or dismissing them changes nothing about where a verse sits. The
 *    reservation is `CHROME_BAR_HEIGHT + insets` at each end — the bottom bar is now the app's
 *    own tab bar, and it is the SAME height constant, so there is no second number to drift.
 *
 * 4. **THE TARGET PAIR IS RESOLVED AS A PAIR, AND RE-RESOLVED ONLY ON FOCUS.** `openingPosition`
 *    clamps the saved row into the book as one value — it lives in `lib/usePosition.ts` since
 *    story 7-7 gave the listening resume the same clamp, and the three half-trust defects it
 *    closes are documented there. While this screen is focused the reader owns where they are — a sync
 *    arriving mid-read never yanks them. But a tab switch or mode toggle is a NAVIGATION: on
 *    focus the saved pair is re-resolved, and if the other renderer moved it, this one jumps to
 *    match — one position, two renderers, which is what makes the mushaf↔reading toggle mean
 *    "same place, different renderer" (story 6-6's acceptance) rather than "wherever this tab
 *    happened to be last".
 *
 * 5. **THE TAP IS AN RNGH GESTURE** (`Gesture.Tap()` over the whole surface,
 *    `.cancelsTouchesInView(false)` so it cannot kill the Pressables inside its area). A
 *    full-screen `Pressable` blocked scrolling outright and a per-row press left no "elsewhere"
 *    to tap — both measured in 6-1; see that story's write-up for the three attempts. ⚠️ Since
 *    story 7-6 the gesture and its empty-area rule live in `useSurfaceTap`, shared with the
 *    mushaf: a press on the Arabic or on the bookmark control no longer ALSO toggles the chrome
 *    (6-4 named that double-fire and accepted it; the owner reversed the call on 2026-09-09).
 *
 * 6. **A VERSE PRESS SELECTS, AND NOTHING ON THIS SCREEN STARTS AUDIO ANY MORE** (story 7-8).
 *    Pressing the Arabic reveals the chrome with that ayah OUTLINED; the empty-area tap reveals
 *    it with nothing selected. Both go through `useChromeReveal`, which holds the selection so it
 *    cannot outlive the bars. The only path from a verse to sound is the contextual row inside
 *    the footer — 7-1's `onPressVerse` → `useVerseSeek` wiring is gone from here, because
 *    `seekToVerse` plays whenever the player is not already playing and a reading app must not
 *    make noise on a mistap.
 */

/**
 * ⚠️ MODULE SCOPE, NOT A RENDER-TIME OBJECT. FlashList documents that changing
 * `viewabilityConfig` on the fly is not supported, and the FlatList this is mocked as under Jest
 * throws outright. 50% because the reported verse is what the reader is READING: a sliver of the
 * next ayah entering the viewport is not a move to it.
 */
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50 } as const;

/** The verse a surah change lands on. */
const FIRST_VERSE = 1;

export default function Read() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  /**
   * ⚠️ THE HEADER OVERLAYS THE LIST, SO EVERY PROGRAMMATIC SCROLL MUST SUBTRACT IT. `paddingTop`
   * keeps the chrome off the verses while the reader scrolls by hand, but `scrollToIndex` aligns
   * the row with the top of the VIEWPORT — which is behind the header — so an auto-scroll parked
   * the target verse's first line under the bar and the reader lost it. Passing this as
   * `viewOffset` puts the row's top exactly where the padding would have. It is the same number
   * as `paddingTop` for the same reason, so the two can never drift apart.
   *
   * ⚠️ IT IS PASSED NEGATED, AND THE SIGN IS THE WHOLE FIX. FlashList adds `viewOffset` to the
   * target offset (`finalOffset += viewOffset` in `useRecyclerViewController`), so a POSITIVE
   * value scrolls further down and drives the row deeper under the header — the opposite of what
   * the name suggests, and measured doing exactly that on a six-line ayah while a three-line one
   * looked fine. Subtracting is what lifts the row clear of the bar.
   */
  const headerInset = CHROME_BAR_HEIGHT + insets.top + SPACING.md;

  const reveal = useChromeReveal();
  const { saved, reportVerse } = usePosition();
  const { data: preferences } = usePreferences();
  const { data: bookmarks } = useBookmarks();
  // ⚠️ THREE SEPARATE SUBSCRIPTIONS, NOT ONE. `useActiveVerseKey` is the only one that moves per
  // ayah; the controls are stable function references and the status changes a handful of times
  // per listen. Selecting them together would re-derive all three on every ayah change.
  const activeVerseKey = useActiveVerseKey();
  const { playSurah, pause, resume } = usePlaybackControls();
  const playback = usePlaybackStatus();

  // ⚠️ THE PAIR IS RESOLVED ONCE PER FOCUS, AND BOTH HALVES COME FROM THE SAME READ. Within a
  // focused session the reader owns where they are: re-reading the row on every render would
  // yank them back each time another device synced. See `clampPosition` in `lib/usePosition.ts`
  // (which `openingPosition` is the top-of-the-book wrapper around) for why reading the surah
  // on one render and the verse on another is a defect and not a detail.
  const [target, setTarget] = useState(() => openingPosition(saved));
  const [surah, setSurah] = useState(target.surah);
  const content = useSurah(surah);

  const fontSize = clampArabicFontSize(preferences?.fontSize);

  const listRef = useRef<FlashListRef<Verse>>(null);
  // ⚠️ ONE restore per TARGET. Without the latch, tapping "next surah" would scroll the new
  // surah's list to the saved verse index of the old one. A focus resync resets it.
  const restored = useRef(false);
  // ⚠️ THE SURAH THE LIST IS ACTUALLY SHOWING, mirrored into a ref because the viewability
  // handler must stay identity-stable (see below) and still be able to reject stale rows.
  const showing = useRef(target.surah);
  // The verse the reader is on. A ref, not state: since 6-6 nothing renders it (the chrome
  // carries controls, not what the page shows), and the focus resync below compares against it
  // without re-creating its callback (a fresh callback per verse would re-run the effect per
  // verse). Seeded from the clamped target so it is in range before any viewability callback.
  const visibleVerseRef = useRef(target.verse);
  // The saved row, as a ref, for the same reason: the focus effect reads it at FOCUS time.
  const savedRef = useRef(saved);
  savedRef.current = saved;
  // ⚠️ PLAYBACK, MIRRORED INTO A REF, for the `bookmarkIdsRef` reason exactly: `onSelectVerse` is
  // handed to every row and must stay identity-stable, or `VerseRow`'s memo stops working and the
  // highlight starts re-rendering all 286 rows of Al-Baqarah.
  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  /**
   * ⚠️ THE FOCUS RESYNC — story 6-6's "one position, two renderers". Runs on every focus of this
   * tab (the first mount included, where it is a no-op because the mount already resolved the
   * same pair). If the saved pair moved while this screen was blurred — the mushaf turned pages,
   * another device synced — the screen re-targets and the restore effect below re-applies it.
   * If nothing moved, nothing happens, which is what keeps a plain tab switch from scrolling.
   */
  const { clearSelection } = reveal;
  useFocusEffect(
    useCallback(() => {
      const fresh = openingPosition(savedRef.current);
      if (fresh.surah === showing.current && fresh.verse === visibleVerseRef.current) return;
      // ⚠️ THE SELECTION DIES WITH THE AYAH IT POINTS AT (story 7-8's review). A resync jumps the
      // reader somewhere else without touching the chrome, so the row would go on offering
      // play-from-here and a bookmark for a verse that is no longer on screen.
      clearSelection();
      showing.current = fresh.surah;
      visibleVerseRef.current = fresh.verse;
      restored.current = false;
      setTarget(fresh);
      setSurah(fresh.surah);
    }, [clearSelection])
  );

  useEffect(() => {
    if (restored.current) return;
    if (content.loading || content.verses.length === 0) return;
    // ⚠️ The ROWS on screen must be the surah the target named — asked of the rows THEMSELVES,
    // not of `content.surah`, which is the prop echoed straight back: during the one commit
    // where the surah state has changed but `useSurah`'s clearing effect has not run yet, the
    // prop already says the new number while the OLD surah's rows are still in state (and
    // `loading` is still stale-false). Consuming the latch on that commit is how a cross-surah
    // focus resync scrolled nowhere — caught by the 6-6 resync test, kept as the guard here.
    if (content.verses[0]?.surah !== target.surah) return;
    restored.current = true;
    const index = content.verses.findIndex((v) => v.verse === target.verse);
    if (index > 0) {
      /**
       * ⚠️ DEFERRED UNTIL THE LIST HAS MEASURED, AND THAT IS THE WHOLE BUG. Calling
       * `scrollToIndex` here — the moment the rows arrive — asks a variable-height FlashList to
       * jump to an index it has not measured yet, so it scrolls to an ESTIMATED offset. On
       * Android that estimate lands far past the real content and the viewport is left on empty
       * space: no rows, no error, no empty state. Measured on a Pixel 9 Pro 2026-08-28 — the
       * entire reading surface was blank for any saved position past the first screen, while the
       * data was fine (110 verses in state, `renderItem` called for the right window) and both
       * containers measured 426×952. Disabling this one call was what made the page appear.
       *
       * `onLoad` fires once the list has laid out and measured, so the pending scroll is drained
       * there instead. A resync AFTER that point can scroll immediately, because by then the
       * measurements are real.
       */
      listRef.current?.scrollToIndex({ index, animated: false, viewOffset: -headerInset });
      // ⚠️ AND AGAIN ON THE NEXT FRAME — THE SECOND CALL IS THE FIX, NOT A BELT-AND-BRACES.
      // The first `scrollToIndex` runs the moment the rows arrive, before FlashList has MEASURED
      // any of them, so it scrolls to an ESTIMATED offset. On Android that estimate lands far
      // past the real content and the reader gets a blank viewport: no rows, no error, no empty
      // state, with 110 verses correctly in state and `renderItem` called for the right window.
      // Measured on a Pixel 9 Pro 2026-08-28 — deleting this one call was what made the surface
      // appear. By the next frame the rows are measured, so the same index resolves to the true
      // offset. Deliberately NOT gated on FlashList's `onLoad`: that fires once per MOUNT, so a
      // resync into a different surah (same mount, new rows) would wait for an event that never
      // comes again. A repeat scroll is idempotent; a missed one is a blank page.
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index, animated: false, viewOffset: -headerInset });
      });
      return;
    }
    // Verse 1 and "not found" both mean the TOP — and the top is only "where the list already
    // is" on a fresh mount. On a focus resync the reader can be anywhere in the surah, so this
    // must be a real scroll: measured in the 6-4 device smoke, tapping a verse-1 bookmark row
    // while scrolled to 13:12 navigated and then went nowhere, because the early return here
    // assumed mount geometry. `scrollToOffset(0)` is a no-op on a mounted-at-top list, so the
    // mount path is unchanged.
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [content.loading, content.verses, content.surah, target, headerInset]);

  /**
   * ⚠️ A SURAH THAT READS CLEAN AND EMPTY IS ITS OWN STATE, NOT A BLANK SCREEN. `getSurahVerses`
   * answers `[]` rather than throwing for anything it cannot find, so a corrupt table would give
   * the reader a surface with no verses, no error, and — because the next-surah control is the
   * list's footer — no way forward either. `loading` guards the ordinary gap between a surah
   * change and its rows landing, which is not this.
   */
  const isEmpty = !content.loading && content.error === null && content.verses.length === 0;

  // ⚠️ THE ERROR AND EMPTY SURFACES REVEAL THE CHROME. It is hidden on arrival, so on every
  // other screen the way out is one tap away — but on a screen that has failed, "guess that a
  // tap does something" is not an exit. The tab bar the reveal brings back is the way out.
  const { show } = reveal;
  useEffect(() => {
    if (content.error !== null || isEmpty) show();
  }, [content.error, isEmpty, show]);

  /**
   * ⚠️ THE READING VIEW FOLLOWS THE RECITATION, INCLUDING ACROSS A SURAH BOUNDARY: the screen
   * re-targets the new surah, its rows load, and the next run of this effect scrolls. The restore
   * latch is CONSUMED on the way through — otherwise the restore effect would fight this one and
   * scroll back to the saved verse the moment the new surah's rows arrived.
   *
   * ⚠️ AND IT FOLLOWS THE TRACK, NOT ONLY THE AYAH KEY (story 7-7). Until this story the effect
   * read `activeVerseKey` alone, which the store leaves NULL for the whole track whenever
   * `highlightAvailable` is false — a surah whose downloaded manifest is incomplete, the case
   * `isSurahTimed` exists for. That was survivable while a cold press always played the surah on
   * screen, because audio and screen could not then disagree. A resume can start ANY surah, so an
   * untimed one would leave the reader hearing Al-Kahf while looking at Al-Fatihah, with no
   * highlight and no explanation. The track's surah is known even when the ayah is not, so the
   * surah is what the screen follows in that case — and where the ayah IS known it still follows
   * that too. (It also makes `togglePlay`'s `resume()` branch reachable after a resume: it
   * compares the loaded track against the surah on screen, which was only ever false because the
   * screen had failed to follow.)
   */
  useEffect(() => {
    /**
     * ⚠️ ONLY WHILE PLAYING, AND THAT GUARD IS A FIX RATHER THAN A TIGHTENING. `pause()` leaves
     * the active key set, and this effect also depends on `content.verses` — so after pausing,
     * every later surah change (the index picker, a focus resync from the mushaf) re-ran it with
     * the STALE key and dragged the reader straight back to the audio's surah, consuming the
     * restore latch on the way. A paused recitation must not own where the reader is.
     */
    if (playback.playbackState !== 'playing') return;

    // The ayah, when the manifest can name one; otherwise only the track's surah is knowable.
    let audioSurah: number | null = null;
    let audioVerse: number | null = null;
    if (activeVerseKey) {
      const [keySurah, keyVerse] = activeVerseKey.split(':').map(Number);
      if (Number.isInteger(keySurah) && Number.isInteger(keyVerse)) {
        audioSurah = keySurah;
        audioVerse = keyVerse;
      }
    }
    if (audioSurah === null) audioSurah = playback.surah;
    if (audioSurah === null) return;

    if (audioSurah !== showing.current) {
      showing.current = audioSurah;
      // An untimed track names no ayah, so the honest landing is the top of its surah — the same
      // claim `savePosition` makes when it stores ayah 1 rather than a lookup it cannot trust.
      visibleVerseRef.current = audioVerse ?? FIRST_VERSE;
      restored.current = true;
      setSurah(audioSurah);
      return;
    }
    if (audioVerse === null) return; // already on the track's surah, and no ayah to scroll to
    visibleVerseRef.current = audioVerse;
    const index = content.verses.findIndex((v) => v.verse === audioVerse);
    if (index < 0) return;
    listRef.current?.scrollToIndex({ index, animated: true, viewOffset: -headerInset });
    /**
     * ⚠️ AND AGAIN NEXT FRAME ON THE ROWS' FIRST RUN — the recorded Android defect, which a
     * track change walks straight into. When audio crosses into a new surah this effect fires as
     * that surah's rows arrive, and FlashList has not MEASURED them yet, so `scrollToIndex`
     * resolves against an ESTIMATE that on Android lands far past the real content and leaves a
     * blank viewport. The restore effect above carries the same pair of calls for the same
     * reason; a repeat scroll is idempotent, a missed one is a blank page.
     */
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, animated: false, viewOffset: -headerInset });
    });
  }, [activeVerseKey, playback.surah, content.verses, playback.playbackState, headerInset]);

  /**
   * The one reading-position write a listening session makes. Fires when playback LEAVES the
   * playing state — a pause, a stop, an error — so where the reader stopped listening becomes
   * where they resume reading.
   *
   * ⚠️ EXCEPT AFTER A RESUME THAT MOVED THE READER (story 7-7, frozen boundary: "resuming
   * playback must not write one"). 7-1 wrote this unconditionally, which was true of every
   * session it could see: audio always started from what was on screen, so the pair this writes
   * was the reader's own. A resumed session's pair is the AUDIO's — the screen followed it there
   * — and writing it would move the reader to a place they never went, one pause after a press
   * that was careful not to. `sessionRelocated` on the playback store is the session's own verdict rather
   * than a per-screen ref, because the reader can resume from the mushaf's transport and pause
   * here.
   */
  const wasPlaying = useRef(false);
  /**
   * ⚠️ ONLY THE FOCUSED SURFACE WRITES. Both reading tabs can be mounted at once, so without this
   * a single pause fired BOTH stop-writes — and the mushaf's is the settled page's FIRST verse,
   * which would land after the reading verse and overwrite it with an earlier ayah. The reader
   * pauses at 2:255 and resumes at 2:253.
   */
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
        // ⚠️ AND THE SELECTION GOES WITH THE SURFACE (story 7-8's review). The MODE TOGGLE is the
        // one navigation that leaves this screen's chrome revealed — it is a plain `navigate`, so
        // nothing here unmounts — and coming back to a row acting on an ayah the reader chose two
        // renderers ago is the wrong-surah class in a new place. Blur is the edge that covers the
        // toggle, a tab switch and a push in one rule.
        clearSelection();
      };
    }, [clearSelection])
  );
  useEffect(() => {
    const playing = playback.playbackState === 'playing';
    const relocated = useAudioPlayerStore.getState().sessionRelocated;
    if (wasPlaying.current && !playing && focused.current && !relocated) {
      reportVerse(showing.current, visibleVerseRef.current);
    }
    wasPlaying.current = playing;
  }, [playback.playbackState, reportVerse]);

  const styles = useThemedStyles((theme) => ({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background.primary,
    },
    surface: {
      flex: 1,
    },
  }));

  /**
   * ⚠️ THE PADDING IS PERMANENT, AND THAT IS WHAT MAKES "CHROME DOES NOT SHIFT CONTENT" TRUE.
   * Reserving it only while the bars are shown would move every verse on each toggle — the exact
   * failure the criterion names. The bottom sum clears the safe-area inset and the tab bar, so
   * the last verse AND the next-surah control below it stay fully visible and tappable.
   */
  const listContentStyle = useMemo(
    () => ({
      ...screenContentStyle('main'),
      paddingTop: headerInset,
      paddingBottom: CHROME_BAR_HEIGHT + insets.bottom + SPACING.xxl,
    }),
    [headerInset, insets.bottom]
  );

  /**
   * ⚠️ STABLE ACROSS SURAH CHANGES, on purpose — a swapped handler mid-list is what FlatList
   * (which FlashList is mocked as under Jest) refuses. Which is why the "are these rows still
   * ours?" question is answered from a ref rather than from `surah`.
   *
   * ⚠️ THAT GUARD IS A REAL FIX, NOT DEFENCE IN DEPTH. `goToSurah` scrolls the list to the top,
   * and for one round it did so while the OLD surah's rows were still the list's data — so
   * viewability fired and reported `(oldSurah, 1)`, and `usePosition` wrote it. Measured: a
   * reader at 1:7 tapped "next" and the writes were `[{1,7}, {1,1}]` before the new rows
   * existed. `useSurah` clears its rows on a surah change too; the two fixes are independent,
   * because either alone still leaves the other window open.
   */
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<Verse>[] }) => {
      const top = viewableItems[0]?.item;
      if (!top) return;
      if (top.surah !== showing.current) return;
      visibleVerseRef.current = top.verse;
      /**
       * ⚠️ NOT WHILE THE RECITATION IS PLAYING (story 7-1). During playback the scrolling is the
       * APP's, following the audio — so reporting it would turn an hour's listening into a synced
       * reading-position write every few seconds. `usePosition` throttles to one write per verse
       * CHANGE, which is exactly what an advancing recitation produces. The position is written
       * once when playback stops, by the effect below.
       */
      if (playbackRef.current.playbackState === 'playing') return;
      // Reported every time. `usePosition` decides whether it is a write.
      reportVerse(top.surah, top.verse);
    },
    [reportVerse]
  );

  /**
   * The verses this list holds a bookmark for — `verseKey` → the bookmark's id, so the toggle
   * can remove by id and the rows can render their state. Rebuilt when the cache changes; the
   * cache itself is applied SYNCHRONOUSLY by `addBookmark`/`removeBookmark`, which is what makes
   * the indicator flip on the same interaction with no optimistic-update code here (story 6-4).
   */
  const bookmarkIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of bookmarks ?? []) map.set(verseKey(b.surah, b.verse), b.id);
    return map;
  }, [bookmarks]);
  // Mirrored into a ref (the `showing.current` pattern above) so ONE stable callback serves
  // every row — a fresh callback per cache change would defeat `VerseRow`'s load-bearing memo.
  const bookmarkIdsRef = useRef(bookmarkIds);
  bookmarkIdsRef.current = bookmarkIds;

  const toggleBookmark = useCallback((surah: number, verse: number) => {
    // ⚠️ THE PAIR COMES FROM THE ROW, NOT FROM `showing.current`. The ref moves synchronously in
    // `goToSurah` AND the focus resync while the OLD surah's rows are still rendered and tappable
    // (a resync's rows load async from SQLite), so reading it here minted the new surah paired
    // with an old row's verse — 6-4's review. The row reports the pair it renders; the callback
    // stays identity-stable because everything else it touches is a ref or a module function.
    const id = bookmarkIdsRef.current.get(verseKey(surah, verse));
    if (id) {
      removeBookmark(id);
      return;
    }
    // Client-minted id (the `lib/auth.ts` `randomUUID` convention): an offline create keeps its
    // identity through the drain, and a retry is idempotent on the worker's unique index.
    addBookmark({ id: Crypto.randomUUID(), surah, verse });
  }, []);

  /**
   * ⚠️ A VERSE PRESS SELECTS; IT DOES NOT PLAY (story 7-8). Story 7-1 wired this straight to
   * `useVerseSeek`, whose `seekToVerse` calls `play()` in any state that is not already playing —
   * so on a reading app every press of the Arabic was one tap from sound, including from a cold
   * launch and from paused. It now reveals the chrome with this ayah selected, and the row inside
   * the footer carries play-from-here. THIS SCREEN NO LONGER TOUCHES THE AUDIO ENGINE FOR A
   * VERSE.
   *
   * ⚠️ The pair still comes from the ROW (see `toggleBookmark` for the defect that taught this),
   * and this callback is identity-stable — `revealFor` is a `useCallback` with no dependencies —
   * which is what `VerseRow`'s memo needs.
   */
  const { revealFor } = reveal;
  const onSelectVerse = useCallback(
    (surah: number, verse: number) => revealFor({ surah, verse }),
    [revealFor]
  );

  /**
   * ⚠️ A PLAYBACK FAILURE REVEALS THE CHROME, for the reason a failed mushaf page does: the error
   * is drawn INSIDE the chrome, so leaving it hidden would put the message and its retry behind a
   * tap the reader has no reason to make.
   */
  useEffect(() => {
    if (playback.errorKey !== null) show();
  }, [playback.errorKey, show]);

  /**
   * ⚠️ WHERE A COLD PRESS LANDS IS NOT THIS SCREEN'S DECISION (story 7-7). The saved LISTENING
   * position is a different thing from the reading position — that is the epic's criterion — so
   * the first press after a relaunch resumes where the recitation stopped rather than where the
   * reader happens to be scrolled. `useResumeListening` owns the row, its clamp and the "is
   * anything loaded?" question, so the mushaf's transport gets the identical rule instead of a
   * second copy of it. Identity-stable, so this callback stays stable for the chrome.
   */
  const resolveListeningStart = useResumeListening();

  /** The chrome's transport: resume, pause, or start where the reader left off listening. */
  const togglePlay = useCallback(() => {
    const { surah: trackSurah, playbackState } = playbackRef.current;
    if (playbackState === 'playing') {
      void pause();
      return;
    }
    if (trackSurah === showing.current && playbackState === 'paused') {
      void resume();
      return;
    }
    // Nothing loaded: the saved listening pair if there is a usable one, else what is on screen.
    const start = resolveListeningStart({
      surah: showing.current,
      verse: visibleVerseRef.current,
    });
    void playSurah(start.surah, start.verse);
  }, [pause, resume, playSurah, resolveListeningStart]);

  const goToSurah = useCallback(
    (next: number) => {
      // The selected ayah belonged to the surah being left — see the focus resync above.
      clearSelection();
      // Synchronously, BEFORE the scroll: the viewability callback that the scroll provokes must
      // already see the new surah as the one we are showing.
      showing.current = next;
      visibleVerseRef.current = FIRST_VERSE;
      setSurah(next);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    },
    [clearSelection]
  );

  /**
   * ⚠️ ONE TAP GESTURE FOR THE WHOLE SURFACE — see the file header for the two shapes this
   * replaces and why each failed. Built by `useSurfaceTap`, which also owns the empty-area rule:
   * `onChildPressIn` goes to every row, and a touch that starts on one suppresses the toggle.
   *
   * ⚠️ `toggle` IS `revealFor(null)` SINCE STORY 7-8 — "reveal with NOTHING selected". This
   * gesture fires exactly where no child took the touch, which is the definition of an empty
   * area, and an empty area names no ayah to act on.
   */
  const { toggle } = reveal;
  const { gesture: surfaceTap, onChildPressIn } = useSurfaceTap(toggle);

  /** The selected ayah as a key, compared ONCE here so each row takes a boolean (story 7-8) —
   *  the `highlighted` discipline, for the reason `VerseRow`'s memo docblock spells out. */
  const selectedKey = reveal.selectedVerse
    ? verseKey(reveal.selectedVerse.surah, reveal.selectedVerse.verse)
    : null;

  const renderItem = useCallback(
    ({ item }: { item: Verse }) => (
      <VerseRow
        surah={item.surah}
        verse={item.verse}
        text={item.textUthmani}
        fontSize={fontSize}
        bookmarked={bookmarkIds.has(verseKey(item.surah, item.verse))}
        onToggleBookmark={toggleBookmark}
        highlighted={activeVerseKey === verseKey(item.surah, item.verse)}
        selected={selectedKey === verseKey(item.surah, item.verse)}
        onSelectVerse={onSelectVerse}
        onInteractionStart={onChildPressIn}
        testID={`verse-${item.surah}:${item.verse}`}
      />
    ),
    [
      fontSize,
      bookmarkIds,
      toggleBookmark,
      activeVerseKey,
      selectedKey,
      onSelectVerse,
      onChildPressIn,
    ]
  );

  const title = content.meta?.nameTransliteration ?? null;
  /**
   * ⚠️ DERIVED ONCE, EACH DIRECTION. It used to be computed three times per press — three places
   * for the label and the destination to drift apart. Story 6-3 adds the previous direction under
   * the same single-derivation rule.
   *
   * ⚠️ THE DESTINATION NAMES COME FROM `quran-data`, WHILE THE TITLE ABOVE COMES FROM THE
   * DATABASE, and the split is deliberate rather than an oversight. The title DESCRIBES the rows
   * on screen, so it must be read from the same file those rows came from. A navigator label
   * describes a destination nothing has loaded yet — reading it from the database would mean a
   * second async read to draw a button. `quranDb.test.ts` asserts the two tables agree for all
   * 114, which is what makes this safe to say.
   */
  const upcoming = nextSurah(surah);
  const nextSurahName = SURAH_METADATA[upcoming - 1]?.nameTransliteration ?? String(upcoming);
  const preceding = prevSurah(surah);
  const prevSurahName = SURAH_METADATA[preceding - 1]?.nameTransliteration ?? String(preceding);

  return (
    <View style={styles.screen} testID="reading-surface">
      {/* ⚠️ NO SPINNER, DELIBERATELY. The text is bundled, so the read is fast on every launch
          after the first, and a loading view would flash for one frame — the epic's rule is that
          loading is the exception and sync is invisible. The ERROR and EMPTY states are
          different: a database that cannot be read, or a surah that reads clean with no rows,
          must be a real surface with a retry — never a blank screen. */}
      <GestureDetector gesture={surfaceTap}>
        <View style={styles.surface} testID="reading-tap-surface">
          {content.error !== null || isEmpty ? (
            <ErrorView
              title={
                content.error
                  ? t('common:reading.unreadableTitle')
                  : t('common:reading.noVersesTitle')
              }
              message={
                content.error
                  ? t('common:reading.unreadableBody')
                  : t('common:reading.noVersesBody')
              }
              onAction={content.reload}
              // ⚠️ THE RETRY MUST NOT TOGGLE THE CHROME. This surface was revealed STICKILY by
              // `show()` above because it carries the only exit; a retry that also ran `toggle()`
              // would take that exit away — and clear the sticky mark — at the moment the reader
              // is trying to recover.
              onActionPressIn={onChildPressIn}
              fullScreen
              testID="reading-error"
            />
          ) : (
            <FlashList
              ref={listRef}
              data={content.verses}
              renderItem={renderItem}
              keyExtractor={(item) => `${item.surah}:${item.verse}`}
              contentContainerStyle={listContentStyle}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={VIEWABILITY_CONFIG}
              /* ⚠️ NO `delaysContentTouches` HERE, AND THAT IS A CHECKED ANSWER RATHER THAN AN
                 OVERSIGHT — story 7-6's review raised it as a threat to `useSurfaceTap`'s
                 ordering argument. UIKit's own default IS `true`: UIScrollView withholds a
                 content touch (and therefore a child's `onPressIn`) while it decides whether the
                 finger is dragging, while the surface tap's recogniser sits on an ancestor and is
                 not delayed — which on iOS could run the tap's `onEnd` BEFORE the press-in meant
                 to suppress it. It cannot happen on this stack: the app is New Architecture only,
                 and Fabric's scroll view sets `_scrollView.delaysContentTouches = NO`
                 unconditionally at init (`RCTScrollViewComponentView.mm:145`) — the prop is not
                 forwarded from JS at all, and RN 0.85 exposes no such prop to set. Android and
                 web have no equivalent delay. Re-check this if the app ever leaves the New
                 Architecture. */
              ListFooterComponent={
                content.verses.length > 0 ? (
                  <SurahNavigator
                    prev={preceding}
                    prevName={prevSurahName}
                    next={upcoming}
                    nextName={nextSurahName}
                    onNavigate={goToSurah}
                    onInteractionStart={onChildPressIn}
                  />
                ) : null
              }
              testID="reading-list"
            />
          )}
        </View>
      </GestureDetector>
      <ReadingChrome
        reveal={reveal}
        title={title}
        mode="reading"
        playing={playback.playbackState === 'playing'}
        onTogglePlay={togglePlay}
        errorMessage={playback.errorKey ? t(playback.errorKey) : null}
      />
    </View>
  );
}
