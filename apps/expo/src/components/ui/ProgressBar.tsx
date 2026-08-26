/**
 * ProgressBar - Seekable audio progress bar component
 *
 * Story 5.3: Build Full-Screen AudioPlayer Component
 * Epic 5: Core Summary Playback
 *
 * Displays audio playback progress with tap-to-seek functionality.
 * Shows a track with filled portion and draggable thumb.
 *
 * @example
 * <ProgressBar
 *   currentMs={45000}
 *   durationMs={180000}
 *   onSeek={(positionMs) => seekTo(positionMs)}
 * />
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  View,
} from 'react-native';
import { RADII } from '@/constants/radii';
import { useThemedStyles } from '@/lib/useThemedStyles';

/**
 * Props for ProgressBar component
 */
export interface ProgressBarProps {
  /** Current playback position in milliseconds */
  currentMs: number;
  /** Total audio duration in milliseconds */
  durationMs: number;
  /** Callback when user seeks to a position */
  onSeek: (positionMs: number) => void;
  /** Whether the progress bar is disabled */
  disabled?: boolean;
  /** Test ID for testing */
  testID?: string;
}

/** Track height in pixels */
const TRACK_HEIGHT = 4;

/** Thumb size in pixels */
const THUMB_SIZE = 16;

/** Minimum hit target for accessibility */
const HIT_SLOP = { top: 12, bottom: 12, left: 0, right: 0 };

/**
 * ProgressBar Component
 *
 * A seekable progress bar for audio playback.
 * Supports tap-to-seek and drag-to-seek interactions.
 */
export function ProgressBar({
  currentMs,
  durationMs,
  onSeek,
  disabled = false,
  testID,
}: ProgressBarProps) {
  const { t } = useTranslation();
  const styles = useThemedStyles((t) => ({
    container: {
      height: TRACK_HEIGHT,
      borderRadius: RADII.sm,
      overflow: 'visible',
      justifyContent: 'center',
      backgroundColor: t.colors.accent.secondary,
    },
    filled: {
      height: '100%',
      borderRadius: RADII.sm,
      position: 'absolute',
      left: 0,
      backgroundColor: t.colors.accent.primary,
    },
    thumb: {
      position: 'absolute',
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: THUMB_SIZE / 2,
      marginLeft: -THUMB_SIZE / 2,
      top: (TRACK_HEIGHT - THUMB_SIZE) / 2,
      backgroundColor: t.colors.accent.primary,
    },
  }));
  const widthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);

  // Calculate progress percentage (0 to 1), clamped to valid range
  const calculateProgress = useCallback(() => {
    if (durationMs <= 0) return 0;
    const current = Math.max(0, currentMs);
    return Math.min(1, current / durationMs);
  }, [currentMs, durationMs]);

  const progress = isDragging ? dragProgress : calculateProgress();
  const progressPercentage = Math.round(progress * 100);

  /**
   * Handle layout event to capture container width
   */
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    widthRef.current = event.nativeEvent.layout.width;
  }, []);

  /**
   * Calculate position from x coordinate and trigger seek
   */
  const calculateSeekPosition = useCallback(
    (locationX: number): number => {
      if (widthRef.current === 0 || durationMs <= 0) return 0;

      const percentage = Math.max(0, Math.min(1, locationX / widthRef.current));
      return Math.round(percentage * durationMs);
    },
    [durationMs]
  );

  /**
   * Handle press/tap on the track
   */
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (disabled || widthRef.current === 0 || durationMs <= 0) return;

      const positionMs = calculateSeekPosition(event.nativeEvent.locationX);
      onSeek(positionMs);
    },
    [disabled, durationMs, calculateSeekPosition, onSeek]
  );

  /**
   * Create PanResponder for drag-to-seek
   * Using useMemo to recreate when dependencies change (fixes closure bug)
   */
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,

        onPanResponderGrant: (event) => {
          if (disabled) return;
          setIsDragging(true);
          const locationX = event.nativeEvent.locationX;
          const percentage = Math.max(0, Math.min(1, locationX / (widthRef.current || 1)));
          setDragProgress(percentage);
        },

        onPanResponderMove: (event, gestureState) => {
          if (disabled || widthRef.current === 0) return;
          // Calculate position based on starting point + movement
          const startX = event.nativeEvent.locationX - gestureState.dx;
          const currentX = startX + gestureState.dx;
          const percentage = Math.max(0, Math.min(1, currentX / widthRef.current));
          setDragProgress(percentage);
        },

        onPanResponderRelease: (event, gestureState) => {
          if (disabled || widthRef.current === 0 || durationMs <= 0) {
            setIsDragging(false);
            return;
          }

          // Calculate final position
          const startX = event.nativeEvent.locationX - gestureState.dx;
          const currentX = startX + gestureState.dx;
          const positionMs = calculateSeekPosition(currentX);

          setIsDragging(false);
          onSeek(positionMs);
        },

        onPanResponderTerminate: () => {
          setIsDragging(false);
        },
      }),
    [disabled, durationMs, calculateSeekPosition, onSeek]
  );

  return (
    <Pressable
      onLayout={handleLayout}
      onPress={handlePress}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      style={[
        styles.container,
        {
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      accessibilityLabel={t('a11y:progressPercent', { percent: progressPercentage })}
      accessibilityRole="adjustable"
      accessibilityState={{ disabled }}
      accessibilityHint={t('a11y:seekHint')}
      testID={testID}
      {...panResponder.panHandlers}
    >
      {/* Filled portion */}
      <View
        style={[
          styles.filled,
          {
            width: `${progress * 100}%`,
          },
        ]}
        testID={testID ? `${testID}-filled` : undefined}
      />

      {/* Thumb */}
      <View
        style={[
          styles.thumb,
          {
            left: `${progress * 100}%`,
          },
        ]}
        testID={testID ? `${testID}-thumb` : undefined}
      />
    </Pressable>
  );
}
