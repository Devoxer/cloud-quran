/**
 * ErrorBoundary - Section-level error boundary for catching render errors
 *
 * CHANGE-024-D / M17: Catches rendering errors in screen sections and
 * displays a fallback UI with retry, preventing full app crashes.
 *
 * NOTE: This is a section-level boundary. Expo Router's built-in
 * ErrorBoundary (re-exported in app/_layout.tsx) handles route-level errors.
 *
 * Uses a functional wrapper to provide theme colors to the class component,
 * since class components cannot use hooks directly.
 *
 * @example
 * <ErrorBoundary screenName="Feed">
 *   <FeedContent />
 * </ErrorBoundary>
 */

import React, { Component, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { captureException } from '@/lib/errors';
import { useTheme } from '@/lib/theme';
import { Icon } from './Icon';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error) => void;
  screenName?: string;
}

interface ThemedColors {
  warning: string;
  textPrimary: string;
  textSecondary: string;
  accentPrimary: string;
  textOnAccent: string;
}

interface ErrorBoundaryInnerProps extends ErrorBoundaryProps {
  themedColors: ThemedColors;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryInner extends Component<ErrorBoundaryInnerProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureException(error, {
      componentStack: info.componentStack ?? undefined,
      screenName: this.props.screenName,
    });
    this.props.onError?.(error);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { themedColors } = this.props;

      return (
        // i18n carve-out (Story 20.2, AC6): this class error boundary MUST render
        // even if i18n itself threw, so its copy stays hardcoded English and never
        // routes through t(...). (Under the synchronous i18n init, isInitialized is
        // always true at normal render — so the robust form here is plain literals,
        // not an isInitialized guard, which would be dead code.)
        <View style={styles.container} testID="error-boundary-fallback">
          <Icon name="warning-outline" size={48} color={themedColors.warning} />
          <Text style={[styles.title, { color: themedColors.textPrimary }]}>
            Something went wrong
          </Text>
          <Text style={[styles.message, { color: themedColors.textSecondary }]}>
            {this.props.screenName
              ? `${this.props.screenName} encountered an error.`
              : 'An unexpected error occurred.'}
          </Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: themedColors.accentPrimary }]}
            onPress={this.handleRetry}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            testID="error-boundary-retry"
          >
            <Text style={[styles.retryText, { color: themedColors.textOnAccent }]}>Try Again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

/** Themed wrapper that provides colors from ThemeContext to the class component */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  const { colors } = useTheme();
  const themedColors: ThemedColors = {
    warning: colors.semantic.warning,
    textPrimary: colors.text.primary,
    textSecondary: colors.text.secondary,
    accentPrimary: colors.accent.primary,
    textOnAccent: colors.text.onAccent,
  };
  return <ErrorBoundaryInner {...props} themedColors={themedColors} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZE.h2,
    fontWeight: FONT_WEIGHT.bold,
    lineHeight: FONT_SIZE.h2 * LINE_HEIGHT.heading2,
    marginTop: SPACING.lg,
    textAlign: 'center',
  },
  message: {
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.regular,
    lineHeight: FONT_SIZE.body * LINE_HEIGHT.body,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.md,
    minWidth: 120,
    alignItems: 'center',
  },
  retryText: {
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.semibold,
  },
});
