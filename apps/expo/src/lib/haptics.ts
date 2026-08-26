/**
 * haptics — tiny notification-haptic helper.
 *
 * Story 17.13: extracted from the deleted `ToastContext` so success actions that
 * already reflect their result in the reactive UI keep their tactile confirmation
 * without a visual toast banner. No-op on web (no haptics engine); fire-and-forget
 * (never await — haptics must not gate the UI).
 *
 * @example
 * import { haptics } from '@/lib/haptics';
 * haptics.success();         // collection renamed, note saved, profile updated…
 * haptics.selection();       // picker tick, segmented choice, preset tap
 * haptics.impact('light');   // long-press preview, standardized delete completion
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

function notify(type: Haptics.NotificationFeedbackType) {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(type);
}

/** String tier → the expo-haptics enum (keeps call sites off `expo-haptics`). */
const IMPACT_STYLE = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
} as const;

/** Tunable impact-tap intensity. */
export type ImpactStyle = keyof typeof IMPACT_STYLE;

export const haptics = {
  /** Success action whose result is already visible in the UI. */
  success: () => notify(Haptics.NotificationFeedbackType.Success),
  /** Warning / non-blocking advisory. */
  warning: () => notify(Haptics.NotificationFeedbackType.Warning),
  /** Error feedback (pair with an inline error message or Alert). */
  error: () => notify(Haptics.NotificationFeedbackType.Error),
  /**
   * Light SELECTION tick — for picker scroll/settle, segmented choice, preset
   * tap. Distinct from the success/warning/error notification haptics (Story
   * 19.5). Web no-op; fire-and-forget (never await).
   */
  selection: () => {
    if (Platform.OS === 'web') return;
    void Haptics.selectionAsync();
  },
  /**
   * Physical IMPACT tap (Story 23.13) — a card long-press preview, a
   * standardized delete/remove completion. The tunable tier the central module
   * gained so nothing calls `expo-haptics` directly. Web no-op; fire-and-forget.
   *
   * @param style 'light' (default) | 'medium' | 'heavy'
   */
  impact: (style: ImpactStyle = 'light') => {
    if (Platform.OS === 'web') return;
    void Haptics.impactAsync(IMPACT_STYLE[style]);
  },
};
