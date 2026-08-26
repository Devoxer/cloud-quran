/**
 * Locale-parity test (Story 20.2, AC5) — committed FIRST, before any string
 * extraction, so that adding a language later (Story 20.4) is guarded the moment
 * a bundle drifts. `fallbackLng: 'en'` silently resolves a missing key to English
 * at runtime with NO tsc / lint / test signal, so this harness is the only thing
 * that catches a missing/renamed/mistyped key or a mismatched interpolation token
 * in a NON-`en` bundle.
 *
 * It auto-discovers every locale directory under `locales/*` (no edit needed when a
 * language's chrome is authored — 20.4 added `fr`; `ar` awaits RTL chrome, deferred — 20.5 was skipped) and asserts:
 *   - per locale (incl. `en`): no empty-string / non-string leaf values;
 *   - `en` itself: every plural stem carries all English-required plural categories
 *     (`_one` + `_other`) — a stem missing `_other` resolves to the bare key at
 *     runtime (renders `"books"`), and this is the ONLY guard for the only bundle
 *     that exists today (Story 20.2 Step-G hardening);
 *   - per non-`en` locale vs `en`: same set of keys (zero missing, zero extra, plural
 *     variants collapsed to their stem); interpolation-token parity per key; and
 *     plural-suffix completeness for every stem that is plural in `en` OR in the
 *     target (so a locale introducing a plural form for a key that is non-plural in
 *     `en` is still checked for its own required categories — Step-G hardening).
 *
 * With only `en` present the cross-locale checks are trivially green (nothing to
 * compare against) but the empty/non-string and `en` plural-completeness checks run.
 * Since Story 20.4 the tree ships `en` + `fr`, so the cross-locale block is live —
 * and `fr` is the first locale to require a category `en` never supplies (`_many`).
 */
import fs from 'node:fs';
import path from 'node:path';

const LOCALES_DIR = path.join(__dirname, 'locales');

// The six CLDR plural categories i18next v4 JSON uses as key suffixes.
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
const PLURAL_SUFFIX_RE = new RegExp(`_(${PLURAL_SUFFIXES.join('|')})$`);

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

/**
 * Recursively flattens a nested bundle to dotted key paths, preserving the RAW
 * leaf value (string, number, boolean, or null) so the validity check can flag a
 * non-string / null leaf. Arrays flatten by index (`slides.0`, `slides.1`) so
 * per-element drift across locales stays visible rather than collapsing to one
 * opaque CSV key.
 */
function flatten(obj: JsonValue, prefix = ''): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  const entries: [string, JsonValue][] = Array.isArray(obj)
    ? obj.map((v, i) => [String(i), v])
    : Object.entries(obj as JsonObject);
  for (const [k, v] of entries) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') {
      const sub = flatten(v, key);
      // An empty object/array leaf (`"foo": {}` / `"foo": []`) recurses to nothing
      // and would DROP the key — vanishing from key-parity AND the invalid-value
      // check, so a blank section ships silently. Preserve the key with its raw
      // (non-string) value so `invalidValueKeys` flags it. (Story 20.2 Step-I.)
      if (Object.keys(sub).length === 0) {
        out[key] = v;
      } else {
        Object.assign(out, sub);
      }
    } else {
      out[key] = v;
    }
  }
  return out;
}

// A BCP-47-ish locale dir name: language (2–3 lower) + optional script (`-Xxxx`, 4 letters) +
// optional region (`-XX` 2 letters OR `-999` 3 digits). Accepts `en`, `pt-BR`, `zh-Hans`,
// `zh-Hans-CN` (script+region), and `es-419` (UN M49 numeric region) — the last two were
// silently dropped by the earlier `(-[A-Za-z]{2,4})?` form (no script+region, no numeric
// region), quietly excluding a real locale from every check. Still filters non-locale subdirs
// (`__snapshots__`, `_shared`) that would otherwise emit spurious drift failures. (20.2 Step-I.)
const LOCALE_NAME_RE = /^[a-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|\d{3}))?$/;

