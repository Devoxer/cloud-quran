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

import { MagicCodeInput } from '../MagicCodeInput';

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

describe('MagicCodeInput', () => {
  const onSuccess = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders email input on initial screen', () => {
    const element = (MagicCodeInput as any)({ onSuccess, onCancel }) as unknown as MockElement;
    const emailInput = findElements(element, (el) => el.props?.accessibilityLabel === 'Email address');
    expect(emailInput.length).toBe(1);
  });

  it('renders Send Code button', () => {
    const element = (MagicCodeInput as any)({ onSuccess, onCancel }) as unknown as MockElement;
    const sendButton = findElements(element, (el) => el.props?.accessibilityLabel === 'Send code');
    expect(sendButton.length).toBe(1);
  });

  it('renders Cancel button', () => {
    const element = (MagicCodeInput as any)({ onSuccess, onCancel }) as unknown as MockElement;
    const cancelButton = findElements(element, (el) => el.props?.accessibilityLabel === 'Cancel');
    expect(cancelButton.length).toBe(1);
  });

  it('calls onCancel when Cancel is pressed', () => {
    const element = (MagicCodeInput as any)({ onSuccess, onCancel }) as unknown as MockElement;
    const [cancelButton] = findElements(element, (el) => el.props?.accessibilityLabel === 'Cancel');
    (cancelButton.props.onPress as () => void)();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders email placeholder text', () => {
    const element = (MagicCodeInput as any)({ onSuccess, onCancel }) as unknown as MockElement;
    const emailInput = findElements(element, (el) => el.props?.placeholder === 'Email address');
    expect(emailInput.length).toBe(1);
  });
});
