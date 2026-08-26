/**
 * SheetHeader — the unified bottom-sheet header (Story 23.22).
 *
 * The single source of truth for a titled bottom sheet's header row. Consumers
 * normally get it FOR FREE via the `BottomSheet` wrapper's `title` prop (the
 * wrapper renders this internally), so a sheet gets a correct header by
 * construction — drift becomes structurally impossible. Exported from the
 * `components/ui` barrel for the rare hand-placed case.
 *
 * SCOPE — titled sheets ONLY (list / action / form sheets). NOT for:
 *   • promos with a floating close over centered content
 *   • headerless drag-handle menus (`AudioPlayerOverflowMenu`)
 * Those omit the wrapper's `title` and render headerless exactly as before.
 *
 * Conventions encoded (see _bmad-output/design-artifacts/primitives.md
 * § "SheetHeader (on BottomSheet)"):
 *   • title — `h3` / semibold / `text.primary` / left-aligned / role="header"
 *   • close × — `Icon name="close"` 24 `text.secondary` in a ≥44pt Pressable
 *   • chrome-header glyph buttons (incl. the sheet create-`+`) are NEUTRAL
 *     (`text.primary`); emphasis lives on the ConfirmDialog's red, not an ambient glyph
 *   • ONE `paddingVertical` + ONE hairline separator (inset `SPACING.lg`)
 */

import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Icon } from './Icon';

export interface SheetHeaderProps {
  /** Header title — `h3`/semibold/left, rendered with `accessibilityRole="header"`. */
  title: string;
  /** Trailing action (e.g. a neutral create `+`), placed before the close ×. */
  trailingAction?: ReactNode;
  /** Leading action, placed before the title (rare). */
  leadingAction?: ReactNode;
  /** Whether to render the close × (calls `onClose`). @default true */
  showClose?: boolean;
  /** Called when the close × is pressed. */
  onClose?: () => void;
  /** testID for the close × Pressable — consumers preserve their own close testID. */
  closeTestID?: string;
}

export function SheetHeader({
  title,
  trailingAction,
  leadingAction,
  showClose = true,
  onClose,
  closeTestID,
}: SheetHeaderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <View>
      <View style={styles.row}>
        {leadingAction}
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {(trailingAction || showClose) && (
          <View style={styles.actions}>
            {trailingAction}
            {showClose && (
              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={styles.closeButton}
                testID={closeTestID}
                accessibilityRole="button"
                accessibilityLabel={t('a11y:close')}
              >
                <Icon name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            )}
          </View>
        )}
      </View>
      <View style={styles.separator} />
    </View>
  );
}

const useStyles = () =>
  useThemedStyles((t) => ({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      // One resolved padding (was sm in CollectionPicker / md in SectionPicker).
      paddingVertical: SPACING.sm,
      // Breathing room so a long (or localized) flex:1 title can't ellipsize
      // flush against the trailing action / close ×.
      gap: SPACING.sm,
    },
    title: {
      flex: 1,
      fontSize: FONT_SIZE.h3,
      fontWeight: FONT_WEIGHT.semibold,
      lineHeight: FONT_SIZE.h3 * LINE_HEIGHT.heading3,
      color: t.colors.text.primary,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    // ≥44pt touch target (24pt glyph centered) — HIG-compliant close.
    closeButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      marginHorizontal: SPACING.lg,
      backgroundColor: t.colors.separator,
    },
  }));
