/**
 * Slider wrapper render-smoke (Story 17.3 AC 8).
 *
 * Proves the wrapped `@expo/ui/community/slider` renders without throwing
 * in jest-expo. Metro resolves `@expo/ui/community/slider/Slider.tsx`
 * (the web fallback — HTML `<input type="range">`), confirming the
 * web-safe path is intact. The native SwiftUI/Compose paths are out of
 * jest's scope.
 *
 * Also covers the testID tag-View wrapper (the community slider has no
 * `testID` prop, so the wrapper wraps in a transparent `<View testID>` —
 * exposed for jest-expo + RNTL).
 */

import { render } from '@testing-library/react-native';

import { Slider } from './Slider';

describe('ui/Slider wrapper', () => {
  it('renders without throwing (defaults)', () => {
    expect(() => render(<Slider value={0.5} onValueChange={() => undefined} />)).not.toThrow();
  });

  it('forwards testID via the tag-View wrapper', () => {
    const { getByTestId } = render(
      <Slider
        value={0.5}
        minimumValue={0}
        maximumValue={1}
        onValueChange={() => undefined}
        testID="slider-smoke"
      />
    );
    expect(getByTestId('slider-smoke')).toBeTruthy();
  });
});
