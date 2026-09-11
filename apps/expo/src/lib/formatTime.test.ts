/**
 * `formatSleepRemaining` — the sleep-timer countdown label.
 *
 * ⚠️ THE `formatTime(ms)` EXPORT AND ITS 78 LINES OF CASES WERE DELETED 2026-09-11, as the
 * epic-7 boundary sweep. It was inherited from the fork's full-screen player (story 5.3) and had
 * ZERO consumers in this tree — `components/ui/TimePicker.tsx` carries a comment about a
 * DIFFERENT local `formatTime(hour, minute, …)`, which is how it kept looking alive. Its tests
 * passed the whole time, which is exactly the shape the repo's non-negotiable warns about: a
 * green suite is not evidence that anything calls the thing.
 *
 * `formatSleepRemaining` is the opposite case and stays: stories 7-4 and 7-8 gave it real
 * consumers (`PlaybackOptions`, `ChromeVerseRow`), so the ledger entry that called it orphaned
 * is out of date.
 */

import i18n from '@/i18n';
import { formatSleepRemaining } from './formatTime';

describe('formatSleepRemaining (Story 19.5)', () => {
  it('returns "End" for end-of-section regardless of ms', () => {
    expect(formatSleepRemaining(0, true)).toBe('End');
    expect(formatSleepRemaining(720000, true)).toBe('End');
  });

  it('returns "" when inactive (no remaining)', () => {
    expect(formatSleepRemaining(0, false)).toBe('');
    expect(formatSleepRemaining(-5, false)).toBe('');
  });

  it('formats sub-minute as seconds (ceil)', () => {
    expect(formatSleepRemaining(45000, false)).toBe('45s');
    expect(formatSleepRemaining(1, false)).toBe('1s');
    expect(formatSleepRemaining(59999, false)).toBe('60s');
  });

  it('formats minutes (ceil) under an hour', () => {
    expect(formatSleepRemaining(720000, false)).toBe('12m'); // 12 min
    expect(formatSleepRemaining(60000, false)).toBe('1m');
    expect(formatSleepRemaining(90000, false)).toBe('2m'); // 1.5 min → ceil 2
  });

  it('formats hours + minutes at/over an hour', () => {
    expect(formatSleepRemaining(3600000, false)).toBe('1h 0m');
    expect(formatSleepRemaining(3900000, false)).toBe('1h 5m'); // 1h05m
    expect(formatSleepRemaining(7200000, false)).toBe('2h 0m');
  });

  it('carries a ceil-to-60 minute remainder instead of showing "60m" (Story 19.5 CR)', () => {
    // Last minute below an hour: ceil(remainder/60000) === 60 → must read as the next hour.
    expect(formatSleepRemaining(3570000, false)).toBe('1h 0m'); // 59m30s, not "60m"
    expect(formatSleepRemaining(3599000, false)).toBe('1h 0m'); // 59m59s, not "60m"
    // Last minute below 2h: must read "2h 0m", not "1h 60m".
    expect(formatSleepRemaining(7170000, false)).toBe('2h 0m'); // 1h59m30s
    expect(formatSleepRemaining(7199000, false)).toBe('2h 0m'); // 1h59m59s
  });
});

/**
 * ⚠️ THE NON-VACUOUS HALF (epic-20 boundary, review round 2).
 *
 * Every `formatSleepRemaining` assertion above runs under the default `en` init — which is exactly
 * why all 22 stayed byte-identical when round 1 converted the unit suffixes from hardcoded
 * literals to `player:sleep.*` keys. That made the change provably safe, and it also means those
 * tests cannot detect an `fr`-specific regression: French uses a NON-BREAKING-space-separated
 * "1 h 5 min" / "45 s", not "1h 5m" / "45s", and a wrong interpolation or a dropped space there
 * would leave every assertion above green.
 */
describe('formatSleepRemaining — localization (fr)', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('uses the French unit abbreviations and spacing', async () => {
    await i18n.changeLanguage('fr');
    expect(formatSleepRemaining(45000, false)).toBe('45 s');
    expect(formatSleepRemaining(720000, false)).toBe('12 min');
    expect(formatSleepRemaining(3900000, false)).toBe('1 h 5 min');
  });

  it('translates the end-of-section label', async () => {
    await i18n.changeLanguage('fr');
    expect(formatSleepRemaining(0, true)).toBe('Fin');
  });

  it('keeps the ceil-to-60 carry correct in fr (the round-1 CR case, re-checked per locale)', async () => {
    await i18n.changeLanguage('fr');
    expect(formatSleepRemaining(3570000, false)).toBe('1 h 0 min');
    expect(formatSleepRemaining(7170000, false)).toBe('2 h 0 min');
  });

  it('still returns the empty string when inactive, in any language', async () => {
    await i18n.changeLanguage('fr');
    expect(formatSleepRemaining(0, false)).toBe('');
  });
});
