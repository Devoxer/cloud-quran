import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export type SurfaceProps = ViewProps & {
  variant?: 'primary' | 'secondary';
};

export function Surface({ style, variant = 'primary', ...rest }: SurfaceProps) {
  const { tokens } = useTheme();

  return (
    <View
      style={[styles.container, { backgroundColor: tokens.surface[variant] }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
