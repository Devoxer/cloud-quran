/**
 * SettingsGroup — a labelled group of SettingsRows on one Card (Story 23.2).
 *
 * Renders an optional uppercase section `label` ABOVE the card (iOS grouped-list
 * convention), a `Card` (padded `false`) wrapping its rows, and an optional
 * `footnote` below. It drives the between-rows hairline: each child after the
 * first gets `showDivider`, so a divider never appears before the first row.
 *
 * `Children.toArray` is used so a `.map()`-produced row array flattens AND any
 * conditional `false` row (e.g. `Platform.OS !== 'web' && <SettingsRow/>`) drops
 * out — keeping "first row" correct regardless of how children are composed.
 *
 * @example
 * <SettingsGroup label="Preferences" footnote="Applied on this device only.">
 *   <SettingsRow ... />
 *   <SettingsRow ... />
 * </SettingsGroup>
 */

import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { type StyleProp, Text, type TextStyle, View } from 'react-native';
import { SPACING } from '@/constants/spacing';
import { captionLetterSpacing, FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { isRTL, TEXT_ALIGN_START } from '@/lib/rtl';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Card } from './Card';

export interface SettingsGroupProps {
  /** Optional uppercase caps header rendered above the card. */
  label?: string;
  /**
   * Direction/alignment override for the label (story 8-3 review, D5c).
   *
   * ⚠️ IT EXISTS FOR ONE CASE: A LABEL THAT IS **CONTENT**, NOT UI COPY. The content screen's
   * group header is a content pack's own TITLE, so it belongs to the pack's language rather than
   * to the interface's — the same rule `contentTextAlign` states for the preview and the
   * attribution drawn beside it. Without this the title was the one element in the group still
   * taking the interface's direction, which is invisible today (one French pack) and wrong the
   * moment story 8-4 ships Urdu and Persian. Merged AFTER the caption treatment, so the uppercase
   * and letter-spacing that make a section header a section header stay owned here.
   */
  labelStyle?: StyleProp<TextStyle>;
  /** Optional explanatory line rendered below the card. */
  footnote?: string;
  children: ReactNode;
  testID?: string;
}

export function SettingsGroup({
  label,
  labelStyle,
  footnote,
  children,
  testID,
}: SettingsGroupProps) {
  const styles = useStyles();

  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <View testID={testID}>
      {label != null && <Text style={[styles.label, labelStyle]}>{label}</Text>}
      <Card padded={false}>
        {rows.map((child, index) =>
          cloneElement(child as ReactElement<{ showDivider?: boolean }>, { showDivider: index > 0 })
        )}
      </Card>
      {footnote != null && <Text style={styles.footnote}>{footnote}</Text>}
    </View>
  );
}

const useStyles = () =>
  useThemedStyles((t) => ({
    // Caption treatment per tokens.ts TYPE.caption (11/600 uppercase, letterSpacing 1.0).
    // The screen's scroll padding provides the outer inset; this is the small extra
    // inset that aligns the header with the card content (iOS section-header look).
    label: {
      textAlign: TEXT_ALIGN_START,
      fontSize: FONT_SIZE.caption,
      fontWeight: FONT_WEIGHT.semibold,
      textTransform: 'uppercase',
      letterSpacing: captionLetterSpacing(isRTL()),
      paddingStart: SPACING.md,
      paddingBottom: SPACING.sm,
      color: t.colors.text.tertiary,
    },
    footnote: {
      textAlign: TEXT_ALIGN_START,
      marginTop: SPACING.sm,
      paddingHorizontal: SPACING.md,
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.regular,
      color: t.colors.text.tertiary,
    },
  }));
