/**
 * Tests for ErrorBoundary component
 *
 * CHANGE-024-D / M17: Section-level error boundary
 */

import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ErrorBoundary } from './ErrorBoundary';

// Mock Sentry captureException
jest.mock('@/lib/errors', () => ({
  captureException: jest.fn(),
}));

import { captureException } from '@/lib/errors';

const mockedCaptureException = captureException as jest.MockedFunction<typeof captureException>;

// Component that throws on render
function ThrowingComponent({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('Test render error');
  }
  return <Text>Child rendered successfully</Text>;
}

// Suppress console.error from React's error boundary logging
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    // Filter out React error boundary warnings
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Error: Uncaught') ||
        args[0].includes('The above error occurred') ||
        args[0].includes('Error: Test render error'))
    ) {
      return;
    }
    originalConsoleError(...args);
  };
});
afterAll(() => {
  console.error = originalConsoleError;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Text>Hello World</Text>
      </ErrorBoundary>
    );

    expect(getByText('Hello World')).toBeTruthy();
  });

  it('shows fallback UI when child throws', () => {
    const { getByText, getByTestId } = render(
      <ErrorBoundary screenName="Feed">
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(getByTestId('error-boundary-fallback')).toBeTruthy();
    expect(getByText('Something went wrong')).toBeTruthy();
    expect(getByText('Feed encountered an error.')).toBeTruthy();
  });

  it('shows generic message when no screenName provided', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(getByText('An unexpected error occurred.')).toBeTruthy();
  });

  it('retry button resets error state and re-renders children', () => {
    let shouldThrow = true;

    function ConditionalThrow() {
      if (shouldThrow) {
        throw new Error('Conditional error');
      }
      return <Text>Recovered</Text>;
    }

    const { getByTestId, getByText } = render(
      <ErrorBoundary>
        <ConditionalThrow />
      </ErrorBoundary>
    );

    // Should show fallback
    expect(getByTestId('error-boundary-fallback')).toBeTruthy();

    // Fix the error condition
    shouldThrow = false;

    // Press retry
    fireEvent.press(getByTestId('error-boundary-retry'));

    // Should show recovered content
    expect(getByText('Recovered')).toBeTruthy();
  });

  it('calls onError callback when error is caught', () => {
    const onError = jest.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toBe('Test render error');
  });

  it('calls captureException with error details and screenName', () => {
    render(
      <ErrorBoundary screenName="Library">
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(mockedCaptureException).toHaveBeenCalledTimes(1);
    expect(mockedCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        screenName: 'Library',
      })
    );
  });

  it('renders custom fallback when provided', () => {
    const customFallback = <Text>Custom fallback UI</Text>;

    const { getByText, queryByTestId } = render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(getByText('Custom fallback UI')).toBeTruthy();
    expect(queryByTestId('error-boundary-fallback')).toBeNull();
  });
});
