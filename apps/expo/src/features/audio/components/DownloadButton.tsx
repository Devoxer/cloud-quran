import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';

import { useDownloadStore } from '@/features/audio/stores/useDownloadStore';
import { useTheme } from '@/theme/ThemeProvider';

interface DownloadButtonProps {
  reciterId: string;
  surahNumber: number;
  size?: number;
}

export function DownloadButton({
  reciterId,
  surahNumber,
  size = 24,
}: DownloadButtonProps) {
  const { tokens } = useTheme();
  const downloadStatus =
    useDownloadStore(
      (s) => s.downloads[`${reciterId}/${surahNumber}`],
    ) ?? 'none';
  const progress = useDownloadStore((s) =>
    s.getProgress(reciterId, surahNumber),
  );
  const startDownload = useDownloadStore((s) => s.startDownload);
  const deleteSurah = useDownloadStore((s) => s.deleteSurah);

  if (Platform.OS === 'web') return null;

  const handlePress = () => {
    if (downloadStatus === 'none') {
      startDownload(reciterId, surahNumber);
    } else if (downloadStatus === 'downloaded') {
      deleteSurah(reciterId, surahNumber);
    }
    // 'downloading' — no action on tap (could add cancel later)
  };

  const iconName =
    downloadStatus === 'downloaded'
      ? 'checkmark-circle'
      : downloadStatus === 'downloading'
        ? 'cloud-download-outline'
        : 'download-outline';

  const iconColor =
    downloadStatus === 'downloaded' ? tokens.accent.audio : tokens.text.ui;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={
        downloadStatus === 'downloaded'
          ? 'Delete downloaded audio'
          : downloadStatus === 'downloading'
            ? `Downloading ${Math.round(progress * 100)}%`
            : 'Download audio for offline'
      }
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.5 }]}
      testID="download-button"
    >
      {downloadStatus === 'downloading' ? (
        <View style={styles.progressContainer}>
          <Ionicons name="cloud-download-outline" size={size} color={tokens.accent.audio} />
        </View>
      ) : (
        <Ionicons name={iconName} size={size} color={iconColor} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
