import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { getPageForVerse, SURAH_METADATA, type Verse } from 'quran-data';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type ViewToken } from 'react-native';
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
import { usePosition } from '@/lib/usePosition';
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
 * ── The three things this screen is careful about ────────────────────────────────────────────
 *
 * 1. **ONE WRITE PER VERSE CHANGE, ZERO WITHIN A VERSE.** `onViewableItemsChanged` reports the
 *    top visible verse as often as it likes; `usePosition` writes only when the `(surah, verse)`
 *    pair actually differs. The screen holds no ref and makes no comparison — that is the whole
 *    design, because a screen that could forget the comparison eventually does. The pre-fork
 *    build fired a database transaction per scroll tick and burned a day of the account-wide
 *    write budget in 4.6 hours.
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
 * ⚠️ THE WAY OUT IS A CONTROL IN CONTENT, inside the chrome header — never a native header slot.
 * `fullScreenModal` has no dismiss gesture and web never had one, and a control in the native
 * stack header is drawn perfectly and never receives a mouse click on an Apple-silicon Mac
 * running the iPhone build. `lint:header-controls` ships its exemption map empty and this story
 * keeps it empty.
 *
 * ⚠️ THE ONLY IN-APP ENTRY IS STILL THE TEMPORARY SETTINGS ROW. There is no Read tab yet —
 * navigation is story 6.3 — so `(tabs)/(profile)/account.tsx`'s `reading-mode-row` stays until
 * that story gives the reader a real door.
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

export default function Read() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reveal = useChromeReveal();
  const { saved, reportVerse } = usePosition();
  const { data: preferences } = usePreferences();

  // The saved pair is read ONCE, as the opening surah. After that the reader owns where they are:
  // re-reading it would yank them back to their last position every time another device synced.
  const [surah, setSurah] = useState(() => saved?.surah ?? FIRST_SURAH);
  const content = useSurah(surah);

  // What the footer names. Seeded from the saved verse so the chrome is correct on the first
  // frame, before any viewability callback has fired.
  const [visibleVerse, setVisibleVerse] = useState(() => saved?.verse ?? FIRST_VERSE);

  const fontSize = clampArabicFontSize(preferences?.fontSize);

  const listRef = useRef<FlashListRef<Verse>>(null);
  // ⚠️ ONE restore, on the FIRST loaded surah only. Without the latch, tapping "next surah" would
  // scroll the new surah's list to the saved verse index of the old one.
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    if (content.loading || content.verses.length === 0) return;
    restored.current = true;
    const index = content.verses.findIndex((v) => v.verse === (saved?.verse ?? FIRST_VERSE));
    if (index <= 0) return; // 1:1 and "not found" both open at the top — the documented fallback.
    listRef.current?.scrollToIndex({ index, animated: false });
  }, [content.loading, content.verses, saved?.verse]);

  const styles = useThemedStyles((theme) => ({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background.primary,
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
   * ⚠️ STABLE ACROSS SURAH CHANGES, on purpose. The visible item carries its OWN surah number, so
   * this closure needs no external state and its identity never changes — which is what keeps
   * FlatList (what FlashList is mocked as under Jest) from refusing a swapped handler mid-list.
   */
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<Verse>[] }) => {
      const top = viewableItems[0]?.item;
      if (!top) return;
      setVisibleVerse(top.verse);
      // Reported every time. `usePosition` decides whether it is a write.
      reportVerse(top.surah, top.verse);
    },
    [reportVerse]
  );

  const goToSurah = useCallback((next: number) => {
    setSurah(next);
    setVisibleVerse(FIRST_VERSE);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Verse }) => (
      <VerseRow
        surah={item.surah}
        verse={item.verse}
        text={item.textUthmani}
        fontSize={fontSize}
        onPress={reveal.toggle}
        testID={`verse-${item.surah}:${item.verse}`}
      />
    ),
    [fontSize, reveal.toggle]
  );

  const title = content.meta?.nameTransliteration ?? null;
  /**
   * ⚠️ THE NEXT SURAH'S NAME COMES FROM `quran-data`, WHILE THE TITLE ABOVE COMES FROM THE
   * DATABASE, and the split is deliberate rather than an oversight. The title DESCRIBES the rows
   * on screen, so it must be read from the same file those rows came from. The next-surah label
   * describes a destination nothing has loaded yet — reading it from the database would mean a
   * second async read to draw a button. `quranDb.test.ts` asserts the two tables agree for all
   * 114, which is what makes this safe to say.
   */
  const nextSurahName =
    SURAH_METADATA[nextSurah(surah) - 1]?.nameTransliteration ?? String(nextSurah(surah));
  const footnote = t('common:reading.footnote', {
    page: getPageForVerse(surah, visibleVerse),
    surah,
    verse: visibleVerse,
  });

  return (
    <View style={styles.screen} testID="reading-surface">
      {/* ⚠️ THIS IS A PLAIN `View`, AND IT WAS A FULL-SCREEN `Pressable` FOR ONE ROUND — WHICH
          BLOCKED SCROLLING ENTIRELY. A `Pressable` around a `FlashList` takes the responder on
          touch START, and RN cancels a press only when the touch leaves the element's bounds, so
          a drag inside a full-screen wrapper never releases it: the list never scrolled and every
          swipe landed as a chrome toggle. Measured on the simulator, invisible to every gate.
          The tap now lives on the verse rows, INSIDE the scroll view, where the `ScrollView`
          claims the responder on move and cancels the child press. See `VerseRow`'s docblock. */}
      {/* ⚠️ NO SPINNER, DELIBERATELY. The text is bundled, so the read is fast on every launch
          after the first, and a loading view would flash for one frame — the epic's rule is that
          loading is the exception and sync is invisible. An empty list for a beat is what
          "instant" looks like when it briefly is not. The ERROR state is different: a database
          that cannot be read must be a real surface with a retry, never a blank screen. */}
      {content.error ? (
        <ErrorView
          title={t('common:reading.unreadableTitle')}
          message={t('common:reading.unreadableBody')}
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
              <NextSurahButton surah={surah} nextName={nextSurahName} onPress={goToSurah} />
            ) : null
          }
          testID="reading-list"
        />
      )}
      <ReadingChrome reveal={reveal} title={title} footnote={footnote} />
    </View>
  );
}
