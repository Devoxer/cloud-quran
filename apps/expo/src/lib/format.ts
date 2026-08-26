/**
 * THE format module — every rendering that depends on a LOCALE (date, time, relative time, number,
 * byte size, collation) goes through this file, and `lint:i18n` sink (a) enforces that it is the
 * only file that may call a locale-sensitive formatter.
 *
 * ⚠️ WHAT THAT SENTENCE DOES *NOT* CLAIM, STATED SO THE NEXT READER DOESN'T HAVE TO INFER IT
 * (Story 24.19 Step G — the first cut read "every … rendering in the app", which was a wider claim
 * than any gate holds, i.e. the same over-claim this module's own history is a warning about):
 *   • `lib/formatTime.ts` also renders human-facing durations — `formatTime` ("3:24", the player
 *     scrubber) and `formatSleepRemaining` ("1h 5m" / "1 h 5 min"). They are LOCALE-INDEPENDENT by
 *     construction: elapsed-time arithmetic plus `t()` unit keys, no `Intl`, no `toLocale*`, no
 *     `toFixed`. Sink (a) is silent on them because there is nothing locale-sensitive to catch —
 *     they are a deliberate sibling, not an escapee. (Their French unit abbreviations are the
 *     in-tree convention `formatRelativeTime` below had to follow.)
 *   • `constants/subscription.ts` § `formatMonthlyEquivalent` deliberately uses the STORE's
 *     currency locale, not the app language, and is carved out with `// lint-i18n-ok`.
 *   • The playback-speed indicator (`1.50x`) is a machine value, likewise carved out — ONE
 *     function (`SpeedSelector.formatSpeed`), used by both the pill and the overflow-menu row.
 *   • The gate's population is `apps/expo/src`. Other workspaces have their own rules.
 *
 * WHY THIS EXISTS. A string-extraction gate asks *"is this literal routed through `t()`?"*, and a
 * formatting defect has **no literal to see** — the English is manufactured at runtime by a
 * library's default locale. Five rounds of the epic-20 boundary each fixed sites of this class and
 * none of them closed it, because the sites keep coming back:
 * `formatDistanceToNow(...)` → "3 days ago" in every language; `format(d, 'MMMM d, yyyy')` →
 * "January 15, 2026" inside French chrome (French also orders day-first, so the month name *and*
 * the field order were wrong); `toFixed(1)` + a hardcoded `['B','KB','MB','GB']` table → "245.3 MB"
 * where French reads "245,3 Mo"; and — the tell — `toLocaleTimeString` replaced by hand-picked
 * 12-hour components with the AM/PM markers *extracted into the locale bundles*, so the string gate
 * was fully satisfied and the OUTPUT still contradicted the dialog on the same screen.
 *
 * WHAT IS IN HERE (the complete inventory, Story 24.19 — a header that claims a narrower one reads
 * as a completed sweep it has not earned, which is exactly how the previous version of this
 * sentence outlived the truth by five sites):
 *   • {@link formatLongDate}        — "December 25, 2026" / "25 décembre 2026"
 *   • {@link formatClockTime}       — "9:05 AM" / "09:05"
 *   • {@link formatRelativeTime}    — "3d ago" / "3 j" · "2w ago" / "2 sem."
 *   • {@link formatBytes}           — "245.3 MB" / "245,3 Mo"
 *   • {@link compareInAppLanguage}  — label collation in the app's language, not the device's
 *
 * `numberingSystem: 'latn'` on every `Intl` call is the standing rule from Story 20.2 AC-7:
 * Android Hermes's Intl polyfill returns Arabic-Indic / Devanagari digits for `ar` / `hi`, and a
 * date whose numerals contradict the rest of the UI is worse than an untranslated one.
 *
 * ⚠️ THIS IS THE ONE READER THAT STAYS ON THE RAW `i18n.language`, ON PURPOSE — it is not an
 * oversight from Story 24.18, which moved every other reader onto `getLanguage()`. `Intl` wants a
 * BCP-47 TAG, and `getLanguage()` returns the app's normalized language (`EXPOSED_LANGUAGES`),
 * which would discard any region a future build legitimately runs on (`fr-CA` → `fr`). The two
 * answers differ only while `i18n.language` holds a code this build does not expose, which no path
 * can reach: boot normalizes on the way in (`initI18n` ← `getStoredLanguage()`) and the picker only
 * ever offers exposed codes. If that ever stops being true, this is a site to revisit.
 *
 * ⚠️ NOTHING HERE MAY BE MEMOIZED BY A CALLER WITHOUT THE LANGUAGE IN THE KEY. Every function below
 * resolves the language at call time, which is the correct half of the invariant; a consumer that
 * caches the RESULT across a language change re-opens it. A committed switch restarts the app, but
 * `reloadAppAsync` can reject on Android and the fallback applies the language live with no
 * restart — and `<NativeTabs>` never unmounts a tab, so "it recovers on the next mount" is false
 * for the whole session (`stack/i18n.md`). See `useOfflineStorage` for the shape that works.
 */
