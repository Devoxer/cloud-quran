/**
 * Unit tests for useColorScheme.web.ts
 * Tests web-specific color scheme detection with real-time updates
 */

import { act, renderHook } from '@testing-library/react-native';

// Mock matchMedia
const mockMatchMedia = jest.fn();
const mockAddEventListener = jest.fn();
const mockRemoveEventListener = jest.fn();

// Store the change handler for triggering in tests
let mediaQueryChangeHandler: ((e: MediaQueryListEvent) => void) | null = null;

beforeEach(() => {
  mockMatchMedia.mockReset();
  mockAddEventListener.mockReset();
  mockRemoveEventListener.mockReset();
  mediaQueryChangeHandler = null;

  // Setup mock implementation
  mockAddEventListener.mockImplementation(
    (event: string, handler: (e: MediaQueryListEvent) => void) => {
      if (event === 'change') {
        mediaQueryChangeHandler = handler;
      }
    }
  );

  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: mockMatchMedia,
  });
});

// Import after setting up mocks
import { useColorScheme } from './useColorScheme.web';

describe('useColorScheme.web', () => {
  describe('initial value detection', () => {
    it('returns light when system prefers light mode', () => {
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener,
      });

      const { result } = renderHook(() => useColorScheme());

      expect(result.current).toBe('light');
    });

    it('returns dark when system prefers dark mode', () => {
      mockMatchMedia.mockReturnValue({
        matches: true,
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener,
      });

      const { result } = renderHook(() => useColorScheme());

      expect(result.current).toBe('dark');
    });
  });

  describe('real-time updates', () => {
    it('registers change event listener on mount', () => {
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener,
      });

      renderHook(() => useColorScheme());

      expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('removes change event listener on unmount', () => {
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener,
      });

      const { unmount } = renderHook(() => useColorScheme());
      unmount();

      expect(mockRemoveEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('updates to dark when system preference changes to dark', () => {
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener,
      });

      const { result } = renderHook(() => useColorScheme());

      expect(result.current).toBe('light');

      // Simulate system preference change to dark
      act(() => {
        if (mediaQueryChangeHandler) {
          mediaQueryChangeHandler({ matches: true } as MediaQueryListEvent);
        }
      });

      expect(result.current).toBe('dark');
    });

    it('updates to light when system preference changes to light', () => {
      mockMatchMedia.mockReturnValue({
        matches: true,
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener,
      });

      const { result } = renderHook(() => useColorScheme());

      expect(result.current).toBe('dark');

      // Simulate system preference change to light
      act(() => {
        if (mediaQueryChangeHandler) {
          mediaQueryChangeHandler({ matches: false } as MediaQueryListEvent);
        }
      });

      expect(result.current).toBe('light');
    });
  });

  describe('matchMedia query', () => {
    it('queries prefers-color-scheme: dark', () => {
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener,
      });

      renderHook(() => useColorScheme());

      expect(mockMatchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    });
  });
});
