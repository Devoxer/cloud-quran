/**
 * DurationPicker render-smoke + ms↔wheel mapping (Story 19.5).
 *
 * The quidone wheel is mocked with a controllable stub (a pressable per datum)
 * so the hours/minutes ↔ milliseconds mapping is asserted deterministically —
 * jest can't drive a real wheel's scroll/settle. Real wheel behavior is covered
 * by the iOS-sim smoke. Render-smoke only (per the story spec).
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { DurationPicker } from './index';

// Controllable wheel stub: one pressable per datum; pressing fires onValueChanged.
jest.mock('@quidone/react-native-wheel-picker', () => {
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({
      data,
      onValueChanged,
      testID,
    }: {
      data: { value: number; label: string }[];
      onValueChanged?: (e: { item: { value: number; label: string }; index: number }) => void;
      testID?: string;
    }) => (
      <>
        {data.map((item, index) => (
          <Pressable
            key={item.value}
            testID={`${testID}-item-${item.value}`}
            onPress={() => onValueChanged?.({ item, index })}
          >
            <Text>{item.label}</Text>
          </Pressable>
        ))}
      </>
    ),
  };
});

const mockSelection = jest.fn();
jest.mock('@/lib/haptics', () => ({ haptics: { selection: () => mockSelection() } }));

describe('DurationPicker', () => {
  beforeEach(() => mockSelection.mockClear());

  it('renders hour + minute wheels', () => {
    render(<DurationPicker valueMs={0} onChange={jest.fn()} testID="dp" />);
    // Hours 0..8 by default + minutes 0..59.
    expect(screen.getByTestId('dp-hours-item-8')).toBeTruthy();
    expect(screen.getByTestId('dp-minutes-item-59')).toBeTruthy();
  });

  it('maps an hour selection to milliseconds', () => {
    const onChange = jest.fn();
    render(<DurationPicker valueMs={0} onChange={onChange} testID="dp" />);
    fireEvent.press(screen.getByTestId('dp-hours-item-2'));
    expect(onChange).toHaveBeenCalledWith(2 * 3_600_000); // 2h
    expect(mockSelection).toHaveBeenCalledTimes(1);
  });

  it('combines the current hours with a new minute selection', () => {
    const onChange = jest.fn();
    // valueMs = 2h → hours wheel sits at 2; pick 30 minutes.
    render(<DurationPicker valueMs={2 * 3_600_000} onChange={onChange} testID="dp" />);
    fireEvent.press(screen.getByTestId('dp-minutes-item-30'));
    expect(onChange).toHaveBeenCalledWith(2 * 3_600_000 + 30 * 60_000); // 2h30m
  });

  it('honors minuteStep (only stepped minute data is rendered)', () => {
    render(<DurationPicker valueMs={0} onChange={jest.fn()} minuteStep={5} testID="dp" />);
    expect(screen.getByTestId('dp-minutes-item-55')).toBeTruthy();
    expect(screen.queryByTestId('dp-minutes-item-1')).toBeNull();
  });

  it('exposes an accessible duration label', () => {
    render(<DurationPicker valueMs={5_400_000} onChange={jest.fn()} testID="dp" />); // 1h30m
    expect(screen.getByLabelText('Duration: 1 hours 30 minutes')).toBeTruthy();
  });
});
