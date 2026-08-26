/**
 * CompactModeToggle - Single cycling button for AudioPlayer mode switching
 *
 * Tapping cycles: synced → listen → read → synced
 * Shows the current mode's icon on an accent-filled circle.
 */

import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { HEADER_ACTION_BUTTON_SIZE } from '@/constants/navigation';
import { type ThemeContextValue, useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Icon } from './Icon';
import type { IconName } from './icon-registry';

/** Playback mode for the audio player: synced highlighting, audio-only listen, or text-only read */
export type PlaybackMode = 'synced' | 'listen' | 'read';

/** Icon size — the centralized header-action token */
const ICON_SIZE = 24;

interface ModeOption {
  id: PlaybackMode;
  icon: IconName;
}

// Labels are a11y-only (the button shows just the mode icon) and live in
// `a11y.json` under `mode.{id}` — resolved at render via `t()` (the mode id ⇒ key
// is compile-checked as a template-literal union). See Story 20.2.
const MODE_CYCLE: ModeOption[] = [
  { id: 'synced', icon: 'sync' },
  { id: 'listen', icon: 'headset' },
  { id: 'read', icon: 'book' },
];

export interface CompactModeToggleProps {
  /** Currently selected mode */
  mode: PlaybackMode;
  /** Called when user selects a new mode */
  onModeChange: (mode: PlaybackMode) => void;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Test ID prefix */
  testID?: string;
}

export function CompactModeToggle({
  mode,
  onModeChange,
  disabled = false,
  testID,
}: CompactModeToggleProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();

  const currentIndex = MODE_CYCLE.findIndex((o) => o.id === mode);
  const current = MODE_CYCLE[currentIndex >= 0 ? currentIndex : 0];
  const nextMode = MODE_CYCLE[(currentIndex + 1) % MODE_CYCLE.length];

  return (
    <Pressable
      onPress={() => !disabled && onModeChange(nextMode.id)}
      disabled={disabled}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={t('a11y:switchMode', {
        current: t(`a11y:mode.${current.id}`),
        next: t(`a11y:mode.${nextMode.id}`),
      })}
      accessibilityState={{ disabled }}
      testID={testID}
    >
      {/* `color` is a non-`style` prop with no StyleSheet home — the token belongs
          inline here (cheat-sheet § lint:style). `text.onAccent` on `accent.primary`
          is gated ≥ AA-large for every palette × scheme by
          `constants/palettes.contrast.test.ts`, so a new palette can't ship an
          unreadable glyph on the accent fill. */}
      <Icon name={current.icon} size={ICON_SIZE} color={colors.text.onAccent} />
    </Pressable>
  );
}

const useStyles = () =>
  useThemedStyles((t: ThemeContextValue) => ({
    // Story 26.14: the accent fill is a DELIBERATE, documented exception to the
    // 23.13 "native header glyphs are neutral chrome" rule. This button sits in the
    // player route's native `headerRight`, so "it's off the header" is NOT the
    // justification — the justification is that it is the player's primary STATE
    // control (it selects the active mode and displays which one is active), which
    // 23.13 explicitly carves out. Its neighbour, the `⋯` overflow, stays neutral:
    // 23.13 governs undifferentiated chrome glyphs, and an accented stateful selector
    // beside a neutral overflow is exactly the distinction the accent is buying.
    button: {
      width: HEADER_ACTION_BUTTON_SIZE,
      height: HEADER_ACTION_BUTTON_SIZE,
      borderRadius: HEADER_ACTION_BUTTON_SIZE / 2,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: t.colors.accent.primary,
    },
    disabled: {
      opacity: 0.5,
    },
    pressed: {
      opacity: 0.7,
    },
  }));
