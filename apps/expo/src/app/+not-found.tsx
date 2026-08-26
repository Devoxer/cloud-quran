import { Link, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import { FONT_SIZE, FONT_WEIGHT, HOME_HREF, SPACING } from '@/constants';
import { useThemedStyles } from '@/lib/useThemedStyles';

/**
 * ⚠️ TWO THINGS ON THIS SCREEN CHANGED IN STORY 6-0, AND BOTH WERE LIVE DEFECTS.
 *
 * **"Go home" pointed at `/`, which is a redirect and not the home screen.** `/` pops the ROOT
 * stack back to the tab shell and deliberately leaves the tab stack where it was — so a reader who
 * had drilled into a pushed settings screen, hit a bad URL, and pressed "go home" landed back on
 * that settings screen. `HOME_HREF` navigates INSIDE the tab navigator, which pops that stack too,
 * and it costs one hop less than bouncing through the redirect. Read from the tab table, so the
 * Read tab in 6.1 inherits it.
 *
 * **The link was `accent.primary` on `background.primary` — 4.05:1 on terracotta·light**, under
 * the 4.5 WCAG AA needs for body text, and terracotta's accent is byte-locked to the live default
 * so the hue cannot be tuned. `app/read.tsx` refused to ship that pair for its close control while
 * this screen still shipped it. The link takes `text.primary` (AAA) and keeps a non-colour
 * affordance — an underline — so it still reads as a link rather than as a third line of copy
 * (WCAG 1.4.1: colour must not be the only cue).
 */
export default function NotFoundScreen() {
  const { t } = useTranslation('common');
  const styles = useStyles();

  return (
    <>
      <Stack.Screen options={{ title: t('notFound.title') }} />
      <View style={styles.container}>
        <Text style={styles.title}>{t('notFound.message')}</Text>

        <Link href={HOME_HREF} style={styles.link}>
          <Text style={styles.linkText}>{t('notFound.goHome')}</Text>
        </Link>
      </View>
    </>
  );
}

const useStyles = () =>
  useThemedStyles((t) => ({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACING.xl,
      // Self-contained background (was the Themed View's auto-bg, removed in Story 23.5).
      // Belt-and-suspenders: the app-wide NavigationThemeProvider already paints every
      // scene's bg with background.primary, so this is pixel-identical, not a fix.
      backgroundColor: t.colors.background.primary,
    },
    title: {
      fontSize: FONT_SIZE.h3,
      fontWeight: FONT_WEIGHT.bold,
    },
    link: {
      marginTop: SPACING.md,
      paddingVertical: SPACING.md,
    },
    linkText: {
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.semibold,
      color: t.colors.text.primary,
      textDecorationLine: 'underline' as const,
    },
  }));
