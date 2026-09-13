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
import { isRTL } from '@/lib/rtl';
import { IconFrame, type IconProps } from './IconBase';
import { ICON_REGISTRY, mirrorIcon } from './icon-registry';

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
  /**
   * ⚠️ iOS MIRRORS HERE TOO, AND IT DID NOT UNTIL 2026-09-13. This file used to read the registry
   * directly, because the four navigational `sf` names were Apple's direction-aware ones and were
   * expected to mirror themselves from `semanticContentAttribute`. Measured in the Arabic build on
   * the owner's iPhone: they do NOT inside `expo-symbols`' `SymbolView` — the settings chevrons had
   * moved to the leading edge and still pointed right, and the index's back chevron pointed left
   * while sitting on the right. The registry's names are absolute now and the swap is explicit and
   * identical on every platform. See `RTL_MIRRORED_ICONS`.
   */
  const entry = ICON_REGISTRY[mirrorIcon(name, isRTL())];
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
