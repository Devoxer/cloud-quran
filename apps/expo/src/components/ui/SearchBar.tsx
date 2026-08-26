/**
 * SearchBar - Search input with icon, clear and cancel buttons
 *
 * Story 4.4: Implement Book Search
 * Epic 4: Book Discovery & Browsing
 *
 * Features:
 * - Search icon on left
 * - Clear button (X) when text is present
 * - Cancel button on right
 * - Auto-focus support
 * - Keyboard handling
 *
 * @example
 * <SearchBar
 *   value={query}
 *   onChangeText={setQuery}
 *   onCancel={() => setIsSearchActive(false)}
 *   onClear={() => setQuery('')}
 *   autoFocus
 * />
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleProp, TextInput, View, ViewStyle } from 'react-native';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Icon } from './Icon';
import { Text } from './Themed';

/**
 * Shared height for every search affordance (this input, the SearchEntryButton
 * fake-bar, and the Discover filter button) so they line up as one control row
 * — a comfortable 44pt tap target (Story 23.18).
 */
export const SEARCH_FIELD_HEIGHT = 44;

/**
 * Props for SearchBar component
 */
export interface SearchBarProps {
  /** Current search query value */
  value: string;
  /** Callback when query changes */
  onChangeText: (text: string) => void;
  /** Callback when search is submitted */
  onSubmit?: () => void;
  /** Callback when cancel is pressed */
  onCancel?: () => void;
  /** Callback when clear button is pressed */
  onClear?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the input is focused */
  autoFocus?: boolean;
  /** Optional container style */
  style?: StyleProp<ViewStyle>;
  /** Test ID for testing */
  testID?: string;
}

/**
 * SearchBar Component
 *
 * Search input with icon, clear and cancel buttons.
 * Follows Cozy Warmth design language.
 */
export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  onCancel,
  onClear,
  placeholder,
  autoFocus = false,
  style,
  testID,
}: SearchBarProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles((t) => ({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      gap: SPACING.sm,
    },
    inputContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: SEARCH_FIELD_HEIGHT,
      borderRadius: RADII.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      backgroundColor: t.colors.background.secondary,
    },
    searchIcon: {
      marginRight: SPACING.sm,
    },
    input: {
      flex: 1,
      fontSize: FONT_SIZE.body,
      padding: 0,
      margin: 0,
      color: t.colors.text.primary,
    },
    clearButton: {
      padding: SPACING.xs,
      marginLeft: SPACING.xs,
    },
    clearButtonInner: {
      width: SPACING.lg + SPACING.xs,
      height: SPACING.lg + SPACING.xs,
      borderRadius: RADII.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.text.tertiary,
    },
    cancelButton: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    cancelText: {
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.medium,
      color: t.colors.accent.primary,
    },
  }));
  const inputRef = useRef<TextInput>(null);

  // Auto-focus on mount if requested
  useEffect(() => {
    if (autoFocus) {
      // Small delay to ensure component is mounted
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  // Handle clear button press
  const handleClear = () => {
    onChangeText('');
    onClear?.();
    inputRef.current?.focus();
  };

  // Handle submit/search
  const handleSubmit = () => {
    onSubmit?.();
  };

  const hasText = value.length > 0;

  return (
    <View style={[styles.container, style]} testID={testID}>
      {/* Search Input Container */}
      <View style={styles.inputContainer}>
        {/* Search Icon */}
        <Icon
          name="search"
          size={SPACING.lg}
          color={colors.text.tertiary}
          style={styles.searchIcon}
          testID={testID ? `${testID}-search-icon` : undefined}
        />

        {/* Text Input */}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={handleSubmit}
          placeholder={placeholder ?? t('common:search.booksPlaceholder')}
          placeholderTextColor={colors.text.tertiary}
          style={styles.input}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('a11y:searchInput')}
          accessibilityRole="search"
          testID={testID ? `${testID}-input` : undefined}
        />

        {/* Clear Button */}
        {hasText && (
          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [styles.clearButton, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityLabel={t('a11y:clearSearch')}
            accessibilityRole="button"
            testID={testID ? `${testID}-clear-button` : undefined}
          >
            <View style={styles.clearButtonInner}>
              <Icon name="close" size={SPACING.md} color={colors.background.primary} />
            </View>
          </Pressable>
        )}
      </View>

      {/* Cancel Button — only when an onCancel handler is provided. Sticky search
          fields (Story 23.18: /search, /filters search-within, notes) dismiss via
          the native back chevron / clear ✕, not a Cancel button, so they omit
          onCancel and this renders nothing. Call sites that DO pass onCancel
          (e.g. web Discover) still get the Cancel affordance. */}
      {onCancel && (
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => [styles.cancelButton, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityLabel={t('a11y:cancelSearch')}
          accessibilityRole="button"
          testID={testID ? `${testID}-cancel-button` : undefined}
        >
          <Text style={styles.cancelText}>{t('actions.cancel')}</Text>
        </Pressable>
      )}
    </View>
  );
}
