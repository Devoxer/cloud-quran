/**
 * LoadingView — the single loading primitive for screen/section-level loading.
 *
 * Story 17.13: a themed, centered `ActivityIndicator` that replaces every
 * hand-composed skeleton. The reactive InstantDB + MMKV cache repaints most
 * screens instantly after the first run, so a centered spinner is all the rare
 * cold load needs — no shimmering placeholder to drift out of sync with the
 * real layout. This is the ONLY go-forward loading primitive; new loading uses
 * it (no new skeletons).
 *
 * @example
 * // Full-screen loading branch (flex:1, centered)
 * if (isLoading) return <LoadingView fullScreen />;
 *
 * // Inline / section spinner
 * <LoadingView style={styles.sectionLoading} />
 */

import { useTranslation } from 'react-i18next';
import { ActivityIndicator, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';

export interface LoadingViewProps {
  /** Spinner size. @default 'large' */
  size?: 'small' | 'large';
  /** Fill the available space and center (screen-level loading branch). @default false */
  fullScreen?: boolean;
  /** Optional container style override (margins, min-height for a section). */
  style?: StyleProp<ViewStyle>;
  /** Accessibility label. @default 'Loading' */
  accessibilityLabel?: string;
  /** Test ID. @default 'loading-view' */
  testID?: string;
}

export function LoadingView({
  size = 'large',
  fullScreen = false,
  style,
  accessibilityLabel,
  testID = 'loading-view',
}: LoadingViewProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <View
      style={[styles.center, fullScreen && styles.fullScreen, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? t('a11y:loading')}
      testID={testID}
    >
      <ActivityIndicator size={size} color={colors.accent.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreen: {
    flex: 1,
  },
});
