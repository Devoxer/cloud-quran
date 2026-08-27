/**
 * HeaderActionButton — the ONE header action button, for OUR OWN header (story 6-6: there is no
 * native stack header anywhere any more; `AppHeader`'s back control and its `leading` /
 * `trailing` slots are where these render). Single source of truth for the box size, icon size,
 * touch target, and press feedback so every header action is identical.
 *
 * Special-case header actions that aren't a plain icon+press keep their own
 * components but share `HEADER_ACTION_BUTTON_SIZE`.
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
  /**
   * Web keyboard reachability. `false` renders `tabIndex={-1}` under react-native-web and is a
   * no-op on native. Chrome that is hidden passes `false` — see `ReadingChrome`'s third-tree note.
   */
  focusable?: boolean;
}

export function HeaderActionButton({
  name,
  onPress,
  color,
  disabled = false,
  accessibilityLabel,
  testID,
  focusable = true,
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
      focusable={focusable}
      tabIndex={focusable ? 0 : -1}
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
