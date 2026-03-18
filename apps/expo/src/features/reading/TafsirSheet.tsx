import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { type TafsirSource, getTafsirForVerse } from '@/services/sqlite';
import { useTheme } from '@/theme/ThemeProvider';
import { KFGQPC_FONT_FAMILY, animation, spacing, typography } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

const SHEET_RATIO = 0.6;
const DISMISS_THRESHOLD = 100;

const TAFSIR_TABS: { key: TafsirSource; label: string }[] = [
  { key: 'ibn-kathir', label: 'Ibn Kathir' },
  { key: 'al-jalalayn', label: 'Al-Jalalayn' },
  { key: 'al-sadi', label: "Al-Sa'di" },
];

export interface TafsirSheetProps {
  visible: boolean;
  surahNumber: number;
  verseNumber: number;
  uthmaniText: string;
  onDismiss: () => void;
}

export function TafsirSheet({
  visible,
  surahNumber,
  verseNumber,
  uthmaniText,
  onDismiss,
}: TafsirSheetProps) {
  const { tokens } = useTheme();
  const { height: screenHeight } = useWindowDimensions();
  const sheetHeight = screenHeight * SHEET_RATIO;
  const preferredSource = useUIStore((s) => s.preferredTafsirSource ?? 'ibn-kathir');
  const [activeSource, setActiveSource] = useState<TafsirSource>(preferredSource as TafsirSource);
  const [tafsirText, setTafsirText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const translateY = useSharedValue(screenHeight);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTabChange = useCallback(
    (source: TafsirSource) => {
      setActiveSource(source);
      useUIStore.getState().setPreferredTafsirSource(source);
    },
    [],
  );

  // Animate in/out
  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(screenHeight - sheetHeight, {
        duration: animation.slide,
        easing: Easing.inOut(Easing.ease),
      });
    } else {
      translateY.value = withTiming(screenHeight, {
        duration: animation.slide,
        easing: Easing.inOut(Easing.ease),
      });
    }
  }, [visible, translateY, screenHeight, sheetHeight]);

  // Load tafsir text when source or verse changes
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setIsLoading(true);
    setTafsirText(null);

    getTafsirForVerse(surahNumber, verseNumber, activeSource).then((entry) => {
      if (!cancelled) {
        setTafsirText(entry?.text ?? null);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [visible, surahNumber, verseNumber, activeSource]);

  // Clean up dismiss timer on unmount
  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const dismissSheet = useCallback(() => {
    translateY.value = withTiming(screenHeight, {
      duration: animation.slide,
      easing: Easing.inOut(Easing.ease),
    });
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(onDismiss, animation.slide);
  }, [onDismiss, translateY, screenHeight]);

  // Swipe-down to dismiss
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = screenHeight - sheetHeight + event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_THRESHOLD || event.velocityY > 500) {
        translateY.value = withTiming(screenHeight, {
          duration: animation.slide,
          easing: Easing.inOut(Easing.ease),
        });
        runOnJS(onDismiss)();
      } else {
        translateY.value = withTiming(screenHeight - sheetHeight, {
          duration: animation.slide,
          easing: Easing.inOut(Easing.ease),
        });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <>
      <Pressable
        style={styles.backdrop}
        onPress={dismissSheet}
        accessibilityLabel="Dismiss tafsir"
      />
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.sheet,
            animatedStyle,
            {
              backgroundColor: tokens.surface.secondary,
              height: sheetHeight,
            },
          ]}
          accessibilityLabel={`Tafsir for verse ${surahNumber}:${verseNumber}`}
          accessibilityRole="summary"
        >
          {/* Drag handle */}
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: tokens.border }]} />
          </View>

          {/* Verse reference */}
          <AppText variant="uiCaption" style={[styles.verseRef, { color: tokens.text.ui }]}>
            Verse {surahNumber}:{verseNumber}
          </AppText>

          {/* Arabic verse text */}
          <Text
            style={[
              styles.arabicVerse,
              {
                color: tokens.text.quran,
                fontFamily: KFGQPC_FONT_FAMILY,
                fontSize: typography.quran.fontSize * 0.8,
                lineHeight: typography.quran.fontSize * 0.8 * typography.quran.lineHeightMultiplier,
              },
            ]}
            numberOfLines={3}
          >
            {uthmaniText}
          </Text>

          {/* Separator */}
          <View style={[styles.separator, { backgroundColor: tokens.border }]} />

          {/* Tab row */}
          <View style={styles.tabRow}>
            {TAFSIR_TABS.map((tab) => (
              <Pressable
                key={tab.key}
                style={[
                  styles.tab,
                  activeSource === tab.key && {
                    borderBottomColor: tokens.accent.audio,
                    borderBottomWidth: 2,
                  },
                ]}
                onPress={() => handleTabChange(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeSource === tab.key }}
                accessibilityLabel={tab.label}
              >
                <AppText
                  variant="ui"
                  style={{
                    color: activeSource === tab.key ? tokens.accent.audio : tokens.text.ui,
                    fontWeight: activeSource === tab.key ? '600' : '400',
                  }}
                >
                  {tab.label}
                </AppText>
              </Pressable>
            ))}
          </View>

          {/* Tafsir content */}
          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.scrollContentContainer}
          >
            {isLoading && (
              <ActivityIndicator
                size="small"
                color={tokens.accent.audio}
                style={styles.loader}
              />
            )}
            {!isLoading && tafsirText && (
              <Text
                style={[
                  styles.tafsirText,
                  {
                    color: tokens.text.quran,
                    fontSize: typography.translation.fontSize,
                    lineHeight:
                      typography.translation.fontSize * typography.translation.lineHeightMultiplier,
                  },
                ]}
              >
                {tafsirText}
              </Text>
            )}
            {!isLoading && !tafsirText && (
              <AppText variant="ui" style={{ color: tokens.text.ui }}>
                No tafsir available for this verse.
              </AppText>
            )}
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  verseRef: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  arabicVerse: {
    writingDirection: 'rtl',
    textAlign: I18nManager.isRTL ? 'left' : 'right',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  separator: {
    height: 1,
    marginHorizontal: spacing.lg,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  tafsirText: {
    writingDirection: 'rtl',
    textAlign: I18nManager.isRTL ? 'left' : 'right',
  },
  loader: {
    marginTop: spacing.xl,
  },
});
