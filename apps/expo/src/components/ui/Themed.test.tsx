/**
 * Unit tests for Themed components
 * Verifies Text and useThemeColor hook functionality
 * (the Themed `View` was removed in Story 23.5 — its auto-background was a footgun.)
 */

import { render } from '@testing-library/react-native';
import React from 'react';
import Colors from '@/constants/Colors';

// Unmock the real theme hook so it reads the active scheme from the mocked useColorScheme
jest.unmock('@/lib/theme');

// Mock the useColorScheme hook
const mockUseColorScheme = jest.fn();
jest.mock('@/lib/useColorScheme', () => ({
  useColorScheme: () => mockUseColorScheme(),
}));

// Import after mocking
import { Text, TextProps, useThemeColor } from './Themed';

// useTheme is provider-free (Story 16.6) — the wrapper is a passthrough.
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

describe('Themed Components', () => {
  beforeEach(() => {
    mockUseColorScheme.mockReset();
  });

  describe('useThemeColor hook', () => {
    // Helper component to test the hook
    function UseThemeColorTest({
      props,
      colorName,
      onColor,
    }: {
      props: { light?: string; dark?: string };
      colorName: 'text' | 'background';
      onColor: (color: string) => void;
    }) {
      const color = useThemeColor(props, colorName);
      onColor(color);
      return null;
    }

    it('returns light prop color when in light mode and prop provided', () => {
      mockUseColorScheme.mockReturnValue('light');
      let resultColor = '';

      render(
        <TestWrapper>
          <UseThemeColorTest
            props={{ light: '#FF0000', dark: '#0000FF' }}
            colorName="text"
            onColor={(c) => (resultColor = c)}
          />
        </TestWrapper>
      );

      expect(resultColor).toBe('#FF0000');
    });

    it('returns dark prop color when in dark mode and prop provided', () => {
      mockUseColorScheme.mockReturnValue('dark');
      let resultColor = '';

      render(
        <TestWrapper>
          <UseThemeColorTest
            props={{ light: '#FF0000', dark: '#0000FF' }}
            colorName="text"
            onColor={(c) => (resultColor = c)}
          />
        </TestWrapper>
      );

      expect(resultColor).toBe('#0000FF');
    });

    it('returns default text color when no prop provided in light mode', () => {
      mockUseColorScheme.mockReturnValue('light');
      let resultColor = '';

      render(
        <TestWrapper>
          <UseThemeColorTest props={{}} colorName="text" onColor={(c) => (resultColor = c)} />
        </TestWrapper>
      );

      expect(resultColor).toBe(Colors.light.text.primary);
    });

    it('returns default text color when no prop provided in dark mode', () => {
      mockUseColorScheme.mockReturnValue('dark');
      let resultColor = '';

      render(
        <TestWrapper>
          <UseThemeColorTest props={{}} colorName="text" onColor={(c) => (resultColor = c)} />
        </TestWrapper>
      );

      expect(resultColor).toBe(Colors.dark.text.primary);
    });

    it('returns default background color when colorName is background', () => {
      mockUseColorScheme.mockReturnValue('light');
      let resultColor = '';

      render(
        <TestWrapper>
          <UseThemeColorTest props={{}} colorName="background" onColor={(c) => (resultColor = c)} />
        </TestWrapper>
      );

      expect(resultColor).toBe(Colors.light.background.primary);
    });
  });

  describe('Text component', () => {
    it('renders with default text color in light mode', () => {
      mockUseColorScheme.mockReturnValue('light');

      const { getByText } = render(
        <TestWrapper>
          <Text>Hello World</Text>
        </TestWrapper>
      );

      const textElement = getByText('Hello World');
      expect(textElement.props.style).toEqual(
        expect.arrayContaining([{ color: Colors.light.text.primary }])
      );
    });

    it('renders with default text color in dark mode', () => {
      mockUseColorScheme.mockReturnValue('dark');

      const { getByText } = render(
        <TestWrapper>
          <Text>Hello World</Text>
        </TestWrapper>
      );

      const textElement = getByText('Hello World');
      expect(textElement.props.style).toEqual(
        expect.arrayContaining([{ color: Colors.dark.text.primary }])
      );
    });

    it('uses lightColor prop in light mode', () => {
      mockUseColorScheme.mockReturnValue('light');

      const { getByText } = render(
        <TestWrapper>
          <Text lightColor="#123456" darkColor="#654321">
            Colored Text
          </Text>
        </TestWrapper>
      );

      const textElement = getByText('Colored Text');
      expect(textElement.props.style).toEqual(expect.arrayContaining([{ color: '#123456' }]));
    });

    it('uses darkColor prop in dark mode', () => {
      mockUseColorScheme.mockReturnValue('dark');

      const { getByText } = render(
        <TestWrapper>
          <Text lightColor="#123456" darkColor="#654321">
            Colored Text
          </Text>
        </TestWrapper>
      );

      const textElement = getByText('Colored Text');
      expect(textElement.props.style).toEqual(expect.arrayContaining([{ color: '#654321' }]));
    });

    it('merges custom styles with theme color', () => {
      mockUseColorScheme.mockReturnValue('light');

      const { getByText } = render(
        <TestWrapper>
          <Text style={{ fontSize: 20 }}>Styled Text</Text>
        </TestWrapper>
      );

      const textElement = getByText('Styled Text');
      expect(textElement.props.style).toEqual(
        expect.arrayContaining([{ color: Colors.light.text.primary }, { fontSize: 20 }])
      );
    });
  });

  describe('type exports', () => {
    it('TextProps type is valid', () => {
      const props: TextProps = {
        children: 'Test',
        lightColor: '#FFF',
        darkColor: '#000',
      };
      expect(props).toHaveProperty('lightColor');
      expect(props).toHaveProperty('darkColor');
    });
  });
});
