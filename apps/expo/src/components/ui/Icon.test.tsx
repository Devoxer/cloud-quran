/**
 * Icon + icon-registry tests (Story 17.4.2 Thread E, AC-19).
 *
 * - Render-smoke: <Icon> renders for a semantic name and forwards testID.
 * - Registry completeness: EVERY entry maps to a non-empty `sf` (iOS SF Symbol) AND `ion`
 *   (Android/Web Ionicons) name. tsc already guarantees the names are VALID (the typed unions
 *   reject typos); this guards against an accidentally-empty entry the type system would still
 *   allow only if widened — it stays a real, cheap regression net. Story 28.2: `md` → `ion`.
 */
import { render } from '@testing-library/react-native';
import { Icon } from './Icon';
import { ICON_REGISTRY, type IconName } from './icon-registry';

describe('Icon', () => {
  it('renders for a semantic name and forwards testID', () => {
    const { getByTestId } = render(<Icon name="search" testID="icon-search" />);
    expect(getByTestId('icon-search')).toBeTruthy();
  });

  it('renders a registry name that uses the outline→base Material mapping', () => {
    const { getByTestId } = render(<Icon name="trash-outline" testID="icon-trash" />);
    expect(getByTestId('icon-trash')).toBeTruthy();
  });
});

describe('ICON_REGISTRY', () => {
  const names = Object.keys(ICON_REGISTRY) as IconName[];

  it('has entries', () => {
    expect(names.length).toBeGreaterThan(50);
  });

  it.each(names)('maps "%s" to a non-empty sf + ion name', (name) => {
    const entry = ICON_REGISTRY[name];
    expect(typeof entry.sf).toBe('string');
    expect(entry.sf.length).toBeGreaterThan(0);
    expect(typeof entry.ion).toBe('string');
    expect(entry.ion.length).toBeGreaterThan(0);
  });
});
