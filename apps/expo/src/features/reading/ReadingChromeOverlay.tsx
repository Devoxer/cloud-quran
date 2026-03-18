import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { SURAH_METADATA } from 'quran-data';
import { useCallback, useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { useAudioStore } from '@/features/audio/stores/useAudioStore';
import { OfflineIndicator } from '@/features/sync/components/OfflineIndicator';
import { useTheme } from '@/theme/ThemeProvider';
import { animation, spacing } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

interface ReadingChromeOverlayProps {
  onVerseJumpPress?: () => void;
}

export function ReadingChromeOverlay({ onVerseJumpPress }: ReadingChromeOverlayProps = {}) {
  const isChromeVisible = useUIStore((s) => s.isChromeVisible);
  const currentSurah = useUIStore((s) => s.currentSurah);
  const currentVerse = useUIStore((s) => s.currentVerse);
  const currentMode = useUIStore((s) => s.currentMode);
  const setMode = useUIStore((s) => s.setMode);
  const audioCurrentSurah = useAudioStore((s) => s.currentSurah);
  const audioPlay = useAudioStore((s) => s.play);
  const firstVisibleVerse = useUIStore((s) => s.firstVisibleVerse);
  const showTransliteration = useUIStore((s) => s.showTransliteration);
  const toggleTransliteration = useUIStore((s) => s.toggleTransliteration);
  const { tokens } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(isChromeVisible ? 1 : 0)).current;

  const handleModeToggle = useCallback(() => {
    setMode(currentMode === 'reading' ? 'mushaf' : 'reading');
  }, [currentMode, setMode]);

  const handleShare = useCallback(async () => {
    const shareUrl = `https://cloudquran.app/quran/${currentSurah}/${currentVerse}`;
    const surahMeta = SURAH_METADATA[currentSurah - 1];
    const message = `${surahMeta.nameEnglish} (${surahMeta.nameArabic}), Verse ${currentVerse} — Cloud Quran`;
    try {
      if (Platform.OS === 'android') {
        await Share.share({ message: `${message}\n${shareUrl}` });
      } else {
        await Share.share({ url: shareUrl, message });
      }
    } catch {
      // Share failed (e.g., no share target available) — no action needed
    }
  }, [currentSurah, currentVerse]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isChromeVisible ? 1 : 0,
      duration: animation.fade,
      useNativeDriver: true,
    }).start();
  }, [isChromeVisible, fadeAnim]);

  const metadata = SURAH_METADATA[currentSurah - 1];

  return (
    <Animated.View
      pointerEvents={isChromeVisible ? 'auto' : 'none'}
      style={[
        styles.container,
        {
          paddingTop: insets.top + spacing.sm,
          backgroundColor: tokens.surface.secondary + 'E6',
          opacity: fadeAnim,
        },
      ]}
    >
      <OfflineIndicator />
      <View style={styles.content}>
        <View style={styles.leftControls}>
          <Pressable
            onPress={handleModeToggle}
            style={styles.modeToggle}
            accessibilityRole="button"
            accessibilityLabel={
              currentMode === 'reading' ? 'Switch to Mushaf Mode' : 'Switch to Reading Mode'
            }
          >
            <Ionicons
              name={currentMode === 'reading' ? 'albums-outline' : 'list-outline'}
              size={22}
              color={tokens.text.ui}
            />
          </Pressable>
          {currentMode === 'reading' && (
            <Pressable
              onPress={toggleTransliteration}
              style={styles.transliterationToggle}
              accessibilityRole="button"
              accessibilityLabel={
                showTransliteration ? 'Hide transliteration' : 'Show transliteration'
              }
            >
              <Ionicons
                name={showTransliteration ? 'text' : 'text-outline'}
                size={20}
                color={showTransliteration ? tokens.accent.audio : tokens.text.ui}
              />
            </Pressable>
          )}
        </View>
        <View style={styles.titleContainer}>
          <AppText variant="surahTitleArabic" style={{ color: tokens.text.quran }}>
            {metadata.nameArabic}
          </AppText>
          {currentMode !== 'mushaf' && (
            <>
              <AppText variant="surahTitleEnglish" style={{ color: tokens.text.ui }}>
                {metadata.nameEnglish}
              </AppText>
              <Pressable
                onPress={onVerseJumpPress}
                accessibilityRole="button"
                accessibilityLabel="Go to verse"
              >
                <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
                  Verse {currentVerse} of {metadata.verseCount}
                </AppText>
              </Pressable>
            </>
          )}
        </View>
        {audioCurrentSurah === null && (
          <Pressable
            onPress={() => audioPlay(currentSurah, undefined, firstVisibleVerse ?? undefined)}
            style={styles.playButton}
            accessibilityRole="button"
            accessibilityLabel="Play surah"
          >
            <Ionicons name="play-circle-outline" size={26} color={tokens.accent.audio} />
          </Pressable>
        )}
        <Pressable
          onPress={handleShare}
          style={styles.shareButton}
          accessibilityRole="button"
          accessibilityLabel="Share verse"
        >
          <Ionicons name="share-outline" size={22} color={tokens.text.ui} />
        </Pressable>
        <Pressable
          onPress={() => router.navigate('/settings')}
          style={styles.settingsButton}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={22} color={tokens.text.ui} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  playButton: {
    position: 'absolute',
    right: spacing.lg + 72,
    top: 0,
    padding: spacing.sm,
    zIndex: 1,
  },
  shareButton: {
    position: 'absolute',
    right: spacing.lg + 36,
    top: 0,
    padding: spacing.sm,
  },
  settingsButton: {
    position: 'absolute',
    right: spacing.lg,
    top: 0,
    padding: spacing.sm,
  },
  leftControls: {
    position: 'absolute',
    left: spacing.lg,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    zIndex: 1,
  },
  modeToggle: {
    padding: spacing.sm,
  },
  transliterationToggle: {
    padding: spacing.sm,
  },
});
