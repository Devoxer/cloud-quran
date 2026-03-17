import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, themes } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

type ThemeOption = 'system' | 'light' | 'sepia' | 'dark';

const CIRCLE_SIZE = 48;

const THEME_OPTIONS: {
  key: ThemeOption;
  label: string;
  previewColor: string;
  previewColorAlt?: string;
}[] = [
  {
    key: 'system',
    label: 'System',
    previewColor: themes.light.surface.primary,
    previewColorAlt: themes.dark.surface.primary,
  },
  { key: 'light', label: 'Light', previewColor: themes.light.surface.primary },
  { key: 'sepia', label: 'Sepia', previewColor: themes.sepia.surface.primary },
  { key: 'dark', label: 'Dark', previewColor: themes.dark.surface.primary },
];

export function ThemePicker() {
  const { tokens } = useTheme();
  const selectedTheme = useUIStore((s) => s.selectedTheme);
  const setTheme = useUIStore((s) => s.setTheme);

  const handlePress = useCallback(
    (key: ThemeOption) => {
      setTheme(key);
    },
    [setTheme],
  );

  return (
    <View style={styles.row}>
      {THEME_OPTIONS.map((option) => {
        const isSelected = selectedTheme === option.key;
        const borderColor = isSelected ? tokens.accent.audio : tokens.border;
        const borderWidth = isSelected ? 2 : 1;

        return (
          <Pressable
            key={option.key}
            style={styles.option}
            onPress={() => handlePress(option.key)}
            accessibilityRole="button"
            accessibilityLabel={`${option.label} theme`}
            accessibilityState={{ selected: isSelected }}
          >
            <View
              style={[
                styles.circle,
                {
                  borderColor,
                  borderWidth,
                },
              ]}
            >
              {option.previewColorAlt ? (
                <View style={styles.splitCircle}>
                  <View style={[styles.halfLeft, { backgroundColor: option.previewColor }]} />
                  <View style={[styles.halfRight, { backgroundColor: option.previewColorAlt }]} />
                </View>
              ) : (
                <View style={[styles.solidCircle, { backgroundColor: option.previewColor }]} />
              )}
            </View>
            <AppText variant="uiCaption" style={styles.label}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  option: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splitCircle: {
    flexDirection: 'row',
    width: '100%',
    height: '100%',
  },
  halfLeft: {
    flex: 1,
  },
  halfRight: {
    flex: 1,
  },
  solidCircle: {
    width: '100%',
    height: '100%',
  },
  label: {
    textAlign: 'center',
  },
});
