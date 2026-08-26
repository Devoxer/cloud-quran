/**
 * Switch wrapper render-smoke (Story 17.3 AC 8).
 *
 * Proves the wrapped Universal `@expo/ui` Switch renders without throwing
 * in the jest-expo / RN environment (web / RN fallback path — Metro
 * resolves `@expo/ui/Switch/index.tsx` here, which wraps `react-native`'s
 * `Switch`). The native SwiftUI/Compose paths are out of jest's scope.
 */

import { render } from '@testing-library/react-native';

import { Switch } from './Switch';

describe('ui/Switch wrapper', () => {
  it('renders without throwing (value=false)', () => {
    expect(() =>
      render(<Switch value={false} onValueChange={() => undefined} testID="switch-smoke" />)
    ).not.toThrow();
  });

  it('renders without throwing (value=true, disabled)', () => {
    expect(() =>
      render(
        <Switch
          value={true}
          onValueChange={() => undefined}
          disabled
          testID="switch-smoke-disabled"
        />
      )
    ).not.toThrow();
  });
});
