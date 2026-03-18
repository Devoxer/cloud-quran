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

// Mock @/services/mmkv directly to avoid react-native-nitro-modules native crash
jest.mock('@/services/mmkv', () => ({
  mmkv: {
    set: jest.fn(),
    getString: jest.fn(),
    getBoolean: jest.fn(),
    remove: jest.fn(),
  },
  mmkvStorage: { setItem: jest.fn(), getItem: jest.fn(), removeItem: jest.fn() },
}));

const mockMmkvInstance = require('@/services/mmkv').mmkv;

import { ConsentScreen, hasGdprConsent, setGdprConsent } from './ConsentScreen';

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

describe('ConsentScreen', () => {
  const onAgree = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders consent text about data sync', () => {
    const element = (ConsentScreen as any)({ onAgree, onCancel }) as unknown as MockElement;
    const texts = findTextContent(element);
    const hasConsentText = texts.some((t) =>
      t.includes('reading position, bookmarks, and preferences will sync'),
    );
    expect(hasConsentText).toBe(true);
  });

  test('renders GDPR Article 9 mention', () => {
    const element = (ConsentScreen as any)({ onAgree, onCancel }) as unknown as MockElement;
    const texts = findTextContent(element);
    const hasGdprMention = texts.some((t) => t.includes('GDPR Article 9'));
    expect(hasGdprMention).toBe(true);
  });

  test('renders I Agree button with accessibility', () => {
    const element = (ConsentScreen as any)({ onAgree, onCancel }) as unknown as MockElement;
    const agreeButtons = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'I agree to sync my data',
    );
    expect(agreeButtons.length).toBe(1);
  });

  test('renders Cancel button with accessibility', () => {
    const element = (ConsentScreen as any)({ onAgree, onCancel }) as unknown as MockElement;
    const cancelButtons = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Cancel and return to settings',
    );
    expect(cancelButtons.length).toBe(1);
  });

  test('I Agree button stores consent and calls onAgree', () => {
    const element = (ConsentScreen as any)({ onAgree, onCancel }) as unknown as MockElement;
    const agreeButton = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'I agree to sync my data',
    )[0];
    const handler = agreeButton.props.onPress as () => void;
    handler();
    expect(mockMmkvInstance.set).toHaveBeenCalledWith('gdpr-sync-consent', true);
    expect(onAgree).toHaveBeenCalled();
  });

  test('Cancel button calls onCancel', () => {
    const element = (ConsentScreen as any)({ onAgree, onCancel }) as unknown as MockElement;
    const cancelButton = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Cancel and return to settings',
    )[0];
    const handler = cancelButton.props.onPress as () => void;
    handler();
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('hasGdprConsent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns true when consent is stored', () => {
    mockMmkvInstance.getBoolean.mockReturnValue(true);
    expect(hasGdprConsent()).toBe(true);
  });

  test('returns false when no consent stored', () => {
    mockMmkvInstance.getBoolean.mockReturnValue(undefined);
    expect(hasGdprConsent()).toBe(false);
  });
});

describe('setGdprConsent', () => {
  test('stores consent flag in MMKV', () => {
    setGdprConsent(true);
    expect(mockMmkvInstance.set).toHaveBeenCalledWith('gdpr-sync-consent', true);
  });
});
