import { Link, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import { FONT_SIZE, FONT_WEIGHT, SPACING } from '@/constants';
import { useThemedStyles } from '@/lib/useThemedStyles';

export default function NotFoundScreen() {
  const { t } = useTranslation('common');
  const styles = useStyles();

  return (
    <>
      <Stack.Screen options={{ title: t('notFound.title') }} />
      <View style={styles.container}>
        <Text style={styles.title}>{t('notFound.message')}</Text>

        <Link href="/" style={styles.link}>
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
      color: t.colors.accent.primary,
    },
  }));
