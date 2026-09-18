/**
 * SearchScreen — the reader who has words but not a reference (story 6-7).
 *
 * ⚠️ A SELECTION IS "WRITE + DISMISS", NEVER NAVIGATION-WITH-PARAMS — 6-3's mechanism verbatim.
 * ONE `reportVerse(surah, verse)` through `usePosition(mode)`, then the stack unwinds; the
 * reading surface underneath re-resolves the saved pair on FOCUS and lands there. A target
 * carried in route params would be a SECOND position channel beside the saved one, which is the
 * decoupling `usePosition` exists to prevent.
 *
 * ⚠️ THE EXIT IS `dismissAll`, NOT `back`, AND THAT IS THE ONE PLACE THIS DIVERGES FROM THE INDEX.
 * Search is pushed FROM the index, so the stack is `(tabs)` → `surahs` → `search` and a single
 * `router.back()` would leave the reader looking at the surah list with their verse loaded behind
 * it — the story's acceptance criterion says the surface underneath lands on the verse and the
 * search surface is GONE. `dismissAll()` is `POP_TO_TOP` on the root stack, whose first route is
 * `(tabs)`, so it unwinds both pushed routes in one commit however many of them there are. A
 * CANCEL is different and stays `back()` (`AppHeader`'s own chevron): a reader who changes their
 * mind wants the screen they came from, not the top of the stack.
 *
 * ⚠️ THE POP IS DEFERRED ONE MACROTASK, AND IT IS A MEASURED FIX INHERITED FROM 6-3 RATHER THAN
 * HYGIENE. The surfaces' focus resync reads `savedRef.current`, a ref assigned during RENDER,
 * and the navigation's focus callback fires BEFORE React has flushed the re-render the write just
 * scheduled (TanStack's notify is itself a `setTimeout(0)`). Measured on web 2026-08-28: the
 * resync read `saved = null` while the write sat committed in the cache, so it no-op'd and the
 * reader did not move. One task later the ref is fresh. The WRITE is not deferred and still
 * strictly precedes the navigation.
 *
 * ⚠️ OPENED AND DISMISSED WITHOUT A SELECTION, THIS SCREEN WRITES NOTHING. It holds no effect
 * that touches `reportVerse` — the only call is inside the row handler — so the frozen matrix's
 * "reading position underneath is exactly unchanged" is structural rather than tested-for.
 *
 * ⚠️ NOT IMMERSIVE: `AppHeader` occupies layout (the settings-shell pattern the index uses), no
 * `useChromeReveal`, no reveal driver. A search field the reader has to tap the screen to see
 * would be absurd.
 */

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader, EmptyState, ErrorView, LoadingView, SearchBar } from '@/components/ui';
import { HOME_HREF, READ_HREF } from '@/constants/navigation';
import { SPACING, screenContentStyle } from '@/constants/spacing';
import { usePosition } from '@/lib/usePosition';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { SearchResultRow } from './components/SearchResultRow';
import { useSearchCorpus } from './hooks/useSearchCorpus';
import { isSearchable, type SearchResult, searchVerses } from './lib/search';

export interface SearchScreenProps {
  /** The surface the reader came from — decides the write's mode and the no-history exit. */
  mode: 'reading' | 'mushaf';
}

