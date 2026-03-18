import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import React, { useCallback } from 'react';
import { I18nManager, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

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
  transliterationText?: string;
  isHighlighted?: boolean;
  onLongPress?: (surahNumber: number, verseNumber: number, x: number, y: number) => void;
}

export const VerseRow = React.memo(function VerseRow({
  surahNumber,
  verseNumber,
  uthmaniText,
  translationText,
  transliterationText,
  isHighlighted = false,
  onLongPress,
}: VerseRowProps) {
  const { tokens } = useTheme();
  const fontSize = useUIStore((s) => s.fontSize);
  const tapToSeek = useUIStore((s) => s.tapToSeek);
  const showTransliteration = useUIStore((s) => s.showTransliteration);
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

  const handleLongPressJS = useCallback(
    (x: number, y: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onLongPress?.(surahNumber, verseNumber, x, y);
    },
    [onLongPress, surahNumber, verseNumber],
  );

  const handleContextMenu = useCallback(
    (e: { preventDefault: () => void; nativeEvent: { pageX: number; pageY: number } }) => {
      e.preventDefault();
      onLongPress?.(surahNumber, verseNumber, e.nativeEvent.pageX, e.nativeEvent.pageY);
    },
    [onLongPress, surahNumber, verseNumber],
  );

  const Container = canSeek ? Pressable : View;

  const content = (
    <Container
      style={[styles.container, isActive && { backgroundColor: tokens.accent.highlight }]}
      testID={isActive ? 'verse-row-highlighted' : undefined}
      {...(canSeek ? { onPress: handleVerseTap, accessibilityRole: 'button' as const } : {})}
      {...(Platform.OS === 'web' && onLongPress ? { onContextMenu: handleContextMenu as (e: any) => void } : {})}
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
      {showTransliteration && transliterationText && (
        <Text
          style={{
            color: tokens.text.translation,
            fontSize: typography.transliteration.fontSize,
            fontStyle: typography.transliteration.fontStyle,
            lineHeight: Math.round(
              typography.transliteration.fontSize * typography.transliteration.lineHeightMultiplier,
            ),
          }}
        >
          {transliterationText}
        </Text>
      )}
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

  // On native, wrap with GestureDetector for long-press support
  if (Platform.OS !== 'web' && onLongPress) {
    const longPress = Gesture.LongPress()
      .minDuration(500)
      .onStart((event) => {
        runOnJS(handleLongPressJS)(event.absoluteX, event.absoluteY);
      });

    return <GestureDetector gesture={longPress}>{content}</GestureDetector>;
  }

  return content;
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
