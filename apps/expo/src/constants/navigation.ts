import type { MaterialIcon, SFSymbolIcon } from 'expo-router/unstable-native-tabs';

/**
 * Header-action chrome convention (Story 17.4.2 Thread A): consistent sizing for
 * the in-`headerRight`/`headerLeft` icon buttons across every native Stack header
 * (Discover filter/search, book-detail download/note/collection, the filters
 * route's Reset/Apply). One size + one gap so the header chrome reads uniform.
 */
export const HEADER_ACTION_ICON_SIZE = 24;
/**
 * Box size for a header action button (a subtle circular touch surface, the
 * "good size" from the collection screen) — the ONE value every header action
 * uses so they're identical across screens. NOT 44 (too wide) and NOT boxless
 * (too small). hitSlop=6 brings the touch target to the 44pt HIG minimum.
 */
export const HEADER_ACTION_BUTTON_SIZE = 32;
/**
 * Gap between adjacent header action buttons — the ONE value every native Stack
 * header row uses (Discover, book-detail, the player, the filters route) so the
 * action spacing is identical everywhere. Kept tight per device review.
 */
export const HEADER_ACTION_GAP = 4;

/**
 * Per-platform icon mapping for native tab chrome.
 *
 * Spread the matching property onto `<NativeTabs.Trigger.Icon>`:
 *   <NativeTabs.Trigger.Icon sf={tab.icon.sf} md={tab.icon.md} />
 *
 * - `sf`: SF Symbol on iOS (rendered natively by UITabBar on iOS 13+).
 * - `md`: Material Symbol on Android (and Web via Google's Material font CDN,
 *   served through expo-router's Radix Tabs web fallback).
 */
export interface TabIconMapping {
  sf: NonNullable<SFSymbolIcon['sf']>;
  md: MaterialIcon['md'];
}

// Routes use URL paths (route groups like (tabs) are stripped by Expo Router)
// story 5-1: narrowed to the routes that exist after the seed. Epic 6 widens it to Cloud Quran's
// own tabs. Keeping this union tight is deliberate — it makes a tab pointing at a deleted route a
// compile error rather than a build that silently produces no bundle.
export type TabRoute = '/account';

export interface TabConfig {
  /**
   * Story 17.17: the NativeTabs.Trigger `name` is now the GROUP segment
   * (`(discover)` etc.) — each tab is an Expo Router route group so the shared
   * `book/[id]` + `player` routes (array-group `(discover,feed,library,profile)/`)
   * materialize into its Stack and open IN-tab.
   */
  name: string;
  /** URL path of the tab home (the group name is stripped; the home file keeps
   * the segment, e.g. `(discover)/discover.tsx` → `/discover`). */
  href: TabRoute;
  /**
   * i18n key (in the `navigation` namespace) for the tab label, rendered via
   * `t(tab.titleKey)` in `(tabs)/_layout.tsx` (Story 20.2). A key, not display
   * text — this module evaluates before i18n, so it can't call `t()` itself.
   */
  titleKey: `tabs.${'settings'}`;
  icon: TabIconMapping;
}

/**
 * Single source of truth for tab navigation configuration.
 * Consumed by `(tabs)/_layout.tsx` to render `<NativeTabs.Trigger>` entries.
 */
export const TABS: TabConfig[] = [
  // story 5-1: the wisdom-fruits tabs (discover/feed/quizzes/library) were deleted with their
  // features. Only `(profile)` survived the seed. Epic 6 replaces this list with Cloud Quran's
  // own information architecture — Read, Mushaf, Bookmarks, Settings — so treat this as a
  // placeholder shell, not a design. A tab whose group does not exist stops `expo export`
  // producing a bundle at all, which is why this list must never outrun the route tree.
  {
    // The group is still named `(profile)` because that is the directory the seed left behind.
    // story 5-5 gave it a real home: `account.tsx`, the settings list carrying the account row
    // and links to privacy + feedback. The LABEL has always said Settings; now the landing
    // screen is one, instead of the Send Feedback form. Epic 6 renames the directory as part of
    // Cloud Quran's own information architecture.
    name: '(profile)',
    href: '/account',
    titleKey: 'tabs.settings',
    icon: {
      sf: { default: 'gearshape', selected: 'gearshape.fill' },
      md: { default: 'settings', selected: 'settings' },
    },
  },
];
