import i18n from '@/i18n';

/**
 * formatTime - Format milliseconds to MM:SS display format
 *
 * Story 5.3: Build Full-Screen AudioPlayer Component
 * Epic 5: Core Summary Playback
 *
 * @param ms - Time in milliseconds
 * @returns Formatted time string (e.g., "3:24")
 *
 * @example
 * formatTime(45000)  // "0:45"
 * formatTime(204000) // "3:24"
 */
export function formatTime(ms: number): string {
  if (ms < 0 || !isFinite(ms)) return '0:00';

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * formatSleepRemaining - Compact sleep-timer countdown label.
 *
 * Story 19.5: one formatter shared by the full-player countdown pill, the
 * MiniPlayer sleep badge, and the overflow-menu Sleep row so all three read
 * identically. Ported from the old `useSleepTimer.remainingLabel`.
 *
 * ⚠️ LOCALIZED (epic-20 boundary review). This shipped returning a hardcoded `'End'` plus bare
 * `h`/`m`/`s` suffixes, and the value flows through `audioPlayerStore.sleep.label` straight into
 * `<Text>` on the full player and the MiniPlayer — so a French user saw an English "End" on the
 * sleep pill. `lint-i18n` cannot see this class: there is no copy literal at the JSX sink (the
 * value arrives as a store binding), and this module has no sink of its own. French also does not
 * abbreviate minutes as `m` — it is `min` — so the units are keys too, not just the word.
 *
 * @param remainingMs - Remaining time in milliseconds (ignored when end-of-section).
 * @param endOfSection - True when the timer is "end of section" (no countdown).
 * @returns the localized end-of-section word, an "Xh Ym" / "Xm" / "Xs" countdown in the app's
 *          language, or "" when inactive.
 *
 * @example
 * formatSleepRemaining(720000, false) // "12m"   (en) · "12 min" (fr)
 * formatSleepRemaining(3900000, false) // "1h 5m" (en) · "1 h 5 min" (fr)
 * formatSleepRemaining(0, true) // "End" (en) · "Fin" (fr)
 */
export function formatSleepRemaining(remainingMs: number, endOfSection: boolean): string {
  if (endOfSection) return i18n.t('player:sleep.end');
  if (!(remainingMs > 0)) return '';
  const hm = (hours: number, minutes: number) =>
    i18n.t('player:sleep.hoursMinutes', { hours, minutes });
  if (remainingMs >= 3600000) {
    const hours = Math.floor(remainingMs / 3600000);
    const mins = Math.ceil((remainingMs % 3600000) / 60000);
    // Ceiling the sub-hour remainder can reach 60 in the last minute of an hour
    // (e.g. 1h59m30s → "1h 60m"); carry it into the hour so it reads "2h 0m".
    return mins === 60 ? hm(hours + 1, 0) : hm(hours, mins);
  }
  if (remainingMs >= 60000) {
    const mins = Math.ceil(remainingMs / 60000);
    // Same carry: 59m30s → ceil → 60 → read "1h 0m", not "60m".
    return mins === 60 ? hm(1, 0) : i18n.t('player:sleep.minutes', { minutes: mins });
  }
  return i18n.t('player:sleep.seconds', { seconds: Math.ceil(remainingMs / 1000) });
}
