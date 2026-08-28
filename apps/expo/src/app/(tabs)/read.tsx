import { FlashList, type FlashListRef } from '@shopify/flash-list';
import * as Crypto from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { SURAH_COUNT, SURAH_METADATA, type Verse } from 'quran-data';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type ViewToken } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorView } from '@/components/ui';
import { clampArabicFontSize } from '@/constants/arabic';
import { CHROME_BAR_HEIGHT } from '@/constants/navigation';
import { SPACING, screenContentStyle } from '@/constants/spacing';
import {
  nextSurah,
  prevSurah,
  ReadingChrome,
  SurahNavigator,
  useChromeReveal,
  useSurah,
  VerseRow,
} from '@/features/reading';
import { addBookmark, removeBookmark, useBookmarks, usePreferences } from '@/lib/sync';
import { type ReadingPositionPair, usePosition, verseKey } from '@/lib/usePosition';
import { useThemedStyles } from '@/lib/useThemedStyles';

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
 *    clamps the saved row into the book as one value (the three half-trust defects it closes are
 *    documented on it). While this screen is focused the reader owns where they are — a sync
 *    arriving mid-read never yanks them. But a tab switch or mode toggle is a NAVIGATION: on
 *    focus the saved pair is re-resolved, and if the other renderer moved it, this one jumps to
 *    match — one position, two renderers, which is what makes the mushaf↔reading toggle mean
 *    "same place, different renderer" (story 6-6's acceptance) rather than "wherever this tab
 *    happened to be last".
 *
 * 5. **THE TAP IS AN RNGH GESTURE** (`Gesture.Tap()` over the whole surface,
 *    `.cancelsTouchesInView(false)` so it cannot kill the Pressables inside its area). A
 *    full-screen `Pressable` blocked scrolling outright and a per-row press left no "elsewhere"
 *    to tap — both measured in 6-1; see that story's write-up for the three attempts.
 */

/**
 * ⚠️ MODULE SCOPE, NOT A RENDER-TIME OBJECT. FlashList documents that changing
 * `viewabilityConfig` on the fly is not supported, and the FlatList this is mocked as under Jest
 * throws outright. 50% because the reported verse is what the reader is READING: a sliver of the
 * next ayah entering the viewport is not a move to it.
 */
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50 } as const;

/** Where a reader with no saved position anywhere starts. */
const FIRST_SURAH = 1;
const FIRST_VERSE = 1;

/**
 * The pair this screen targets — clamped into the book, and clamped as a PAIR.
 *
 * ⚠️ THE SAVED ROW IS UNTRUSTED INPUT. It comes out of MMKV, it can be written by a newer build,
 * it survives a downgrade, and it can be corrupt. Three defects came from trusting parts of it:
 *
 *   • the surah was locked on the first render while the VERSE was read again on a later one, so
 *     a row arriving one render late (`{18, 4}` after an initial `null`) opened Al-Fatihah and
 *     scrolled to its fourth ayah — the reader landed on 1:4 instead of 18:4;
 *   • an out-of-range verse (`{1, 999}`) was range-checked by the restore effect and NOT by the
 *     chrome, which rendered `Page -1 · 1:999` to the reader;
 *   • an out-of-range surah (`{200, 1}`) reached `getSurahVerses`, which answers `[]` — a blank
 *     screen with no verses, no error, and no next-surah control to escape by.
 *
 * So the whole pair is resolved in one place. An out-of-range surah resets the VERSE too: a
 * verse number from a surah that does not exist means nothing in the surah we fall back to.
 * ⚠️ The worker bounds these values on the way in; this clamp is about the copy already on the
 * device, which no server check has ever seen.
 */
function openingPosition(saved: ReadingPositionPair | null): ReadingPositionPair {
  const top = { surah: FIRST_SURAH, verse: FIRST_VERSE };
  if (!saved) return top;
  const { surah, verse } = saved;
  if (!Number.isInteger(surah) || surah < FIRST_SURAH || surah > SURAH_COUNT) return top;
  const verseCount = SURAH_METADATA[surah - 1]?.verseCount ?? FIRST_VERSE;
  if (!Number.isInteger(verse) || verse < FIRST_VERSE || verse > verseCount) {
    return { surah, verse: FIRST_VERSE };
  }
  return { surah, verse };
}

