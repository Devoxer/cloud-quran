import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/AppText';
import { useAudioStore } from '@/features/audio/stores/useAudioStore';
import { useDownloadStore } from '@/features/audio/stores/useDownloadStore';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export function OfflineAudioToast() {
  const error = useAudioStore((s) => s.error);
  const currentSurah = useAudioStore((s) => s.currentSurah);
  const selectedReciterId = useAudioStore((s) => s.selectedReciterId);
  const startDownload = useDownloadStore((s) => s.startDownload);
  const { tokens } = useTheme();

  if (error !== 'offline-no-audio' || !currentSurah) return null;

  const isWeb = Platform.OS === 'web';

  const handleDownload = () => {
    startDownload(selectedReciterId, currentSurah);
    useAudioStore.setState({ error: null });
  };

  const handleDismiss = () => {
    useAudioStore.setState({ error: null });
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: tokens.surface.secondary, borderColor: tokens.border },
      ]}
      testID="offline-audio-toast"
    >
      <Ionicons name="cloud-offline-outline" size={20} color={tokens.text.ui} />
      <AppText variant="ui" style={[styles.text, { color: tokens.text.ui }]}>
        {isWeb ? 'Audio unavailable offline' : 'Download surah for offline?'}
      </AppText>
      {!isWeb && (
        <Pressable
          onPress={handleDownload}
          accessibilityRole="button"
          accessibilityLabel="Download"
          style={[styles.downloadAction, { backgroundColor: tokens.accent.audio }]}
        >
          <AppText variant="uiCaption" style={[styles.actionText, { color: tokens.surface.primary }]}>
            Download
          </AppText>
        </Pressable>
      )}
      <Pressable
        onPress={handleDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={8}
      >
        <Ionicons name="close" size={18} color={tokens.text.ui} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.sm,
  },
  text: {
    flex: 1,
  },
  downloadAction: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
  },
  actionText: {
    fontWeight: '600',
  },
});
