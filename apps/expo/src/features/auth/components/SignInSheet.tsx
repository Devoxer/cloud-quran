import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Surface } from '@/components/Surface';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

type SignInMethod = 'apple' | 'google' | 'magic-link';
type FlowState = 'idle' | 'loading' | 'email-sent' | 'error';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SignInSheetProps {
  onAppleSignIn: () => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
  onMagicLinkSignIn: (email: string) => Promise<void>;
}

export function SignInSheet({
  onAppleSignIn,
  onGoogleSignIn,
  onMagicLinkSignIn,
}: SignInSheetProps) {
  const { tokens } = useTheme();
  const [flowState, setFlowState] = useState<FlowState>('idle');
  const [activeMethod, setActiveMethod] = useState<SignInMethod | null>(null);
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const isLoading = flowState === 'loading';
  const isValidEmail = EMAIL_REGEX.test(email.trim());

  const handleSignIn = async (method: SignInMethod) => {
    setFlowState('loading');
    setActiveMethod(method);
    setErrorMessage('');
    try {
      if (method === 'apple') {
        await onAppleSignIn();
      } else if (method === 'google') {
        await onGoogleSignIn();
      } else {
        await onMagicLinkSignIn(email);
        setFlowState('email-sent');
        return;
      }
    } catch (e) {
      setFlowState('error');
      setErrorMessage(e instanceof Error ? e.message : 'Sign-in failed. Please try again.');
      return;
    }
    setFlowState('idle');
  };

  if (flowState === 'email-sent') {
    return (
      <Surface style={styles.container}>
        <View style={styles.content}>
          <Ionicons name="mail-outline" size={48} color={tokens.accent.audio} style={styles.icon} />
          <AppText variant="ui" style={[styles.title, { color: tokens.text.quran }]}>
            Check your email
          </AppText>
          <AppText variant="uiCaption" style={[styles.subtitle, { color: tokens.text.ui }]}>
            We sent a sign-in link to {email}
          </AppText>
          <Pressable
            style={[styles.linkButton]}
            onPress={() => {
              setFlowState('idle');
              setActiveMethod(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Try a different method"
          >
            <AppText variant="uiCaption" style={{ color: tokens.accent.audio }}>
              Try a different method
            </AppText>
          </Pressable>
        </View>
      </Surface>
    );
  }

  return (
    <Surface style={styles.container}>
      <View style={styles.content}>
        <AppText variant="ui" style={[styles.title, { color: tokens.text.quran }]}>
          Sign in to sync
        </AppText>

        {flowState === 'error' && (
          <View style={[styles.errorBanner, { backgroundColor: tokens.status.error }]}>
            <AppText variant="uiCaption" style={{ color: tokens.status.errorText }}>
              {errorMessage}
            </AppText>
          </View>
        )}

        {/* Apple Sign-In */}
        {Platform.OS !== 'android' && (
          <Pressable
            style={[styles.socialButton, { backgroundColor: tokens.text.quran }]}
            onPress={() => handleSignIn('apple')}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Sign in with Apple"
          >
            {isLoading && activeMethod === 'apple' ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="logo-apple" size={20} color={tokens.surface.primary} />
                <AppText
                  variant="ui"
                  style={[styles.socialButtonText, { color: tokens.surface.primary }]}
                >
                  Continue with Apple
                </AppText>
              </>
            )}
          </Pressable>
        )}

        {/* Google Sign-In */}
        <Pressable
          style={[styles.socialButton, { borderColor: tokens.border, borderWidth: 1 }]}
          onPress={() => handleSignIn('google')}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Sign in with Google"
        >
          {isLoading && activeMethod === 'google' ? (
            <ActivityIndicator color={tokens.text.quran} size="small" />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color={tokens.text.quran} />
              <AppText variant="ui" style={{ color: tokens.text.quran }}>
                Continue with Google
              </AppText>
            </>
          )}
        </Pressable>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: tokens.border }]} />
          <AppText
            variant="uiCaption"
            style={{ color: tokens.text.ui, marginHorizontal: spacing.md }}
          >
            or
          </AppText>
          <View style={[styles.dividerLine, { backgroundColor: tokens.border }]} />
        </View>

        {/* Magic Link */}
        <TextInput
          style={[
            styles.emailInput,
            {
              color: tokens.text.quran,
              borderColor: tokens.border,
              backgroundColor: tokens.surface.secondary,
            },
          ]}
          placeholder="Enter your email"
          placeholderTextColor={tokens.text.ui}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isLoading}
          accessibilityLabel="Email address"
        />
        <Pressable
          style={[
            styles.magicLinkButton,
            {
              backgroundColor: tokens.accent.audio,
              opacity: !isValidEmail || isLoading ? 0.5 : 1,
            },
          ]}
          onPress={() => handleSignIn('magic-link')}
          disabled={!isValidEmail || isLoading}
          accessibilityRole="button"
          accessibilityLabel="Send magic link"
        >
          {isLoading && activeMethod === 'magic-link' ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <AppText variant="ui" style={styles.magicLinkButtonText}>
              Send Magic Link
            </AppText>
          )}
        </Pressable>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.xl,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  icon: {
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  errorBanner: {
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.lg,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.md,
    gap: spacing.sm,
    minHeight: 48,
  },
  socialButtonText: {
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  emailInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  magicLinkButton: {
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  magicLinkButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  linkButton: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
});
