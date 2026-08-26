/**
 * Host — bridging container for @expo/ui Universal primitives.
 *
 * Re-exported from the `@expo/ui` root so app/feature code never imports
 * `@expo/ui` directly (Story 17.3 AC 3). On iOS, hosts SwiftUI views; on
 * Android, hosts Jetpack Compose views; on web, renders a plain `View`
 * (web-safe).
 *
 * Wrapped primitives in this folder (Switch, Slider, …) self-host — you
 * only need to import `Host` directly when composing Universal primitives
 * inline in a screen.
 *
 * Source: STACK-CHEAT-SHEET.md § "Expo UI — wrapper layer + native chrome".
 */

import { Host as ExpoHost, type UniversalHostProps } from '@expo/ui';

export type HostProps = UniversalHostProps;

export function Host(props: HostProps) {
  return <ExpoHost {...props} />;
}
