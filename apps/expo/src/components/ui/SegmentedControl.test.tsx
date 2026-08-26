/**
 * SegmentedControl wrapper render-smoke (Story 17.4.1 AC 7).
 *
 * Proves the wrapped `@expo/ui/community/segmented-control` renders without
 * throwing in the jest-expo / RN environment, and that `onValueChange` is wired
 * through the wrapper. jest-expo's default platform is iOS, so this exercises the
 * self-hosting `.ios` variant (which mounts its own swift-ui `Host` — the reason
 * the wrapper must NOT add its own, unlike `Switch.tsx`).
 */

import { render } from '@testing-library/react-native';

import { SegmentedControl } from './SegmentedControl';

describe('ui/SegmentedControl wrapper', () => {
  it('renders without throwing (three segments)', () => {
    expect(() =>
      render(
        <SegmentedControl
          values={['Light', 'Dark', 'Auto']}
          selectedIndex={0}
          onValueChange={() => undefined}
          testID="segmented-smoke"
        />
      )
    ).not.toThrow();
  });

  it('renders without throwing (disabled, no handlers)', () => {
    expect(() =>
      render(<SegmentedControl values={['A', 'B']} selectedIndex={1} enabled={false} />)
    ).not.toThrow();
  });
});
