import { router } from 'expo-router';

import { ConsentScreen } from '@/features/auth/components/ConsentScreen';

export default function ConsentRoute() {
  return (
    <ConsentScreen
      onAgree={() => router.replace('/(auth)/sign-in')}
      onCancel={() => router.back()}
    />
  );
}