/** Lists the locale directories (e.g. `en`, `de`) under `locales/`. */
function listLocales(): string[] {
  return fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && LOCALE_NAME_RE.test(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * Loads every namespace JSON for a locale into one flat map, namespace-prefixed
 * (`common.ok`, `book.title`, …) to mirror how i18next addresses `ns:key`.
 */
function loadLocale(locale: string): Record<string, JsonValue> {
  const dir = path.join(LOCALES_DIR, locale);
  const flat: Record<string, JsonValue> = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const ns = path.basename(file, '.json');
    const content = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as JsonObject;
    Object.assign(flat, flatten(content, ns));
  }
  return flat;
}

/** Collapses a plural-variant key (`x_one`, `x_other`) to its stem; others unchanged. */
function stem(key: string): string {
  return key.replace(PLURAL_SUFFIX_RE, '');
}

/** The set of canonical keys (plural variants collapsed to their stem). */
function canonicalKeys(flat: Record<string, JsonValue>): Set<string> {
  return new Set(Object.keys(flat).map(stem));
}

/** The set of plural stems in a flat map (keys carrying a `_one`/`_other`/… suffix). */
function pluralStems(flat: Record<string, JsonValue>): Set<string> {
  return new Set(
    Object.keys(flat)
      .filter((k) => PLURAL_SUFFIX_RE.test(k))
      .map(stem)
  );
}

/**
 * The `{{token}}` variable names referenced by a value, as a MULTISET (sorted, with
 * duplicates preserved). Captures every `{{…}}` form: plain (`{{name}}`), formatted
 * (`{{count, number}}` → `count`), and the unescaped prefix (`{{- html}}` → `html`).
 * A multiset (not a Set) so a translation that DROPS or DUPLICATES a repeated token —
 * `{{name}} … {{name}}` collapsed to one `{{name}}` — is caught, not hidden by set-union
 * (Story 20.2 Step-I). Non-string values have no tokens.
 */
function tokenMultiset(value: JsonValue): string[] {
  const out: string[] = [];
  if (typeof value !== 'string') return out;
  const re = /\{\{([^}]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    const name = m[1]
      .trim()
      .replace(/^[-+]/, '') // i18next unescape/keep prefix
      .split(',')[0] // drop the ", format" suffix
      .trim();
    if (name) out.push(name);
  }
  return out.sort();
}

/** Leaf keys whose value is not a non-empty string (empty, null, number, boolean, array element). */
function invalidValueKeys(flat: Record<string, JsonValue>): string[] {
  return Object.entries(flat)
    .filter(([, v]) => typeof v !== 'string' || v.trim() === '')
    .map(([k]) => k)
    .sort();
}

const locales = listLocales();
const en = loadLocale('en');
const nonEnLocales = locales.filter((l) => l !== 'en');

describe('locale parity', () => {
  it('has an `en` base locale', () => {
    expect(locales).toContain('en');
  });

  // Runs for EVERY locale, including en-only — a blank/`null`/non-string leaf in any
  // bundle is a defect regardless of how many locales exist.
  describe.each(locales)('locale "%s"', (locale) => {
    it('has no empty or non-string leaf values', () => {
      expect(invalidValueKeys(loadLocale(locale))).toEqual([]);
    });
  });

  // `en`'s OWN plural completeness — the guard for the only bundle that ships today.
  // A ternary→plural conversion that produced `books_one` but no `books_other` would
  // otherwise render the raw key at runtime with zero tsc/lint/test signal.
  it('every `en` plural stem carries all English plural categories', () => {
    const required = new Intl.PluralRules('en', { type: 'cardinal' }).resolvedOptions()
      .pluralCategories;
    const missing: string[] = [];
    for (const s of pluralStems(en)) {
      for (const cat of required) {
        if (!(`${s}_${cat}` in en)) missing.push(`${s}_${cat}`);
      }
    }
    expect(missing.sort()).toEqual([]);
  });

  // Retained for the degenerate `en`-only tree (jest's `describe.each` rejects an empty
  // table). Inert since 20.4 shipped `fr`; the block below is the live guard.
  if (nonEnLocales.length === 0) {
    it('has only the en base locale (nothing to compare yet)', () => {
      expect(locales).toEqual(['en']);
    });
  }

  (nonEnLocales.length > 0 ? describe.each(nonEnLocales) : describe.each([['__skip__']]))(
    'locale "%s" vs en',
    (locale) => {
      if (locale === '__skip__') return;
      const target = loadLocale(locale);
      const enCanonical = canonicalKeys(en);
      const targetCanonical = canonicalKeys(target);

      it('has zero missing keys vs en', () => {
        const missing = [...enCanonical].filter((k) => !targetCanonical.has(k)).sort();
        expect(missing).toEqual([]);
      });

      it('has no extra keys vs en', () => {
        const extra = [...targetCanonical].filter((k) => !enCanonical.has(k)).sort();
        expect(extra).toEqual([]);
      });

      it('matches interpolation tokens per key', () => {
        const mismatches: string[] = [];
        // Iterated over the TARGET's keys, not `en`'s. Driving the loop from `en` (as this did
        // until Story 20.4) leaves a target-only plural variant unchecked whenever the `en` key it
        // stems from is itself present: `en` carries `books_one` + `books_other`, both of which
        // exist in the target, so a French `books_many` that dropped `{{count}}` was never looked
        // at — and `_many`/`_few` are exactly the forms `en` can never supply, i.e. the ones the
        // model had to invent. Every target key is held to the `en` value of the same STEM: the
        // exact key when it exists, else the stem's `_other` form, so a locale that splits a
        // non-plural `en` key into `_one`/`_few`/`_other` is still fully covered — the case the
        // 20.2 Step-I fix was reaching for. A target-only key with no `en` stem at all is already
        // a failure of the "no extra keys" check above.
        //
        // ⚠️ The fallback is `_other` SPECIFICALLY, not "any variant of the stem". Picking an
        // arbitrary variant (the first in insertion order, i.e. `_one`) breaks on the commonest
        // English plural idiom — an untokenized singular beside a tokenized plural,
        // `books_one: "1 book"` / `books_other: "{{count}} books"` — where a CORRECT French
        // `books_many: "{{count}} livres"` would be compared against `"1 book"` and reported as a
        // mismatch, reddening CI for every shipped locale on a routine `en` copy edit (while a
        // `books_many` that genuinely DROPPED `{{count}}` would pass). `_other` is the generic plural
        // and is present for every real plural group (the `en` completeness check above guarantees
        // it). Latent today only because all 13 `en` stems happen to be token-symmetric.
        // `lib/translate-ui-bundle.ts`'s `otherFormFor` is the generation-time mirror of this.
        for (const [tKey, tValue] of Object.entries(target)) {
          const enValue = tKey in en ? en[tKey] : en[`${stem(tKey)}_other`];
          if (enValue === undefined) continue;
          // JSON compare of the sorted multisets — order-independent, duplicate-sensitive.
          if (JSON.stringify(tokenMultiset(tValue)) !== JSON.stringify(tokenMultiset(enValue))) {
            mismatches.push(tKey);
          }
        }
        expect(mismatches.sort()).toEqual([]);
      });

      it('has all required plural categories for every plural stem', () => {
        const required = new Set(
          new Intl.PluralRules(locale, { type: 'cardinal' }).resolvedOptions().pluralCategories
        );
        // Union of stems that are plural in `en` OR in the target — so a locale that
        // introduces a plural form for a key non-plural in `en` (e.g. `{{count}}`-bearing
        // keys with no en plural) is still held to its own required categories.
        const stems = new Set([...pluralStems(en), ...pluralStems(target)]);
        const missing: string[] = [];
        for (const s of stems) {
          for (const cat of required) {
            if (!(`${s}_${cat}` in target)) missing.push(`${s}_${cat}`);
          }
        }
        expect(missing.sort()).toEqual([]);
      });
    }
  );
});