import i18n from '@/i18n';

/** "December 25, 2026" / "25 décembre 2026" — long form, in the app's current language. */
export function formatLongDate(date: Date): string {
  // An invalid Date renders the literal string "Invalid Date" through `toLocaleDateString` — which
  // would ship straight into the trial/renewal copy under French chrome. Callers build these from
  // RevenueCat's `expirationDate`, which is absent or malformed on more paths than it looks
  // (`subscription.tsx:390,491`), so the guard belongs here rather than at each call site.
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(i18n.language, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    // Force Western (Latin) digits regardless of locale (Story 20.2, AC7).
    numberingSystem: 'latn',
  });
}

/**
 * "9:05 AM" / "21:05" — a wall-clock time in the app's current language.
 *
 * ⚠️ 12-VS-24-HOUR IS A FORMAT CONVENTION, NOT A TRANSLATABLE STRING (epic-20 boundary, round 2).
 * Epic 20 extracted the AM/PM markers to `common:time.am` / `common:time.pm` and gave the French
 * bundle the verbatim values `"AM"` / `"PM"` — so the string gate was fully satisfied and the
 * OUTPUT was still wrong: the Android reminder row rendered a 21:00 reminder as "9:00 PM" while
 * the Material dialog it opens showed "21:00". Two contradictory renderings of one value, on one
 * screen. French is a 24-hour locale; `Intl` knows that and a translation key never can.
 *
 * This is the general lesson worth carrying: extracting a format convention INTO the locale
 * bundles hides the defect from every gate the epic built, because nothing is left un-extracted.
 *
 * @param hour   0-23
 * @param minute 0-59
 */
export function formatClockTime(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString(i18n.language, {
    // `timeStyle: 'short'` rather than `hour`/`minute` components: it takes the locale's OWN
    // convention for both the hour cycle AND the padding. Spelling the components out gave a
    // non-idiomatic French "0:00" for midnight and "9:05" for morning, where French pads to
    // "00:00" / "09:05". English is unaffected ("9:00 AM", "12:00 AM") — that asymmetry IS the
    // locale convention, and picking it by hand is the class of mistake this function replaced.
    timeStyle: 'short',
    // Western digits, same rationale as `formatLongDate` (Story 20.2, AC7).
    numberingSystem: 'latn',
  });
}

