/**
 * Switch — wrapped Universal `@expo/ui` Switch.
 *
 * iOS: SwiftUI `Toggle`. Android: Jetpack Compose `Switch`. Web: RN `Switch`
 * (web-safe fallback — `react-native-web`).
 *
 * Self-hosts via `<Host matchContents>` so it can drop into any layout
 * without the consumer having to provide a Host (Story 17.3 AC 4).
 *
 * **Known regression (Story 17.3, accepted)** — Universal `@expo/ui` Switch
 * does NOT expose tint/track-color props on any platform:
 *   - Web fallback (RN `Switch`) does not forward color from `@expo/ui`.
 *   - iOS/Android tinting is only reachable via raw `@expo/ui/swift-ui` /
 *     `@expo/ui/jetpack-compose` modifiers — barred by the web-safe wrapper
 *     rule (Story 17.3 scope decision 3).
 * Result: switches render with the platform-default toggle color (iOS green
 * / Android M3 primary / web RN default), NOT the app's terracotta accent.
 * Revisit trigger: `@expo/ui` exposes a tint prop on the Universal Switch
 * AND its web fallback forwards it.
 *
 * Source: STACK-CHEAT-SHEET.md § "Expo UI — wrapper layer + native chrome".
 */

import { Switch as ExpoSwitch, type SwitchProps as ExpoSwitchProps } from '@expo/ui';
import { Host } from './Host';

export type SwitchProps = ExpoSwitchProps;

export function Switch(props: SwitchProps) {
  return (
    <Host matchContents>
      <ExpoSwitch {...props} />
    </Host>
  );
}
