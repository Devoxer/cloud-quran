import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Ionicons from '@expo/vector-icons/Ionicons';

import { SURAH_METADATA } from 'quran-data';

import { AppText } from '@/components/AppText';
import { RECITERS } from '@/features/audio/data/reciters';
import { useAudioStore } from '@/features/audio/stores/useAudioStore';
import { useTheme } from '@/theme/ThemeProvider';
import { animation, spacing } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';
import { formatSpeed } from '@/features/audio/utils/formatSpeed';

export const MINI_PLAYER_HEIGHT = 56;

export function MiniPlayerBar() {
  const currentSurah = useAudioStore((s) => s.currentSurah);
  const currentVerseKey = useAudioStore((s) => s.currentVerseKey);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const positionMs = useAudioStore((s) => s.positionMs);
  const durationMs = useAudioStore((s) => s.durationMs);
  const selectedReciterId = useAudioStore((s) => s.selectedReciterId);
  const playbackSpeed = useAudioStore((s) => s.playbackSpeed);
  const sleepTimerEndTime = useAudioStore((s) => s.sleepTimerEndTime);
  const pause = useAudioStore((s) => s.pause);
  const resume = useAudioStore((s) => s.resume);
  const resumePlayback = useAudioStore((s) => s.resumePlayback);
  const stop = useAudioStore((s) => s.stop);
  const toggleExpandedPlayer = useUIStore((s) => s.toggleExpandedPlayer);
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const totalHeight = MINI_PLAYER_HEIGHT + insets.bottom;
  const slideAnim = useRef(new Animated.Value(MINI_PLAYER_HEIGHT + 50)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: currentSurah ? 0 : totalHeight,
      duration: animation.slide,
      useNativeDriver: true,
    }).start();
  }, [currentSurah, slideAnim, totalHeight]);

  if (currentSurah === null) return null;

  const surahMeta = SURAH_METADATA[currentSurah - 1];
  const verseNumber = currentVerseKey?.split(':')[1] ?? '1';
  const reciter = RECITERS.find((r) => r.id === selectedReciterId);
  const progress = durationMs > 0 ? positionMs / durationMs : 0;
  const hasSleepTimer = sleepTimerEndTime !== null;

  const handlePlayPause = () => {
    if (isPlaying) {
      pause();
    } else if (durationMs === 0) {
      // No track loaded (e.g. after app restart) — reload and seek to persisted verse
      resumePlayback();
    } else {
      resume();
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: tokens.surface.secondary,
          borderTopColor: tokens.border,
          paddingBottom: insets.bottom,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {/* Progress bar */}
      <View testID="mini-progress-bar" style={[styles.progressTrack, { backgroundColor: tokens.border }]}>
        <View style={[styles.progressFill, { backgroundColor: tokens.accent.audio, width: `${Math.min(progress * 100, 100)}%` }]} />
      </View>
      <View style={styles.content}>
        <Pressable
          onPress={toggleExpandedPlayer}
          style={styles.info}
          accessibilityRole="button"
          accessibilityLabel="Open audio player"
        >
          <AppText
            variant="uiCaption"
            style={{ color: tokens.text.quran }}
            numberOfLines={1}
          >
            {surahMeta?.nameEnglish} : {verseNumber} — {reciter?.nameEnglish ?? selectedReciterId}
          </AppText>
        </Pressable>
        <View style={styles.indicators}>
          {playbackSpeed !== 1.0 && (
            <View testID="speed-badge" style={[styles.badge, { backgroundColor: tokens.surface.secondary }]}>
              <AppText variant="uiCaption" style={{ color: tokens.accent.audio, fontSize: 10 }}>
                {formatSpeed(playbackSpeed)}
              </AppText>
            </View>
          )}
          {hasSleepTimer && (
            <Ionicons testID="sleep-icon" name="moon-outline" size={16} color={tokens.accent.audio} />
          )}
        </View>
        <Pressable
          onPress={handlePlayPause}
          style={styles.playButton}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={24}
            color={tokens.accent.audio}
          />
        </Pressable>
        <Pressable
          onPress={stop}
          style={styles.stopButton}
          accessibilityRole="button"
          accessibilityLabel="Stop audio"
          testID="mini-stop-button"
        >
          <Ionicons name="close" size={20} color={tokens.text.ui} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  progressTrack: {
    height: 2,
    width: '100%',
  },
  progressFill: {
    height: '100%',
  },
  content: {
    height: MINI_PLAYER_HEIGHT - 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  info: {
    flex: 1,
    marginRight: spacing.md,
  },
  indicators: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: spacing.sm,
  },
  badge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  playButton: {
    padding: spacing.sm,
  },
  stopButton: {
    padding: spacing.sm,
  },
});
