import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Surface } from '@/components/Surface';
import { spacing } from '@/theme/tokens';

interface ErrorBoundaryProps {
  screenName: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(`[ErrorBoundary:${this.props.screenName}]`, error, errorInfo);
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Surface style={styles.container}>
          <View style={styles.content}>
            <AppText variant="surahTitleEnglish">Something went wrong</AppText>
            <AppText variant="uiCaption">Screen: {this.props.screenName}</AppText>
            {typeof __DEV__ !== 'undefined' && __DEV__ && this.state.error && (
              <AppText variant="uiCaption">{this.state.error.message}</AppText>
            )}
            <View style={styles.retryButton}>
              <AppText variant="ui" onPress={this.handleRetry}>
                Retry
              </AppText>
            </View>
          </View>
        </Surface>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  retryButton: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
});
