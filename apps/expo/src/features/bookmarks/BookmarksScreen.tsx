import React, { useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRouter } from 'expo-router';

import { AppText } from '@/components/AppText';
import { Surface } from '@/components/Surface';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

import { BookmarkRow, ROW_HEIGHT } from './BookmarkRow';
import type { BookmarkedVerse } from './hooks/useBookmarkedVerses';
import { useBookmarkedVerses } from './hooks/useBookmarkedVerses';
import { useBookmarkStore } from './useBookmarkStore';

const MAX_CONTENT_WIDTH = 680;

function ItemSeparator() {
  const { tokens } = useTheme();
  return <View style={[styles.separator, { backgroundColor: tokens.border }]} />;
}

export function BookmarksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { verses, isLoading } = useBookmarkedVerses();
  const navigateToVerse = useUIStore((s) => s.navigateToVerse);
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark);

  const handleBookmarkPress = useCallback(
    (surahNumber: number, verseNumber: number) => {
      navigateToVerse(surahNumber, verseNumber);
      router.navigate('/');
    },
    [navigateToVerse, router],
  );

  const handleDelete = useCallback(
    (surahNumber: number, verseNumber: number) => {
      removeBookmark(surahNumber, verseNumber);
    },
    [removeBookmark],
  );

  const keyExtractor = useCallback(
    (item: BookmarkedVerse) => `${item.surahNumber}:${item.verseNumber}`,
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: BookmarkedVerse }) => (
      <BookmarkRow
        surahNumber={item.surahNumber}
        verseNumber={item.verseNumber}
        uthmaniText={item.uthmaniText}
        onPress={() => handleBookmarkPress(item.surahNumber, item.verseNumber)}
        onDelete={() => handleDelete(item.surahNumber, item.verseNumber)}
      />
    ),
    [handleBookmarkPress, handleDelete],
  );

  const getItemLayout = useCallback(
    (_data: unknown, index: number) => ({
      length: ROW_HEIGHT + StyleSheet.hairlineWidth,
      offset: (ROW_HEIGHT + StyleSheet.hairlineWidth) * index,
      index,
    }),
    [],
  );

  if (!isLoading && verses.length === 0) {
    return (
      <Surface style={[styles.emptyContainer, { paddingTop: insets.top }]}>
        <AppText variant="ui">No bookmarks yet</AppText>
        <AppText variant="uiCaption">Tap the bookmark icon on any verse to save it here.</AppText>
      </Surface>
    );
  }

  return (
    <Surface>
      <FlatList
        data={verses}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={ItemSeparator}
        getItemLayout={getItemLayout}
        contentContainerStyle={[styles.content, { paddingTop: insets.top }]}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={5}
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  content: {
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.lg,
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
