/**
 * TimePicker wrapper render-smoke (Story 18.8).
 *
 * iOS path: the wrapped `@expo/ui/community/datetime-picker` renders without throwing
 * in jest-expo (the community impl resolves to its web variant here, which renders
 * `null` — the native SwiftUI/Compose paths are out of jest's scope).
 *
 * Android path: a tappable formatted-time row that conditionally mounts the native
 * dialog on press. We assert the row label + the open-on-press behavior in jest
 * (default OS is ios, so the Android branch is exercised by forcing `Platform.OS`).
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { TimePicker } from './TimePicker';

describe('ui/TimePicker wrapper', () => {
  it('renders without throwing (iOS inline chip)', () => {
    expect(() =>
      render(<TimePicker hour={9} minute={0} onChange={() => undefined} testID="time-smoke" />)
    ).not.toThrow();
  });

  it('renders without throwing (disabled, custom time)', () => {
    expect(() =>
      render(
        <TimePicker
          hour={21}
          minute={30}
          onChange={() => undefined}
          disabled
          accentColor="#c1440e"
          testID="time-smoke-disabled"
        />
      )
    ).not.toThrow();
  });

  describe('Android (tap-to-open dialog)', () => {
    const originalOS = Platform.OS;
    beforeAll(() => {
      Platform.OS = 'android';
    });
    afterAll(() => {
      Platform.OS = originalOS;
    });

    it('shows the formatted 12-hour time on the tappable row', () => {
      render(<TimePicker hour={9} minute={5} onChange={() => undefined} testID="time-android" />);
      expect(screen.getByText('9:05 AM')).toBeTruthy();
    });

    it('formats noon/midnight correctly (12-hour clock)', () => {
      const { rerender } = render(
        <TimePicker hour={0} minute={0} onChange={() => undefined} testID="t" />
      );
      expect(screen.getByText('12:00 AM')).toBeTruthy();
      rerender(<TimePicker hour={12} minute={0} onChange={() => undefined} testID="t" />);
      expect(screen.getByText('12:00 PM')).toBeTruthy();
    });

    it('mounts the dialog on press without throwing', () => {
      render(<TimePicker hour={21} minute={30} onChange={() => undefined} testID="time-android" />);
      expect(() => fireEvent.press(screen.getByTestId('time-android'))).not.toThrow();
    });
  });
});
