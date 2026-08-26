/**
 * Cross-platform navigation header options.
 *
 * Story 17.3 (iPhone smoke pass 7) — centralised the iOS-specific
 * Liquid Glass opt-in so it lives in ONE place. Every migrated Stack
 * layout spreads `LIQUID_GLASS_STACK_OPTIONS` in its `screenOptions`
 * instead of repeating `Platform.select` per layout.
 *
 * Why centralise:
 * - Solo dev + AI + template scale → per-layout `Platform.select` is N
 *   places to maintain. One config util = one edit point. (User
 *   directive 2026-05-26: "i dont want divergeance thats gonna add
 *   maintenance".)
 *
 * Why iOS-only:
 * - `headerTransparent: true` on iOS lets the iOS 26 system
 *   `UINavigationBarAppearance` render its default Liquid Glass
 *   floating-capsule chrome. NOT setting `headerBlurEffect` is
 *   important — that prop forces the legacy iOS-17/18 `UIBlurEffect`
 *   flat-bar chrome and SUPPRESSES iOS 26's default Liquid Glass
 *   (per react-native-screens 4.25 docs).
 * - On Android, `headerTransparent: true` works at the toolbar level
 *   BUT `contentInsetAdjustmentBehavior` is iOS-only, so the
 *   ScrollView content overlaps the toolbar (top items hidden behind
 *   chrome). The native Android default — solid Material 3 toolbar —
 *   renders cleanly with no overlap. Don't fight it.
 * - On web, expo-router renders a JS `Header`; the native solid
 *   chrome is the safer + more accessible default.
 *
 * Net result on each platform with this util:
 * - iOS 26: floating Liquid Glass capsules, content scrolls under
 *   (auto-inset via `contentInsetAdjustmentBehavior="automatic"` on
 *   the scroll view).
 * - Android: solid Material 3 toolbar, content starts below it.
 * - Web: solid JS header, content starts below it.
 */

import { Platform } from 'react-native';

// Intentionally NO explicit `NativeStackNavigationOptions` annotation —
// that type lives at `expo-router/build/react-navigation/native-stack/types`
// (deep internal path, no clean re-export) and tying this util to it
// would make us brittle to expo-router internal moves. The literal
// returned by `Platform.select` is structurally compatible with the
// `screenOptions` slot at every Stack spread site; TS validates the
// shape there.
export const LIQUID_GLASS_STACK_OPTIONS = Platform.select({
  ios: {
    headerTransparent: true,
    headerStyle: { backgroundColor: 'transparent' as const },
  },
  default: {},
}) as { headerTransparent?: boolean; headerStyle?: { backgroundColor: string } };

/**
 * For the Bottom Tabs `headerBackground` BlurView, see the
 * `Platform.OS === 'ios'` guard in `(tabs)/_layout.tsx`. BlurView lives
 * there alongside the `<Tabs.Screen>` config; this util stays
 * dep-light so it can be spread into any Stack layout's `screenOptions`
 * without pulling in `expo-blur`.
 */

/**
 * Story 17.17 — `book/[id]` is an Expo Router **shared route** (array-group
 * `(discover,feed,library,profile)/`), so it materializes once into EACH tab
 * group's Stack. Every group layout registers it with these identical options,
 * so the chrome is uniform whichever tab the user opened the book from.
 * Self-contained (carries `headerShown` + `headerBackButtonDisplayMode`) so it
 * renders the same regardless of a group Stack's own `screenOptions`.
 *
 * The nested book Stack (`book/[id]`) renders `headerShown: false`, so this
 * parent registration owns the visible Liquid Glass header + back chevron; book
 * detail overrides title/headerRight at mount via
 * `navigation.getParent()?.setOptions`. The non-empty placeholder title (the
 * translated `navigation:titles.book`, set by each consumer — see below) keeps the
 * iOS 26 header from collapsing during the paint window.
 *
 * i18n (Story 20.2): the placeholder `title` is NOT baked here — this const is
 * module-load-evaluated BEFORE `initI18n()` runs, so a `t()`/`i18n.t()` at this
 * scope would resolve to the raw key. Every consumer spreads this and sets
 * `title: t('navigation:titles.book')` at render (where i18n is initialized), so
 * even the paint-window placeholder localizes in every shipped language (Story 20.4 added the
 * first non-English one).
 */
export const SHARED_BOOK_STACK_OPTIONS = {
  ...LIQUID_GLASS_STACK_OPTIONS,
  headerShown: true,
  headerBackButtonDisplayMode: 'minimal' as const,
};

/**
 * Story 23.14 — `note/[id]` + `note/new` is an Expo Router **shared route**
 * (array-group `(discover,feed,library,profile)/note/`), so it materializes once
 * into EACH tab group's Stack (reachable from book detail, which is itself
 * cross-tab). Every group layout registers it with these identical options.
 *
 * INVERSE of `book/`'s header ownership (deliberate — Story 23.14 Step C): the
 * note inner Stack (`note/_layout.tsx`) OWNS its native header, so the parent
 * group registration hides its own header (`headerShown: false`) — no double
 * header. Each note screen sets title + Cancel/Save/delete on the NEAREST Stack
 * via `useNavigation().setOptions` (NOT `getParent()` — that idiom is only for
 * `book/`, whose inner Stack is `headerShown:false` so the PARENT owns the header).
 */
