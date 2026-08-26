/**
 * KeyboardDismissView — tap empty space to dismiss the on-screen keyboard.
 *
 * Story 23.12. Wraps its children; a still tap that lands on EMPTY space (not on
 * a child Pressable / row / chip, and not a scroll drag) dismisses the keyboard
 * via `react-native-keyboard-controller`'s `KeyboardController.dismiss()` — the
 * app's one adopted keyboard lib (`<KeyboardProvider>` at the root). It is the
 * canonical tap-to-dismiss primitive: the lib ships avoid (`KeyboardAwareScrollView`)
 * but no tap-empty-space component.
 *
 * - **Non-tap-swallowing.** The outer `Pressable` only wins the responder
 *   negotiation when no child consumes the touch, and a scroll drag cancels the
 *   press — so FlashList/ScrollView scroll and child row/chip taps keep working.
 *   Pair inner lists with `keyboardShouldPersistTaps="handled"` so a first tap on
 *   a row registers instead of only dismissing the keyboard.
 * - **Web no-op.** There is no on-screen keyboard on web, so it renders a plain
 *   flex container (passthrough) — no Pressable, no dismiss.
 *
 * @example
 * <KeyboardDismissView>
 *   <FlashList ... keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" />
 * </KeyboardDismissView>
 */

import type { ReactNode } from 'react';
import { useCallback } from 'react';
import {
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';

export interface KeyboardDismissViewProps {
  /** Content to render inside the dismiss surface. */
  children: ReactNode;
  /** Extra style merged onto the flex container. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function KeyboardDismissView({ children, style, testID }: KeyboardDismissViewProps) {
  const handleDismiss = useCallback(() => {
    KeyboardController.dismiss();
  }, []);

  // Web has no on-screen keyboard — render a passthrough container.
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.fill, style]} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      onPress={handleDismiss}
      // Not an a11y element itself: it must not intercept VoiceOver focus or be
      // announced as a button — child rows/chips own their own accessibility.
      accessible={false}
      style={[styles.fill, style]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
