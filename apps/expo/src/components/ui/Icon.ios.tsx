/**
 * Icon (iOS) — SF Symbols via `expo-symbols` `<SymbolView>`.
 *
 * Story 17.4.2 Thread E: native SF Symbols on iOS, resolved from the semantic name through
 * `ICON_REGISTRY.sf`. Story 28.2 split the renderer per platform — Android + Web moved to
 * Ionicons (`Icon.tsx`) for genuine filled/outline glyphs; iOS keeps SF Symbols here for the
 * native Apple look. `expo-symbols` stays an iOS-only dependency.
 *
 * Imports the registry + theme/constants directly (NEVER the own-folder barrel `@/components/ui`
 * — that is a Metro self-cycle; see STACK-CHEAT-SHEET § Don't / RN).
 */
import { SymbolView } from 'expo-symbols';
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
  weight = 'medium',
  accessibilityLabel,
  accessibilityElementsHidden,
  testID,
}: IconProps) {
  const entry = ICON_REGISTRY[name];
  // Defensive: a name absent from the registry (only reachable if the typed union is widened /
  // a value is `as IconName`-cast) renders the fallback instead of crashing on `entry.sf`.
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
      <SymbolView
        name={entry.sf}
        size={size}
        weight={weight}
        tintColor={tintColor ?? color}
        fallback={fallback}
      />
    </IconFrame>
  );
}
