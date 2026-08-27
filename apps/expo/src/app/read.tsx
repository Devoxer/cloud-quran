import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { getPageForVerse, SURAH_COUNT, SURAH_METADATA, type Verse } from 'quran-data';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type ViewToken } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorView } from '@/components/ui';
import { clampArabicFontSize } from '@/constants/arabic';
import { SPACING, screenContentStyle } from '@/constants/spacing';
import {
  CHROME_BAR_HEIGHT,
  NextSurahButton,
  nextSurah,
  ReadingChrome,
  useChromeReveal,
  useSurah,
  VerseRow,
} from '@/features/reading';
import { usePreferences } from '@/lib/sync';
import { type ReadingPositionPair, usePosition } from '@/lib/usePosition';
import { useThemedStyles } from '@/lib/useThemedStyles';

/**
 * READING MODE — the immersive reading surface (story 6-1, filling the slot story 6-0 built).
 *
 * ⚠️ ITS ADDRESS AND ITS PRESENTATION ARE THE FEATURE, AND THEY DO DIFFERENT JOBS. This file sits
 * at the ROOT of `src/app/`, a sibling of `(tabs)`, and `app/_layout.tsx` registers it with
 * `presentation: 'fullScreenModal'`. Story 6-1 fills it IN PLACE: the file did not move and the
 * registration did not change.
 *
 *   - **Position removes the tab bar.** Being outside the tab navigator is what keeps the bar out
 *     of this screen's layout. ⚠️ On Android `presentation: 'modal'` is documented as equivalent
 *     to `push`, so a presentation cannot be what covers the Material NavigationBar there — only
 *     the position can be.
 *   - **Presentation makes it immersive rather than a push**: full-screen cover, no page-sheet
 *     inset, no parent visible behind, no back-chevron or edge-swipe affordance.
 *
 * ⚠️ THIS FILE MUST NEVER CONTAIN THE STRING `headerShown`. The route is registered without a
 * header; a local `<Stack.Screen options={{ headerShown: true }} />` — the idiom the four sibling
 * profile screens use, and the natural way to answer "the reader needs a way out" — would put it
 * straight back and drag in the header-control question the epic exists to sidestep.
 * `immersive-route.test.ts` scans this source for it.
 *
 * ── The four things this screen is careful about ─────────────────────────────────────────────
 *
 * 1. **ONE WRITE PER VERSE CHANGE, ZERO WITHIN A VERSE.** `onViewableItemsChanged` reports the
 *    top visible verse as often as it likes; `usePosition` writes only when the `(surah, verse)`
 *    pair actually differs. The screen holds no ref for that comparison and makes none — that is
 *    the whole design, because a screen that could forget the comparison eventually does. The
 *    pre-fork build fired a database transaction per scroll tick and burned a day of the
 *    account-wide write budget in 4.6 hours.
 *
 * 2. **NO FIXED HEIGHT AND NO `initialScrollIndex`.** Verse height varies with the Arabic length,
 *    the font size and the width; a fixed estimate accumulated thousands of pixels of error over
 *    Al-Baqarah's 286 verses. Story 1-7.5 fixed that by REMOVING the abstraction, and FlashList
 *    v2 dropped `getItemLayout` anyway. The saved position is restored by ONE imperative
 *    `scrollToIndex` after mount, which measures rather than predicts.
 *
 * 3. **THE CHROME OVERLAYS AND NEVER OCCUPIES LAYOUT.** The list reserves padding for both bars
 *    permanently, so revealing or dismissing them changes nothing about where a verse sits. The
 *    bottom reservation is the safe-area inset plus this story's own footer — ⚠️ NOT
 *    `useTabBarHeight()`, which answers 49pt for a bar that is not on this route at all (see
 *    `ReadingChrome`'s `CHROME_BAR_HEIGHT` docblock).
 *
 * 4. **THE OPENING PAIR IS READ ONCE AND CLAMPED, AS A PAIR.** See `openingPosition` below: a
 *    saved row is device state that can be stale, corrupt, or newer than this build, and every
 *    part of the screen that trusted half of it produced a wrong screen rather than an error.
 *
 * ── ⚠️ THE TAP IS A GESTURE, AND THE THREE SHAPES BEFORE IT ARE WHY ──────────────────────────
 *
 * The reading surface is immersive on arrival — the frozen criterion is "when it renders, then it
 * is immersive" — so the chrome, and with it the route's only exit, has to be reachable by
 * tapping the page. Getting that tap right took three attempts and only the third works:
 *
 *   1. a full-screen `Pressable` around the list **blocked scrolling outright** (it takes the RN
 *      responder on touch START and cancels a press only when the touch LEAVES its bounds, which
 *      a drag inside a full-screen element never does);
 *   2. a `Pressable` on each verse row scrolled fine but left no "elsewhere" to tap — which is
 *      what pushed the chrome into shipping revealed, against the frozen intent — and spent the
 *      tap epic 7 is already promised ("a tap on a verse plays audio from it");
 *   3. an RNGH **`Gesture.Tap()` over the whole reading area**, which is what ships. A gesture
 *      recogniser fails on movement instead of holding the responder, so a drag reaches the list
 *      and a tap reaches the toggle.
 *
 * ⚠️ `.cancelsTouchesInView(false)` IS LOAD-BEARING. RNGH's default is `true`: when the tap
 * recognises, UIKit cancels the touch in the RN view tree — which would silently kill every
 * `Pressable` INSIDE the gesture's area, i.e. the next-surah control and the error state's retry.
 * With it false, both fire normally and the tap simply also toggles the chrome.
 *
 * ⚠️ THE CHROME IS NOT INSIDE THE GESTURE. `ReadingChrome` is a sibling of the detector, so the
 * close button is not in the tap's area at all and pressing it cannot also toggle.
 *
 * ⚠️ THE ONLY IN-APP ENTRY IS STILL THE TEMPORARY SETTINGS ROW. There is no Read tab yet —
 * navigation is story 6.3, which is where the epic's frozen Never list puts it — so
 * `(tabs)/(profile)/account.tsx`'s `reading-mode-row` stays until that story gives the reader a
 * real door. Deleting the row now, with no tab to replace it, would strand the route.
 */

