import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { db } from '@/services/instantdb';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

interface AppleSignInButtonProps {
  onSuccess: () => void;
  onError: (message: string) => void;
}

const APPLE_CLIENT_NAME = process.env.EXPO_PUBLIC_APPLE_AUTH_CLIENT_NAME ?? 'apple';

export function AppleSignInButton({ onSuccess, onError }: AppleSignInButtonProps) {
  const { tokens } = useTheme();
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setAvailable);
  }, []);

  const handlePress = useCallback(async () => {
    setLoading(true);
    try {
      const nonce = Crypto.randomUUID();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
      });

      if (!credential.identityToken) {
        throw new Error('No identity token received from Apple.');
      }

      await db.auth.signInWithIdToken({
        clientName: APPLE_CLIENT_NAME,
        idToken: credential.identityToken,
        nonce,
      });
      onSuccess();
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
      // User cancelled — not an error
      if (code === 'ERR_REQUEST_CANCELED') {
        setLoading(false);
        return;
      }
      const message = err instanceof Error ? err.message : 'Apple sign-in failed.';
      onError(message);
    } finally {
      setLoading(false);
    }
  }, [onSuccess, onError]);

  // Only show on iOS when available
  if (Platform.OS !== 'ios' || !available) return null;

  return (
    <View style={styles.wrapper}>
      {loading ? (
        <View style={[styles.loadingContainer, { backgroundColor: '#000' }]}>
          <ActivityIndicator color="#FFF" />
        </View>
      ) : (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={8}
          style={styles.appleButton}
          onPress={handlePress}
        />
      )}
      <AppText variant="uiCaption" style={[styles.label, { color: tokens.text.ui }]}>
        Sign in with Apple
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  appleButton: {
    height: 48,
    width: '100%',
  },
  loadingContainer: {
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
