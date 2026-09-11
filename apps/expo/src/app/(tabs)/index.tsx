import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { getFirstVerseForPage, getPageForVerse, SURAH_METADATA, TOTAL_PAGES } from 'quran-data';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View, type ViewToken } from 'react-native';

import { useResumeListening } from '@/features/audio';
import { MushafPage, ReadingChrome, useChromeReveal, WelcomeBackBanner } from '@/features/reading';
import { preloadAdjacentPageFonts } from '@/lib/mushafFonts';
import { type ReadingPositionPair, usePosition } from '@/lib/usePosition';
import { useThemedStyles } from '@/lib/useThemedStyles';
import {
  useActiveVerseKey,
  useAudioPlayerStore,
  usePlaybackControls,
  usePlaybackStatus,
} from '@/stores/audioPlayerStore';

/**
 * MUSHAF MODE — the 604-page facsimile surface (story 6-2), and THE HOME SURFACE since story
 * 6-6: this file is `(tabs)/index.tsx`, so it serves `/` directly — the app opens on the mushaf
 * at the reader's last-read position, with no redirect hop (`app/index.tsx` is deleted, exactly
 * as its own docblock demanded the moment `(tabs)` had an index again).
 *
 * ⚠️ ITS ADDRESS CHANGED IN 6-6 AND ITS IMMERSION DID NOT. The root-sibling `fullScreenModal`
 * registration is gone; "immersive" is a property WE own — the chrome overlays, starts hidden,
 * and the navigator draws no bar and no header of its own. `AppTabBar` is mounted HERE, inside
 * `ReadingChrome`, riding the same reveal driver as the header. This source must never contain
 * the header-visibility option (`custom-chrome.test.ts` scans for it).
 *
 * ── The shapes that are load-bearing here (6-2, plus 6-6's resync) ───────────────────────────
 *
 * 1. **REVERSED DATA, NOT `inverted`.** `PAGE_DATA` is `[604 … 1]`, one strategy on every
 *    platform: page 1 sits at index 603, and advancing a finger left-to-right lands on a LOWER
 *    index = HIGHER page — the RTL page turn. The pre-fork ran `inverted` on native and reversed
 *    data on web because `inverted` broke web scroll/drag.
 *
 * 2. **`initialScrollIndex` IS ALLOWED HERE, AND THE DIFFERENCE FROM `read.tsx` IS THE ITEM.**
 *    A mushaf page is a UNIFORM full-screen item — index × width IS the offset, exactly, so the
 *    restore can be declarative (and the focus resync's `scrollToIndex` exact). The saved
 *    `(surah, verse)` pair is resolved as a pair: `getPageForVerse` answers -1 for any pair not
 *    in the map, and -1 clamps to page 1 — the documented fallback.
 *
 * 3. **ONE POSITION WRITE PER SETTLED PAGE, ZERO WITHIN A PAGE, AND ZERO ON A RESTORE.** The
 *    viewability callback reports the settled page's FIRST verse through `usePosition('mushaf')`,
 *    whose verse-changed comparison is the throttle. The `moved` latch guards the restore: the
 *    target page's own settle is the restore landing, and reporting that page's first verse
 *    would OVERWRITE the saved verse with an earlier one (a reader at 2:255 opens page 42, whose
 *    first verse is 2:253) and spend a write on no movement. ⚠️ Since 6-6 the latch re-arms on a
 *    FOCUS RESYNC too, for the same reason: a jump to where the other renderer moved the pair is
 *    not the reader moving.
 *
 * 4. **THE FOCUS RESYNC — one position, two renderers.** While focused, the reader owns where
 *    they are (a sync arriving mid-read never yanks the page). On focus — a tab switch or the
 *    mode toggle — the saved pair is re-resolved, and if reading mode moved it, this surface
 *    jumps to that verse's page. That is what makes the toggle mean "same place, different
 *    renderer".
 *
 * 5. **THERE IS NO SURFACE GESTURE ON THIS SCREEN, AND THAT IS THE 2026-09-10 CHANGE.** Stories
 *    6-2 through 7-6 put an RNGH tap over the whole pager; the owner replaced it with TWO BANDS
 *    inside the page — its header strip and its page number — which `MushafPage` draws as plain
 *    `Pressable`s. A word press SELECTS its ayah (story 7-8 — it was a seek in 7-6, and nothing
 *    on this screen starts audio any more); everything else on the page does nothing. The bands
 *    reveal the chrome with NOTHING selected, because a band names no ayah. Two things fall
 *    out, both recorded in that file: the cross-system race 7-6 logged is now unwritable (one
 *    touch system, RN's responder, decides alone), and an inter-word gap tap no longer flips the
 *    chrome — under 7-6 roughly one tap in three across a line did. A page-turn swipe is a
 *    ScrollView drag that the bands' `Pressable`s release, exactly as a button inside any list.
 *    `read.tsx` keeps `useSurfaceTap`: its surface has real empty areas and no equivalent bands.
 *
 * 6. **A PAGE THAT FAILS reveals the chrome — on BOTH edges, and only for the page the reader is
 *    LOOKING at.** FlashList renders neighbours off-screen; offline, an uncached neighbour fails
 *    too, and revealing the exit for a page nobody can see would flash the bars mid-read. A page
 *    usually fails while it is still an off-screen neighbour and only becomes visible afterwards
 *    — `failedPages` is what lets the second edge (the page becoming current) ask the question.
 */

