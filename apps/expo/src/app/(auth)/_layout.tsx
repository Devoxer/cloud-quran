import { Stack } from 'expo-router';

import { useTheme } from '@/theme/ThemeProvider';

export default function AuthLayout() {
  const { tokens } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tokens.surface.primary },
        presentation: 'modal',
      }}
    >
      <Stack.Screen name="consent" />
      <Stack.Screen name="sign-in" />
    </Stack>
  );
}
