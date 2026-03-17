import { SURAH_METADATA } from 'quran-data';
import React, { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

interface BookmarkRowProps {
  surahNumber: number;
  verseNumber: number;
  uthmaniText: string;
  onPress: () => void;
  onDelete: () => void;
}

const ROW_HEIGHT = 72;
const TEXT_PREVIEW_LENGTH = 80;

export const BookmarkRow = React.memo(function BookmarkRow({
  surahNumber,
  verseNumber,
  uthmaniText,
  onPress,
  onDelete,
}: BookmarkRowProps) {
  const { tokens } = useTheme();
  const swipeableRef = useRef<Swipeable>(null);
  const surahName = SURAH_METADATA[surahNumber - 1]?.nameEnglish ?? `Surah ${surahNumber}`;
  const preview =
    uthmaniText.length > TEXT_PREVIEW_LENGTH
      ? uthmaniText.slice(0, TEXT_PREVIEW_LENGTH) + '…'
      : uthmaniText;

  const handleDelete = useCallback(() => {
    swipeableRef.current?.close();
    onDelete();
  }, [onDelete]);

  const renderRightActions = useCallback(
    () => (
      <Pressable
        onPress={handleDelete}
        style={[styles.deleteAction, { backgroundColor: tokens.status.error }]}
        accessibilityRole="button"
        accessibilityLabel="Delete bookmark"
      >
        <AppText variant="ui" style={[styles.deleteText, { color: tokens.status.errorText }]}>
          Delete
        </AppText>
      </Pressable>
    ),
    [handleDelete, tokens.status.error, tokens.status.errorText],
  );

  return (
    <Swipeable ref={swipeableRef} renderRightActions={renderRightActions}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${surahName}, verse ${verseNumber}`}
        style={[styles.container, { backgroundColor: tokens.surface.primary }]}
      >
        <View style={styles.info}>
          <View style={styles.header}>
            <AppText variant="surahTitleEnglish">{surahName}</AppText>
            <AppText variant="uiCaption">Verse {verseNumber}</AppText>
          </View>
          <AppText variant="uiCaption" numberOfLines={1}>
            {preview}
          </AppText>
        </View>
      </Pressable>
    </Swipeable>
  );
});

export { ROW_HEIGHT };

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  info: {
    flex: 1,
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  deleteText: {
    fontWeight: '600',
  },
});
