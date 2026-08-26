/**
 * Profile Tab Stack Navigator
 *
 * CHANGE-005-B: Fix Profile Navigation Layout
 * Issue: Expo Router auto-discovered profile files as separate tabs
 * showing "profile/index" and "profile/notif..." instead of proper tab labels.
 *
 * Solution: Add _layout.tsx to establish proper Stack nesting under Profile tab.
 */

import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LIQUID_GLASS_STACK_OPTIONS } from '@/lib/nav-theme';
import { useTheme } from '@/lib/theme';

// Story 17.17: this tab is now the `(profile)` GROUP, so the shared `book/[id]`
// route materializes into its Stack (a book opened from Profile — e.g. via
// History — stays in the Profile tab). (Story 19.6: `player` hoisted to a
// root-level modal in `app/_layout.tsx` — no longer a per-tab route.) Home route
// renamed `index.tsx` → `profile.tsx` to keep the `/profile` URL.
export const unstable_settings = {
  // story 5-2 review: this anchored on 'profile', whose route file went with the InstantDB
  // account screen. An initialRouteName naming a missing route silently falls back to
  // alphabetical order, so the tab would have opened privacy-settings rather than feedback.
  //
  // story 5-5: moved from 'feedback' to 'account'. The tab is labelled SETTINGS and it opened
  // straight onto the Send Feedback form, while privacy-settings was reachable from nowhere in
  // the UI at all. `account.tsx` is the settings list — it carries the account row this story
  // adds and links to the other two, so nothing became unreachable in the move.
  initialRouteName: 'account',
};

export default function ProfileLayout() {
  const { t } = useTranslation('navigation');
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        // Story 17.3 (iPhone smoke pass 7): native Stack header for
        // profile sub-screens. Liquid Glass on iOS via the centralised
        // util — Android + web get native solid chrome.
        ...LIQUID_GLASS_STACK_OPTIONS,
        headerShown: true,
        // Story 17.3.5 follow-up #3 (user direction): no text in any
        // back button — chevron alone is the affordance.
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background.primary },
      }}
    >
      {/* story 5-1 code review: nine Stack.Screen registrations were removed from here —
          `profile`, `playback-settings`, `notification-settings`, `language-settings/index`,
          `stats`, `book`, `note`, `quiz/[bookId]` and `quotes`. Every one of their route files
          went with the wisdom-fruits domain deletion, so expo-router logged
          `[Layout children]: No route named "…" exists in nested children` NINE TIMES on every
          launch and dropped them. They survived the first review pass because the root
          `_layout.tsx` was cleaned while this nested layout was not, and the guard added in that
          same pass only read the root file — see `__tests__/app/route-integrity.test.ts`, which
          now walks every `_layout.tsx` in the tree.

          What remains is what exists: feedback (the tab home) and privacy-settings. Epic 6
          rebuilds this group as Cloud Quran's Settings. */}
      {/* story 5-5: `account` is the tab home — the settings list and the ONE door to sign-in. */}
      <Stack.Screen
        name="account"
        options={{ title: t('titles.account'), headerLargeTitle: true }}
      />
      {/* story 5-7 (amended 2026-08-26): there is NO consent route. A `consent` screen sat
          between `account` and `sign-in` for one day; it gated a navigation while sync already ran
          for every anonymous guest, so it interrupted the reader without protecting anybody. The
          disclosure is inline on `sign-in` and the opt-out is a switch on `data`. */}
      <Stack.Screen name="sign-in" options={{ title: t('titles.signIn') }} />
      {/* story 5-7: export, delete-my-data and delete-my-account (FR28/FR28a/FR29). */}
      <Stack.Screen name="data" options={{ title: t('titles.data') }} />
      <Stack.Screen name="feedback" options={{ title: t('titles.feedback') }} />
      {/* Story 19.3: analytics opt-out toggle (device-local privacy choice). Story 5-7 turns
          this into the opt-IN crash-reporting surface `lib/privacyPrefs.ts` now expects. */}
      <Stack.Screen name="privacy-settings" options={{ title: t('titles.privacy') }} />
    </Stack>
  );
}
