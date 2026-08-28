/**
 * Appearance (story 6-5, reshaped 6-6) — the reading look and the Quran text size, and the only
 * UI in this app that writes the synced `preferences` entity's `theme` column.
 *
 * ── ⚠️ TWO INDEPENDENT AXES, AND NEITHER ONE FORCES THE OTHER ────────────────────────────────
 *
 * The theme model is `palette × scheme`, where `ColorScheme` is exactly `'light' | 'dark'`. This
 * screen exposes both axes, separately:
 *
 *   · a PALETTE picker over all six of `PALETTE_NAMES` — a swatch strip, device-local
 *   · an APPEARANCE control — System / Light / Dark, i.e. `ThemeMode`
 *
 * ⚠️ AN EARLIER CUT COUPLED THEM — four options over the two axes, with "Sepia" forcing
 * `themeMode: 'light'`. That does not generalise past two palettes. Every palette here ships a
 * real dark slice that the contrast gate holds to the same bar, so forcing a scheme from a colour
 * choice would make four of the six unreachable after dusk and would silently override a reader
 * who had already chosen Dark. Choosing a palette must never move the mode, and choosing a mode
 * must never move the palette; `appearance-screen.test.tsx` asserts both directions.
 *
 * ── ⚠️ THE MIRROR IS ONE-WAY, PARTIAL, AND DELIBERATELY BOTH ────────────────────────────────
 *
 * Rendering is device-local: `lib/theme.ts` reads MMKV and nothing else. The worker's
 * `preferences` row has a NOT-NULL `theme` column validated as exactly `'light' | 'sepia' |
 * 'dark'` (`apps/worker/src/lib/validate.ts`), so only the COARSE look travels — see `wireTheme`.
 * The palette does not sync at all, and does not need to: it is a per-device reading comfort
 * setting, and widening the column to carry six names would be a migration bought with nothing.
 *
 * There is no server → device apply effect. `auto` cannot be expressed on the wire (the column is
 * one of three literals), and a reconciliation loop here has real failure modes — write → drain →
 * invalidate → pull → re-apply, with a device that disagrees with itself in between. The mirror
 * sends the RESOLVED scheme, so the row says what the reader is actually looking at.
 *
 * ⚠️ AND IT ONLY WRITES WHEN THE WIRE VALUE ACTUALLY MOVES. Six palettes collapse onto three wire
 * values, so most palette taps (olive → linen, say) change nothing the server can hold. Writing
 * anyway would queue an outbox entry per tap for a preference the column cannot even express.
 *
 * ── ⚠️ THE SLIDER WRITES LIVE, AND THE MACHINERY THAT MAKES THAT SAFE ALREADY EXISTS ─────────
 *
 * `components/ui/Slider` deliberately exposes no `onSlidingComplete` (story 17.3's accepted
 * regression — the community wrapper does not bridge the native release event). Committing live
 * on `onValueChange` is therefore the design, not a workaround, and it is safe because of three
 * things that are already true: the cache apply in `applyLocal` is SYNCHRONOUS (the preview and
 * the reading rows re-render on the same tick), the outbox coalesces LWW per entity (one pending
 * entry however many steps a drag produces), and `DRAIN_DEBOUNCE_MS` restarts on every write, so
 * a whole drag session settles into ONE PUT.
 *
 * ⚠️ PLUS A SAME-VALUE GUARD, WHICH IS NOT REDUNDANT WITH THE DEBOUNCE. `step={2}` quantizes the
 * emitted value, but the slider still emits on every touch move — dragging one pixel back and
 * forth across a step boundary fires repeatedly with the SAME number. Without the guard each of
 * those is a cache write, a re-render of every verse row on the reading screen, an outbox
 * coalesce and a re-armed timer. The ref holds the last value we WROTE, not the last we saw.
 *
 * ⚠️ THE GUARD'S REF IS SEEDED FROM THE CACHED PREFERENCE, so the first drag of a session does
 * not re-write the value the reader already has.
 *
 * ── Shell ────────────────────────────────────────────────────────────────────────────────────
 *
 * No native header slot and no `Stack.Screen` toolbar: the `(profile)` layout mounts `AppHeader`
 * + `AppTabBar` around this whole group (story 6-6), and the title comes from that layout's
 * `TITLE_KEYS`. `lint:header-controls` forbids the native slots outright.
 */

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Icon, SegmentedControl, SettingsGroup, Slider } from '@/components/ui';
import {
  ARABIC_FONT_SIZE,
  ARABIC_LINE_HEIGHT,
  clampArabicFontSize,
  UTHMANI_FONT_FAMILY,
} from '@/constants/arabic';
import type { ColorScheme } from '@/constants/Colors';
import { BASMALA_TEXT } from '@/constants/mushaf';
import { PALETTE_NAMES, PALETTES, type PaletteName } from '@/constants/palettes';
import { RADII } from '@/constants/radii';
import { SPACING, screenContentStyle } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { haptics } from '@/lib/haptics';
import { patchPreferences, usePreferences } from '@/lib/sync';
import { type ThemeMode, useTheme } from '@/lib/theme';
import { useColorScheme } from '@/lib/useColorScheme';
import { useThemedStyles } from '@/lib/useThemedStyles';

