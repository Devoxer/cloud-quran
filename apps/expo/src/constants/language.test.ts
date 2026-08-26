/**
 * Story 20.4 Step G — pairs the two halves of adding a UI language.
 *
 * Authoring a bundle is one command plus TWO manual data entries: register the locale in
 * `i18n/resources.ts` (which is what `AVAILABLE_UI_LANGUAGES` is derived from) and add its endonym
 * here. Nothing in the type system connects them — `UI_LANGUAGE_NATIVE_NAMES` is a
 * `Record<string, string>`, not keyed off `typeof resources` — and `uiLanguageLabel` falls back to the
 * code itself, so forgetting the second entry ships a picker row labelled `"de"` with no tsc, lint or
 * render-test signal. Under the just-in-time rule that second step is repeated once per language, one
 * language at a time, which is exactly the shape of thing that gets skipped.
 */

import { AVAILABLE_UI_LANGUAGES } from '@/i18n/resources';
import { BASE_LANGUAGE, UI_LANGUAGE_NATIVE_NAMES, uiLanguageLabel } from './language';

describe('UI_LANGUAGE_NATIVE_NAMES', () => {
  it('has an endonym for EVERY shipped UI language', () => {
    const missing = AVAILABLE_UI_LANGUAGES.filter((code) => !(code in UI_LANGUAGE_NATIVE_NAMES));
    expect(missing).toEqual([]);
  });

  it('has no endonym for a language the app does NOT ship chrome for', () => {
    // The inverse drift: a bundle removed (or an entry added ahead of its bundle) leaves a name for
    // a code the picker can never offer, which reads as "we support this" in every future review.
    const orphans = Object.keys(UI_LANGUAGE_NATIVE_NAMES).filter(
      (code) => !(AVAILABLE_UI_LANGUAGES as readonly string[]).includes(code)
    );
    expect(orphans).toEqual([]);
  });

  it('is each language’s OWN name, not the English one', () => {
    expect(UI_LANGUAGE_NATIVE_NAMES[BASE_LANGUAGE]).toBe('English');
    expect(UI_LANGUAGE_NATIVE_NAMES.fr).toBe('Français');
  });

  it('falls back to the code itself rather than rendering a blank row', () => {
    expect(uiLanguageLabel('zz')).toBe('zz');
  });
});