/** Module scope — FlashList refuses a changing viewabilityConfig (see `read.tsx`). */
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50 } as const;

/** All 604 pages, REVERSED — see shape 1 in the header. Index i holds page 604 − i. */
const PAGE_DATA: number[] = Array.from({ length: TOTAL_PAGES }, (_, i) => TOTAL_PAGES - i);

/** The list index a page sits at, under the reversed data. */
function pageToIndex(page: number): number {
  return TOTAL_PAGES - page;
}

/**
 * The page this screen targets — the saved pair resolved as a PAIR. A pair the map does not hold
 * answers -1, which clamps to page 1; there is no half-trusted surah or verse for the clamp to
 * miss (the family of defects `lib/usePosition.ts`'s `clampPosition` documents).
 */
function openingPage(saved: ReadingPositionPair | null): number {
  if (!saved) return 1;
  const page = getPageForVerse(saved.surah, saved.verse);
  return page >= 1 && page <= TOTAL_PAGES ? page : 1;
}

export default function Mushaf() {
  const { t } = useTranslation();
  const reveal = useChromeReveal();
  const { saved, reportVerse } = usePosition('mushaf');
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  // Three separate subscriptions, for `read.tsx`'s reason: only the key moves per ayah.
  const activeVerseKey = useActiveVerseKey();
  const { playSurah, pause, resume } = usePlaybackControls();
  const playback = usePlaybackStatus();

  // Resolved once per focus — the reader owns where they are in between (see `read.tsx`).
  const [opening] = useState(() => openingPage(saved));
  const [currentPage, setCurrentPage] = useState(opening);
  // Mirrored into a ref so the error callback can ask "is that the visible page?" without
  // changing identity per page turn (identity-stable handlers are what FlashList requires).
  const currentPageRef = useRef(opening);
  // The restore latch — shape 3 in the header. One-shot per RESTORE TARGET, never a comparison.
  const moved = useRef(false);
  // Where the current restore is headed: the opening page on mount, a fresh page on focus resync.
  const restoreTarget = useRef(opening);
  // The saved row at focus time, without re-creating the focus callback per render.
  const savedRef = useRef(saved);
  savedRef.current = saved;
  // Playback in a ref: the viewability handler must stay identity-stable (FlashList's rule) and
  // still be able to ask whether the page it is reporting was turned by the reader or by audio.
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const listRef = useRef<FlashListRef<number>>(null);
  /**
   * Which pages are currently in a failed state — shape 6 in the header. A SET rather than
   * "the page that just failed", because the reveal has TWO edges: a page can fail while it is
   * still an off-screen neighbour, and then become the page the reader is looking at. Kept
   * honest in both directions (a successful retry removes the entry) so returning to a page
   * that has since loaded does not flash the bars.
   */
  const failedPages = useRef(new Set<number>());
  const { show, clearSelection } = reveal;
  /**
   * Story 6-3: the welcome-back banner's screen-driven dismissal. Flipped where `moved.current`
   * first becomes true — a REAL page move, not the restore settling — because "gone on page
   * movement" must not fire on the open-position landing the latch exists to ignore. The banner
   * decides for itself whether to show at all (the 7-day gate lives in the component).
   */
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const styles = useThemedStyles((theme) => ({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background.primary,
    },
  }));

  /** The focus resync — shape 4 in the header. A no-op on first mount and on any focus where
   * the saved pair still resolves to the page already under the reader. */
  useFocusEffect(
    useCallback(() => {
      const fresh = openingPage(savedRef.current);
      if (fresh === currentPageRef.current) return;
      // ⚠️ THE SELECTION DIES WITH THE AYAH IT POINTS AT (story 7-8's review). A resync turns to
      // another page without touching the chrome, so the row would go on offering
      // play-from-here for a verse that is no longer drawn.
      clearSelection();
      restoreTarget.current = fresh;
      moved.current = false;
      currentPageRef.current = fresh;
      setCurrentPage(fresh);
      listRef.current?.scrollToIndex({ index: pageToIndex(fresh), animated: false });
    }, [clearSelection])
  );

  /**
   * ⚠️ THE SAVED ROW ARRIVES AFTER THE FIRST RENDER, AND WITHOUT THIS THE RESTORE IS LOST FOR THE
   * WHOLE SESSION — not merely delayed. `readCache` answers `undefined` until the anonymous
   * session resolves (`syncCache.ts`: `if (!userId) return undefined`), so `opening` above
   * captures page 1, and the focus resync CANNOT correct it: on mount `fresh` and
   * `currentPageRef.current` are both 1, so it returns early and never runs again for this row.
   * Measured in WebKit 2026-09-10 — a saved Al-Kahf position (page 293) opened page 1 and was
   * still there ten seconds later. `usePosition`'s docblock claimed the opposite ("the row is
   * already there when this hook initialises"); it is now corrected.
   *
   * ⚠️ ONE SHOT, AND ONLY WHILE THE READER HAS NOT MOVED. `moved` is the same latch the restore
   * uses, so a row landing after a page turn changes nothing under the reader's finger — which is
   * the whole reason this is not simply "re-resolve whenever `saved` changes".
   */
  const lateRestore = useRef(false);
  useEffect(() => {
    if (lateRestore.current || moved.current || saved === null) return;
    // Latched on first SIGHT of a row, not on a successful re-target — see `read.tsx` for the
    // regression that taught this (TanStack hands back a fresh identity, so this effect re-runs).
    lateRestore.current = true;
    const fresh = openingPage(saved);
    if (fresh === currentPageRef.current) return;
    // ⚠️ A LATE RESTORE IS A POSITION CHANGE, so it owes the same debt every other one does
    // (7-8's review): the row must stop offering play-from-here for an ayah no longer drawn.
    clearSelection();
    lateRestore.current = true;
    restoreTarget.current = fresh;
    currentPageRef.current = fresh;
    setCurrentPage(fresh);
    listRef.current?.scrollToIndex({ index: pageToIndex(fresh), animated: false });
  }, [saved]);

  // ±2 neighbour fonts, re-aimed on every settled page (and at the opening page on mount).
  // Fire-and-forget: `preloadAdjacentPageFonts` never throws; a miss becomes that page's own
  // retry surface if the reader ever arrives on it.
  useEffect(() => {
    void preloadAdjacentPageFonts(currentPage);
  }, [currentPage]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<number>[] }) => {
      const page = viewableItems[0]?.item;
      if (typeof page !== 'number') return;
      // A SETTLED page is a move — the selected ayah was on the page the reader turned away from
      // (story 7-8's review). Cheap: `clearSelection` returns the same state when nothing is
      // selected, so an ordinary page turn re-renders nothing extra.
      if (page !== currentPageRef.current) clearSelection();
      currentPageRef.current = page;
      setCurrentPage(page);
      // The OTHER edge of the failure reveal — see `failedPages` above for why one is not enough.
      if (failedPages.current.has(page)) show();
      /**
       * ⚠️ "THE READER MOVED" MEANS THE READER — NOT THE RECITATION. This flag already gated the
       * position write for exactly that reason; the banner dismissal sat ABOVE the gate and so
       * counted an audio-driven page turn as a move, which put the welcome-back banner away
       * without the reader ever touching the screen. The banner's whole contract is that it
       * survives until the reader moves or its 4s fade elapses.
       */
      const readerDriven = playbackRef.current.playbackState !== 'playing';
      if (!moved.current && readerDriven) {
        if (page === restoreTarget.current) return; // a restore settling is not a move
        moved.current = true;
        setBannerDismissed(true); // the first real move dismisses the welcome-back banner
      }
      const first = getFirstVerseForPage(page);
      if (first.surah === 0) return; // out-of-range answer — nothing true to write
      // ⚠️ NOT WHILE PLAYING — `read.tsx`'s reasoning, on this surface's cadence. A long listen
      // would otherwise write a position per page. The effect below writes once playback stops.
      if (!readerDriven) return;
      // Reported every time. `usePosition` decides whether it is a write.
      reportVerse(first.surah, first.verse);
    },
    [reportVerse, show, clearSelection]
  );

  /**
   * ⚠️ THE PAGE FOLLOWS THE RECITATION (story 7-1). The active ayah's page is a table read, so
   * this is a lookup and a comparison, not arithmetic on page numbers. Only a CHANGE of page
   * scrolls — an ayah advancing within the page the reader is already on must not re-scroll it,
   * or every few seconds the pager would twitch.
   *
   * ⚠️ AND IT FOLLOWS THE TRACK, NOT ONLY THE AYAH KEY (story 7-7) — `read.tsx` carries the full
   * note. The store leaves `activeVerseKey` NULL for a whole track whose manifest cannot name
   * every ayah, so before this story a resume into such a surah would have left the reader
   * hearing one surah while looking at another. The track's own surah opens at its first ayah,
   * which is the page `savePosition` would have stored for it anyway.
   */
  useEffect(() => {
    let surah: number | null = null;
    let verse: number | null = null;
    if (activeVerseKey) {
      const [keySurah, keyVerse] = activeVerseKey.split(':').map(Number);
      if (Number.isInteger(keySurah) && Number.isInteger(keyVerse)) {
        surah = keySurah;
        verse = keyVerse;
      }
    }
    if (surah === null) {
      surah = playback.surah;
      verse = 1;
    }
    if (surah === null || verse === null) return;
    const page = getPageForVerse(surah, verse);
    if (page < 1 || page > TOTAL_PAGES || page === currentPageRef.current) return;
    currentPageRef.current = page;
    setCurrentPage(page);
    listRef.current?.scrollToIndex({ index: pageToIndex(page), animated: true });
  }, [activeVerseKey, playback.surah]);

  /**
   * The one position write a listening session makes here — `read.tsx`'s effect, same reason, and
   * since story 7-7 with the same exception: a session the saved listening row RELOCATED writes
   * nothing, because the page under the reader is the audio's rather than theirs. See
   * `sessionRelocated` on the playback store.
   */
  const wasPlaying = useRef(false);
  /**
   * ⚠️ ONLY THE FOCUSED SURFACE WRITES — see `read.tsx` for the defect. This one is the more
   * damaging half: a page's FIRST verse is earlier than wherever the reader actually paused, so
   * an unfocused mushaf writing on the reading tab's pause moves them backwards.
   */
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
        // ⚠️ AND THE SELECTION GOES WITH THE SURFACE — see `read.tsx` for the mode-toggle case
        // this blur edge is the one rule for.
        clearSelection();
      };
    }, [clearSelection])
  );
  useEffect(() => {
    const playing = playback.playbackState === 'playing';
    const relocated = useAudioPlayerStore.getState().sessionRelocated;
    if (wasPlaying.current && !playing && focused.current && !relocated) {
      const first = getFirstVerseForPage(currentPageRef.current);
      if (first.surah !== 0) reportVerse(first.surah, first.verse);
    }
    wasPlaying.current = playing;
  }, [playback.playbackState, reportVerse]);

  /**
   * ⚠️ A PLAYBACK FAILURE REVEALS THE CHROME, for the reason a failed mushaf page does: the error
   * is drawn INSIDE the chrome, so leaving it hidden would put the message and its retry behind a
   * tap the reader has no reason to make.
   */
  useEffect(() => {
    if (playback.errorKey !== null) show();
  }, [playback.errorKey, show]);

  /**
   * Where a COLD press lands is not this screen's decision either (story 7-7) — the SAME resolver
   * `read.tsx` uses, so the saved listening position wins over the settled page on both surfaces
   * and there is one rule rather than two that can drift. See `useResumeListening`.
   */
  const resolveListeningStart = useResumeListening();

  /** The chrome's transport: resume, pause, or start where the reader left off listening. */
  const togglePlay = useCallback(() => {
    const { surah: trackSurah, playbackState } = playbackRef.current;
    if (playbackState === 'playing') {
      void pause();
      return;
    }
    // `{0, 0}` for a page the map cannot resolve — carried as the FALLBACK rather than checked
    // here, because a page this screen cannot name is no reason to refuse a saved listening
    // position that names itself perfectly well. The guard moves to the resolver's answer.
    const here = getFirstVerseForPage(currentPageRef.current);
    if (trackSurah === here.surah && here.surah !== 0 && playbackState === 'paused') {
      void resume();
      return;
    }
    const start = resolveListeningStart(here);
    if (start.surah === 0) return; // no usable row AND no usable page — nothing true to play
    void playSurah(start.surah, start.verse);
  }, [pause, resume, playSurah, resolveListeningStart]);

  // Reveal the exit when the VISIBLE page fails — see the header for why not every page.
  const onPageErrorChange = useCallback(
    (page: number, failed: boolean) => {
      if (failed) failedPages.current.add(page);
      else failedPages.current.delete(page);
      if (failed && page === currentPageRef.current) show();
    },
    [show]
  );

  /**
   * ⚠️ NO SURFACE GESTURE HERE — the chrome toggle lives on TWO BANDS inside the page (its header
   * strip and its page number), and `MushafPage` owns them. See that file's docblock for what
   * removing the recogniser bought: the cross-system race is unwritable, and an inter-word gap
   * tap no longer flips the chrome. `read.tsx` still uses `useSurfaceTap`; its surface has large
   * genuine empty areas and no equivalent bands.
   *
   * ⚠️ THE BANDS ARE THE EMPTY AREA, so they reveal with NOTHING selected (story 7-8) — `toggle`
   * is `revealFor(null)`.
   */
  const { toggle, revealFor } = reveal;

  /**
   * ⚠️ A WORD PRESS SELECTS ITS AYAH; IT DOES NOT PLAY IT (story 7-8). Story 7-6 wired this to
   * `useVerseSeek`, which starts playback in any state that is not already playing — and 7-6 had
   * just made every word on the app's PRIMARY surface a press target, so a mistap was one tap
   * from recitation out loud. A word carries exact verse identity (`words[].location`), so the
   * press selects the whole ayah it belongs to and the chrome's row is where that becomes audio.
   * Identity-stable, which is what `renderPage` below needs.
   */
  const onSelectVerse = useCallback(
    (surah: number, verse: number) => revealFor({ surah, verse }),
    [revealFor]
  );

  /** The selected ayah as a key, in the same `"{surah}:{verse}"` shape `activeVerseKey` uses —
   *  `MushafPage` matches it against `location` prefixes, exactly as it does the highlight. */
  const selectedVerseKey = reveal.selectedVerse
    ? `${reveal.selectedVerse.surah}:${reveal.selectedVerse.verse}`
    : null;

  // Every item is exactly one screen — which is what makes `pagingEnabled` page cleanly and
  // `initialScrollIndex` exact (shape 2). Geometry, not theme, so it lives inline.
  const pageStyle = useMemo(
    () => ({ width: screenWidth, height: screenHeight }),
    [screenWidth, screenHeight]
  );

  const renderPage = useCallback(
    ({ item }: { item: number }) => (
      <View style={pageStyle}>
        <MushafPage
          pageNumber={item}
          activeVerseKey={activeVerseKey}
          selectedVerseKey={selectedVerseKey}
          onErrorChange={onPageErrorChange}
          onSelectVerse={onSelectVerse}
          onToggleChrome={toggle}
        />
      </View>
    ),
    [pageStyle, onPageErrorChange, activeVerseKey, selectedVerseKey, onSelectVerse, toggle]
  );

  const keyExtractor = useCallback((item: number) => `page-${item}`, []);

  // What the chrome names: the settled page's surah. The page number is not repeated — the
  // facsimile page draws its own (story 6-6's intent: the header carries controls).
  const surahNumber = getFirstVerseForPage(currentPage).surah;
  const title = SURAH_METADATA[surahNumber - 1]?.nameTransliteration ?? null;

  return (
    <View style={styles.screen} testID="mushaf-surface">
      <FlashList
        ref={listRef}
        data={PAGE_DATA}
        renderItem={renderPage}
        keyExtractor={keyExtractor}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={pageToIndex(opening)}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        /* ⚠️ NO `delaysContentTouches` HERE EITHER — see `read.tsx` for the whole answer.
           The question bites hardest on this list, because it IS the page pager: every word
           press starts inside a scroll view that is deciding about a page turn. Fabric's
           scroll view already sets it to NO unconditionally, and RN 0.85 forwards no such
           prop from JS. */
        testID="mushaf-list"
      />
      {/* Sibling of the chrome, over the pager — NOT inside the reveal: the banner is not
          chrome, and it sits below the header zone so a revealed header never overlaps it. */}
      <WelcomeBackBanner dismissed={bannerDismissed} />
      <ReadingChrome
        reveal={reveal}
        title={title}
        mode="mushaf"
        playing={playback.playbackState === 'playing'}
        onTogglePlay={togglePlay}
        errorMessage={playback.errorKey ? t(playback.errorKey) : null}
      />
    </View>
  );
}
