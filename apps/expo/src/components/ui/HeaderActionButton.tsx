/**
 * HeaderActionButton — the ONE header action button for every native Stack
 * header (Discover search, book-detail, collection, the player overflow, the
 * filters route). Single source of truth for the box size, icon size, touch
 * target, and press feedback so every screen's header actions are identical.
 *
 * Special-case header actions that aren't a plain icon+press keep their own
 * components but share `HEADER_ACTION_BUTTON_SIZE` (e.g. the player's
 * CompactModeToggle). The back chevron stays boxless to mirror the native
 * back button.
 */

import type { ColorValue } from 'react-native';
import { Pressable, StyleSheet } from 'react-native';
import { HEADER_ACTION_BUTTON_SIZE, HEADER_ACTION_ICON_SIZE } from '@/constants/navigation';
import { Icon } from './Icon';
import type { IconName } from './icon-registry';

export interface HeaderActionButtonProps {
  /** Semantic icon name. */
  name: IconName;
  onPress: () => void;
  /** Glyph color (defaults handled by the caller's theme). */
  color?: ColorValue;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
}

export function HeaderActionButton({
  name,
  onPress,
  color,
  disabled = false,
  accessibilityLabel,
  testID,
}: HeaderActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      // 32pt box + hitSlop 6 = the 44pt HIG touch target.
      hitSlop={6}
      style={({ pressed }) => [styles.button, pressed && !disabled && styles.pressed]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
    >
      <Icon name={name} size={HEADER_ACTION_ICON_SIZE} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: HEADER_ACTION_BUTTON_SIZE,
    height: HEADER_ACTION_BUTTON_SIZE,
    borderRadius: HEADER_ACTION_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
