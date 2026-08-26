/**
 * SettingsRow — one row in a settings/forms list (Story 23.2).
 *
 * The single owner of the settings-row look: a leading icon (inline glyph or a
 * 34×34 badge), a label (+ optional description), and a `trailing` slot. The
 * trailing slot accepts a semantic token (`'switch' | 'chevron' | 'external' |
 * 'spinner'`), a value-text string, or an arbitrary ReactNode (e.g. a
 * `SegmentedControl` / `TimePicker`). Composed only from RN `View`/`Text`/
 * `Pressable` + existing `components/ui` wrappers + tokens (no component lib).
 *
 * Note: the badge is the tinted `accent.faint` fill + `accent.soft` glyph (the Claude
 * Design look, landed in Story 23.8 once the palette system introduced those accent
 * sub-tokens — 23.2 shipped the neutral interim deliberately). It reads tokens, so it
 * re-skins automatically across all six palettes.
 *
 * @example
 * <SettingsRow icon="notifications-outline" iconVariant="badge" label="All Notifications"
 *   description="Turn reminders on or off" trailing="switch" value={on} onValueChange={set} />
 * <SettingsRow icon="open-outline" label="Privacy Policy" trailing="external" onPress={open} />
 */

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  type ColorValue,
  Platform,
  PlatformColor,
  Pressable,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { RADII } from '@/constants/radii';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Icon } from './Icon';
import type { IconName } from './icon-registry';
import { Switch } from './Switch';

/** Reserved semantic trailing tokens (anything else string → rendered as value text). */
const TRAILING_TOKENS = ['switch', 'chevron', 'external', 'spinner'] as const;
type TrailingToken = (typeof TRAILING_TOKENS)[number];

export type SettingsRowTrailing = TrailingToken | ReactNode;

export interface SettingsRowProps {
  /** Leading icon name (omit for no icon). */
  icon?: IconName;
  /** `'inline'` (default) = a 20px glyph; `'badge'` = a 34×34 tinted badge. */
  iconVariant?: 'inline' | 'badge';
  /** Primary row label. */
  label: string;
  /** Optional secondary line below the label. */
  description?: string;
  /**
   * Trailing affordance: a semantic token, a value-text string, or a ReactNode.
   * `'switch'` reads `value` / `onValueChange`; `'spinner'` shows an ActivityIndicator.
   */
  trailing?: SettingsRowTrailing;
  /** Switch value — used when `trailing === 'switch'`. */
  value?: boolean;
  /** Switch handler — used when `trailing === 'switch'`. */
  onValueChange?: (value: boolean) => void;
  /** testID forwarded to the inner switch / spinner so migrated screens keep their IDs. */
  trailingTestID?: string;
  /** Tapping the row. When set, the row is a Pressable. */
  onPress?: () => void;
  /** Dims the row (opacity 0.5) and blocks press + the inner switch. */
  disabled?: boolean;
  /**
   * Marks the row as the chosen option in a checkmark list (Story 20.3), surfaced to
   * assistive tech via `accessibilityState.selected`. Required for accessibility: a checkmark
   * GLYPH carries no semantics, so without this a VoiceOver user cannot tell which option is
   * active. Additive and default-`undefined`, so every existing consumer is unchanged.
   */
  selected?: boolean;
  /**
   * The row hosts a WIDE inline control (a multi-segment picker) rather than a small
   * affordance, so the row hands some of its own chrome back to it — but only chrome on the
   * TRAILING side. Opt-in; every other row keeps the standard insets.
   *
   * Why it exists: at 402pt the appearance row could not fit icon + label + a
   * 3-segment picker once a non-English bundle shipped (French `Sombre` clipped to
   * `So...`, and widening the picker alone pushed the row's own label into a mid-word
   * wrap). The ~12pt this frees is what makes both fit. (Story 20.4.)
   *
   * ⚠️ It must NOT touch the leading inset or the icon→label gap. Those two define the
   * grouped list's LEFT ALIGNMENT RAIL — the icon edge (16) and the label edge (16+20+14=50)
   * that every sibling row and the divider insets are drawn against. The first cut of this
   * prop reclaimed its 16pt symmetrically (`paddingHorizontal: 12`, `gap: 10`), which pulled
   * this one row's icon 4pt and its label 8pt left of the five rows below it in the same
   * group while the hairline stayed at its fixed inset — a visibly ragged left edge, in the
   * one place iOS's own convention is strict alignment. The reclaim is trailing-side only,
   * and the icon's compensating margin keeps the label rail byte-identical to a standard row.
   * (Story 20.4 Step G.)
   */
  wideTrailing?: boolean;
  /** Destructive styling — label + inline icon use the OS destructive color. */
  destructive?: boolean;
  /** Accessibility label for a pressable row (defaults to `label`). */
  accessibilityLabel?: string;
  /** Accessibility hint for a pressable row (e.g. "Opens in your browser"). */
  accessibilityHint?: string;
  testID?: string;
  /** Internal — set by SettingsGroup to draw the between-rows hairline. */
  showDivider?: boolean;
  style?: StyleProp<ViewStyle>;
}

function isTrailingToken(value: SettingsRowTrailing): value is TrailingToken {
  return typeof value === 'string' && (TRAILING_TOKENS as readonly string[]).includes(value);
}