export function SearchScreen({ mode }: SearchScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { reportVerse } = usePosition(mode);
  const { verses, loading, error, reload } = useSearchCorpus();
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();

  const styles = useThemedStyles((theme) => ({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background.primary,
    },
    field: {
      paddingVertical: SPACING.sm,
    },
    content: {
      flex: 1,
    },
  }));

  // ⚠️ THE SCAN RUNS ON A DEFERRED QUERY, AND THE MEMO ALONE WAS NOT ENOUGH. The memo stops a
  // re-render for an unrelated reason from rescanning, but it still scans SYNCHRONOUSLY on every
  // keystroke — 6,236 joined strings on the same JS thread that services the `TextInput`, on a
  // screen whose field auto-focuses. `useDeferredValue` lets the keystroke paint first and the
  // scan run at lower priority, so holding backspace cannot stall the field. The emphasis reads
  // the same deferred value, or a row would highlight a query the list no longer matches.
  const deferredQuery = useDeferredValue(query);
  const results = useMemo<SearchResult[]>(
    () => searchVerses(verses, deferredQuery),
    [verses, deferredQuery]
  );
  const searching = isSearchable(deferredQuery);

  // One exit in flight at a time. The dismiss is deferred a macrotask (see the docblock), so
  // there is a real window in which a second row can be pressed — and a second press in it would
  // write a second position, landing the reader on whichever row was second rather than the one
  // they meant. The guard is checked before the WRITE, not only before the navigation.
  const exiting = useRef(false);
  // ⚠️ AND THE TIMER IS CANCELLED ON UNMOUNT. The dismiss is deferred a macrotask, so a hardware
  // back (or a cancel) inside that window would otherwise fire `dismissAll()` AFTER the reader
  // has already left — unwinding the stack out from under whatever they went to instead.
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (dismissTimer.current !== null) clearTimeout(dismissTimer.current);
    },
    []
  );

  const openResult = useCallback(
    (surah: number, verse: number) => {
      if (exiting.current) return;
      exiting.current = true;
      // The write FIRST — the surface's focus resync is what turns it into a jump.
      reportVerse(surah, verse);
      dismissTimer.current = setTimeout(() => {
        if (router.canDismiss()) {
          router.dismissAll();
        } else {
          // A deep-linked `/search` has nothing to unwind; go to the opener mode's home rather
          // than dead-ending on a screen with no back control (the index's rule).
          router.replace(mode === 'mushaf' ? HOME_HREF : READ_HREF);
        }
      }, 0);
    },
    [reportVerse, router, mode]
  );

  // ⚠️ CANCEL IS WIRED HERE RATHER THAN LEFT TO THE HEADER CHEVRON, because that chevron is
  // `canGoBack()`-conditional: a deep-linked `/search` has no history, draws no chevron, and
  // without this the reader is stranded on the search screen with no exit at all while
  // `openResult` handles the same case perfectly well one function above.
  const cancel = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(mode === 'mushaf' ? HOME_HREF : READ_HREF);
    }
  }, [router, mode]);

  // ⚠️ A RESULT COUNT IS ANNOUNCED, because nothing else tells a screen-reader user that the
  // list under the field changed — the rows are off-focus, so a query that found five ayat and
  // one that found none are the same silence.
  const resultCount = results.length;
  useEffect(() => {
    if (!searching || loading || error !== null) return;
    AccessibilityInfo.announceForAccessibility(
      t('common:search.resultsA11y', { count: resultCount })
    );
  }, [resultCount, searching, loading, error, t]);

  const renderItem = useCallback(
    ({ item }: { item: SearchResult }) => (
      <SearchResultRow
        entry={item.entry}
        side={item.side}
        query={deferredQuery}
        onPress={openResult}
        testID={`search-result-${item.entry.surah}:${item.entry.verse}`}
      />
    ),
    [openResult, deferredQuery]
  );

  const body = () => {
    // The order matters: a failed corpus can answer nothing, so it must be told before any state
    // that would otherwise read as "we looked and found nothing".
    if (error !== null) {
      return (
        <ErrorView
          icon="search"
          title={t('common:search.errorTitle')}
          message={t('common:search.errorBody')}
          onAction={reload}
          fullScreen
          testID="search-error"
        />
      );
    }
    if (loading) return <LoadingView fullScreen testID="search-loading" />;
    if (!searching) {
      return (
        <EmptyState
          icon="search"
          title={t('common:search.restingTitle')}
          description={t('common:search.restingBody')}
          fullScreen
          testID="search-resting"
        />
      );
    }
    if (results.length === 0) {
      return (
        <EmptyState
          icon="search"
          title={t('common:search.emptyTitle')}
          description={t('common:search.emptyBody')}
          fullScreen
          testID="search-empty"
        />
      );
    }
    return (
      <FlashList
        data={results}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.entry.surah}:${item.entry.verse}`}
        // ⚠️ WITHOUT THIS THE FIRST TAP ON A RESULT ONLY DISMISSES THE KEYBOARD. The field
        // auto-focuses, so the keyboard is up for every result list this screen ever draws.
        keyboardShouldPersistTaps="handled"
        // The inset, not a flat pad — the index's rule (`QuranIndexScreen`). Without it the last
        // result sits under the home indicator and cannot be read or tapped.
        contentContainerStyle={{
          ...screenContentStyle('main'),
          paddingBottom: insets.bottom + SPACING.xl,
        }}
        testID="search-results"
      />
    );
  };

  return (
    <View style={styles.screen} testID="search-screen">
      <AppHeader title={t('navigation:titles.search')} />
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={t('common:search.placeholder')}
        onCancel={cancel}
        style={styles.field}
        autoFocus
        testID="search-field"
      />
      <View style={styles.content}>{body()}</View>
    </View>
  );
}