/**
 * The appearance axis, in display order — the whole of `ThemeMode`, nothing projected.
 *
 * A table so the control, the selected-index derivation and the test read the SAME order; the
 * label for each comes from `profile:appearance.mode.<mode>`.
 */
export const APPEARANCE_MODES = ['auto', 'light', 'dark'] as const satisfies readonly ThemeMode[];

/** Slider granularity. See the `<Slider>` call for why it is not 1 and not continuous. */
export const FONT_SIZE_STEP = 2;

/** Swatch diameter, and the accent dot inside it. Touch area is widened by `hitSlop`. */
const SWATCH_SIZE = 32;
const SWATCH_DOT_SIZE = 18;

/**
 * What the synced row should say, given the palette and the scheme it resolved to.
 *
 * ⚠️ SIX PALETTES COLLAPSE ONTO THREE WIRE VALUES, AND THE COLUMN IS NOT WIDENED FOR THEM. The
 * worker validates `theme` as exactly `['light','sepia','dark']`; `'sepia'` is the one palette
 * with a wire name of its own, and every other palette reports the plain resolved scheme. So a
 * second device learns whether this reader is on parchment, on light or on dark — the coarse
 * reading look — and the exact colour identity stays where it is chosen, on the device.
 *
 * `'auto'` is never a return value: the caller resolves the mode first, so the row records what
 * the reader saw rather than a mode name the server has no column for.
 */
export function wireTheme(
  palette: PaletteName,
  resolvedScheme: ColorScheme
): 'light' | 'sepia' | 'dark' {
  return palette === 'sepia' ? 'sepia' : resolvedScheme;
}

