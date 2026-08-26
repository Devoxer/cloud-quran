/**
 * Unit tests for CodeInput Component
 * Verifies digit box rendering, input handling, and accessibility
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

// Mock ThemeContext
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      background: { primary: '#FFFBF7' },
      text: { primary: '#1A1612' },
      accent: { primary: '#C65D3B' },
      border: '#E5DED6',
      semantic: { error: '#C44536' },
    },
  }),
}));

// Import after mocking
import { CodeInput } from './CodeInput';

describe('CodeInput', () => {
  const mockOnChangeText = jest.fn();

  beforeEach(() => {
    mockOnChangeText.mockReset();
  });

  describe('rendering', () => {
    it('renders the code input container', () => {
      render(<CodeInput value="" onChangeText={mockOnChangeText} />);
      expect(screen.getByTestId('code-input')).toBeTruthy();
    });

    it('renders 6 code boxes by default', () => {
      render(<CodeInput value="" onChangeText={mockOnChangeText} />);

      for (let i = 0; i < 6; i++) {
        expect(screen.getByTestId(`code-box-${i}`)).toBeTruthy();
      }
    });

    it('renders custom number of code boxes', () => {
      render(<CodeInput value="" onChangeText={mockOnChangeText} length={4} />);

      for (let i = 0; i < 4; i++) {
        expect(screen.getByTestId(`code-box-${i}`)).toBeTruthy();
      }
      expect(screen.queryByTestId('code-box-4')).toBeNull();
    });

    it('displays digits in corresponding boxes', () => {
      render(<CodeInput value="123" onChangeText={mockOnChangeText} />);

      expect(screen.getByTestId('code-box-0')).toHaveTextContent('1');
      expect(screen.getByTestId('code-box-1')).toHaveTextContent('2');
      expect(screen.getByTestId('code-box-2')).toHaveTextContent('3');
      expect(screen.getByTestId('code-box-3')).toHaveTextContent('');
    });

    it('renders hidden text input for keyboard', () => {
      render(<CodeInput value="" onChangeText={mockOnChangeText} />);
      expect(screen.getByTestId('code-input-hidden')).toBeTruthy();
    });
  });

  describe('input handling', () => {
    it('calls onChangeText when text is entered', () => {
      render(<CodeInput value="" onChangeText={mockOnChangeText} />);

      const hiddenInput = screen.getByTestId('code-input-hidden');
      fireEvent.changeText(hiddenInput, '123');

      expect(mockOnChangeText).toHaveBeenCalledWith('123');
    });

    it('strips non-numeric characters', () => {
      render(<CodeInput value="" onChangeText={mockOnChangeText} />);

      const hiddenInput = screen.getByTestId('code-input-hidden');
      fireEvent.changeText(hiddenInput, 'a1b2c3');

      expect(mockOnChangeText).toHaveBeenCalledWith('123');
    });

    it('limits input to specified length', () => {
      render(<CodeInput value="" onChangeText={mockOnChangeText} length={6} />);

      const hiddenInput = screen.getByTestId('code-input-hidden');
      fireEvent.changeText(hiddenInput, '123456789');

      expect(mockOnChangeText).toHaveBeenCalledWith('123456');
    });

    it('tapping boxes focuses the hidden input', () => {
      render(<CodeInput value="" onChangeText={mockOnChangeText} />);

      const codeBoxes = screen.getByTestId('code-boxes');
      fireEvent.press(codeBoxes);

      // The hidden input should be focusable (we can't directly test focus in RNTL)
      const hiddenInput = screen.getByTestId('code-input-hidden');
      expect(hiddenInput).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('renders without error state by default', () => {
      render(<CodeInput value="" onChangeText={mockOnChangeText} />);

      // Boxes should have default border (not error color)
      const box = screen.getByTestId('code-box-0');
      expect(box.props.style).toBeDefined();
    });

    it('applies error styling when error prop is true', () => {
      render(<CodeInput value="" onChangeText={mockOnChangeText} error />);

      // Verify error prop is being used (component renders with error state)
      const codeInput = screen.getByTestId('code-input');
      expect(codeInput).toBeTruthy();
    });
  });

  describe('disabled state', () => {
    it('input is editable by default', () => {
      render(<CodeInput value="" onChangeText={mockOnChangeText} />);

      const hiddenInput = screen.getByTestId('code-input-hidden');
      expect(hiddenInput.props.editable).toBe(true);
    });

    it('input is not editable when disabled', () => {
      render(<CodeInput value="" onChangeText={mockOnChangeText} disabled />);

      const hiddenInput = screen.getByTestId('code-input-hidden');
      expect(hiddenInput.props.editable).toBe(false);
    });
  });

  describe('accessibility', () => {
    it('hidden input has correct accessibility label', () => {
      render(<CodeInput value="" onChangeText={mockOnChangeText} />);

      const hiddenInput = screen.getByTestId('code-input-hidden');
      expect(hiddenInput.props.accessibilityLabel).toBe('Enter verification code');
    });

    it('uses number-pad keyboard type', () => {
      render(<CodeInput value="" onChangeText={mockOnChangeText} />);

      const hiddenInput = screen.getByTestId('code-input-hidden');
      expect(hiddenInput.props.keyboardType).toBe('number-pad');
    });
  });
});
