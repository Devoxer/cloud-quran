import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { db } from '@/services/instantdb';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

type Step = 'email' | 'code';

interface MagicCodeInputProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function MagicCodeInput({ onSuccess, onCancel }: MagicCodeInputProps) {
  const { tokens } = useTheme();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await db.auth.sendMagicCode({ email: trimmed });
      setStep('code');
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'body' in err
          ? (err as { body?: { message?: string } }).body?.message
          : undefined;
      setError(message ?? 'Failed to send code. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleVerifyCode = useCallback(async () => {
    const trimmedCode = code.trim();
    if (!trimmedCode || trimmedCode.length < 6) {
      setError('Please enter the 6-digit code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await db.auth.signInWithMagicCode({ email: email.trim().toLowerCase(), code: trimmedCode });
      onSuccess();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'body' in err
          ? (err as { body?: { message?: string } }).body?.message
          : undefined;
      setError(message ?? 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [email, code, onSuccess]);

  return (
    <View style={styles.container}>
      <AppText variant="ui" style={[styles.title, { color: tokens.text.quran }]}>
        {step === 'email' ? 'Sign in with Magic Code' : 'Enter verification code'}
      </AppText>

      {step === 'email' ? (
        <>
          <AppText variant="uiCaption" style={[styles.subtitle, { color: tokens.text.ui }]}>
            We'll send a 6-digit code to your email.
          </AppText>
          <TextInput
            style={[
              styles.input,
              {
                color: tokens.text.quran,
                borderColor: tokens.border,
                backgroundColor: tokens.surface.secondary,
              },
            ]}
            placeholder="Email address"
            placeholderTextColor={tokens.text.ui}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            accessibilityLabel="Email address"
          />
        </>
      ) : (
        <>
          <AppText variant="uiCaption" style={[styles.subtitle, { color: tokens.text.ui }]}>
            Check your email for the 6-digit code.
          </AppText>
          <TextInput
            style={[
              styles.input,
              {
                color: tokens.text.quran,
                borderColor: tokens.border,
                backgroundColor: tokens.surface.secondary,
              },
            ]}
            placeholder="6-digit code"
            placeholderTextColor={tokens.text.ui}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            editable={!loading}
            accessibilityLabel="Verification code"
          />
        </>
      )}

      {error && (
        <AppText variant="uiCaption" style={[styles.error, { color: tokens.status.error }]}>
          {error}
        </AppText>
      )}

      <Pressable
        style={[styles.button, { backgroundColor: tokens.accent.audio }]}
        onPress={step === 'email' ? handleSendCode : handleVerifyCode}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={step === 'email' ? 'Send code' : 'Verify code'}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <AppText variant="ui" style={{ color: '#FFFFFF' }}>
            {step === 'email' ? 'Send Code' : 'Verify'}
          </AppText>
        )}
      </Pressable>

      <Pressable
        style={styles.cancelButton}
        onPress={step === 'code' ? () => setStep('email') : onCancel}
        accessibilityRole="button"
        accessibilityLabel={step === 'code' ? 'Back to email' : 'Cancel'}
      >
        <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
          {step === 'code' ? 'Use a different email' : 'Cancel'}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    marginBottom: spacing.lg,
  },
  error: {
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  button: {
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
});