export const SHARED_NOTE_STACK_OPTIONS = {
  headerShown: false,
};

/**
 * Story 33.1 — both quiz runners (`quiz/[bookId]` per-book + `quizzes/[scope]` pool) play IN-TAB
 * (owner call 2026-07-18: keep the tab bar + mini-player visible so the user can navigate away and
 * back mid-quiz, rather than being forced to dismiss a full-screen modal). Standard pushed screens
 * in the tab navigator → the native **back chevron** dismisses (plus swipe-back + the tab bar); no
 * modal, no explicit close button. Both are SINGLE-FILE routes (no inner `quiz/_layout.tsx`) so the
 * screen's nearest navigator (the group / `(quizzes)` Stack) owns the header. The book identity is
 * an in-CONTENT card (`QuizRunner`), NOT stuffed into the header; the only dynamic header piece is a
 * small elapsed timer wired as `headerRight` via `useNavigation().setOptions`. Fallback title
 * `navigation:titles.testYourself` (per-book) / per-scope (pool, overridden by the host
 * `<Stack.Screen>`).
 *
 * TRANSPARENT Liquid Glass header (like every other route). `QuizRunner`'s scroll clears it with the
 * app-standard `contentInsetAdjustmentBehavior="automatic"` (the framework computes the real inset
 * per device — iPad/web top tab bar included). The Next scroll-reset is a REMOUNT (keyed ScrollView),
 * NOT `scrollTo({y:0})` — under `automatic` the resting top is `y = -inset`, so `y:0` would tuck
 * content under the header (the old "Next tucks under" bug). Story 33.1 briefly stuffed the book
 * title + timer into the header as a TALL custom title; combined with the top tab bar that overlapped
 * the quiz body on iPad and crowded it on narrow web. A standard-height header + the in-body card + a
 * header-only timer removes all of that.
 *
 * The bottom of the scroll pads by `MINI_PLAYER_HEIGHT + insets.bottom` to clear the floating
 * mini-player + tab bar; the Next CTA scrolls WITH the answers (no pinned bar).
 *
 * i18n (Story 20.2): the fallback `title` is set by each consumer via
 * `t('navigation:titles.testYourself')` — see `SHARED_BOOK_STACK_OPTIONS` for why it is not baked here.
 */
export const SHARED_QUIZ_STACK_OPTIONS = {
  ...LIQUID_GLASS_STACK_OPTIONS,
  headerShown: true,
  headerBackButtonDisplayMode: 'minimal' as const,
};

/**
 * Story 30.1 — `/quotes` became an Expo Router **shared route** (array-group
 * `(discover,feed,library,profile)/quotes.tsx`) so it opens IN the current tab from
 * BOTH launch points: the Discover daily-quote card's "See all quotes" AND the
 * Library Quotes section's "See All" (`?tab=favorites`). Before, `/quotes` lived only
 * under `(discover)`, so the Library See-All jumped the user out of the Library tab.
 * A single-file screen (no inner Stack), so the PARENT group registration owns the
 * visible Liquid Glass header + title. Unlike `book`/`quiz`, the screen never overrides
 * this title, so `navigation:titles.quotes` is the SETTLED header the user sees.
 *
 * i18n (Story 20.2): the `title` is set by each consumer via `t('navigation:titles.quotes')`
 * — see `SHARED_BOOK_STACK_OPTIONS` for why it is not baked here.
 */
export const SHARED_QUOTES_STACK_OPTIONS = {
  ...LIQUID_GLASS_STACK_OPTIONS,
  headerShown: true,
  headerBackButtonDisplayMode: 'minimal' as const,
};

/**
 * Story 19.6 — the full player is now a ROOT-LEVEL modal route (`app/player.tsx`,
 * sibling of `(tabs)` / `subscription`), NOT a per-tab shared route. Hoisting it
 * out of the 17.17 in-tab design is what lets the modal cover the native NativeTabs
 * bottom bar on **Android** (a stack modal renders inside the activity, so an
 * in-tab modal left the bar visible; a root-level modal covers it on both
 * platforms — the Apple-Music / Spotify "now-playing is a root modal" pattern).
 * iOS already covered the tab bar via the UIKit modal; this keeps that and fixes
 * Android. Registered ONCE in `app/_layout.tsx` (mirroring `subscription`).
 *
 * `presentation: 'modal'` page sheet (Story 17.20): swipe-DOWN to dismiss
 * (Apple-Music idiom) + the chevron-down minimize. Placeholder title for the
 * iOS-26 header-collapse reason; AudioPlayer overrides it via `setOptions`.
 *
 * i18n (Story 20.2): the placeholder `title` is set by the consumer
 * (`RootLayoutNav` in `app/_layout.tsx`) via `t('navigation:titles.nowPlaying')`
 * — see `SHARED_BOOK_STACK_OPTIONS` for why it is not baked here.
 */
export const PLAYER_STACK_OPTIONS = {
  ...LIQUID_GLASS_STACK_OPTIONS,
  presentation: 'modal' as const,
  gestureEnabled: true,
  headerShown: true,
  headerBackButtonDisplayMode: 'minimal' as const,
};
