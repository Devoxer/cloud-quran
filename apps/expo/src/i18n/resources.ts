/**
 * i18n resource LEAF (Story 20.3) — the bundles + the shipped-UI-language set.
 *
 * ⚠️ This module exists to break an import cycle, so keep it a LEAF: it imports the JSON
 * bundles and NOTHING else from the app. Both `i18n/index.ts` (which needs `resources` to
 * init i18next) and `lib/language.ts` (which needs `AVAILABLE_UI_LANGUAGES` to normalize the
 * persisted preference) import it, and neither imports the other's owner. Wiring
 * `lib/language.ts` → `@/i18n` instead would re-create the cycle through `initI18n`, so
 * `lib/language.ts` takes the i18next SINGLETON from `'i18next'` directly.
 *
 * Edge map (acyclic):
 *   i18n/resources.ts  → (JSON only)
 *   lib/language.ts    → i18n/resources.ts · i18next · lib/mmkv
 *   i18n/index.ts      → i18n/resources.ts · lib/language.ts · i18next · react-i18next
 *
 * `i18n/index.ts` re-exports `resources` + `defaultNS` so existing importers are unaffected.
 *
 * ⚠️ DECLARATION ORDER IS THE PICKER'S ON-SCREEN ORDER (Story 20.4 AC-6; since Story 20.6 that is
 * the ONE unified picker). `AVAILABLE_UI_LANGUAGES` below is `Object.keys(resources)` and
 * `useLanguageOptions` maps it straight to rows (filtering on `EXPOSED_LANGUAGES`, never reordering),
 * so the order the locales are declared in IS what the user scrolls. The rule: **`en` first, then every
 * target sorted by code.** It is written down here because bundles arrive ONE LANGUAGE AT A TIME
 * (just-in-time — a language's chrome is authored alongside its content and TTS, Story 20.4), so no
 * later story ever re-derives it; each addition just has to slot into the right place.
 */

import a11y from './locales/en/a11y.json';
import book from './locales/en/book.json';
import common from './locales/en/common.json';
import discover from './locales/en/discover.json';
import feed from './locales/en/feed.json';
import library from './locales/en/library.json';
import navigation from './locales/en/navigation.json';
import notes from './locales/en/notes.json';
import notifications from './locales/en/notifications.json';
import player from './locales/en/player.json';
import profile from './locales/en/profile.json';
import quiz from './locales/en/quiz.json';
import quotes from './locales/en/quotes.json';
import stats from './locales/en/stats.json';
import esA11y from './locales/es/a11y.json';
import esBook from './locales/es/book.json';
import esCommon from './locales/es/common.json';
import esDiscover from './locales/es/discover.json';
import esFeed from './locales/es/feed.json';
import esLibrary from './locales/es/library.json';
import esNavigation from './locales/es/navigation.json';
import esNotes from './locales/es/notes.json';
import esNotifications from './locales/es/notifications.json';
import esPlayer from './locales/es/player.json';
import esProfile from './locales/es/profile.json';
import esQuiz from './locales/es/quiz.json';
import esQuotes from './locales/es/quotes.json';
import esStats from './locales/es/stats.json';
import frA11y from './locales/fr/a11y.json';
import frBook from './locales/fr/book.json';
import frCommon from './locales/fr/common.json';
import frDiscover from './locales/fr/discover.json';
import frFeed from './locales/fr/feed.json';
import frLibrary from './locales/fr/library.json';
import frNavigation from './locales/fr/navigation.json';
import frNotes from './locales/fr/notes.json';
import frNotifications from './locales/fr/notifications.json';
import frPlayer from './locales/fr/player.json';
import frProfile from './locales/fr/profile.json';
import frQuiz from './locales/fr/quiz.json';
import frQuotes from './locales/fr/quotes.json';
import frStats from './locales/fr/stats.json';

export const defaultNS = 'common' as const;

/**
 * All shipped bundles, keyed by language. `common` / `a11y` / `navigation` are the
 * always-present core; the rest mirror `src/features/*`. Every namespace is statically
 * imported — RN bundles are static, so there is no lazy backend.
 *
 * Declaration order: `en` first, then targets sorted by code (see the header — it is the picker's
 * on-screen order). Non-`en` bundles are produced by `tools/content-pipeline/translate-ui-bundle.ts`
 * and gated by `parity.test.ts`; the namespace key order within each locale mirrors `en`'s.
 */
export const resources = {
  en: {
    common,
    a11y,
    navigation,
    discover,
    library,
    feed,
    player,
    book,
    notes,
    quotes,
    quiz,
    stats,
    profile,
    notifications,
  },
  es: {
    common: esCommon,
    a11y: esA11y,
    navigation: esNavigation,
    discover: esDiscover,
    library: esLibrary,
    feed: esFeed,
    player: esPlayer,
    book: esBook,
    notes: esNotes,
    quotes: esQuotes,
    quiz: esQuiz,
    stats: esStats,
    profile: esProfile,
    notifications: esNotifications,
  },
  fr: {
    common: frCommon,
    a11y: frA11y,
    navigation: frNavigation,
    discover: frDiscover,
    library: frLibrary,
    feed: frFeed,
    player: frPlayer,
    book: frBook,
    notes: frNotes,
    quotes: frQuotes,
    quiz: frQuiz,
    stats: frStats,
    profile: frProfile,
    notifications: frNotifications,
  },
} as const;

/**
 * The languages the app actually ships chrome bundles for — the candidate set the language
 * picker filters (by the compile-time `EXPOSED_LANGUAGES`, which is a strict subset: a bundle can
 * ship before its language is offered) and the normalization target for the persisted preference.
 * Derived from `resources`, so the list grows on data alone each time a language's chrome is
 * authored; nothing else has to change.
 */
export const AVAILABLE_UI_LANGUAGES = Object.keys(resources) as (keyof typeof resources)[];
