import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { Surface } from '@/components/Surface';
import { ConsentForm } from '@/features/auth/components/ConsentForm';
import { mmkv, MMKV_KEYS } from '@/services/mmkv';

export default function ConsentScreen() {
  const router = useRouter();

  // Skip consent if already accepted — go directly to sign-in
  useEffect(() => {
    if (mmkv.getBoolean(MMKV_KEYS.GDPR_CONSENT)) {
      router.replace('/(auth)/sign-in');
    }
  }, [router]);

  const handleAccept = () => {
    mmkv.set(MMKV_KEYS.GDPR_CONSENT, true);
    router.replace('/(auth)/sign-in');
  };

  const handleDecline = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/settings');
    }
  };

  return (
    <Surface>
      <ConsentForm onAccept={handleAccept} onDecline={handleDecline} />
    </Surface>
  );
}