export default function Read() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reveal = useChromeReveal();
  const { saved, reportVerse } = usePosition();
  const { data: preferences } = usePreferences();
  const { data: bookmarks } = useBookmarks();

  // ⚠️ THE PAIR IS RESOLVED ONCE PER FOCUS, AND BOTH HALVES COME FROM THE SAME READ. Within a
  // focused session the reader owns where they are: re-reading the row on every render would
  // yank them back each time another device synced. See `openingPosition` for why reading the
  // surah on one render and the verse on another is a defect and not a detail.
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

  /**
   * ⚠️ THE FOCUS RESYNC — story 6-6's "one position, two renderers". Runs on every focus of this
   * tab (the first mount included, where it is a no-op because the mount already resolved the
   * same pair). If the saved pair moved while this screen was blurred — the mushaf turned pages,
   * another device synced — the screen re-targets and the restore effect below re-applies it.
   * If nothing moved, nothing happens, which is what keeps a plain tab switch from scrolling.
   */
  useFocusEffect(
    useCallback(() => {
      const fresh = openingPosition(savedRef.current);
      if (fresh.surah === showing.current && fresh.verse === visibleVerseRef.current) return;
      showing.current = fresh.surah;
      visibleVerseRef.current = fresh.verse;
      restored.current = false;
      setTarget(fresh);
      setSurah(fresh.surah);
    }, [])
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
      listRef.current?.scrollToIndex({ index, animated: false });
      return;
    }
    // Verse 1 and "not found" both mean the TOP — and the top is only "where the list already
    // is" on a fresh mount. On a focus resync the reader can be anywhere in the surah, so this
    // must be a real scroll: measured in the 6-4 device smoke, tapping a verse-1 bookmark row
    // while scrolled to 13:12 navigated and then went nowhere, because the early return here
    // assumed mount geometry. `scrollToOffset(0)` is a no-op on a mounted-at-top list, so the
    // mount path is unchanged.
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [content.loading, content.verses, content.surah, target]);

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
      paddingTop: CHROME_BAR_HEIGHT + insets.top + SPACING.md,
      paddingBottom: CHROME_BAR_HEIGHT + insets.bottom + SPACING.xxl,
    }),
    [insets.top, insets.bottom]
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

  const goToSurah = useCallback((next: number) => {
    // Synchronously, BEFORE the scroll: the viewability callback that the scroll provokes must
    // already see the new surah as the one we are showing.
    showing.current = next;
    visibleVerseRef.current = FIRST_VERSE;
    setSurah(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  /**
   * ⚠️ ONE TAP GESTURE FOR THE WHOLE SURFACE — see the file header for the two shapes this
   * replaces and why each failed. `runOnJS(true)` because the callback is a React state setter,
   * not a worklet.
   */
  const { toggle } = reveal;
  const surfaceTap = useMemo(
    () =>
      Gesture.Tap()
        .cancelsTouchesInView(false)
        .runOnJS(true)
        .onEnd(() => toggle()),
    [toggle]
  );

  const renderItem = useCallback(
    ({ item }: { item: Verse }) => (
      <VerseRow
        surah={item.surah}
        verse={item.verse}
        text={item.textUthmani}
        fontSize={fontSize}
        bookmarked={bookmarkIds.has(verseKey(item.surah, item.verse))}
        onToggleBookmark={toggleBookmark}
        testID={`verse-${item.surah}:${item.verse}`}
      />
    ),
    [fontSize, bookmarkIds, toggleBookmark]
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
              ListFooterComponent={
                content.verses.length > 0 ? (
                  <SurahNavigator
                    prev={preceding}
                    prevName={prevSurahName}
                    next={upcoming}
                    nextName={nextSurahName}
                    onNavigate={goToSurah}
                  />
                ) : null
              }
              testID="reading-list"
            />
          )}
        </View>
      </GestureDetector>
      <ReadingChrome reveal={reveal} title={title} mode="reading" />
    </View>
  );
}
