import { makeRedirectUri, useAutoDiscovery, useAuthRequest } from 'expo-auth-session';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { db } from '@/services/instantdb';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

interface GoogleSignInButtonProps {
  onSuccess: () => void;
  onError: (message: string) => void;
}

const GOOGLE_CLIENT_NAME = process.env.EXPO_PUBLIC_GOOGLE_AUTH_CLIENT_NAME ?? 'google-web';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export function GoogleSignInButton({ onSuccess, onError }: GoogleSignInButtonProps) {
  const { tokens } = useTheme();
  const [loading, setLoading] = useState(false);

  // Web OAuth flow via expo-auth-session hooks (only active on web)
  const issuerURI = Platform.OS === 'web' ? db.auth.issuerURI() : undefined;
  const discovery = useAutoDiscovery(issuerURI as string);
  const redirectUri = Platform.OS === 'web' ? makeRedirectUri() : 'https://localhost';
  const [request, response, promptAsync] = useAuthRequest(
    { clientId: GOOGLE_CLIENT_NAME, redirectUri },
    discovery,
  );

  // Handle web OAuth response
  useEffect(() => {
    if (Platform.OS !== 'web' || !response) return;
    if (response.type === 'success' && response.params?.code && request?.codeVerifier) {
      db.auth
        .exchangeOAuthCode({
          code: response.params.code,
          codeVerifier: request.codeVerifier,
        })
        .then(() => onSuccess())
        .catch((err: Error) => onError(err.message));
    }
  }, [response, request, onSuccess, onError]);

  const handlePress = useCallback(async () => {
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        await promptAsync();
        // Result handled in useEffect above
      } else {
        // Native flow via Google Sign-In SDK
        const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
        GoogleSignin.configure({
          iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
          webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
        });
        await GoogleSignin.hasPlayServices();
        const userInfo = await GoogleSignin.signIn();
        const idToken = userInfo.data?.idToken;
        if (!idToken) throw new Error('No ID token received from Google.');
        await db.auth.signInWithIdToken({ clientName: GOOGLE_CLIENT_NAME, idToken });
        onSuccess();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed.';
      if (message.includes('SIGN_IN_CANCELLED') || message.includes('dismiss')) {
        setLoading(false);
        return;
      }
      onError(message);
    } finally {
      setLoading(false);
    }
  }, [onSuccess, onError, promptAsync]);

  return (
    <Pressable
      style={[styles.button, { borderColor: tokens.border }]}
      onPress={handlePress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel="Sign in with Google"
    >
      {loading ? (
        <ActivityIndicator color={tokens.text.quran} />
      ) : (
        <View style={styles.content}>
          <AppText variant="ui" style={{ color: tokens.text.quran }}>
            Continue with Google
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
