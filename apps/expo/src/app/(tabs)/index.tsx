import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MushafModeScreen } from '@/features/reading/MushafMode/MushafModeScreen';
import { ReadingModeScreen } from '@/features/reading/ReadingModeScreen';
import { animation } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

const HALF_FADE = animation.fade / 2; // 125ms

export default function ReadingTab() {
  const currentMode = useUIStore((s) => s.currentMode);
  const [renderedMode, setRenderedMode] = useState(currentMode);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (currentMode !== renderedMode) {
      // Stop any in-progress animation before starting new one
      fadeAnim.stopAnimation();
      // Fade out → swap → fade in
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: HALF_FADE,
        useNativeDriver: true,
      }).start(() => {
        setRenderedMode(currentMode);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: HALF_FADE,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [currentMode, renderedMode, fadeAnim]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {renderedMode === 'mushaf' ? (
        <ErrorBoundary screenName="Mushaf">
          <MushafModeScreen />
        </ErrorBoundary>
      ) : (
        <ErrorBoundary screenName="Reading">
          <ReadingModeScreen />
        </ErrorBoundary>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
