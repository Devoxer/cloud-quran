jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => (fn as () => unknown)(),
  useRef: (val: unknown) => ({ current: val ?? null }),
  useEffect: (fn: () => void) => fn(),
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

// Mock child components as string types so they appear in the tree
jest.mock('../AppleSignInButton', () => ({ AppleSignInButton: 'AppleSignInButton' }));
jest.mock('../GoogleSignInButton', () => ({ GoogleSignInButton: 'GoogleSignInButton' }));
jest.mock('../MagicCodeInput', () => ({ MagicCodeInput: 'MagicCodeInput' }));

import { SignInMethodList } from '../SignInMethodList';

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

function findByText(element: unknown, text: string): MockElement[] {
  return findElements(element, (el) => {
    if (typeof el.props?.children === 'string' && el.props.children.includes(text)) return true;
    return false;
  });
}

function findByType(element: unknown, typeName: string): MockElement[] {
  return findElements(element, (el) => {
    if (typeof el.type === 'string' && el.type === typeName) return true;
    return false;
  });
}

describe('SignInMethodList', () => {
  const onSuccess = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders GoogleSignInButton component', () => {
    const element = (SignInMethodList as any)({ onSuccess, onCancel }) as unknown as MockElement;
    const googleButtons = findByType(element, 'GoogleSignInButton');
    expect(googleButtons.length).toBe(1);
  });

  it('renders AppleSignInButton component', () => {
    const element = (SignInMethodList as any)({ onSuccess, onCancel }) as unknown as MockElement;
    const appleButtons = findByType(element, 'AppleSignInButton');
    expect(appleButtons.length).toBe(1);
  });

  it('renders "Sign in with email" link', () => {
    const element = (SignInMethodList as any)({ onSuccess, onCancel }) as unknown as MockElement;
    const emailLink = findByText(element, 'Sign in with email');
    expect(emailLink.length).toBe(1);
  });

  it('renders cancel button', () => {
    const element = (SignInMethodList as any)({ onSuccess, onCancel }) as unknown as MockElement;
    const cancelButtons = findByText(element, 'Cancel');
    expect(cancelButtons.length).toBeGreaterThan(0);
  });

  it('renders title "Sign in to sync"', () => {
    const element = (SignInMethodList as any)({ onSuccess, onCancel }) as unknown as MockElement;
    const title = findByText(element, 'Sign in to sync');
    expect(title.length).toBe(1);
  });

  it('passes onSuccess to child components', () => {
    const element = (SignInMethodList as any)({ onSuccess, onCancel }) as unknown as MockElement;
    const [googleButton] = findByType(element, 'GoogleSignInButton');
    const [appleButton] = findByType(element, 'AppleSignInButton');
    expect(googleButton.props.onSuccess).toBe(onSuccess);
    expect(appleButton.props.onSuccess).toBe(onSuccess);
  });
});
