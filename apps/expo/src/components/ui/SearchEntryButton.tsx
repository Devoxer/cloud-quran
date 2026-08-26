/**
 * SearchEntryButton — a presentational "fake search bar" that is really a button.
 *
 * Story 23.18: the Discover home no longer hosts a working search field — search
 * moved to the dedicated `/search` route. This is the trigger that LOOKS like the
 * app's `<SearchBar>` input (rounded surface + search glyph + placeholder text)
 * but is a single `Pressable` that pushes the route. It renders identically on
 * every platform (one code path) and is reusable for any "tap to open search"
 * entry point.
 */

import { useTranslation } from 'react-i18next';
import { Pressable, StyleProp, ViewStyle } from 'react-native';
import { RADII } from '@/constants/radii';
import { SHADOWS } from '@/constants/shadows';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Icon } from './Icon';
import { SEARCH_FIELD_HEIGHT } from './SearchBar';
import { Text } from './Themed';

export interface SearchEntryButtonProps {
  /** Placeholder copy shown in the fake input (e.g. "Search books, authors"). */
  placeholder: string;
  /** Called when the button is tapped (typically `router.push('/search')`). */
  onPress: () => void;
  /** Optional container style (e.g. `flex: 1` inside a row). */
  style?: StyleProp<ViewStyle>;
  /** Test ID for testing. */
  testID?: string;
}

/**
 * SearchEntryButton Component
 *
 * Mirrors `<SearchBar>`'s input surface so it reads as a search field, but acts
 * as a button. Themed via `useThemedStyles`; accent-free neutral surface.
 */
export function SearchEntryButton({ placeholder, onPress, style, testID }: SearchEntryButtonProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles((t) => ({
    surface: {
      flexDirection: 'row',
      alignItems: 'center',
      // Match the SearchBar input + the Discover filter button (44pt) so the entry
      // row reads as one consistent-height control pair (Story 23.18 smoke).
      minHeight: SEARCH_FIELD_HEIGHT,
      borderRadius: RADII.md,
      paddingHorizontal: SPACING.md,
      gap: SPACING.sm,
      backgroundColor: t.colors.background.secondary,
      ...SHADOWS.card, // unified soft elevation (matches the cards/chips app-wide)
    },
    placeholder: {
      flex: 1,
      fontSize: FONT_SIZE.body,
      color: t.colors.text.tertiary,
    },
  }));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.surface, { opacity: pressed ? 0.6 : 1 }, style]}
      accessibilityRole="button"
      accessibilityLabel={t('a11y:search')}
      testID={testID}
    >
      <Icon name="search" size={SPACING.lg} color={colors.text.tertiary} />
      <Text style={styles.placeholder} numberOfLines={1}>
        {placeholder}
      </Text>
    </Pressable>
  );
}