export function SettingsRow({
  icon,
  iconVariant = 'inline',
  label,
  description,
  trailing,
  value,
  onValueChange,
  trailingTestID,
  onPress,
  disabled = false,
  selected,
  wideTrailing = false,
  destructive = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  showDivider = false,
  style,
}: SettingsRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();

  // Destructive glyph color for the inline icon's `color` prop (a non-style prop —
  // allowed inline). The label uses the factory `destructiveText` variant. PlatformColor
  // on native; brand accent on web/Electron (no PlatformColor, hex-free).
  // PlatformColor must be evaluated LAZILY per platform — `Platform.select({ ios:
  // PlatformColor(...) })` builds the object literal eagerly, so the iOS/Android
  // branches run on web too, where react-native-web has no `PlatformColor` → boot
  // crash. A `Platform.OS` ternary only evaluates the taken branch. (Story 23.12.)
  const destructiveColor: ColorValue =
    Platform.OS === 'ios'
      ? PlatformColor('systemRed')
      : Platform.OS === 'android'
        ? PlatformColor('@android:color/holo_red_dark')
        : colors.accent.primary;

  const renderTrailing = (): ReactNode => {
    if (trailing == null) return null;
    if (isTrailingToken(trailing)) {
      switch (trailing) {
        case 'switch':
          return (
            <Switch
              value={!!value}
              onValueChange={onValueChange ?? (() => {})}
              disabled={disabled}
              testID={trailingTestID}
            />
          );
        case 'spinner':
          return (
            <ActivityIndicator size="small" color={colors.accent.primary} testID={trailingTestID} />
          );
        case 'chevron':
          return <Icon name="chevron-forward" size={18} color={colors.text.tertiary} />;
        case 'external':
          return <Icon name="open-outline" size={18} color={colors.text.tertiary} />;
      }
    }
    // A plain string that isn't a token → value text; otherwise an arbitrary ReactNode.
    if (typeof trailing === 'string') {
      return <Text style={styles.valueText}>{trailing}</Text>;
    }
    return trailing;
  };

  const glyphColor = destructive ? destructiveColor : colors.text.primary;

  const content = (
    <View style={[styles.rowBody, wideTrailing && styles.rowBodyWide]}>
      {icon != null &&
        (iconVariant === 'badge' ? (
          <View style={[styles.badge, wideTrailing && styles.badgeWide]}>
            <Icon name={icon} size={20} color={colors.accent.soft} />
          </View>
        ) : (
          <Icon
            name={icon}
            size={20}
            color={glyphColor}
            style={[styles.inlineIcon, wideTrailing && styles.inlineIconWide]}
          />
        ))}
      <View style={styles.textBlock}>
        <Text style={[styles.label, destructive && styles.destructiveText]}>{label}</Text>
        {description != null && <Text style={styles.description}>{description}</Text>}
      </View>
      {renderTrailing()}
    </View>
  );

  const divider = showDivider ? (
    <View style={[styles.divider, icon != null && styles.dividerInsetIcon]} />
  ) : null;

  // testID + accessibility live on the interactive element itself (the Pressable) so
  // consumers can `getByTestId(...)` then assert role/label/state AND fireEvent.press it.
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [disabled && styles.disabled, pressed && styles.pressed, style]}
        accessibilityRole={trailing === 'external' ? 'link' : 'button'}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled, selected }}
      >
        {divider}
        {content}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={[disabled && styles.disabled, style]}>
      {divider}
      {content}
    </View>
  );
}

const useStyles = () =>
  useThemedStyles((t) => ({
    rowBody: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      minHeight: 56,
      paddingVertical: 15,
      paddingHorizontal: 16,
    },
    // See `wideTrailing` — reclaims ~12pt of row chrome for a wide inline control, all of it from
    // the TRAILING side. `paddingLeft` stays at `rowBody`'s 16 (the group's alignment rail); the
    // narrowed `gap` is the label→control gap, and `*IconWide`'s `marginRight` adds the 8pt back on
    // the icon→label side so the label rail stays 16 + 20 + 14 = 50, identical to a standard row.
    rowBodyWide: {
      gap: 6,
      paddingRight: 12,
    },
    badge: {
      width: 34,
      height: 34,
      borderRadius: RADII.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.accent.faint,
    },
    inlineIcon: {
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // `wideTrailing` narrows the row's uniform `gap` to 6 for the label→control side; these add the
    // 8pt back on the icon→label side so the label starts at the same x as every other row's.
    inlineIconWide: {
      marginRight: 8,
    },
    badgeWide: {
      marginRight: 8,
    },
    textBlock: {
      flex: 1,
    },
    label: {
      fontSize: FONT_SIZE.h3,
      fontWeight: FONT_WEIGHT.semibold,
      lineHeight: FONT_SIZE.h3 * LINE_HEIGHT.heading3,
      color: t.colors.text.primary,
    },
    description: {
      marginTop: 2,
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.regular,
      lineHeight: FONT_SIZE.bodySmall * LINE_HEIGHT.body,
      color: t.colors.text.secondary,
    },
    valueText: {
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.medium,
      color: t.colors.text.secondary,
    },
    // Destructive uses the OS destructive color, never a literal hex / the dropped
    // semantic.error token (color-group restructure is story 23.5). Web/Electron have no
    // PlatformColor → fall back to the brand accent (a neutral, hex-free choice).
    destructiveText: {
      // Lazy per-platform (see destructiveColor above) — eager `Platform.select`
      // would crash web, which lacks `PlatformColor`. (Story 23.12.)
      color:
        Platform.OS === 'ios'
          ? PlatformColor('systemRed')
          : Platform.OS === 'android'
            ? PlatformColor('@android:color/holo_red_dark')
            : t.colors.accent.primary,
    },
    disabled: {
      opacity: 0.5,
    },
    pressed: {
      opacity: 0.7,
    },
    divider: {
      height: 1,
      marginLeft: 16,
      backgroundColor: t.colors.separator,
    },
    dividerInsetIcon: {
      marginLeft: 64,
    },
  }));
