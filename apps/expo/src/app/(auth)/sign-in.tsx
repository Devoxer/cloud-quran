import { useRouter } from 'expo-router';

import { Surface } from '@/components/Surface';
import { SignInMethodList } from '@/features/auth/components/SignInMethodList';

export default function SignInScreen() {
  const router = useRouter();

  const handleSuccess = () => {
    // Navigate back to the app — AuthGate will detect the new auth state
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/settings');
    }
  };

  const handleCancel = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/settings');
    }
  };

  return (
    <Surface>
      <SignInMethodList onSuccess={handleSuccess} onCancel={handleCancel} />
    </Surface>
  );
}
