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

import { Stack, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AppHeader, AppTabBar } from '@/components/ui';
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
} as const;
type TitleKey = (typeof TITLE_KEYS)[keyof typeof TITLE_KEYS];

export default function ProfileLayout() {
  const { t } = useTranslation('navigation');
  const { colors } = useTheme();
  const segments: string[] = useSegments();
  const leaf = segments[segments.length - 1] ?? 'account';
  const titleKey: TitleKey =
    (TITLE_KEYS as Record<string, TitleKey | undefined>)[leaf] ?? 'titles.account';
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
      <AppHeader title={t(titleKey)} showBack={leaf !== 'account'} />
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
