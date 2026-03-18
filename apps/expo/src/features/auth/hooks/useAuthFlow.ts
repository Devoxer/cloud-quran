import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback } from 'react';
import { useAuthStore } from '@/features/auth';
import { authClient } from '@/services/auth-client';
import { setAuthToken } from '@/services/secure-store';
import { useDataMigration } from './useDataMigration';

// Dismiss any open browser on OAuth redirect return
WebBrowser.maybeCompleteAuthSession();

function useCompleteSignIn() {
  const setUser = useAuthStore((s) => s.setUser);
  const { migrateData } = useDataMigration();

  return useCallback(
    async (session: {
      user: { id: string; email?: string | null; name?: string | null };
      token?: string;
    }) => {
      if (session.token) {
        await setAuthToken(session.token);
      }
      // Best-effort data migration runs BEFORE setUser so the sign-in screen
      // stays visible with its loading indicator during migration (Task 11.5).
      await migrateData();
      setUser({
        userId: session.user.id,
        email: session.user.email ?? null,
        displayName: session.user.name ?? null,
      });
    },
    [setUser, migrateData],
  );
}

export function useAuthFlow() {
  const completeSignIn = useCompleteSignIn();

  const signInWithMagicLink = useCallback(async (email: string) => {
    await authClient.signIn.magicLink({ email });
    // User must tap the link in their email — we show "check your email" UI
  }, []);

  const handleMagicLinkCallback = useCallback(
    async (url: string) => {
      // Parse the token/session from the magic link callback URL
      const parsed = Linking.parse(url);
      const token = parsed.queryParams?.token as string | undefined;
      if (!token) return;

      // Verify the magic link token with the server
      const result = await authClient.magicLink.verify({ token });
      if (result.data) {
        await completeSignIn({
          user: result.data.user,
          token: result.data.session?.token,
        });
      }
    },
    [completeSignIn],
  );

  const signInWithGoogle = useCallback(async () => {
    const result = await authClient.signIn.social({ provider: 'google' });
    if (result.error) {
      throw new Error(result.error.message ?? 'Google sign-in failed');
    }
    if (!result.data) {
      throw new Error('Google sign-in failed: no response from server');
    }
    await completeSignIn({
      user: result.data.user,
      token: result.data.session?.token,
    });
  }, [completeSignIn]);

  const signInWithApple = useCallback(async () => {
    const result = await authClient.signIn.social({ provider: 'apple' });
    if (result.error) {
      throw new Error(result.error.message ?? 'Apple sign-in failed');
    }
    if (!result.data) {
      throw new Error('Apple sign-in failed: no response from server');
    }
    await completeSignIn({
      user: result.data.user,
      token: result.data.session?.token,
    });
  }, [completeSignIn]);

  return {
    signInWithMagicLink,
    signInWithGoogle,
    signInWithApple,
    handleMagicLinkCallback,
  };
}
