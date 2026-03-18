import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useIsAuthenticated } from '@/features/auth';
import { SignInSheet } from '@/features/auth/components/SignInSheet';
import { useAuthFlow } from '@/features/auth/hooks/useAuthFlow';

export default function SignInRoute() {
  const { signInWithApple, signInWithGoogle, signInWithMagicLink, handleMagicLinkCallback } =
    useAuthFlow();
  const isAuthenticated = useIsAuthenticated();

  // Listen for magic link deep link callback
  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => {
      handleMagicLinkCallback(event.url);
    });

    // Check if app was opened via a magic link deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleMagicLinkCallback(url);
    });

    return () => subscription.remove();
  }, [handleMagicLinkCallback]);

  // Dismiss modal once authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.dismiss();
    }
  }, [isAuthenticated]);

  return (
    <SignInSheet
      onAppleSignIn={signInWithApple}
      onGoogleSignIn={signInWithGoogle}
      onMagicLinkSignIn={signInWithMagicLink}
    />
  );
}
