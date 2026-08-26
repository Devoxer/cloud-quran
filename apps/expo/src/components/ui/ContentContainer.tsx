/**
 * ContentContainer - Reusable layout wrapper for consistent max-width across screens
 *
 * Provides centered content with configurable max-width using design tokens.
 * Ensures consistent layout on larger screens while remaining full-width on mobile.
 */

import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LAYOUT, LayoutMaxWidthToken } from '@/constants/spacing';

interface ContentContainerProps {
  children: React.ReactNode;
  /** Max width variant from LAYOUT tokens. Defaults to 'content' (640px) */
  maxWidth?: LayoutMaxWidthToken;
  /** Additional styles for the container */
  style?: StyleProp<ViewStyle>;
  /** Test ID for testing */
  testID?: string;
}

/**
 * Wraps content with a max-width constraint and centers it horizontally.
 * Use this component to maintain consistent content widths across screens.
 *
 * @example
 * ```tsx
 * <ContentContainer maxWidth="form">
 *   <ProfileCard />
 * </ContentContainer>
 * ```
 */
export function ContentContainer({
  children,
  maxWidth = 'content',
  style,
  testID,
}: ContentContainerProps) {
  return (
    <View
      style={[styles.container, { maxWidth: LAYOUT.maxWidth[maxWidth] }, style]}
      testID={testID}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignSelf: 'center',
  },
});
