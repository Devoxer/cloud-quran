/**
 * Icon (Android + Web) — Ionicons via `@expo/vector-icons`.
 *
 * Story 28.2 (follow-up): the non-iOS renderer moved off `expo-symbols`' Material Symbols to
 * Ionicons. Material Symbols encode fill as a font AXIS that expo-symbols' bundled outline-only
 * font can't expose on Android/web, so "filled" glyphs (favorited heart, saved bookmark, …)
 * rendered as outlines. Ionicons ships DISTINCT filled + outline glyphs, so the fill state is
 * honored on both platforms. iOS keeps SF Symbols (`Icon.ios.tsx`); the name resolves through
 * `ICON_REGISTRY.ion` (87/98 keys ARE the Ionicons name; the rest carry an explicit `ion`).
 *
 * Imports the registry directly (NEVER the own-folder barrel `@/components/ui` — Metro self-cycle;
 * see STACK-CHEAT-SHEET § Don't / RN).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { IconFrame, type IconProps } from './IconBase';
import { ICON_REGISTRY } from './icon-registry';

export type { IconProps };

export function Icon({
  name,
  size = 24,
  color,
  tintColor,
  fallback,
  style,
  accessibilityLabel,
  accessibilityElementsHidden,
  testID,
}: IconProps) {
  const entry = ICON_REGISTRY[name];
  // Defensive: a name absent from the registry renders the fallback instead of crashing.
  if (!entry) {
    return <>{fallback ?? null}</>;
  }
  return (
    <IconFrame
      style={style}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={accessibilityElementsHidden}
    >
      <Ionicons name={entry.ion} size={size} color={tintColor ?? color} />
    </IconFrame>
  );
}
