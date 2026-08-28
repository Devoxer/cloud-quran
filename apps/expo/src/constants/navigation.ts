// ⚠️ Type-only, so this stays a leaf module at runtime: `IconName` is erased by tsc and no
// require edge to the UI layer exists in the bundle. What it buys is the same guarantee the
// old NativeTabs types gave — a tab naming a glyph that is not in the semantic registry is a
// COMPILE error, not a blank icon.
import type { IconName } from '@/components/ui/icon-registry';

/**
 * Chrome-action sizing convention (Story 17.4.2 Thread A, re-premised by story 6-6): consistent
 * sizing for the icon buttons OUR OWN header carries — `AppHeader`'s back control and its
 * `leading` / `trailing` slots. There is no native stack header anywhere any more (story 6-6
 * replaced it with `components/ui/AppHeader` on every platform), so these are the app's only
 * header actions. One size + one gap so the header chrome reads uniform.
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
 * Gap between adjacent header action buttons — the ONE value every header action
 * row uses so the action spacing is identical everywhere. Kept tight per device review.
 */
export const HEADER_ACTION_GAP = 4;

/**
 * The visible height of one chrome bar's own content — `AppHeader` and `AppTabBar` are each this
 * tall, EXCLUDING the safe-area inset they sit above/below (their rendered height is
 * `CHROME_BAR_HEIGHT + insets.top|bottom`).
 *
 * ⚠️ THIS IS THE TAB BAR'S HEIGHT TOO, AND IT IS OURS — NOT A PLATFORM MEASUREMENT. Story 6-0's
 * `useTabBarHeight()` carried `ios: 49`, `android: 80` and an iPad width test, all measurements
 * of `NativeTabs`' own chrome; story 6-6 deleted the hook with the bar it measured. Our bar is
 * one row, bottom-docked, the same height on every platform and at every window width — Slide
 * Over and Split View change nothing, because nothing moves the bar off the bottom edge (the
 * iPad/desktop sidebar is epic 9's, and IT re-opens the question, not this constant).
 *
 * ⚠️ CONSUMED, NOT MERELY EXPORTED — the `tab-bar-covers-last-verse` lesson. The reading
 * surfaces reserve `CHROME_BAR_HEIGHT + insets.{top,bottom}` in their list padding permanently
 * (`(tabs)/read.tsx`, chrome overlays without shifting content), and the settings shell
 * (`(tabs)/(profile)/_layout.tsx`) places both bars IN layout, so nothing there can be covered.
 */
export const CHROME_BAR_HEIGHT = 56;

// Routes use URL paths (route groups like (tabs) are stripped by Expo Router).
// ⚠️ Keeping this union tight is deliberate — it makes a tab pointing at a deleted route a
// compile error rather than a build that silently produces no bundle (`expo export` emits
// NOTHING for a tab whose segment does not exist — the failure commit 38db2cb repaired).
// Widen it when a route lands; never loosen it to `string`.
export type TabRoute = '/' | '/read' | '/bookmarks' | '/account';

export interface TabConfig {
  /** The route segment under `(tabs)/` — a file base name or a group directory. Asserted
   * against the filesystem by `route-integrity.test.ts`. */
  name: string;
  /** URL path of the tab home (the group name is stripped; `(tabs)/index.tsx` → `/`). */
  href: TabRoute;
  /**
   * i18n key (in the `navigation` namespace) for the tab label, rendered via
   * `t(tab.titleKey)` in `AppTabBar`. A key, not display text — this module evaluates before
   * i18n, so it can't call `t()` itself.
   */
  titleKey: `tabs.${'mushaf' | 'read' | 'bookmarks' | 'settings'}`;
  /** Semantic icon name — `components/ui/icon-registry` resolves it per platform (SF Symbol on
   * iOS, Ionicons on Android + web), and tsc rejects a name that exists on neither. */
  icon: IconName;
}

/**
 * The mushaf IS the group index: it serves `/`, which is what makes it the home surface with no
 * redirect hop (story 6-6 deleted `app/index.tsx` the moment this landed — a group index serving
 * `/` directly is one hop shorter and cannot go stale).
 */
const MUSHAF_TAB: TabConfig = {
  name: 'index',
  href: '/',
  titleKey: 'tabs.mushaf',
  icon: 'book',
};

const READ_TAB: TabConfig = {
  name: 'read',
  href: '/read',
  titleKey: 'tabs.read',
  icon: 'view-list',
};

const BOOKMARKS_TAB: TabConfig = {
  name: 'bookmarks',
  href: '/bookmarks',
  titleKey: 'tabs.bookmarks',
  // The OUTLINE glyph, deliberately: the filled `bookmark` is the verse toggle's "saved" state
  // (story 6-4), and the selected-tab cue is already the accent tint (`AppTabBar`'s rule 2).
  icon: 'bookmark-outline',
};

const SETTINGS_TAB: TabConfig = {
  // The group is still named `(profile)` because that is the directory the seed left behind;
  // its home is `account.tsx`, the settings list. The label has always said Settings.
  name: '(profile)',
  href: '/account',
  titleKey: 'tabs.settings',
  icon: 'settings-outline',
};

/**
 * Single source of truth for tab navigation configuration — Cloud Quran's own information
 * architecture as of story 6-6. Consumed by `components/ui/AppTabBar`, which draws the ONE tab
 * bar every platform gets; the navigator in `(tabs)/_layout.tsx` renders no bar of its own.
 *
 * ⚠️ ORDER IS MEANING: `TABS[0]` is the home surface (`HOME_HREF` reads it), and the app opens
 * on the mushaf at the reader's last-read position — opening on Settings was an artefact of
 * this table having exactly one entry, not a decision. Bookmarks landed in 6-4 exactly as this
 * table reserved: together with its route, `(tabs)/bookmarks.tsx`. Any further tab lands the
 * same way — TOGETHER WITH ITS ROUTE, never ahead of it.
 */
export const TABS: TabConfig[] = [MUSHAF_TAB, READ_TAB, BOOKMARKS_TAB, SETTINGS_TAB];

/**
 * Where "open the app" goes — the first tab's home, read from the table above rather than written
 * anywhere as a path (story 6-0; the table finally grew past one entry in 6-6).
 *
 * ⚠️ EVERY SURFACE THAT MEANS "GO HOME" READS THIS — `+not-found.tsx` today — so the home surface
 * moves by reordering the table, with no other edit. `TABS` is a non-empty literal, but its TYPE
 * is not, so the fallback keeps a future empty table pointing at a real route rather than at
 * `undefined`. Since 6-6 the home IS `/` (the mushaf serves it directly), so the old "never `/`,
 * it is a redirect" rule is retired with the redirect it guarded against.
 */
export const HOME_HREF: TabRoute = TABS[0]?.href ?? '/';

/**
 * The reading-mode tab's home — the mushaf↔reading toggle in `ReadingChrome` navigates between
 * this and `HOME_HREF`. Read from the table for the same reason `HOME_HREF` is.
 */
export const READ_HREF: TabRoute = READ_TAB.href;
