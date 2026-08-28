/**
 * QuranIndexScreen — the Quran's information architecture as a surface: 114 surahs, 30 juz',
 * 60 hizb, one pushed route (story 6-3).
 *
 * ⚠️ A SELECTION IS "WRITE + BACK", NEVER NAVIGATION-WITH-PARAMS. Both reading surfaces already
 * re-resolve the saved pair on FOCUS (story 6-6's "one position, two renderers"), so the index
 * writes the pair through `usePosition`'s one door — ONE `reportVerse(surah, verse)` per
 * selection — and pops; the surface underneath refocuses and jumps. Passing a target through
 * route params would build a SECOND position channel beside the first, the exact decoupling
 * `usePosition` exists to prevent. Tapping the surah being read writes NOTHING and just returns:
 * `reportVerse(surah, 1)` would clobber the reader's saved verse with the surah's top. A
 * juz'/hizb row always reports its `(startSurah, startVerse)` PAIR — never page arithmetic — and
 * the hook's own comparison suppresses the write when the start IS the saved pair.
 *
 * ⚠️ `initialScrollIndex` IS ALLOWED HERE, AND THE DIFFERENCE FROM `read.tsx` IS THE ROWS. The
 * 6-1 ban was about VARIABLE-height verse rows, where index × estimate accumulates thousands of
 * pixels of error. These rows are uniform by construction — every row is the same one-line title
 * + one-line subtitle `ListRow`, `numberOfLines={1}` on every text — so the index is exact, the
 * mushaf's uniform-page precedent (story 6-2).
 *
 * ⚠️ THE SAVED ROW IS UNTRUSTED (MMKV): the surah is clamped into 1..114 for the highlight, so a
 * corrupt row highlights surah 1 rather than crashing or highlighting nothing.
 *
 * The screen is NOT immersive: `AppHeader` occupies layout (the settings-shell pattern), with the
 * default history-conditional back. On a deep link with no history the back control is ABSENT and
 * a selection `replace`s toward the opener mode's home — never a dead end.
 */

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import {
  getPageForVerse,
  HIZB_METADATA,
  JUZ_METADATA,
  SURAH_COUNT,
  SURAH_METADATA,
} from 'quran-data';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader, ListRow, SegmentedControl, Text } from '@/components/ui';
import { HOME_HREF, READ_HREF } from '@/constants/navigation';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE } from '@/constants/typography';
import { usePosition } from '@/lib/usePosition';
import { useThemedStyles } from '@/lib/useThemedStyles';

const SEGMENTS = ['surahs', 'juz', 'hizb'] as const;
type Segment = (typeof SEGMENTS)[number];

/** One row of whichever segment is active — discriminated by which fields exist. */
type IndexRow = (typeof SURAH_METADATA)[number] | (typeof JUZ_METADATA)[number];

export interface QuranIndexScreenProps {
  /** The surface the reader came from — decides the write's mode and the no-history exit. */
  mode: 'reading' | 'mushaf';
}

