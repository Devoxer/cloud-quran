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
    uiCaption: {
      fontFamily: 'System',
      fontSize: 12,
      fontWeight: '400',
      lineHeightMultiplier: 1.3,
    },
  },
}));

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    set: jest.fn(),
    getString: jest.fn(),
    getBoolean: jest.fn(() => false),
    remove: jest.fn(),
  }),
}));

jest.mock('@/services/notifications', () => ({
  requestNotificationPermission: jest.fn().mockResolvedValue(true),
  scheduleReadingReminder: jest.fn().mockResolvedValue(undefined),
  cancelAllReminders: jest.fn().mockResolvedValue(undefined),
}));

const mockReminderState = {
  reminderEnabled: false,
  reminderHour: 8,
  reminderMinute: 0,
  reminderDays: [1, 2, 3, 4, 5, 6, 7],
  toggleReminder: jest.fn(),
  setReminderTime: jest.fn(),
  setReminderDays: jest.fn(),
};

jest.mock('./useReminderStore', () => {
  const useReminderStore = Object.assign(
    (selector: (s: typeof mockReminderState) => unknown) => selector(mockReminderState),
    {
      getState: () => mockReminderState,
      setState: (partial: Partial<typeof mockReminderState>) =>
        Object.assign(mockReminderState, partial),
      subscribe: () => () => {},
    },
  );
  return { useReminderStore };
});

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

import { ReminderSettings } from './ReminderSettings';

describe('ReminderSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockReminderState, {
      reminderEnabled: false,
      reminderHour: 8,
      reminderMinute: 0,
      reminderDays: [1, 2, 3, 4, 5, 6, 7],
    });
  });

  test('renders toggle switch with label', () => {
    const element = (ReminderSettings as any)() as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts).toContain('Reading reminder');
    expect(texts).toContain('Gentle daily reading reminders');
  });

  test('renders switch component with correct value', () => {
    const element = (ReminderSettings as any)() as unknown as MockElement;
    const switches = findElements(
      element,
      (el) => el.props?.onValueChange === mockReminderState.toggleReminder && 'value' in (el.props ?? {}),
    );
    expect(switches.length).toBe(1);
    expect(switches[0].props.value).toBe(false);
  });

  test('does not show time and day controls when disabled', () => {
    const element = (ReminderSettings as any)() as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts).not.toContain('Time');
    expect(texts).not.toContain('Every day');
  });

  test('shows time and day controls when enabled', () => {
    mockReminderState.reminderEnabled = true;
    const element = (ReminderSettings as any)() as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts).toContain('Time');
    expect(texts).toContain('Every day');
    expect(texts).toContain('8:00 AM');
  });

  test('displays formatted time correctly for PM', () => {
    mockReminderState.reminderEnabled = true;
    mockReminderState.reminderHour = 14;
    mockReminderState.reminderMinute = 30;
    const element = (ReminderSettings as any)() as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts).toContain('2:30 PM');
  });

  test('shows "Repeat" label when not all days selected', () => {
    mockReminderState.reminderEnabled = true;
    mockReminderState.reminderDays = [1, 4];
    const element = (ReminderSettings as any)() as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts).toContain('Repeat');
    expect(texts).not.toContain('Every day');
  });

  test('renders 7 day buttons when enabled', () => {
    mockReminderState.reminderEnabled = true;
    const element = (ReminderSettings as any)() as unknown as MockElement;
    const dayButtons = findElements(element, (el) => el.props?.accessibilityRole === 'checkbox');
    expect(dayButtons.length).toBe(7);
  });

  test('renders hour stepper buttons', () => {
    mockReminderState.reminderEnabled = true;
    const element = (ReminderSettings as any)() as unknown as MockElement;
    const decreaseHour = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Decrease hour',
    );
    const increaseHour = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Increase hour',
    );
    expect(decreaseHour.length).toBe(1);
    expect(increaseHour.length).toBe(1);
  });

  test('renders minute stepper buttons', () => {
    mockReminderState.reminderEnabled = true;
    const element = (ReminderSettings as any)() as unknown as MockElement;
    const decreaseMin = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Decrease minute',
    );
    const increaseMin = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Increase minute',
    );
    expect(decreaseMin.length).toBe(1);
    expect(increaseMin.length).toBe(1);
  });

  test('midnight displays as 12:00 AM', () => {
    mockReminderState.reminderEnabled = true;
    mockReminderState.reminderHour = 0;
    mockReminderState.reminderMinute = 0;
    const element = (ReminderSettings as any)() as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts).toContain('12:00 AM');
  });

  test('noon displays as 12:00 PM', () => {
    mockReminderState.reminderEnabled = true;
    mockReminderState.reminderHour = 12;
    mockReminderState.reminderMinute = 0;
    const element = (ReminderSettings as any)() as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts).toContain('12:00 PM');
  });

  test('toggle row fires toggleReminder on press', () => {
    const element = (ReminderSettings as any)() as unknown as MockElement;
    const toggleRow = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Reading reminder',
    )[0];
    (toggleRow.props.onPress as () => void)();
    expect(mockReminderState.toggleReminder).toHaveBeenCalled();
  });

  test('hour increase button calls setReminderTime with incremented hour', () => {
    mockReminderState.reminderEnabled = true;
    const element = (ReminderSettings as any)() as unknown as MockElement;
    const increaseHour = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Increase hour',
    )[0];
    (increaseHour.props.onPress as () => void)();
    expect(mockReminderState.setReminderTime).toHaveBeenCalledWith(9, 0);
  });

  test('minute increase button calls setReminderTime with +5 minutes', () => {
    mockReminderState.reminderEnabled = true;
    const element = (ReminderSettings as any)() as unknown as MockElement;
    const increaseMin = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Increase minute',
    )[0];
    (increaseMin.props.onPress as () => void)();
    expect(mockReminderState.setReminderTime).toHaveBeenCalledWith(8, 5);
  });

  test('day button toggles day selection', () => {
    mockReminderState.reminderEnabled = true;
    const element = (ReminderSettings as any)() as unknown as MockElement;
    const mondayButton = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Monday',
    )[0];
    (mondayButton.props.onPress as () => void)();
    // Monday (day 2) should be removed from [1,2,3,4,5,6,7]
    expect(mockReminderState.setReminderDays).toHaveBeenCalledWith([1, 3, 4, 5, 6, 7]);
  });
});
