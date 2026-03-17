import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import Slider from '@react-native-community/slider';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

const PREVIEW_TEXT =
  '\u0628\u0650\u0633\u0652\u0645\u0650 \u0627\u0644\u0644\u0651\u064E\u0647\u0650 \u0627\u0644\u0631\u0651\u064E\u062D\u0652\u0645\u064E\u0670\u0646\u0650 \u0627\u0644\u0631\u0651\u064E\u062D\u0650\u064A\u0645\u0650';

export function FontSizeSlider() {
  const { tokens } = useTheme();
  const fontSize = useUIStore((s) => s.fontSize);
  const setFontSize = useUIStore((s) => s.setFontSize);

  const handleValueChange = useCallback(
    (value: number) => {
      setFontSize(value);
    },
    [setFontSize],
  );

  return (
    <View>
      <View style={styles.header}>
        <AppText variant="ui">Font Size</AppText>
        <AppText variant="ui" style={styles.value}>
          {fontSize}
        </AppText>
      </View>
      <Slider
        minimumValue={20}
        maximumValue={44}
        step={2}
        value={fontSize}
        onValueChange={handleValueChange}
        minimumTrackTintColor={tokens.accent.audio}
        maximumTrackTintColor={tokens.border}
        thumbTintColor={tokens.accent.audio}
        accessibilityLabel="Font size"
      />
      <AppText variant="quran" style={styles.preview}>
        {PREVIEW_TEXT}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  value: {
    fontWeight: '700',
  },
  preview: {
    marginTop: spacing.md,
  },
});
