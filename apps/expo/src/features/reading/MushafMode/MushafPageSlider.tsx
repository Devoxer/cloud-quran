import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Slider from '@react-native-community/slider';
import { TOTAL_PAGES } from 'quran-data';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { animation, spacing } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

interface MushafPageSliderProps {
  currentPage: number;
  onPageChange: (page: number) => void;
}

export function MushafPageSlider({ currentPage, onPageChange }: MushafPageSliderProps) {
  const isChromeVisible = useUIStore((s) => s.isChromeVisible);
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(isChromeVisible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isChromeVisible ? 1 : 0,
      duration: animation.fade,
      useNativeDriver: true,
    }).start();
  }, [isChromeVisible, fadeAnim]);

  return (
    <Animated.View
      pointerEvents={isChromeVisible ? 'auto' : 'none'}
      style={[
        styles.container,
        {
          paddingBottom: insets.bottom + spacing.sm,
          backgroundColor: tokens.surface.secondary + 'E6',
          opacity: fadeAnim,
        },
      ]}
    >
      <AppText variant="uiCaption" style={[styles.pageText, { color: tokens.text.ui }]}>
        Page {currentPage} of {TOTAL_PAGES}
      </AppText>
      <Slider
        style={styles.slider}
        minimumValue={1}
        maximumValue={TOTAL_PAGES}
        step={1}
        value={TOTAL_PAGES + 1 - currentPage}
        onSlidingComplete={(value) => onPageChange(TOTAL_PAGES + 1 - Math.round(value))}
        minimumTrackTintColor={tokens.border}
        maximumTrackTintColor={tokens.accent.audio}
        thumbTintColor={tokens.accent.audio}
        accessibilityLabel={`Page slider, page ${currentPage} of ${TOTAL_PAGES}`}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  pageText: {
    textAlign: 'center',
  },
  slider: {
    width: '100%',
    height: 40,
  },
});
