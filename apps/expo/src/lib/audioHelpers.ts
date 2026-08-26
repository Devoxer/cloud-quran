/**
 * Audio helper utilities for playback formatting.
 *
 * Story 22.2 removed the word-level sync machinery (`findWordAtPosition`,
 * `findWordIndexAtPosition`, `calculateDrift`, `getDriftTier`, `WordBoundary`).
 * Story 22.9 then moved highlighting to BLOCK granularity via a direct
 * `currentTime → block` lookup over the R2 block sidecar's exact ranges
 * (`findBlockAtTime` in `@cloudquran/shared`), so there is nothing to drift and no
 * word/sentence index to track.
 */

/**
 * Standard playback rate options
 */
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

/**
 * Format milliseconds to human-readable duration string
 * @param ms - Duration in milliseconds
 * @returns Formatted string "M:SS" or "H:MM:SS" for durations >= 1 hour
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Calculate playback progress percentage
 * @param position - Current position in milliseconds
 * @param duration - Total duration in milliseconds
 * @returns Progress percentage (0-100)
 */
export function calculateProgress(position: number, duration: number): number {
  if (duration <= 0 || position < 0) {
    return 0;
  }

  const progress = (position / duration) * 100;
  return Math.min(100, Math.max(0, progress));
}
