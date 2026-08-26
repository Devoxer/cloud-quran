/**
 * Tests for the locale-aware date / time / relative-time / byte formatters.
 *
 * WHY THIS FILE EXISTS (epic-20 boundary, review round 2). `lib/formatDate.ts` — this module's
 * predecessor — was created by round 1 to fix two date sites that ignored the app language, and it
 * shipped with NO tests, in the round whose headline lesson was that the epic's own backstops
 * reported green on a broken tree. `formatClockTime` was then added in round 2 for the AM/PM
 * defect, and Story 24.19 folded in the relative-time and byte-size formatters when the module
 * became `lib/format.ts`, the ONE sanctioned home for locale-sensitive formatting.
 *
 * Every formatter here is locale-driven, so an `en`-only assertion proves nothing: every case pins
 * the `fr` behaviour too.
 */

import i18n from '@/i18n';
import {
  compareInAppLanguage,
  formatBytes,
  formatClockTime,
  formatLongDate,
  formatRelativeTime,
} from './format';

describe('format', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  describe('formatLongDate', () => {
    it('formats in the APP language, not the device locale', async () => {
      const d = new Date(2026, 11, 25);
      expect(formatLongDate(d)).toBe('December 25, 2026');
      await i18n.changeLanguage('fr');
      expect(formatLongDate(d)).toBe('25 décembre 2026');
    });

    it('returns empty string for an Invalid Date rather than the literal "Invalid Date"', () => {
      // RevenueCat's `expirationDate` is absent or malformed on more paths than it looks; without
      // this guard `toLocaleDateString` renders the string "Invalid Date" into trial/renewal copy.
      expect(formatLongDate(new Date('not-a-date'))).toBe('');
      expect(formatLongDate(new Date(Number.NaN))).toBe('');
    });

    /**
     * ⚠️ THIS ASSERTION HAS TO BE ABLE TO FAIL, WHICH THE OBVIOUS ONE CANNOT (Step G). The first
     * version was `expect(formatLongDate(d)).toMatch(/\d/)`, which passes identically with or
     * without `numberingSystem: 'latn'` — `en` and `fr` both default to Latin digits, so it could
     * not distinguish the defect it was named for. The rule exists for locales that do NOT
     * (Android Hermes returns Arabic-Indic for `ar`, Devanagari for `hi`), so the only assertion
     * that can red is one made against such a locale. Delete `numberingSystem` from the formatter
     * and this test goes red; the old one stayed green.
     */
    it('forces Western digits even in a locale whose default numerals are not (Story 20.2 AC-7)', async () => {
      const d = new Date(2026, 0, 5);
      // The CONTROL, asserted rather than assumed: this locale's own default numerals really are
      // Arabic-Indic. If that stops holding, the assertion below has stopped proving anything and
      // this line is what says so.
      expect(d.toLocaleDateString('ar-EG', { day: 'numeric' })).toMatch(/[٠-٩]/);

      // Drive the SHIPPED formatter under that locale — it reads `i18n.language` as a BCP-47 tag,
      // so this is the same code path a future `ar` build takes. Asserting against `en`/`fr` (both
      // Latin-by-default) is what made the original version of this test unfailable.
      await i18n.changeLanguage('ar-EG');
      expect(i18n.language).toBe('ar-EG');
      expect(formatLongDate(d)).toMatch(/[0-9]/);
      expect(formatLongDate(d)).not.toMatch(/[٠-٩]/);
    });

    it('forces Western digits in every OTHER formatter too, not just the date one', async () => {
      await i18n.changeLanguage('ar-EG');
      expect(formatClockTime(21, 5)).toMatch(/[0-9]/);
      expect(formatClockTime(21, 5)).not.toMatch(/[٠-٩]/);
      expect(formatBytes(1536)).toMatch(/[0-9]/);
      expect(formatBytes(1536)).not.toMatch(/[٠-٩]/);
    });
  });

  describe('formatClockTime', () => {
    it('is 12-hour with a meridiem in en', () => {
      expect(formatClockTime(21, 0)).toMatch(/9:00\s?(PM|pm)/i);
      expect(formatClockTime(9, 5)).toMatch(/9:05\s?(AM|am)/i);
    });

    /**
     * ⚠️ THE REGRESSION THIS FUNCTION EXISTS FOR. Epic 20 shipped a hardcoded 12-hour format with
     * t()-resolved AM/PM markers, and gave the French bundle the verbatim values "AM"/"PM". So a
     * 21:00 reminder rendered "9:00 PM" on the Android row while the Material dialog that row
     * opens showed "21:00". The string gate was satisfied; the output was still wrong.
     */
    it('is 24-hour in fr — no meridiem anywhere', async () => {
      await i18n.changeLanguage('fr');
      const evening = formatClockTime(21, 0);
      expect(evening).toMatch(/21[:h]00/);
      expect(evening).not.toMatch(/AM|PM/i);
      expect(formatClockTime(9, 5)).not.toMatch(/AM|PM/i);
    });

    it('distinguishes morning from evening in fr (the 9-vs-21 collision)', async () => {
      await i18n.changeLanguage('fr');
      expect(formatClockTime(9, 0)).not.toBe(formatClockTime(21, 0));
    });

    it('handles midnight and noon in both languages', async () => {
      expect(formatClockTime(0, 0)).toMatch(/12:00\s?(AM|am)/i);
      expect(formatClockTime(12, 0)).toMatch(/12:00\s?(PM|pm)/i);
      await i18n.changeLanguage('fr');
      // French zero-pads the hour — "00:00", not "0:00". That padding is exactly what
      // `timeStyle: 'short'` gets right and hand-picked `hour`/`minute` components got wrong.
      expect(formatClockTime(0, 0)).toMatch(/00[:h]00/);
      expect(formatClockTime(12, 0)).toMatch(/12[:h]00/);
    });

    it('zero-pads the minute', () => {
      expect(formatClockTime(7, 5)).toMatch(/7:05/);
    });

    it('zero-pads the HOUR in fr, per that locale convention', async () => {
      await i18n.changeLanguage('fr');
      expect(formatClockTime(9, 5)).toMatch(/09[:h]05/);
    });
  });

  /**
   * ⚠️ THE REGRESSION THIS FUNCTION EXISTS FOR (Story 24.19). Four sites called `date-fns`
   * `formatDistanceToNow(ts, { addSuffix: true })`, which takes no locale by default and so
   * returned "3 days ago" under fully French chrome — with no string literal anywhere for the
   * extraction gate to see. Every case below therefore asserts BOTH languages; an `en`-only
   * assertion would have passed against the pre-fix source.
   */
  describe('formatRelativeTime', () => {
    const NOW = Date.UTC(2026, 7, 4, 12, 0, 0);
    const ago = (ms: number) => formatRelativeTime(NOW - ms, NOW);

    it('renders every threshold in en', () => {
      expect(ago(5_000)).toBe('just now');
      expect(ago(3 * 60_000)).toBe('3m ago');
      expect(ago(2 * 3_600_000)).toBe('2h ago');
      expect(ago(3 * 86_400_000)).toBe('3d ago');
      expect(ago(2 * 7 * 86_400_000)).toBe('2w ago');
    });

    it('renders every threshold in fr — no English unit survives', async () => {
      await i18n.changeLanguage('fr');
      expect(ago(5_000)).toBe("à l'instant");
      expect(ago(3 * 60_000)).toBe('3 min');
      expect(ago(2 * 3_600_000)).toBe('2 h');
      expect(ago(3 * 86_400_000)).toBe('3 j');
      expect(ago(2 * 7 * 86_400_000)).toBe('2 sem.');
      // ⚠️ `s` IS SECONDS IN THIS APP'S OWN FRENCH BUNDLE (`player:sleep.seconds` =
      // "{{seconds}} s"), so an abbreviated week must not use it — the owner smoke read "3 s" on
      // a note row as "3 seconds" where it meant "3 weeks". Same reason minutes are "min" and not
      // "m": the sleep-timer formatter already settled that convention in-tree.
      expect(ago(2 * 7 * 86_400_000)).not.toBe('2 s');
      // The pre-fix `date-fns` output was "3 days ago" / "2 weeks ago" in EVERY language.
      expect(ago(3 * 86_400_000)).not.toMatch(/ago|day|week/i);
    });

    it('is exclusive at each boundary (59s is still "just now", 60s is a minute)', () => {
      expect(ago(59_999)).toBe('just now');
      expect(ago(60_000)).toBe('1m ago');
      expect(ago(3_599_999)).toBe('59m ago');
      expect(ago(3_600_000)).toBe('1h ago');
      expect(ago(86_399_999)).toBe('23h ago');
      expect(ago(86_400_000)).toBe('1d ago');
      expect(ago(7 * 86_400_000 - 1)).toBe('6d ago');
      expect(ago(7 * 86_400_000)).toBe('1w ago');
    });

    it('clamps a FUTURE timestamp to "just now" rather than counting backwards', () => {
      expect(formatRelativeTime(NOW + 86_400_000, NOW)).toBe('just now');
    });

    /**
     * The three deleted local wrappers each wrapped `formatDistanceToNow` in a `try/catch`
     * returning `''`, because it THROWS on a bad timestamp. Arithmetic does not throw — it yields
     * `NaN`, and every threshold comparison against `NaN` is false, so an unguarded version falls
     * through to the last branch and renders the literal "NaNw ago".
     */
    it('returns empty string for a non-finite timestamp instead of "NaNw ago"', () => {
      expect(formatRelativeTime(Number.NaN, NOW)).toBe('');
      expect(formatRelativeTime(Number.POSITIVE_INFINITY, NOW)).toBe('');
      expect(formatRelativeTime(NOW, Number.NaN)).toBe('');
    });

    /**
     * `now` DEFAULTS to `Date.now()`, and the default is the form all four row call sites use —
     * i.e. the one an explicit-argument suite never exercises (`stack/gates-scanners.md`).
     */
    it('defaults `now` to the real clock when the caller omits it', () => {
      expect(formatRelativeTime(Date.now() - 5_000)).toBe('just now');
      expect(formatRelativeTime(Date.now() - 3 * 86_400_000)).toBe('3d ago');
    });
  });

  /**
   * ⚠️ THE REGRESSION THIS FUNCTION EXISTS FOR (Story 24.19). `formatBytes` lived in
   * `lib/storage.ts` as `` `${parseFloat((bytes / k ** i).toFixed(1))} ${units[i]}` `` — `toFixed`
   * always emits a `.` separator and the unit table was hardcoded English, so all SEVEN offline
   * render sites read "245.3 MB" under French chrome. French writes "245,3 Mo".
   */
  describe('formatBytes', () => {
    it('formats each magnitude in en', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1234567)).toBe('1.2 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
    });

    it('formats with the FRENCH decimal separator, unit AND spacing — the whole point', async () => {
      await i18n.changeLanguage('fr');
      // The pre-fix implementation returned "245.3 MB" here, in French chrome.
      // ⚠️ `\u00a0` is a NON-BREAKING space, and it is why the number-and-unit join is a
      // translation key (`common:byteSize`) rather than a hardcoded ' '. French typography does
      // not break a line between a value and its unit symbol; English does, and the `en` case
      // above asserts a plain space. Written as an ESCAPE rather than the character because the
      // two are indistinguishable on screen and in a diff — a literal here would be an
      // assertion nobody can read and an edit nobody can see (Story 24.19 Step I).
      expect(formatBytes(245.3 * 1024 ** 2)).toBe('245,3\u00a0Mo');
      expect(formatBytes(1536)).toBe('1,5\u00a0Ko');
      expect(formatBytes(0)).toBe('0\u00a0o');
      expect(formatBytes(1073741824)).toBe('1\u00a0Go');
      expect(formatBytes(1536)).not.toMatch(/KB|\./);
    });

    /**
     * The predecessor fell straight into `Math.log(bytes)` for these, which is `NaN` for a negative
     * and for `NaN` itself — it then indexed the unit table with `NaN` and rendered "undefined".
     */
    it('treats negative and NaN sizes as zero rather than rendering "undefined"', () => {
      expect(formatBytes(-1)).toBe('0 B');
      expect(formatBytes(Number.NaN)).toBe('0 B');
    });

    it('clamps past the largest unit instead of indexing off the end of the table', () => {
      // 5 TB — one magnitude beyond GB, the last unit the table declares.
      expect(formatBytes(5 * 1024 ** 4)).toBe('5,120 GB');
    });

    /**
     * ⚠️ THE OTHER END OF THE SAME CLAMP, MISSED BY THE FIRST CUT (Step G). The top clamp above was
     * covered; the bottom was not, and the exponent for a sub-byte value is `-1` —
     * `BYTE_UNIT_KEYS[-1]` is `undefined`, `i18n.t(undefined)` is `''`, and the value is divided by
     * `1024**-1`, i.e. MULTIPLIED. `formatBytes(0.5)` rendered "512 ": no unit, and 1024x too
     * large. Not reachable from a file size today, which is exactly why nothing would have caught
     * it later either.
     */
    it('clamps below the smallest unit too — a sub-byte size is 0 B, never a unitless "512"', () => {
      expect(formatBytes(0.5)).toBe('0 B');
      expect(formatBytes(0.9)).toBe('0 B');
    });

    it('treats a non-finite size as zero rather than rendering "∞ GB"', () => {
      expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B');
      expect(formatBytes(Number.NEGATIVE_INFINITY)).toBe('0 B');
    });
  });

  describe('compareInAppLanguage', () => {
    /**
     * ⚠️ COLLATION IS THE SAME CLASS AS THE FORMATTERS ABOVE and shipped past the story's first cut
     * (Step G): two quiz-category sorts resolved their labels with the app language and then
     * ordered them with `localeCompare()` and NO locale — i.e. the device's. `lint:i18n` sink (a)
     * now names `localeCompare`, so a bare call cannot come back.
     */
    it('orders accented labels the way the language does, not by codepoint', () => {
      // Codepoint order puts every accented letter after "z"; a French reader expects É with E.
      const byCodepoint = ['Zoologie', 'Éducation'].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      expect(byCodepoint[0]).toBe('Zoologie');

      const sorted = ['Zoologie', 'Éducation'].sort(compareInAppLanguage);
      expect(sorted).toEqual(['Éducation', 'Zoologie']);
    });

    it('follows the APP language, and keeps working after a switch', async () => {
      expect(compareInAppLanguage('a', 'b')).toBeLessThan(0);
      await i18n.changeLanguage('fr');
      // The per-language collator cache must not hand back the previous language's collator.
      expect(['Zoologie', 'Éducation'].sort(compareInAppLanguage)).toEqual([
        'Éducation',
        'Zoologie',
      ]);
    });

    it('sorts numeric prefixes by value, not by digit order', () => {
      expect(['10 Rules', '2 Rules'].sort(compareInAppLanguage)).toEqual(['2 Rules', '10 Rules']);
    });
  });
});
