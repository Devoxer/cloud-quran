/**
 * Tests for KeyboardDismissView (Story 23.12)
 *
 * Verifies the tap-empty-space → keyboard-dismiss behavior and that child press
 * handlers are NOT swallowed. `react-native-keyboard-controller` is mocked
 * globally (jest.setup.js) with the package's own jest mock, where
 * `KeyboardController.dismiss` is a jest.fn — so we spy on it directly.
 */

import { fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import { KeyboardDismissView } from './KeyboardDismissView';

describe('KeyboardDismissView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('dismisses the keyboard when empty space is tapped', () => {
    const { getByTestId } = render(
      <KeyboardDismissView testID="kdv">
        <Text>content</Text>
      </KeyboardDismissView>
    );

    fireEvent.press(getByTestId('kdv'));

    expect(KeyboardController.dismiss).toHaveBeenCalledTimes(1);
  });

  it('does not swallow child press handlers', () => {
    const onChildPress = jest.fn();

    const { getByTestId } = render(
      <KeyboardDismissView testID="kdv">
        <Pressable testID="child" onPress={onChildPress}>
          <Text>tap me</Text>
        </Pressable>
      </KeyboardDismissView>
    );

    fireEvent.press(getByTestId('child'));

    // Child handler fires; the wrapper's dismiss does NOT (tapping a child does
    // not bubble to the outer Pressable).
    expect(onChildPress).toHaveBeenCalledTimes(1);
    expect(KeyboardController.dismiss).not.toHaveBeenCalled();
  });
});
