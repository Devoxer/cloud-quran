import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/**
 * Subtle offline chip displayed in the header for authenticated users.
 * Auto-dismisses when connectivity returns.
 */
export function OfflineIndicator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [isConnected, setIsConnected] = useState(true);
  const { tokens } = useTheme();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? true);
    });
    return () => unsubscribe();
  }, []);

  if (!isAuthenticated || isConnected) return null;

  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: tokens.surface.secondary },
      ]}
    >
      <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
        Offline
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'center',
  },
});
