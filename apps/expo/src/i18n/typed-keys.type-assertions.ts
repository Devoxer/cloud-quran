/**
 * Compile-time pin for Story 20.2 AC-8's typed `t()` keys (epic-20 boundary review).
 *
 * WHY THIS FILE EXISTS. The `CustomTypeOptions` augmentation in `react-i18next.d.ts` shipped for
 * the whole of Epic 20 pointing at the WRONG MODULE (`react-i18next` instead of `i18next`), which
 * does not merge into anything — it silently declared a new, unused interface. The result compiled,
 * looked correct, and checked NOTHING: `t('common:no.such.key')` type-checked clean. Nothing else
 * could catch it — `lint-i18n` only checks that copy goes THROUGH `t()`, and `parity.test.ts` only
 * compares bundle to bundle, so a key present in NEITHER locale is invisible to both.
 *
 * HOW THE PIN WORKS. `@ts-expect-error` is itself an error when the line below it does NOT error
 * ("Unused '@ts-expect-error' directive"). So if the augmentation ever goes inert again — a module
 * rename, an i18next major moving the interface, a botched refactor — these bogus keys stop being
 * rejected, the directives become unused, and `pnpm typecheck` FAILS. A fixture cannot falsify a
 * claim about the type system; only the type system can.
 *
 * This file is type-only: it exports nothing, is imported by nothing, and never reaches a bundle.
 * It is not named `*.test.ts` so jest does not collect it — `tsc` is the runner here.
 */
import i18n from './index';

// A namespaced key that exists in no bundle must be rejected.
// @ts-expect-error — 'common:this.key.does.not.exist' is not a real key
i18n.t('common:this.key.does.not.exist');

// A real key under the WRONG namespace must be rejected (this is the misnamespacing AC-8 names).
// @ts-expect-error — 'actions.tryAgain' lives in `common`, not `player`
i18n.t('player:actions.tryAgain');

// An unnamespaced key that is not in the default namespace (`common`) must be rejected.
// @ts-expect-error — 'sections.shuffle' is a `discover` key, and bare keys resolve against `common`
i18n.t('sections.shuffle');

// A whole namespace that does not exist must be rejected.
// @ts-expect-error — there is no `nosuchns` namespace
i18n.t('nosuchns:whatever');

// ...and the positive control: real keys, both prefixed and bare, must still compile.
i18n.t('common:actions.tryAgain');
i18n.t('actions.tryAgain');
i18n.t('discover:sections.shuffle');
