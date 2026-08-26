/**
 * PlayButton - Reusable play/pause button with loading and error states
 *
 * Story 5.2: Implement Basic Audio Playback
 * Epic 5: Core Summary Playback
 *
 * Displays a circular button that shows:
 * - Play icon in default state
 * - Pause icon when playing
 * - Loading indicator when loading
 * - Error icon with retry functionality
 *
 * @example
 * <PlayButton
 *   onPress={handlePlay}
 *   isLoading={isLoading}
 *   error={error}
 *   onRetry={handleRetry}
 * />
 */

import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable } from 'react-native';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Icon } from './Icon';

/**
 * Size configurations for PlayButton
 */
const SIZES = {
  sm: 32,
  md: 40,
  lg: 48,
} as const;

export type PlayButtonSize = keyof typeof SIZES;

/**
 * Props for PlayButton component
 */
export interface PlayButtonProps {
  /** Called when button is pressed (play or pause) */
  onPress: () => void;
  /** Whether audio is currently loading */
  isLoading?: boolean;
  /** Whether audio is currently playing */
  isPlaying?: boolean;
  /** Error message (shows error state with retry) */
  error?: string | null;
  /** Called when retrying after error */
  onRetry?: () => void;
  /** Button size */
  size?: PlayButtonSize;
  /** Whether button is disabled */
  disabled?: boolean;
  /** Test ID for testing */
  testID?: string;
}

/**
 * PlayButton Component
 *
 * A circular button for audio playback control with multiple states:
 * - Default: Shows play icon
 * - Playing: Shows pause icon
 * - Loading: Shows loading indicator
 * - Error: Shows error icon, triggers retry on press
 */
export function PlayButton({
  onPress,
  isLoading = false,
  isPlaying = false,
  error,
  onRetry,
  size = 'md',
  disabled = false,
  testID,
}: PlayButtonProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const buttonSize = SIZES[size];
  const iconSize = Math.round(buttonSize * 0.5);

  /**
   * Handle button press
   * - If error and onRetry provided, call onRetry
   * - Otherwise call onPress
   */
  const handlePress = () => {
    if (disabled || isLoading) {
      return;
    }
    if (error && onRetry) {
      onRetry();
    } else {
      onPress();
    }
  };

  /**
   * Get accessibility label based on current state
   */
  const getAccessibilityLabel = (): string => {
    if (error) return t('a11y:retryPlayback');
    if (isPlaying) return t('a11y:pauseAudio');
    return t('a11y:playAudio');
  };

  /**
   * Render button content based on state
   */
  const renderContent = () => {
    // Loading state
    if (isLoading) {
      return (
        <ActivityIndicator
          size="small"
          color={colors.accent.primary}
          testID={`${testID}-loading`}
        />
      );
    }

    // Error state
    if (error) {
      return (
        <Icon
          name="alert-circle"
          size={iconSize}
          color={colors.semantic.error}
          testID={`${testID}-error`}
        />
      );
    }

    // Playing state
    if (isPlaying) {
      return (
        <Icon
          name="pause"
          size={iconSize}
          color={colors.accent.primary}
          testID={`${testID}-pause`}
        />
      );
    }

    // Default state - play icon
    return (
      <Icon
        name="play"
        size={iconSize}
        color={disabled ? colors.text.tertiary : colors.accent.primary}
        testID={`${testID}-play`}
      />
    );
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || isLoading}
      style={({ pressed }) => [
        styles.button,
        {
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          opacity: pressed && !disabled && !isLoading ? 0.7 : 1,
        },
        disabled && styles.disabled,
      ]}
      accessibilityLabel={getAccessibilityLabel()}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || isLoading }}
      testID={testID}
    >
      {renderContent()}
    </Pressable>
  );
}

const useStyles = () =>
  useThemedStyles((t) => ({
    button: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.background.secondary,
    },
    disabled: {
      opacity: 0.5,
    },
  }));
