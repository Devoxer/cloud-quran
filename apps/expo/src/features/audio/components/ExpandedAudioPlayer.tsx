import Ionicons from '@expo/vector-icons/Ionicons';
import { SURAH_METADATA } from 'quran-data';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { DownloadButton } from '@/features/audio/components/DownloadButton';
import { ReciterSelector } from '@/features/audio/components/ReciterSelector';
import { RECITERS } from '@/features/audio/data/reciters';
import {
  getNextVerseKey,
  getPreviousVerseKey,
  useAudioStore,
} from '@/features/audio/stores/useAudioStore';
import { useDownloadStore } from '@/features/audio/stores/useDownloadStore';
import { formatSpeed } from '@/features/audio/utils/formatSpeed';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

const SPEED_PRESETS = [0.5, 0.7, 0.8, 1.0, 1.2, 1.5, 2.0] as const;
const SLEEP_PRESETS: Array<{ value: number | 'end-of-surah'; label: string }> = [
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 45, label: '45m' },
  { value: 60, label: '1hr' },
  { value: 'end-of-surah', label: 'End of Surah' },
];

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatSleepRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  return `${seconds}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function ExpandedAudioPlayer() {
  const currentSurah = useAudioStore((s) => s.currentSurah);
  const currentVerseKey = useAudioStore((s) => s.currentVerseKey);
  const activeVerseKey = useAudioStore((s) => s.activeVerseKey);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const selectedReciterId = useAudioStore((s) => s.selectedReciterId);
  const playbackSpeed = useAudioStore((s) => s.playbackSpeed);
  const positionMs = useAudioStore((s) => s.positionMs);
  const durationMs = useAudioStore((s) => s.durationMs);
  const verseTimings = useAudioStore((s) => s.verseTimings);
  const pause = useAudioStore((s) => s.pause);
  const resume = useAudioStore((s) => s.resume);
  const resumePlayback = useAudioStore((s) => s.resumePlayback);
  const stop = useAudioStore((s) => s.stop);
  const setSpeed = useAudioStore((s) => s.setSpeed);
  const seekToVerse = useAudioStore((s) => s.seekToVerse);
  const sleepTimerMinutes = useAudioStore((s) => s.sleepTimerMinutes);
  const sleepTimerEndTime = useAudioStore((s) => s.sleepTimerEndTime);
  const sleepTimerRemainingMs = useAudioStore((s) => s.sleepTimerRemainingMs);
  const setSleepTimer = useAudioStore((s) => s.setSleepTimer);
  const clearSleepTimer = useAudioStore((s) => s.clearSleepTimer);
  const downloadCount = useDownloadStore((s) => s.getReciterDownloadCount(selectedReciterId));
  const downloadAll = useDownloadStore((s) => s.downloadAllForReciter);
  const deleteReciter = useDownloadStore((s) => s.deleteReciter);
  const storageBytes = useDownloadStore((s) => s.storageUsageBytes[selectedReciterId] ?? 0);
  const refreshStorageUsage = useDownloadStore((s) => s.refreshStorageUsage);
  const isVisible = useUIStore((s) => s.isExpandedPlayerVisible);
  const toggleExpandedPlayer = useUIStore((s) => s.toggleExpandedPlayer);
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [reciterPickerVisible, setReciterPickerVisible] = useState(false);

  useEffect(() => {
    if (isVisible && downloadCount > 0) {
      refreshStorageUsage(selectedReciterId);
    }
  }, [isVisible, downloadCount, selectedReciterId, refreshStorageUsage]);

  if (!isVisible || currentSurah === null) return null;

  const surahMeta = SURAH_METADATA[currentSurah - 1];
  const verseKey = activeVerseKey ?? currentVerseKey;
  const verseNumber = verseKey?.split(':')[1] ?? '1';
  const reciter = RECITERS.find((r) => r.id === selectedReciterId);
  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  const handleDownloadAll = () => {
    const reciterName = reciter?.nameEnglish ?? selectedReciterId;
    const remaining = 114 - downloadCount;
    Alert.alert(
      'Download All Surahs',
      `Download ${remaining} surahs for ${reciterName}?\n\nEstimated size: ~${((remaining / 114) * 1.5).toFixed(1)} GB\nThis may take a while on slower connections.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: () => downloadAll(selectedReciterId),
        },
      ],
    );
  };

  const handleDeleteAll = () => {
    const reciterName = reciter?.nameEnglish ?? selectedReciterId;
    Alert.alert(
      'Delete All Downloads',
      `Remove all ${downloadCount} downloaded surahs for ${reciterName}? You can re-download them later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: () => deleteReciter(selectedReciterId),
        },
      ],
    );
  };

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

  const handleNextVerse = () => {
    if (!verseKey) return;
    const nextKey = getNextVerseKey(verseKey, verseTimings);
    if (nextKey) seekToVerse(nextKey);
  };

  const handlePreviousVerse = () => {
    if (!verseKey) return;
    const prevKey = getPreviousVerseKey(verseKey, verseTimings);
    if (prevKey) seekToVerse(prevKey);
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: tokens.surface.primary,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {/* Header with close button */}
      <View style={styles.header}>
        <Pressable
          onPress={toggleExpandedPlayer}
          accessibilityRole="button"
          accessibilityLabel="Close player"
          style={styles.closeButton}
        >
          <Ionicons name="chevron-down" size={28} color={tokens.text.ui} />
        </Pressable>
      </View>

      {/* Track info */}
      <View style={styles.trackInfo}>
        <AppText variant="surahTitleEnglish" style={{ color: tokens.text.quran }}>
          {surahMeta?.nameTransliteration}
        </AppText>
        <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
          Verse {verseNumber}
        </AppText>
        <Pressable
          onPress={() => setReciterPickerVisible(true)}
          style={styles.reciterRow}
          accessibilityRole="button"
          accessibilityLabel="Select reciter"
        >
          <AppText variant="uiCaption" style={{ color: tokens.accent.audio }}>
            {reciter?.nameEnglish ?? selectedReciterId}
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={tokens.accent.audio} />
        </Pressable>
      </View>

      {/* Progress bar */}
      <View style={styles.progressSection}>
        <View
          testID="progress-bar"
          style={[styles.progressTrack, { backgroundColor: tokens.border }]}
        >
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: tokens.accent.audio,
                width: `${Math.min(progress * 100, 100)}%`,
              },
            ]}
          />
        </View>
        <View style={styles.timeRow}>
          <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
            {formatTime(positionMs)}
          </AppText>
          <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
            {formatTime(durationMs)}
          </AppText>
        </View>
      </View>

      {/* Playback controls */}
      <View style={styles.controls}>
        <Pressable
          onPress={handlePreviousVerse}
          accessibilityRole="button"
          accessibilityLabel="Previous verse"
          style={styles.controlButton}
        >
          <Ionicons name="play-skip-back" size={28} color={tokens.text.ui} />
        </Pressable>

        <Pressable
          onPress={handlePlayPause}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          style={styles.playPauseButton}
        >
          <Ionicons
            name={isPlaying ? 'pause-circle' : 'play-circle'}
            size={56}
            color={tokens.accent.audio}
          />
        </Pressable>

        <Pressable
          onPress={handleNextVerse}
          accessibilityRole="button"
          accessibilityLabel="Next verse"
          style={styles.controlButton}
        >
          <Ionicons name="play-skip-forward" size={28} color={tokens.text.ui} />
        </Pressable>
      </View>

      {/* Speed presets */}
      <View style={styles.speedSection}>
        <AppText variant="uiCaption" style={[styles.speedLabel, { color: tokens.text.ui }]}>
          Speed
        </AppText>
        <View style={styles.speedRow}>
          {SPEED_PRESETS.map((speed) => {
            const isActive = playbackSpeed === speed;
            return (
              <Pressable
                key={speed}
                testID={`speed-${speed}`}
                onPress={() => setSpeed(speed)}
                accessibilityRole="button"
                accessibilityLabel={`Speed ${formatSpeed(speed)}`}
                style={[
                  styles.speedButton,
                  {
                    backgroundColor: isActive ? tokens.accent.audio : tokens.surface.secondary,
                  },
                ]}
              >
                <AppText
                  variant="uiCaption"
                  style={{
                    color: isActive ? '#FFFFFF' : tokens.text.ui,
                    fontWeight: isActive ? '600' : '400',
                  }}
                >
                  {formatSpeed(speed)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Sleep timer section */}
      <View style={styles.sleepSection}>
        <View style={styles.sleepLabelRow}>
          <Ionicons name="moon-outline" size={16} color={tokens.text.ui} />
          <AppText variant="uiCaption" style={[styles.speedLabel, { color: tokens.text.ui }]}>
            Sleep Timer
          </AppText>
          {sleepTimerEndTime !== null && sleepTimerRemainingMs !== null && (
            <AppText variant="uiCaption" style={{ color: tokens.accent.audio }}>
              {formatSleepRemaining(sleepTimerRemainingMs)}
            </AppText>
          )}
          {sleepTimerMinutes === 'end-of-surah' && (
            <AppText variant="uiCaption" style={{ color: tokens.accent.audio }}>
              End of Surah
            </AppText>
          )}
        </View>
        <View style={styles.speedRow}>
          {SLEEP_PRESETS.map((preset) => {
            const isActive = sleepTimerMinutes === preset.value;
            return (
              <Pressable
                key={String(preset.value)}
                testID={`sleep-${preset.value}`}
                onPress={() => (isActive ? clearSleepTimer() : setSleepTimer(preset.value))}
                accessibilityRole="button"
                accessibilityLabel={isActive ? `Cancel sleep timer` : `Sleep in ${preset.label}`}
                style={[
                  styles.speedButton,
                  {
                    backgroundColor: isActive ? tokens.accent.audio : tokens.surface.secondary,
                  },
                ]}
              >
                <AppText
                  variant="uiCaption"
                  style={{
                    color: isActive ? '#FFFFFF' : tokens.text.ui,
                    fontWeight: isActive ? '600' : '400',
                  }}
                >
                  {preset.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Download section */}
      <View style={styles.downloadSection}>
        <View style={styles.downloadRow}>
          <DownloadButton reciterId={selectedReciterId} surahNumber={currentSurah} />
          <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
            {downloadCount}/114 downloaded
          </AppText>
          {storageBytes > 0 && (
            <AppText variant="uiCaption" style={{ color: tokens.text.ui }} testID="storage-usage">
              ({formatBytes(storageBytes)})
            </AppText>
          )}
        </View>
        {downloadCount < 114 && (
          <Pressable
            onPress={handleDownloadAll}
            accessibilityRole="button"
            accessibilityLabel="Download all surahs"
            testID="download-all-button"
            style={[styles.downloadAllButton, { borderColor: tokens.border }]}
          >
            <Ionicons name="cloud-download-outline" size={16} color={tokens.text.ui} />
            <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
              Download All
            </AppText>
          </Pressable>
        )}
        {downloadCount > 0 && (
          <Pressable
            onPress={handleDeleteAll}
            accessibilityRole="button"
            accessibilityLabel="Delete all downloads"
            testID="delete-all-button"
            style={[styles.downloadAllButton, { borderColor: tokens.border }]}
          >
            <Ionicons name="trash-outline" size={16} color={tokens.text.ui} />
            <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
              Delete All
            </AppText>
          </Pressable>
        )}
      </View>

      {/* Stop button — stops audio and closes expanded player */}
      <Pressable
        onPress={() => {
          stop();
          toggleExpandedPlayer();
        }}
        accessibilityRole="button"
        accessibilityLabel="Stop audio"
        testID="stop-button"
        style={[styles.stopButton, { borderColor: tokens.border }]}
      >
        <Ionicons name="stop-circle-outline" size={18} color={tokens.text.ui} />
        <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
          Stop
        </AppText>
      </Pressable>

      <ReciterSelector
        visible={reciterPickerVisible}
        onClose={() => setReciterPickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  closeButton: {
    padding: spacing.sm,
  },
  trackInfo: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  reciterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  progressSection: {
    marginBottom: spacing.xl,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing['2xl'],
  },
  controlButton: {
    padding: spacing.sm,
  },
  playPauseButton: {
    padding: spacing.xs,
  },
  speedSection: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  speedLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  speedRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  speedButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
  },
  sleepSection: {
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  sleepLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  downloadSection: {
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  downloadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  downloadAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    alignSelf: 'center',
    marginTop: spacing.xl,
  },
});
