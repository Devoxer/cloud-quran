/**
 * The settings shell — a native Stack wrapped in OUR chrome (story 6-6).
 *
 * ⚠️ NO NATIVE HEADER RENDERS HERE ANY MORE. `headerShown: false` on this Stack is not
 * "chromelessness" — the header these screens get is `components/ui/AppHeader`, mounted ONCE
 * above the navigator, with the title resolved from the focused segment. The tab bar is
 * `AppTabBar` below it. Both bars occupy layout on this shell (nothing here is immersive), so
 * no screen needs to reserve padding for them — unlike the reading surfaces, where the same two
 * components overlay and the lists pad permanently.
 *
 * ⚠️ NAVIGATION BEHAVIOUR STAYS NATIVE: the Stack is `react-native-screens`' native stack, so
 * push transitions and the iOS back-swipe survive the header's removal. The back CONTROL is
 * `AppHeader`'s, history-conditional via `router.canGoBack()` — present on a pushed sub-screen,
 * absent on the tab home (`backBehavior="none"` on the tab navigator is what keeps a tab switch
 * out of that answer).
 *
 * ⚠️ `initialRouteName` must name a route that EXISTS — a missing anchor silently falls back to
 * alphabetical order (this file shipped that defect twice; `route-integrity.test.ts` checks
 * every layout's anchor against the filesystem).
 */

import { Stack, useGlobalSearchParams, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AppHeader, AppTabBar } from '@/components/ui';
import { reciterDisplayName } from '@/features/audio';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';

export const unstable_settings = {
  // story 5-5: `account.tsx` is the settings list — the tab is labelled Settings and this is
  // the screen that makes it one.
  initialRouteName: 'account',
};

/** The focused segment → its header title key (the `navigation` namespace's `titles.*`). */
const TITLE_KEYS = {
  account: 'titles.account',
  'sign-in': 'titles.signIn',
  data: 'titles.data',
  feedback: 'titles.feedback',
  'privacy-settings': 'titles.privacy',
  appearance: 'titles.appearance',
  recitation: 'titles.recitation',
  language: 'titles.language',
  'reciter-downloads': 'titles.reciterDownloads',
} as const;
type TitleKey = (typeof TITLE_KEYS)[keyof typeof TITLE_KEYS];

/**
 * The one leaf whose title is DATA rather than a key (2026-09-11).
 *
 * ⚠️ THE RECITER-DOWNLOADS SCREEN IS ABOUT ONE VOICE, AND THE BAR IS WHERE IT SAYS SO. It used
 * to read "Downloads" over a body that repeated the reciter's name as an h2 — two headings, one
 * subject (owner: "the reciter's name is already the screen title's subject, do not repeat it").
 * `titles.reciterDownloads` stays in `TITLE_KEYS` and stays the fallback: it is what a link with
 * no `id` renders, and what every OTHER leaf still resolves through.
 *
 * ⚠️ `useGlobalSearchParams`, NOT `useLocalSearchParams`. A layout is not the focused route, so
 * the local hook answers with the layout's own (empty) params; the global one tracks the focused
 * URL, which is the thing the title is about. It re-renders this shell on any param change —
 * acceptable here, where the shell is two bars and already re-renders on every segment change.
 */
const RECITER_TITLE_LEAF = 'reciter-downloads';

export default function ProfileLayout() {
  const { t } = useTranslation('navigation');
  const { colors } = useTheme();
  const segments: string[] = useSegments();
  const leaf = segments[segments.length - 1] ?? 'account';
  const titleKey: TitleKey =
    (TITLE_KEYS as Record<string, TitleKey | undefined>)[leaf] ?? 'titles.account';
  const { id } = useGlobalSearchParams<{ id?: string }>();
  const title = leaf === RECITER_TITLE_LEAF && id ? reciterDisplayName(id) : t(titleKey);
  const styles = useThemedStyles((theme) => ({
    shell: {
      flex: 1,
      backgroundColor: theme.colors.background.primary,
    },
    stack: {
      flex: 1,
    },
  }));

  return (
    <View style={styles.shell}>
      {/* ⚠️ `showBack` comes from the SAME segments as the title, not from the router's global
          `canGoBack()` — which is computed over the focused path and measured one commit stale
          on a push (the chevron missed its first frame). The stack root is `account`; any other
          focused leaf is a pushed screen with history to pop. `AppHeader`'s docblock has the
          full story. */}
      <AppHeader title={title} showBack={leaf !== 'account'} />
      <View style={styles.stack}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background.primary },
          }}
        />
      </View>
      <AppTabBar />
    </View>
  );
}
