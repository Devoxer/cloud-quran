jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => (fn as () => unknown)(),
  useRef: (val: unknown) => ({ current: val ?? null }),
  useEffect: () => {},
  useState: (initial: unknown) => [
    typeof initial === 'function' ? (initial as () => unknown)() : initial,
    jest.fn(),
  ],
}));

jest.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({
    tokens: {
      text: { quran: '#000', translation: '#333', ui: '#666' },
      surface: { primary: '#FFF', secondary: '#EEE' },
      accent: { audio: '#2E7D5A', highlight: '#FFF3CD', bookmark: '#C9956B' },
      border: '#DDD',
      status: { error: '#C00', errorText: '#FFF' },
    },
  }),
}));

jest.mock('@/theme/useUIStore', () => ({
  useUIStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ fontSize: 28 }),
  ),
}));

import { ConsentForm } from '../ConsentForm';

interface MockElement {
  type: string | ((...args: unknown[]) => unknown);
  props: Record<string, unknown>;
}

function findElements(element: unknown, predicate: (el: MockElement) => boolean): MockElement[] {
  const results: MockElement[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    const el = node as MockElement;
    if (predicate(el)) results.push(el);
    if (el.props?.children) {
      const children = Array.isArray(el.props.children) ? el.props.children : [el.props.children];
      children.forEach(walk);
    }
  }
  walk(element);
  return results;
}

describe('ConsentForm', () => {
  const onAccept = jest.fn();
  const onDecline = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders consent text explaining what data syncs', () => {
    const element = (ConsentForm as any)({ onAccept, onDecline }) as unknown as MockElement;
    const found = findElements(
      element,
      (el) =>
        typeof el.props?.children === 'string' &&
        el.props.children.includes('reading position, bookmarks, and preferences will sync through InstantDB'),
    );
    expect(found.length).toBeGreaterThan(0);
  });

  it('renders Accept and Decline buttons', () => {
    const element = (ConsentForm as any)({ onAccept, onDecline }) as unknown as MockElement;
    const acceptButton = findElements(element, (el) => el.props?.accessibilityLabel === 'Accept consent');
    const declineButton = findElements(element, (el) => el.props?.accessibilityLabel === 'Decline consent');
    expect(acceptButton.length).toBe(1);
    expect(declineButton.length).toBe(1);
  });

  it('calls onAccept when Accept button is pressed', () => {
    const element = (ConsentForm as any)({ onAccept, onDecline }) as unknown as MockElement;
    const [acceptButton] = findElements(element, (el) => el.props?.accessibilityLabel === 'Accept consent');
    (acceptButton.props.onPress as () => void)();
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('calls onDecline when Decline button is pressed', () => {
    const element = (ConsentForm as any)({ onAccept, onDecline }) as unknown as MockElement;
    const [declineButton] = findElements(element, (el) => el.props?.accessibilityLabel === 'Decline consent');
    (declineButton.props.onPress as () => void)();
    expect(onDecline).toHaveBeenCalledTimes(1);
  });
});
