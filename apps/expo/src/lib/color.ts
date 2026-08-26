/**
 * Color helpers — pure logic, no UI / theme / upward imports (lib is the lowest
 * shared layer; see STACK-CHEAT-SHEET § Layer separation).
 */

/**
 * Apply an alpha channel to a `#rrggbb` / `#rgb` hex color, returning an
 * `rgba(r, g, b, alpha)` string. Promoted from `GlassBackdrop.applyAlpha`
 * (Story 23.5; originally Story 17.4 §B). BOTH fallbacks are preserved verbatim:
 *
 *   - a non-string input → `'transparent'`. A missing theme token resolves to
 *     `undefined` despite the `string` type, and an unguarded `.startsWith` would
 *     throw and crash the render (the L2 crash-guard).
 *   - any other non-`#rgb`/`#rrggbb` string (already-`rgba(...)`, a named color,
 *     a malformed-length hex) → returned unchanged.
 *
 * The returned `rgba(${r}, …)` is a runtime builder, not a literal, so the
 * `lint:style` color scan (which requires a digit after `(`) correctly ignores it.
 *
 * @param hexColor a `#rgb` or `#rrggbb` hex string (or a theme token resolving to one)
 * @param alpha    opacity fraction in the range 0–1
 */
export function withAlpha(hexColor: string, alpha: number): string {
  // Guard a runtime theme-key miss (typed `string`, but a missing token resolves
  // to `undefined` → `.startsWith` would throw and crash the render).
  if (typeof hexColor !== 'string') return 'transparent';
  if (hexColor.startsWith('#') && (hexColor.length === 7 || hexColor.length === 4)) {
    const full =
      hexColor.length === 4
        ? `#${hexColor[1]}${hexColor[1]}${hexColor[2]}${hexColor[2]}${hexColor[3]}${hexColor[3]}`
        : hexColor;
    const r = parseInt(full.slice(1, 3), 16);
    const g = parseInt(full.slice(3, 5), 16);
    const b = parseInt(full.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hexColor;
}

/** Parse a `#rgb` / `#rrggbb` hex string to its 0–255 channels, or `null` if it
 * isn't a well-formed hex (an `rgba(...)`/named color/malformed length → null). */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return null;
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  // Strict: EXACTLY six hex digits. `parseInt(_, 16)` partial-parses ('1g'→1, '-1'→-1,
  // ' 4'→4), so a length-only check would silently admit malformed hex like '#1g3456' /
  // '#-12345' as bogus (even negative) channels. The regex closes that — and makes the
  // per-channel parses unconditionally valid 0–255, so no NaN guard is needed after it.
  if (!/^#[0-9a-fA-F]{6}$/.test(full)) return null;
  const r = parseInt(full.slice(1, 3), 16);
  const g = parseInt(full.slice(3, 5), 16);
  const b = parseInt(full.slice(5, 7), 16);
  return { r, g, b };
}

/** WCAG 2.1 relative luminance (0 = black, 1 = white) of an sRGB color. */
function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * WCAG contrast ratio between two `#rgb`/`#rrggbb` colors — `(L_light + 0.05) /
 * (L_dark + 0.05)`, ranging 1 (identical) → 21 (black on white). Order-independent.
 * An unparseable input (rgba token, named color) returns the neutral `1` rather than
 * throwing — the palette contrast gate only ever feeds it the hex `background`/`text`/
 * `accent` tokens, so a `1` would surface a bad call site as an obvious gate failure.
 */
export function contrastRatio(fg: string, bg: string): number {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!f || !b) return 1;
  const lf = relativeLuminance(f);
  const lb = relativeLuminance(b);
  const lighter = Math.max(lf, lb);
  const darker = Math.min(lf, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** True when `fg` on `bg` meets a minimum WCAG contrast ratio (e.g. 4.5 = AA body text). */
export function meetsContrast(fg: string, bg: string, min: number): boolean {
  return contrastRatio(fg, bg) >= min;
}
