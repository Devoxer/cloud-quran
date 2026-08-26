/**
 * RowDeleteButton — the shared in-row delete/remove affordance.
 *
 * Story 23.13 (delete-action standardization): ONE primitive for every in-row
 * delete `×` across the app (reading history, offline library, collection
 * detail) so they look and feel identical. A plain, non-outlined `×` (the
 * `close` glyph → SF `xmark` / Material `close`, NOT the filled `close-circle`
 * and NOT a trash can) in a NEUTRAL `text.secondary` — a clearly-active-but-muted
 * affordance that "blends" without borrowing `text.tertiary`'s established
 * *disabled* meaning.
 *
 * Why no red: destructive RED belongs on the CONFIRMATION step (a ConfirmDialog's
 * red confirm button), never on the trigger affordance — and the low-stakes,
 * no-confirm removes this fronts are trivially reversible. So the in-row `×`
 * carries no red. See `_bmad-output/design-artifacts/primitives.md` §
 * RowDeleteButton + the neutral-affordance convention.
 *
 * Web-safe (plain `Pressable` + `Icon`); token-clean (color from `useTheme`,
 * padding from `SPACING`). Pair the press with a single light delete haptic at
 * the call site (`haptics.impact('light')`), not here — the haptic fires on the
 * delete *completion*, not the tap.
 *
 * @example
 * <RowDeleteButton
 *   onPress={() => removeFromHistory(book.id)}
 *   accessibilityLabel={`Remove ${book.title} from history`}
 *   testID={`${testID}-delete`}
 * />
 */
import { Pressable, StyleSheet } from 'react-native';
import { SPACING } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { Icon } from './Icon';

export interface RowDeleteButtonProps {
  /** Fired when the affordance is tapped (the actual delete/remove handler). */
  onPress: () => void;
  /** REQUIRED, e.g. `Remove {title} from history` — the affordance is icon-only. */
  accessibilityLabel: string;
  /** Glyph size. @default 18 (shared by every in-row delete — AC2: identical rows). */
  size?: number;
  testID?: string;
}

/**
 * Default `×` glyph size — one size for every in-row delete (AC2: rows look
 * identical). 18 (owner smoke 2026-06-23: 22 read too large/heavy next to the
 * 18pt row icons; balanced down to match).
 */
const DEFAULT_SIZE = 18;

export function RowDeleteButton({
  onPress,
  accessibilityLabel,
  size = DEFAULT_SIZE,
  testID,
}: RowDeleteButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      // 26pt visual (18 glyph + 2×SPACING.xs) + 10pt slop each side = 46pt ≥ the
      // 44pt HIG touch target. (Slop, not a bigger box, so the owner-smoked glyph
      // position is unchanged — see DEFAULT_SIZE.)
      hitSlop={10}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {/* `close` = plain × (xmark/close); neutral text.secondary — red lives on the
          confirm dialog, never the trigger. The Pressable carries the a11y label,
          so the glyph itself is decorative. */}
      <Icon name="close" size={size} color={colors.text.secondary} accessibilityElementsHidden />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: SPACING.xs,
  },
});
