import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAudioStore } from '@/features/audio/stores/useAudioStore';
import { useBookmarkStore } from '@/features/bookmarks/useBookmarkStore';
import { useTheme } from '@/theme/ThemeProvider';
import { KFGQPC_FONT_FAMILY, spacing, typography } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

/**
 * U+06DF (Arabic Small High Rounded Zero) marks a silent alef in Uthmani text.
 * The KFGQPC font renders it as a large circle on web instead of a tiny
 * diacritical mark, so we strip it for display.
 */
const SMALL_HIGH_ROUNDED_ZERO = /\u06DF/g;

interface VerseRowProps {
  surahNumber: number;
  verseNumber: number;
  uthmaniText: string;
  translationText: string;
  isHighlighted?: boolean;
}

export const VerseRow = React.memo(function VerseRow({
  surahNumber,
  verseNumber,
  uthmaniText,
  translationText,
  isHighlighted = false,
}: VerseRowProps) {
  const { tokens } = useTheme();
  const fontSize = useUIStore((s) => s.fontSize);
  const tapToSeek = useUIStore((s) => s.tapToSeek);
  const currentSurah = useAudioStore((s) => s.currentSurah);
  const seekToVerse = useAudioStore((s) => s.seekToVerse);
  const isBookmarked = useBookmarkStore((s) =>
    s.bookmarks.some((b) => b.surahNumber === surahNumber && b.verseNumber === verseNumber),
  );
  const toggleBookmark = useBookmarkStore((s) => s.toggleBookmark);
  const lineHeight = Math.round(fontSize * typography.quran.lineHeightMultiplier);
  const badgeFontSize = Math.round(fontSize * 0.45);
  const displayText = uthmaniText.replace(SMALL_HIGH_ROUNDED_ZERO, '');

  const isActive = isHighlighted;
  const badgeColor = isActive ? tokens.accent.audio : tokens.text.ui;

  // Tap-to-seek only when setting is on AND audio is already loaded
  const canSeek = tapToSeek && currentSurah !== null;

  const handleVerseTap = canSeek ? () => seekToVerse(`${surahNumber}:${verseNumber}`) : undefined;

  const Container = canSeek ? Pressable : View;

  return (
    <Container
      style={[styles.container, isActive && { backgroundColor: tokens.accent.highlight }]}
      testID={isActive ? 'verse-row-highlighted' : undefined}
      {...(canSeek ? { onPress: handleVerseTap, accessibilityRole: 'button' as const } : {})}
      accessibilityLabel={`Verse ${verseNumber}`}
    >
      <View style={styles.metaRow}>
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            toggleBookmark(surahNumber, verseNumber);
          }}
          onTouchEnd={(e) => e.stopPropagation()}
          accessibilityRole="button"
          accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Bookmark verse'}
          hitSlop={8}
        >
          <Ionicons
            name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={isBookmarked ? tokens.accent.bookmark : tokens.text.ui}
          />
        </Pressable>
        <View
          style={[
            styles.ayahBadge,
            {
              borderColor: badgeColor,
              width: badgeFontSize * 2,
              height: badgeFontSize * 2,
              borderRadius: badgeFontSize,
            },
          ]}
        >
          <Text
            style={{
              color: badgeColor,
              fontSize: badgeFontSize * 1.1,
              fontWeight: '600',
              textAlign: 'center',
            }}
          >
            {verseNumber}
          </Text>
        </View>
      </View>
      <Text
        style={[
          styles.arabicText,
          {
            color: tokens.text.quran,
            fontSize,
            lineHeight,
            fontFamily: KFGQPC_FONT_FAMILY,
          },
        ]}
      >
        {displayText}
      </Text>
      <Text
        style={{
          color: tokens.text.translation,
          fontSize: typography.translation.fontSize,
          fontWeight: typography.translation.fontWeight,
          lineHeight: Math.round(
            typography.translation.fontSize * typography.translation.lineHeightMultiplier,
          ),
        }}
      >
        {translationText}
      </Text>
    </Container>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  arabicText: {
    writingDirection: 'rtl',
    textAlign: I18nManager.isRTL ? 'left' : 'right',
    fontWeight: typography.quran.fontWeight,
  },
  ayahBadge: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
});