export function QuranIndexScreen({ mode }: QuranIndexScreenProps) {
  const { t } = useTranslation('navigation');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { saved, reportVerse } = usePosition(mode);
  const [segment, setSegment] = useState<Segment>('surahs');

  // Clamp, never trust — the row comes out of MMKV, and the highlight's only job is to point at
  // a real row: an out-of-range surah highlights surah 1 (the frozen matrix's corrupt-row row).
  const savedSurah = saved?.surah ?? 1;
  const currentSurah =
    Number.isInteger(savedSurah) && savedSurah >= 1 && savedSurah <= SURAH_COUNT ? savedSurah : 1;

  const styles = useThemedStyles((theme) => ({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background.primary,
    },
    segments: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
    },
    list: {
      flex: 1,
    },
    // The current surah's highlight — an already-gated pair (the header bar's own surface).
    currentRow: {
      backgroundColor: theme.colors.background.secondary,
    },
    number: {
      width: 32,
      textAlign: 'center',
      color: theme.colors.text.tertiary,
      fontSize: FONT_SIZE.bodySmall,
    },
    // The Arabic NAME is metadata, not Quran text — the system font is correct here; the Uthmani
    // face is reserved for the verses themselves.
    arabicName: {
      color: theme.colors.text.primary,
      fontSize: FONT_SIZE.h2,
    },
  }));

  // One-shot: the exit unmounts this screen, and a second tap racing the deferred pop must not
  // pop twice (or write again into a screen already leaving).
  const exiting = useRef(false);

  /**
   * The one exit. History-conditional: a deep-linked index has nothing to pop, so a selection
   * replaces toward the opener mode's home rather than dead-ending.
   *
   * ⚠️ THE POP IS DEFERRED ONE MACROTASK, AND THAT IS A MEASURED FIX, NOT HYGIENE. The surfaces'
   * focus resync reads `savedRef.current`, a ref assigned during RENDER — and the pop's focus
   * callback fires from the navigation event, BEFORE React has flushed the re-render the write
   * just scheduled (TanStack's notify is itself a `setTimeout(0)`). Measured on web against the
   * dev server, 2026-08-28: a probe inside the mushaf's focus effect read `saved = null` while
   * the index's write of 4:24 sat committed in the query cache, so the resync no-op'd and the
   * reader stayed on page 1 — the exact "reasoned, not yet measured" ordering caveat this
   * story's spec named. One task later the notify has run and the re-render has committed, so
   * the ref is fresh when the focus callback reads it. The write itself is untouched and still
   * strictly precedes the navigation.
   */
  const exit = useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    setTimeout(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(mode === 'mushaf' ? HOME_HREF : READ_HREF);
      }
    }, 0);
  }, [router, mode]);

  const onSelectSurah = useCallback(
    (surah: number) => {
      // ⚠️ THE ONE-SHOT IS CHECKED HERE TOO, NOT ONLY INSIDE `exit()`. The pop is deferred a
      // macrotask, so between the first press and the navigation there is a real window in which
      // a second row can be pressed — and `exit()`'s own guard stops only the second POP. The
      // write runs before it, so without this line two taps in that window write two positions
      // and the reader lands on whichever was second, not the one they meant.
      if (exiting.current) return;
      // The current surah's row writes NOTHING — see the docblock. Any other surah is one write
      // of its start; the surface's focus resync does the rest.
      if (surah !== currentSurah) reportVerse(surah, 1);
      exit();
    },
    [currentSurah, reportVerse, exit]
  );

  const onSelectBoundary = useCallback(
    (startSurah: number, startVerse: number) => {
      // Same one-shot window as `onSelectSurah` — see its comment.
      if (exiting.current) return;
      // The PAIR, never page arithmetic. `reportVerse`'s comparison makes this at most one write
      // — and zero when the boundary IS the saved pair.
      reportVerse(startSurah, startVerse);
      exit();
    },
    [reportVerse, exit]
  );

  const renderRow = useCallback(
    ({ item }: { item: IndexRow }) => {
      if ('verseCount' in item) {
        const verses = String(item.verseCount);
        const revelation =
          item.revelationType === 'meccan'
            ? t('index.revelation.meccan')
            : t('index.revelation.medinan');
        return (
          <ListRow
            leading={<Text style={styles.number}>{item.number}</Text>}
            title={item.nameTransliteration}
            subtitle={t('index.surahSubtitle', { name: item.nameEnglish, verses, revelation })}
            trailing={<Text style={styles.arabicName}>{item.nameArabic}</Text>}
            onPress={() => onSelectSurah(item.number)}
            style={item.number === currentSurah ? styles.currentRow : undefined}
            testID={`surah-row-${item.number}`}
          />
        );
      }
      const name =
        SURAH_METADATA[item.startSurah - 1]?.nameTransliteration ?? String(item.startSurah);
      const page = getPageForVerse(item.startSurah, item.startVerse);
      const isJuz = segment === 'juz';
      return (
        <ListRow
          leading={<Text style={styles.number}>{item.number}</Text>}
          title={
            isJuz
              ? t('index.juzTitle', { number: item.number })
              : t('index.hizbTitle', { number: item.number })
          }
          subtitle={t('index.boundarySubtitle', {
            name,
            surah: item.startSurah,
            verse: item.startVerse,
            page,
          })}
          onPress={() => onSelectBoundary(item.startSurah, item.startVerse)}
          testID={`${isJuz ? 'juz' : 'hizb'}-row-${item.number}`}
        />
      );
    },
    [segment, currentSurah, onSelectSurah, onSelectBoundary, styles, t]
  );

  const rows: IndexRow[] =
    segment === 'surahs' ? SURAH_METADATA : segment === 'juz' ? JUZ_METADATA : HIZB_METADATA;

  return (
    <View style={styles.screen} testID="quran-index-screen">
      <AppHeader title={t('titles.index')} />
      <View style={styles.segments}>
        <SegmentedControl
          values={[t('index.segments.surahs'), t('index.segments.juz'), t('index.segments.hizb')]}
          selectedIndex={SEGMENTS.indexOf(segment)}
          onChange={({ nativeEvent }) =>
            setSegment(SEGMENTS[nativeEvent.selectedSegmentIndex] ?? 'surahs')
          }
          testID="index-segment"
        />
      </View>
      <View style={styles.list}>
        {/* Keyed by segment: each switch REMOUNTS the list, so the surah segment's
            initialScrollIndex applies exactly once and juz'/hizb open at the top. */}
        <FlashList
          key={segment}
          data={rows}
          renderItem={renderRow}
          keyExtractor={(item) => `${segment}-${item.number}`}
          initialScrollIndex={
            segment === 'surahs' && currentSurah > 1 ? currentSurah - 1 : undefined
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.xl }}
          testID="quran-index-list"
        />
      </View>
    </View>
  );
}