/**
 * ⚠️ MODULE SCOPE, NOT A RENDER-TIME OBJECT. FlashList documents that changing
 * `viewabilityConfig` on the fly is not supported, and the FlatList this is mocked as under Jest
 * throws outright. A fresh object literal each render is exactly that change.
 *
 * 50% rather than a smaller threshold because the reported verse is what the reader is READING:
 * a sliver of the next ayah entering the viewport is not a move to it.
 */
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50 } as const;

/** Where a reader with no saved position anywhere starts. */
const FIRST_SURAH = 1;
const FIRST_VERSE = 1;

/**
 * The pair this screen OPENS at — clamped into the book, and clamped as a PAIR.
 *
 * ⚠️ THE SAVED ROW IS UNTRUSTED INPUT. It comes out of MMKV, it can be written by a newer build,
 * it survives a downgrade, and it can be corrupt. Three defects came from trusting parts of it:
 *
 *   • the surah was locked on the first render while the VERSE was read again on a later one, so
 *     a row arriving one render late (`{18, 4}` after an initial `null`) opened Al-Fatihah and
 *     scrolled to its fourth ayah — the reader landed on 1:4 instead of 18:4;
 *   • an out-of-range verse (`{1, 999}`) was range-checked by the restore effect and NOT by the
 *     footer, which rendered `Page -1 · 1:999` to the reader;
 *   • an out-of-range surah (`{200, 1}`) reached `getSurahVerses`, which answers `[]` — a blank
 *     screen with no verses, no error, and no next-surah control to escape by.
 *
 * So the whole pair is resolved once, here. An out-of-range surah resets the VERSE too: a verse
 * number from a surah that does not exist means nothing in the surah we fall back to. The
 * documented fallback in the I/O matrix is "falls back to the top", and this is both halves of it.
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

  // ⚠️ THE PAIR IS RESOLVED ONCE, ON THE FIRST RENDER, AND BOTH HALVES COME FROM THAT ONE READ.
  // After that the reader owns where they are: re-reading the row would yank them back to their
  // last position every time another device synced. See `openingPosition` for why reading the
  // surah on one render and the verse on another is a defect and not a detail.
  const [opening] = useState(() => openingPosition(saved));
  const [surah, setSurah] = useState(opening.surah);
  const content = useSurah(surah);

  // What the footer names. Seeded from the clamped opening verse so the chrome is correct — and
  // in range — on the first frame, before any viewability callback has fired.
  const [visibleVerse, setVisibleVerse] = useState(opening.verse);

  const fontSize = clampArabicFontSize(preferences?.fontSize);

  const listRef = useRef<FlashListRef<Verse>>(null);
  // ⚠️ ONE restore, on the FIRST loaded surah only. Without the latch, tapping "next surah" would
  // scroll the new surah's list to the saved verse index of the old one.
  const restored = useRef(false);
  // ⚠️ THE SURAH THE LIST IS ACTUALLY SHOWING, mirrored into a ref because the viewability
  // handler must stay identity-stable (see below) and still be able to reject stale rows.
  const showing = useRef(opening.surah);

  useEffect(() => {
    if (restored.current) return;
    if (content.loading || content.verses.length === 0) return;
    // The rows on screen must be the surah the opening pair named. Without this the restore
    // could apply the opening VERSE to some other surah's list.
    if (content.surah !== opening.surah) return;
    restored.current = true;
    const index = content.verses.findIndex((v) => v.verse === opening.verse);
    if (index <= 0) return; // 1:1 and "not found" both open at the top — the documented fallback.
    listRef.current?.scrollToIndex({ index, animated: false });
  }, [content.loading, content.verses, content.surah, opening]);

  /**
   * ⚠️ A SURAH THAT READS CLEAN AND EMPTY IS ITS OWN STATE, NOT A BLANK SCREEN. `getSurahVerses`
   * answers `[]` rather than throwing for anything it cannot find, so a corrupt table would give
   * the reader a surface with no verses, no error, and — because the next-surah control is the
   * list's footer — no way forward either. `loading` guards the ordinary gap between a surah
   * change and its rows landing, which is not this.
   */
  const isEmpty = !content.loading && content.error === null && content.verses.length === 0;

  // ⚠️ THE ERROR AND EMPTY SURFACES REVEAL THE DOOR. The chrome is hidden on arrival, so on every
  // other screen the way out is one tap away — but on a screen that has failed, "guess that a tap
  // does something" is not an exit. `fullScreenModal` has no dismiss gesture and web never had
  // one, so this is the only way out. A room with no door is not an acceptable empty room.
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
   * failure the criterion names. The bottom sum clears the safe-area inset and the footer bar, so
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
   * reader at 1:7 tapped "next" and the writes were `[{1,7}, {1,1}]` before the new rows existed.
   * If the next read then failed, their saved place was permanently the top of the surah they had
   * just left. That is the one leak in the "one write per verse change" discipline this whole
   * story is built on. `useSurah` now clears its rows on a surah change too; the two fixes are
   * independent, because either alone still leaves the other window open.
   */
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<Verse>[] }) => {
      const top = viewableItems[0]?.item;
      if (!top) return;
      if (top.surah !== showing.current) return;
      setVisibleVerse(top.verse);
      // Reported every time. `usePosition` decides whether it is a write.
      reportVerse(top.surah, top.verse);
    },
    [reportVerse]
  );

  const goToSurah = useCallback((next: number) => {
    // Synchronously, BEFORE the scroll: the viewability callback that the scroll provokes must
    // already see the new surah as the one we are showing.
    showing.current = next;
    setSurah(next);
    setVisibleVerse(FIRST_VERSE);
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
        verse={item.verse}
        text={item.textUthmani}
        fontSize={fontSize}
        testID={`verse-${item.surah}:${item.verse}`}
      />
    ),
    [fontSize]
  );

  const title = content.meta?.nameTransliteration ?? null;
  /**
   * ⚠️ DERIVED ONCE. It used to be computed three times per press — twice here for the label and
   * once inside the button's `onPress` — which is three places for the label and the destination
   * to drift apart.
   *
   * ⚠️ THE NEXT SURAH'S NAME COMES FROM `quran-data`, WHILE THE TITLE ABOVE COMES FROM THE
   * DATABASE, and the split is deliberate rather than an oversight. The title DESCRIBES the rows
   * on screen, so it must be read from the same file those rows came from. The next-surah label
   * describes a destination nothing has loaded yet — reading it from the database would mean a
   * second async read to draw a button. `quranDb.test.ts` asserts the two tables agree for all
   * 114, which is what makes this safe to say.
   */
  const upcoming = nextSurah(surah);
  const nextSurahName = SURAH_METADATA[upcoming - 1]?.nameTransliteration ?? String(upcoming);
  const footnote = t('common:reading.footnote', {
    page: getPageForVerse(surah, visibleVerse),
    surah,
    verse: visibleVerse,
  });

  return (
    <View style={styles.screen} testID="reading-surface">
      {/* ⚠️ NO SPINNER, DELIBERATELY. The text is bundled, so the read is fast on every launch
          after the first, and a loading view would flash for one frame — the epic's rule is that
          loading is the exception and sync is invisible. An empty list for a beat is what
          "instant" looks like when it briefly is not. The ERROR and EMPTY states are different:
          a database that cannot be read, or a surah that reads clean with no rows, must be a real
          surface with a retry — never a blank screen. */}
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
                  <NextSurahButton next={upcoming} nextName={nextSurahName} onPress={goToSurah} />
                ) : null
              }
              testID="reading-list"
            />
          )}
        </View>
      </GestureDetector>
      <ReadingChrome reveal={reveal} title={title} footnote={footnote} />
    </View>
  );
}
