/**
 * Typed resource keys (Story 20.2, AC8). Augments `CustomTypeOptions` with the `en` resource
 * shape + `defaultNS`, so every `t('ns:key')` / `useTranslation('ns')` call is
 * compile-time-checked: a missing, renamed, or misnamespaced key is a `tsc` error. This is one
 * of the three backstops (with the parity test + the jest i18n init) that make the large
 * extraction diff self-verifying.
 *
 * ⚠️ AUGMENT `i18next`, NOT `react-i18next` (epic-20 boundary review). `CustomTypeOptions` is
 * declared in `i18next/typescript/options.d.ts` and NOWHERE else — `react-i18next@17` re-exports
 * the resolved types but does not declare the interface. Augmenting `react-i18next` therefore
 * silently DECLARES A NEW, UNUSED interface instead of merging into the real one: it compiles,
 * it looks right, and every key check is inert. That is how this shipped from 20.2 (`acb2e08a`)
 * until the epic-20 boundary — a bogus `t('common:no.such.key')` type-checked clean, and neither
 * `lint-i18n` (checks only that copy goes THROUGH `t()`) nor the parity test (compares bundle to
 * bundle) can see a key that exists in neither. `src/i18n/typed-keys.type-assertions.ts` now
 * pins it. (That filename was wrong here — `typed-keys.test-d.ts` — until the boundary's round 2:
 * a dead pointer is the one defect that specifically defeats the purpose of a pin, since its whole
 * job is to be findable by whoever breaks the augmentation next.)
 */
import 'i18next';

import type { defaultNS, resources } from './index';

/**
 * The namespace set a bare `useTranslation()` / `i18n.t()` is typed against.
 *
 * RUNTIME `defaultNS` stays `'common'` (`i18n/index.ts`) — this is a TYPE-ONLY widening, and the
 * two are deliberately different. i18next types a `t` bound to namespace `N` as accepting `N`'s
 * bare keys plus `` `N:${key}` ``, and NOTHING from another namespace. This app calls
 * `useTranslation()` with no argument at 123 of its 138 sites and then addresses every namespace
 * by explicit `ns:key` prefix, so typing the bare hook as `'common'` alone would reject ~770
 * correct call sites. Listing every namespace here makes the prefixed form check for real while
 * leaving the 81 unprefixed `common` calls resolving exactly as they do at runtime — `'common'`
 * is first, which is what i18next uses for a bare key.
 */
type DefaultNamespaces = readonly [
  typeof defaultNS,
  ...Exclude<keyof (typeof resources)['en'], typeof defaultNS>[],
];

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: DefaultNamespaces;
    nsSeparator: ':';
    keySeparator: '.';
    resources: (typeof resources)['en'];
  }
}
