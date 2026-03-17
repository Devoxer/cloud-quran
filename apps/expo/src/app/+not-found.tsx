import { StyleSheet, View } from 'react-native';

import { Link, Stack } from 'expo-router';

import { AppText } from '@/components/AppText';
import { Surface } from '@/components/Surface';
import { spacing } from '@/theme/tokens';

export default function NotFoundScreen() {
  return (
    <Surface>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View style={styles.container}>
        <AppText variant="surahTitleEnglish">Page not found</AppText>
        <Link href="/" style={styles.link}>
          <AppText variant="ui">Go to home screen</AppText>
        </Link>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
  link: {
    marginTop: spacing.lg,
  },
});