/**
 * A compact relative-time caption — "just now" / "3m ago" / "2h ago" / "5d ago" / "2w ago",
 * and "à l'instant" / "3 min" / "2 h" / "5 j" / "2 sem." in French.
 *
 * ⚠️ THE FRENCH UNITS FOLLOW THE APP'S OWN ESTABLISHED ABBREVIATIONS, NOT ENGLISH'S. `s` means
 * SECONDS in this app's French bundle (`player:sleep.seconds` = "{{seconds}} s"), so a week
 * cannot borrow it — the Step-E owner smoke read a note row's "3 s" as "3 seconds" where it meant
 * three weeks. Likewise minutes are "min", never "m" (which is metres); `lib/formatTime.ts`
 * § formatSleepRemaining settled this in-tree before this module existed.
 *
 * ⚠️ THIS REPLACED `date-fns` `formatDistanceToNow` AT FOUR SITES (Story 24.19), and the copy
 * changed on shipped screens as a result: a note or history row that read "3 days ago" now reads
 * "3d ago". That is intended. `formatDistanceToNow` takes no locale by default and returned
 * English under French chrome unconditionally; the alternatives were a per-language `date-fns`
 * locale map (a static per-language asset map — the trap in `stack/i18n.md`) or
 * `Intl.RelativeTimeFormat`, which the shipped Hermes does **not** implement (verified against the
 * bundled `hermesvm.framework`: `NumberFormat`, `DateTimeFormat` and `Collator` are present,
 * `RelativeTimeFormat` and `ListFormat` are not), so reaching for it means a polyfill dependency
 * plus per-language data. This app already had a localized compact form; it is now the only one.
 *
 * ⚠️ THE KEYS DELIBERATELY DO NOT PASS `count` — they interpolate `{{minutes}}`/`{{hours}}`/
 * `{{days}}`/`{{weeks}}` instead. The rendered unit is an ABBREVIATION (`3d`, `3 j`) which does not
 * inflect in either shipped language, so renaming to `count` would buy nothing at the call site
 * while obliging every locale to declare its full plural category set for five keys (French has
 * three: 10 bundle entries would become 25, each identical to its siblings, and a standing tax on
 * every language ever added). `lint:i18n` sink (b) is quiet on them **because they pass no
 * `count`** — that is the correct answer, not a gap: the correspondence it enforces is *call site
 * passes `count`* ⇄ *key declares variants*, and these keys are on neither side of it. A future
 * language that genuinely inflects an abbreviated unit is the trigger to revisit.
 *
 * @param ts  the past instant, epoch ms
 * @param now the reference instant, epoch ms — injectable so tests need no fake timers. The four
 *            row call sites take the default; `QuizPoolStatsSection` threads its own clock.
 */
export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  // The three `date-fns` wrappers this replaced each wore a `try/catch` returning `''`, because
  // `formatDistanceToNow` THROWS on a bad timestamp. Arithmetic does not throw — it produces
  // `NaN`, every comparison against which is false, so an unguarded fall-through would render
  // "NaNw ago". One guard at the top is the whole of what those three catch blocks were doing.
  if (!Number.isFinite(ts) || !Number.isFinite(now)) return '';

  const diff = Math.max(0, now - ts);
  const MIN = 60_000;
  const HR = 60 * MIN;
  const DAY = 24 * HR;
  const WK = 7 * DAY;
  if (diff < MIN) return i18n.t('common:relativeTime.justNow');
  if (diff < HR)
    return i18n.t('common:relativeTime.minutesAgo', { minutes: Math.floor(diff / MIN) });
  if (diff < DAY) return i18n.t('common:relativeTime.hoursAgo', { hours: Math.floor(diff / HR) });
  if (diff < WK) return i18n.t('common:relativeTime.daysAgo', { days: Math.floor(diff / DAY) });
  return i18n.t('common:relativeTime.weeksAgo', { weeks: Math.floor(diff / WK) });
}

/**
 * Sort comparator for user-visible labels, in the app's language — for `[...].sort(…)`.
 *
 * ⚠️ COLLATION IS LOCALE-SENSITIVE RENDERING, AND A BARE `localeCompare()` USES THE DEVICE'S
 * LOCALE, NOT THE APP'S (Story 24.19 Step G). Two quiz-category sorts shipped resolving their
 * labels with the app language and then ordering them with the device's — so the same data came
 * back in a different order depending on a setting the app does not control, and accented French
 * names (`Éducation`) collated by whatever rules the phone was set to. It is the same class as the
 * rest of this module: no literal to see, the wrong locale supplied by a default.
 *
 * `Intl.Collator` is present in the shipped Hermes (verified alongside `NumberFormat` /
 * `DateTimeFormat` — see the module header), so this needs no polyfill.
 */
export function compareInAppLanguage(a: string, b: string): number {
  return collatorFor(i18n.language).compare(a, b);
}

/**
 * One `Intl.Collator` per language, built on first use.
 *
 * A comparator is called O(n log n) times per sort, and constructing a `Collator` is the expensive
 * half — so this caches the derived VALUE keyed BY the language rather than pinning the language
 * itself, which is the shape `stack/i18n.md` requires (and the one the rest of this module already
 * follows by resolving `i18n.language` at every call). A switch simply lands on a different key;
 * nothing has to be invalidated, and no caller can be left holding the previous language's
 * collator.
 */
