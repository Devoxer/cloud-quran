import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { SPACING } from '@/constants/spacing';
import { useThemedStyles } from '@/lib/useThemedStyles';

/**
 * Placeholder home (story 5-1).
 *
 * The seed deleted wisdom-fruits' `(discover)` group, and this route used to `<Redirect>` into
 * it — which typechecked only because `.expo/types/router.d.ts` still held the old route union,
 * and which stopped `expo export` producing a bundle at all once it regenerated.
 *
 * Epic 6 replaces this with Reading Mode. It renders rather than redirects on purpose: a route
 * that redirects somewhere non-existent fails at build time, and a route that renders nothing
 * hides that the shell is incomplete.
 */
export default function Home() {
  const { t } = useTranslation('common');
  const styles = useThemedStyles((t) => ({
    screen: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      padding: SPACING.lg,
      backgroundColor: t.colors.background.primary,
    },
    title: { color: t.colors.text.primary, marginBottom: SPACING.xs },
    body: { color: t.colors.text.secondary, textAlign: 'center' as const },
  }));

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t('placeholder.appName')}</Text>
      <Text style={styles.body}>{t('placeholder.readingModeSoon')}</Text>
    </View>
  );
}
