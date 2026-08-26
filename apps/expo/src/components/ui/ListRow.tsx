/**
 * ListRow — one generic (non-book) row in a list (Story 23.4).
 *
 * The `SettingsRow` shape generalized for arbitrary content: an optional
 * `leading` slot, a `title` (+ optional `subtitle`), and an optional `trailing`
 * slot. It is the home for the "generic / text" list rows (note items, plain
 * text rows) — the §B/§C boundary's counterpart to `BookCard`'s `row` variant
 * (which owns book-cover-primary rows). Composed only from RN `View`/`Text`/
 * `Pressable` + tokens (no component lib).
 *
 * Mirrors `SettingsRow` exactly (factory styles, `Pressable`-when-`onPress`,
 * testID/a11y on the interactive element, internal `showDivider`). Drops the
 * SettingsRow-specific affordances (`icon`/`iconVariant` badge, `trailing`
 * tokens, `switch`, `destructive`, `disabled`) — `leading`/`trailing` are the
 * generic escape hatches. `swipeActions` is intentionally NOT built (no consumer
 * swipes a generic row today; YAGNI — add it when a swipe consumer arrives).
 *
 * @example
 * <ListRow title={noteText} titleNumberOfLines={2} subtitle="2 hours ago"
 *   onPress={openEditor} testID="note-item-1" showDivider />
 */

import type { ReactNode } from 'react';
import { Pressable, type StyleProp, Text, View, type ViewStyle } from 'react-native';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { useThemedStyles } from '@/lib/useThemedStyles';

export interface ListRowProps {
  /**
   * Optional left slot (glyph / thumbnail). Omitted for text-only rows.
   * Note: `showDivider`'s hairline insets a fixed 16 (a leading-less row); a
   * leading-present consumer would need a wider divider inset — deferred until
   * one exists (YAGNI), so `showDivider` assumes no `leading`.
   */
  leading?: ReactNode;
  /** Primary line — `FONT_SIZE.h3`(16), `text.primary`. Weight per `titleWeight`. */
  title: string;
  /**
   * Title weight. Default `semibold` (the settings-row look). Pass `regular` for
   * multi-line body-text primaries (note previews) where semibold reads heavy.
   */
  titleWeight?: 'regular' | 'semibold';
  /** Lines before the title truncates (default 1; note rows pass 2). */
  titleNumberOfLines?: number;
  /** Second line — `FONT_SIZE.bodySmall`(13)/regular, `text.tertiary`, 1-line. */
  subtitle?: string;
  /** Optional right slot (action / value / chevron), right-aligned after the text. */
  trailing?: ReactNode;
  /** Tapping the row. When set, the row is a Pressable. */
  onPress?: () => void;
  /** Accessibility label for a pressable row (defaults to `title`). */
  accessibilityLabel?: string;
  /** Accessibility hint for a pressable row. */
  accessibilityHint?: string;
  testID?: string;
  /** Internal — set by the consumer to draw the between-rows hairline ABOVE this row. */
  showDivider?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ListRow({
  leading,
  title,
  titleWeight = 'semibold',
  titleNumberOfLines = 1,
  subtitle,
  trailing,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
  showDivider = false,
  style,
}: ListRowProps) {
  const styles = useStyles();

  const content = (
    <View style={styles.rowBody}>
      {leading}
      <View style={styles.textBlock}>
        <Text
          style={[styles.title, titleWeight === 'regular' && styles.titleRegular]}
          numberOfLines={titleNumberOfLines}
          testID={testID ? `${testID}-title` : undefined}
        >
          {title}
        </Text>
        {/* Truthy guard (not `!= null`): an empty-string subtitle is omitted
            rather than rendering a blank caption line — the primitive stays safe
            even if a consumer forgets the `relativeTime || undefined` coercion. */}
        {subtitle ? (
          <Text
            style={styles.subtitle}
            numberOfLines={1}
            testID={testID ? `${testID}-subtitle` : undefined}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );

  // Hairline ABOVE the row body (mirrors SettingsRow `showDivider`). Inset 16 =
  // the title-start inset for a text-only row (no `leading`); every consumer in
  // this story is leading-less. (A leading-present consumer would need the divider
  // to clear the leading width — deferred until one exists.)
  const divider = showDivider ? (
    <View style={styles.divider} testID={testID ? `${testID}-divider` : undefined} />
  ) : null;

  // testID + accessibility live on the interactive element itself (the Pressable)
  // so consumers can `getByTestId(...)` then assert role/label AND fire the press.
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed, style]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityHint={accessibilityHint}
      >
        {divider}
        {content}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={style}>
      {divider}
      {content}
    </View>
  );
}

const useStyles = () =>
  useThemedStyles((t) => ({
    // Same locked row metrics as SettingsRow (the house row rhythm). Literals are
    // fine inside a `useThemedStyles` factory (lint:style scans `style` props only).
    rowBody: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      minHeight: 56,
      paddingVertical: 15,
      paddingHorizontal: 16,
    },
    textBlock: {
      flex: 1,
    },
    title: {
      fontSize: FONT_SIZE.h3,
      fontWeight: FONT_WEIGHT.semibold,
      lineHeight: FONT_SIZE.h3 * LINE_HEIGHT.heading3,
      color: t.colors.text.primary,
    },
    // `titleWeight="regular"` variant — lighter primary for multi-line body text.
    titleRegular: {
      fontWeight: FONT_WEIGHT.regular,
    },
    subtitle: {
      marginTop: 2,
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.regular,
      lineHeight: FONT_SIZE.bodySmall * LINE_HEIGHT.body,
      color: t.colors.text.tertiary,
    },
    pressed: {
      opacity: 0.7,
    },
    divider: {
      height: 1,
      marginLeft: 16,
      backgroundColor: t.colors.separator,
    },
  }));
