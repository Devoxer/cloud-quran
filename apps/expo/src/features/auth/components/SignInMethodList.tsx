import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

import { AppleSignInButton } from './AppleSignInButton';
import { GoogleSignInButton } from './GoogleSignInButton';
import { MagicCodeInput } from './MagicCodeInput';

type Screen = 'methods' | 'magic-code';

interface SignInMethodListProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function SignInMethodList({ onSuccess, onCancel }: SignInMethodListProps) {
  const { tokens } = useTheme();
  const [screen, setScreen] = useState<Screen>('methods');
  const [error, setError] = useState<string | null>(null);

  if (screen === 'magic-code') {
    return <MagicCodeInput onSuccess={onSuccess} onCancel={() => setScreen('methods')} />;
  }

  return (
    <View style={styles.container}>
      <AppText variant="ui" style={[styles.title, { color: tokens.text.quran }]}>
        Sign in to sync
      </AppText>

      <AppText variant="uiCaption" style={[styles.subtitle, { color: tokens.text.ui }]}>
        Choose a sign-in method to sync your reading data across devices.
      </AppText>

      {error && (
        <AppText variant="uiCaption" style={[styles.error, { color: tokens.status.error }]}>
          {error}
        </AppText>
      )}

      <AppleSignInButton onSuccess={onSuccess} onError={setError} />

      <GoogleSignInButton onSuccess={onSuccess} onError={setError} />

      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: tokens.border }]} />
        <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
          or
        </AppText>
        <View style={[styles.dividerLine, { backgroundColor: tokens.border }]} />
      </View>

      <View style={styles.magicCodeLink}>
        <AppText
          variant="ui"
          style={{ color: tokens.accent.audio }}
          onPress={() => setScreen('magic-code')}
          accessibilityRole="button"
        >
          Sign in with email
        </AppText>
      </View>

      <View style={styles.cancelLink}>
        <AppText
          variant="uiCaption"
          style={{ color: tokens.text.ui }}
          onPress={onCancel}
          accessibilityRole="button"
        >
          Cancel
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: spacing['2xl'],
  },
  error: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  magicCodeLink: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  cancelLink: {
    alignItems: 'center',
  },
});
