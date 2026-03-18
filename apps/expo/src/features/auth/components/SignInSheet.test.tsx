function mockFullLightTheme() {
  return {
    surface: { primary: '#FAF8F5', secondary: '#F0EDE8' },
    text: { quran: '#1A1A1A', translation: '#4A4A4A', ui: '#6B6B6B' },
    accent: { highlight: '#FFF3CD', audio: '#2E7D5A', bookmark: '#C9956B' },
    border: '#E8E4DF',
    status: { error: '#C0392B', errorText: '#FFFFFF' },
  };
}

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
  useTheme: () => ({ tokens: mockFullLightTheme(), themeName: 'light' as const }),
}));

jest.mock('@/theme/tokens', () => ({
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48, '4xl': 64, '5xl': 96 },
  typography: {
    ui: { fontFamily: 'System', fontSize: 14, fontWeight: '400', lineHeightMultiplier: 1.4 },
    uiCaption: { fontFamily: 'System', fontSize: 12, fontWeight: '400', lineHeightMultiplier: 1.3 },
  },
}));

jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));

jest.mock('@/services/mmkv', () => ({
  mmkv: {
    set: jest.fn(),
    getString: jest.fn(),
    getBoolean: jest.fn(),
    remove: jest.fn(),
  },
  mmkvStorage: {
    setItem: jest.fn(),
    getItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/theme/useUIStore', () => ({
  useUIStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector({ fontSize: 28 }),
    { getState: () => ({}), setState: () => {}, subscribe: () => () => {} },
  ),
}));

import { SignInSheet } from './SignInSheet';

interface MockElement {
  type: string | ((...args: unknown[]) => unknown);
  props: Record<string, unknown>;
}

function findTextContent(element: unknown): string[] {
  const texts: string[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    if (typeof node === 'string') {
      texts.push(node);
      return;
    }
    const el = node as MockElement;
    if (typeof el.props?.children === 'string') texts.push(el.props.children);
    if (el.props?.children) {
      const children = Array.isArray(el.props.children) ? el.props.children : [el.props.children];
      children.forEach(walk);
    }
  }
  walk(element);
  return texts;
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

describe('SignInSheet', () => {
  const onAppleSignIn = jest.fn().mockResolvedValue(undefined);
  const onGoogleSignIn = jest.fn().mockResolvedValue(undefined);
  const onMagicLinkSignIn = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders "Sign in to sync" title', () => {
    const element = (SignInSheet as any)({
      onAppleSignIn,
      onGoogleSignIn,
      onMagicLinkSignIn,
    }) as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts).toContain('Sign in to sync');
  });

  test('renders Google sign-in button with accessibility', () => {
    const element = (SignInSheet as any)({
      onAppleSignIn,
      onGoogleSignIn,
      onMagicLinkSignIn,
    }) as unknown as MockElement;
    const googleButtons = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Sign in with Google',
    );
    expect(googleButtons.length).toBe(1);
  });

  test('renders email input with accessibility', () => {
    const element = (SignInSheet as any)({
      onAppleSignIn,
      onGoogleSignIn,
      onMagicLinkSignIn,
    }) as unknown as MockElement;
    const emailInputs = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Email address',
    );
    expect(emailInputs.length).toBe(1);
  });

  test('renders Send Magic Link button with accessibility', () => {
    const element = (SignInSheet as any)({
      onAppleSignIn,
      onGoogleSignIn,
      onMagicLinkSignIn,
    }) as unknown as MockElement;
    const magicButtons = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Send magic link',
    );
    expect(magicButtons.length).toBe(1);
  });

  test('Send Magic Link button is disabled when email is empty', () => {
    const element = (SignInSheet as any)({
      onAppleSignIn,
      onGoogleSignIn,
      onMagicLinkSignIn,
    }) as unknown as MockElement;
    const magicButton = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Send magic link',
    )[0];
    expect(magicButton.props.disabled).toBe(true);
  });

  test('renders "or" divider', () => {
    const element = (SignInSheet as any)({
      onAppleSignIn,
      onGoogleSignIn,
      onMagicLinkSignIn,
    }) as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts).toContain('or');
  });
});
