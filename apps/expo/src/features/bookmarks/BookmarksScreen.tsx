/**
 * BookmarksScreen — the Bookmarks tab: every kept verse, most-recent-first (story 6-4).
 *
 * ⚠️ NOT IMMERSIVE. `AppHeader` and `AppTabBar` OCCUPY LAYOUT (the settings-shell pattern) — no
 * reveal driver, no `useChromeReveal` import (`bookmarks-screen.test.tsx` scans this source for
 * it). A list of destinations is chrome-forward; immersion belongs to the two reading surfaces.
 * `showBack={false}` because a tab home is never pushed — under `backBehavior="none"` there is
 * nothing to pop, and passing the answer beats re-deriving it from a router that is one commit
 * stale on a push (the `AppHeader` docblock's measured case).
 *
 * ⚠️ A ROW TAP IS WRITE → NAVIGATE, NEVER NAVIGATION-WITH-PARAMS (6-3's mechanism). ONE
 * `reportVerse(surah, verse)` through `usePosition('reading')`, then `router.navigate(READ_HREF)`;
 * `read.tsx` re-resolves the saved pair on FOCUS and lands the reader. A param-carried target
 * would be a second position channel — the decoupling `usePosition` exists to prevent.
 *
 * ⚠️ THE NAVIGATION IS DEFERRED ONE MACROTASK, THE 6-3 MEASURED FIX. The read surface's focus
 * resync reads `savedRef.current`, a ref assigned during RENDER — and the focus event fires
 * before React has flushed the re-render the write just scheduled (TanStack's notify is itself a
 * `setTimeout(0)`), so a synchronous navigate lands on a stale ref and the resync no-ops
 * (measured on web, 2026-08-28, in `QuranIndexScreen`). One task later the ref is fresh. The
 * write itself is NOT deferred and still strictly precedes the navigation. Unlike the pushed
 * index, this screen survives its own navigation (tabs stay mounted), so the in-flight guard
 * re-arms after the deferred hop instead of latching forever.
 *
 * Tapping the row for the verse already saved still navigates — `usePosition`'s comparison makes
 * the write a no-op, and the reader still lands on their verse. Deletes are `removeBookmark(id)`
 * with no confirmation (trivially reversible: re-tap the verse's control).
 *
 * Offline cold launch: `useBookmarks()` paints the MMKV seed on the FIRST render with zero
 * network calls — nothing here gates, spins, or mentions sync (sync is invisible).
 */

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppHeader, AppTabBar, EmptyState } from '@/components/ui';
import { READ_HREF } from '@/constants/navigation';
import { SPACING, screenContentStyle } from '@/constants/spacing';
import { removeBookmark } from '@/lib/sync';
import { usePosition } from '@/lib/usePosition';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { BookmarkRow } from './BookmarkRow';
import { type BookmarkListRow, useBookmarkRows } from './hooks/useBookmarkRows';

export function BookmarksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rows = useBookmarkRows();
  const { reportVerse } = usePosition('reading');

  const styles = useThemedStyles((theme) => ({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background.primary,
    },
    content: {
      flex: 1,
    },
  }));

  // One hop in flight at a time — a second tap inside the deferral window must not write a
  // second destination over the first (the 6-3 double-tap window). Re-armed when the hop runs,
  // because this tab stays mounted and must serve the next visit.
  const navigating = useRef(false);
  // The deferred hop's timer, cleared on unmount: tabs stay mounted in the steady state, but a
  // teardown or shell re-key inside the one-task window must not fire a navigate afterwards.
  const hopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(hopTimer.current), []);

  const openBookmark = useCallback(
    (surah: number, verse: number) => {
      if (navigating.current) return;
      navigating.current = true;
      // The write FIRST — read.tsx's focus resync is what turns it into a jump.
      reportVerse(surah, verse);
      hopTimer.current = setTimeout(() => {
        navigating.current = false;
        router.navigate(READ_HREF);
      }, 0);
    },
    [reportVerse, router]
  );

  const renderItem = useCallback(
    ({ item }: { item: BookmarkListRow }) => (
      <BookmarkRow
        id={item.id}
        surah={item.surah}
        verse={item.verse}
        preview={item.preview}
        onPress={openBookmark}
        onDelete={removeBookmark}
        testID={`bookmark-row-${item.surah}:${item.verse}`}
      />
    ),
    [openBookmark]
  );

  return (
    <View style={styles.screen} testID="bookmarks-screen">
      <AppHeader title={t('navigation:titles.bookmarks')} showBack={false} />
      <View style={styles.content}>
        {rows.length === 0 ? (
          // Empty states teach (the epic's rule): the how-to line names the verse control.
          <EmptyState
            icon="bookmark-outline"
            title={t('common:bookmarks.emptyTitle')}
            description={t('common:bookmarks.emptyBody')}
            fullScreen
            testID="bookmarks-empty"
          />
        ) : (
          <FlashList
            data={rows}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              ...screenContentStyle('main'),
              paddingVertical: SPACING.sm,
            }}
            testID="bookmarks-list"
          />
        )}
      </View>
      <AppTabBar />
    </View>
  );
}