export default function AppearanceScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors, palette, themeMode, colorScheme, setPalette, setThemeMode } = useTheme();
  const accentColor = colors.accent.primary;
  const { data: preferences } = usePreferences();

  // ⚠️ THE DEVICE'S OWN SCHEME, NOT THE RESOLVED ONE. `colorScheme` is what the CURRENT mode
  // resolves to, so it cannot answer "what would System show?" while the reader is on an explicit
  // Light or Dark. Picking System from Dark has to mirror the device's scheme, not the one being
  // left behind.
  const systemScheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  const storedSize = clampArabicFontSize(preferences?.fontSize);
  // ⚠️ LOCAL STATE FOR THE SLIDER'S OWN POSITION, seeded from the cache — NOT a `useState` of a
  // query result that then stops tracking it. The cached value is still the source of truth for
  // the reading screen; this only keeps the thumb from snapping back between a write and the
  // cache round-trip on platforms where the native slider is uncontrolled.
  const [size, setSize] = useState(storedSize);
  const lastWritten = useRef(storedSize);

  /** Mirror the coarse look, but only when the value the column can hold actually changed. */
  const mirror = (nextPalette: PaletteName, nextScheme: ColorScheme) => {
    const next = wireTheme(nextPalette, nextScheme);
    if (next === wireTheme(palette, colorScheme)) return;
    patchPreferences({ theme: next });
  };

  const choosePalette = (name: PaletteName) => {
    setPalette(name);
    // The scheme is untouched by a palette choice — that is the whole point of the two axes.
    mirror(name, colorScheme);
    haptics.selection();
  };

  const chooseMode = (index: number) => {
    const mode = APPEARANCE_MODES[index];
    if (!mode) return;
    setThemeMode(mode);
    mirror(palette, mode === 'auto' ? systemScheme : mode);
    haptics.selection();
  };

  const changeSize = (next: number) => {
    // The slider's `step` quantizes, but a drag still emits repeatedly at the same step. Round
    // defensively anyway: `patchPreferences` feeds the worker's `intIn(fontSize, 20, 44)`, which
    // rejects a fraction outright, and `clampArabicFontSize` clamps without rounding.
    const quantized = clampArabicFontSize(Math.round(next));
    setSize(quantized);
    if (quantized === lastWritten.current) return;
    lastWritten.current = quantized;
    patchPreferences({ fontSize: quantized });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic"
      testID="appearance-screen"
    >
      <SettingsGroup
        label={t('profile:appearance.paletteGroup')}
        footnote={t('profile:appearance.paletteFootnote')}
        testID="reading-palette-section"
      >
        <View style={styles.controlRow} accessibilityLabel={t('profile:a11y.readingTheme')}>
          <View style={styles.strip}>
            {PALETTE_NAMES.map((name) => {
              // ⚠️ PREVIEW COLOURS COME FROM THE PALETTE'S OWN SLICE, in the CURRENT scheme —
              // never from `useTheme().colors`, which would paint all six swatches identically
              // in the active palette. A `slice.*` reference is also what keeps `lint:style`
              // Scan 3 out of an inline style prop that legitimately holds colour.
              const slice = PALETTES[name][colorScheme];
              const selected = name === palette;
              return (
                <Pressable
                  key={name}
                  testID={`palette-swatch-${name}`}
                  onPress={() => choosePalette(name)}
                  accessibilityRole="button"
                  accessibilityLabel={t(`profile:palette.${name}`)}
                  accessibilityState={{ selected }}
                  hitSlop={SPACING.sm}
                  style={[
                    styles.swatch,
                    { backgroundColor: slice.background.secondary, borderColor: slice.border },
                    selected && styles.swatchSelected,
                  ]}
                >
                  <View style={[styles.dot, { backgroundColor: slice.accent.primary }]} />
                  {selected && (
                    <View style={styles.check}>
                      <Icon name="checkmark" size={14} color={slice.text.onAccent} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
          {/* The swatches are the control; this names the one in force, so "High contrast" is
              findable by a reader who needs it rather than only by whoever recognises the hue. */}
          <Text style={styles.paletteName} testID="palette-name">
            {t(`profile:palette.${palette}`)}
          </Text>
        </View>
      </SettingsGroup>

      <SettingsGroup
        label={t('profile:appearance.modeGroup')}
        footnote={t('profile:appearance.modeFootnote')}
        testID="appearance-mode-section"
      >
        <View style={styles.controlRow} accessibilityLabel={t('profile:a11y.appearance')}>
          <SegmentedControl
            values={APPEARANCE_MODES.map((mode) => t(`profile:appearance.mode.${mode}`))}
            selectedIndex={APPEARANCE_MODES.indexOf(themeMode)}
            onChange={({ nativeEvent }) => chooseMode(nativeEvent.selectedSegmentIndex)}
            testID="appearance-segment"
          />
        </View>
      </SettingsGroup>

      <SettingsGroup
        label={t('profile:appearance.fontSizeGroup')}
        footnote={t('profile:appearance.fontSizeFootnote')}
        testID="font-size-section"
      >
        <View style={styles.controlRow} accessibilityLabel={t('profile:a11y.fontSize')}>
          <View style={styles.sizeHeader}>
            <Text style={styles.sizeLabel}>{t('profile:appearance.fontSizeLabel')}</Text>
            {/* The number itself is data, not copy. */}
            <Text style={styles.sizeValue} testID="font-size-value">
              {size}
            </Text>
          </View>
          {/* ⚠️ `step={2}` IS THE WHOLE INTEGER STORY. The worker's `intIn(fontSize, 20, 44)`
              rejects a fraction outright and `clampArabicFontSize` does not round, so a
              continuous slider would queue a body the drain could only 422-and-drop. Two points
              is also the smallest step a reader can actually see at this scale. */}
          <Slider
            minimumValue={ARABIC_FONT_SIZE.min}
            maximumValue={ARABIC_FONT_SIZE.max}
            step={FONT_SIZE_STEP}
            value={size}
            onValueChange={changeSize}
            minimumTrackTintColor={accentColor}
            thumbTintColor={accentColor}
            testID="font-size-slider"
          />
          {/* ⚠️ THE PREVIEW IS THE SAME FACE AND THE SAME RATIO THE VERSE ROWS USE, so what the
              reader sizes here is what they get. RTL is set locally (`writingDirection` +
              `textAlign`) rather than by flipping the app — the same choice `VerseRow` makes. */}
          <Text
            style={[styles.preview, { fontSize: size, lineHeight: size * ARABIC_LINE_HEIGHT }]}
            testID="font-size-preview"
          >
            {BASMALA_TEXT}
          </Text>
        </View>
      </SettingsGroup>
    </ScrollView>
  );
}

const useStyles = () =>
  useThemedStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: t.colors.background.primary,
    },
    scrollContent: {
      ...screenContentStyle('content'),
      padding: SPACING.xl,
      gap: SPACING.xl,
    },
    controlRow: {
      padding: SPACING.md,
      gap: SPACING.md,
    },
    // Six swatches on one row at any phone width; wrapping is the fallback, not the layout.
    strip: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      gap: SPACING.sm,
    },
    swatch: {
      width: SWATCH_SIZE,
      height: SWATCH_SIZE,
      borderRadius: RADII.pill,
      borderWidth: 2,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    // Selected: the LIVE theme accent ring (the inline base borderColor is the palette's own
    // border; this variant wins via style-array precedence when selected).
    swatchSelected: {
      borderColor: t.colors.accent.primary,
    },
    dot: {
      width: SWATCH_DOT_SIZE,
      height: SWATCH_DOT_SIZE,
      borderRadius: RADII.pill,
    },
    check: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    paletteName: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.semibold,
      color: t.colors.text.secondary,
    },
    sizeHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
    },
    sizeLabel: {
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.regular,
      color: t.colors.text.primary,
    },
    sizeValue: {
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.semibold,
      color: t.colors.text.secondary,
    },
    preview: {
      fontFamily: UTHMANI_FONT_FAMILY,
      color: t.colors.text.primary,
      writingDirection: 'rtl' as const,
      textAlign: 'right' as const,
    },
  }));