const collators = new Map<string, Intl.Collator>();
function collatorFor(language: string): Intl.Collator {
  const cached = collators.get(language);
  if (cached) return cached;
  const collator = new Intl.Collator(language, {
    // A label that starts with a number ("10 Rules" before "2 Rules" under codepoint order) sorts
    // the way a reader expects. Costs nothing on labels without digits.
    numeric: true,
    // ⚠️ The DEFAULT sensitivity ('variant') on purpose — this is an ORDERING comparator, not a
    // matching one. `sensitivity: 'base'` (the first cut) makes strings that differ only by accent
    // or case compare EQUAL, so "Education" and "Éducation" tie: an A→Z list would then order those
    // two by whatever their input order happened to be, and the quiz-category list is fed by a
    // query sorted on `lastAttemptAt`, so two tied labels would swap places as the reader takes
    // quizzes. 'base' is the sensitivity for search and de-duplication, where a tie is the answer
    // you want (Story 24.19 Step I).
  });
  collators.set(language, collator);
  return collator;
}

/** Byte-magnitude unit keys, smallest first — the INDEX is the power of 1024. */
const BYTE_UNIT_KEYS = [
  'common:byteUnits.b',
  'common:byteUnits.kb',
  'common:byteUnits.mb',
  'common:byteUnits.gb',
] as const;

/**
 * A human-readable byte size in the app's language — "245.3 MB" / "245,3 Mo".
 *
 * ⚠️ MOVED HERE FROM `lib/storage.ts` (Story 24.19), where it was
 * `` `${parseFloat((bytes / k ** i).toFixed(1))} ${units[i]}` `` — `toFixed` always emits a `.`
 * decimal separator and the unit table was hardcoded English, so the offline screen rendered
 * "245.3 MB" under fully French chrome at all seven of its render sites. Both halves are locale
 * data: French writes a comma and abbreviates *octets*, not *bytes*. The number-and-unit JOIN is a
 * key too (`common:byteSize`) rather than a hardcoded space, because the spacing between a number
 * and a unit symbol is itself a typographic convention a locale owns — and it is not a decorative
 * claim: `fr` joins with a NON-BREAKING space (`\u00a0` in the bundle, written as an escape so it
 * is visible in a diff) because French does not break a line between a value and its unit, while
 * English does. `format.test.ts` asserts both sides; a key that resolved to the same string in
 * every locale would be a mechanism with nothing to do (Story 24.19 Step I).
 *
 * The `!(bytes >= 1)` guard covers zero, negatives, `NaN` AND the sub-byte range in one line — the
 * previous version fell into `Math.log(bytes)`, which returns `NaN` for a negative or `NaN` input,
 * indexed the unit table with it and rendered `undefined`. The exponent is clamped at BOTH ends,
 * and for the same reason each time: a size past the largest unit indexes off the end of the table,
 * and a size below one byte indexes off the FRONT of it — `BYTE_UNIT_KEYS[-1]` is `undefined`, so
 * `formatBytes(0.5)` rendered "512 " (unitless, and 1024× too large) until Step G. A non-integer
 * byte count is not reachable from a file size today; the guard is one comparison and does not
 * depend on that staying true.
 */
export function formatBytes(bytes: number): string {
  const unitAt = (exponent: number) => i18n.t(BYTE_UNIT_KEYS[exponent]);
  if (!Number.isFinite(bytes) || !(bytes >= 1)) {
    return i18n.t('common:byteSize', { value: '0', unit: unitAt(0) });
  }

  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    BYTE_UNIT_KEYS.length - 1
  );

  return i18n.t('common:byteSize', {
    value: new Intl.NumberFormat(i18n.language, {
      maximumFractionDigits: 1,
      // Western digits, same rationale as `formatLongDate` (Story 20.2, AC7).
      numberingSystem: 'latn',
    }).format(bytes / 1024 ** exponent),
    unit: unitAt(exponent),
  });
}
