describe('getDefaultMode', () => {
  const OriginalDateTimeFormat = Intl.DateTimeFormat;

  afterEach(() => {
    Intl.DateTimeFormat = OriginalDateTimeFormat;
    jest.resetModules();
  });

  function importFresh() {
    const mod = require('./getDefaultMode') as typeof import('./getDefaultMode');
    return mod.getDefaultMode;
  }

  test('returns mushaf when locale starts with ar', () => {
    Intl.DateTimeFormat = (() => ({
      resolvedOptions: () => ({
        locale: 'ar-SA',
        calendar: '',
        numberingSystem: '',
        timeZone: '',
      }),
      format: () => '',
      formatToParts: () => [],
      formatRange: () => '',
      formatRangeToParts: () => [],
    })) as any;
    const getDefaultMode = importFresh();
    expect(getDefaultMode()).toBe('mushaf');
  });

  test('returns reading when locale is non-Arabic', () => {
    Intl.DateTimeFormat = (() => ({
      resolvedOptions: () => ({
        locale: 'en-US',
        calendar: '',
        numberingSystem: '',
        timeZone: '',
      }),
      format: () => '',
      formatToParts: () => [],
      formatRange: () => '',
      formatRangeToParts: () => [],
    })) as any;
    const getDefaultMode = importFresh();
    expect(getDefaultMode()).toBe('reading');
  });

  test('returns reading when Intl throws', () => {
    Intl.DateTimeFormat = (() => {
      throw new Error('Intl not available');
    }) as any;
    const getDefaultMode = importFresh();
    expect(getDefaultMode()).toBe('reading');
  });

  test('returns a valid ReadingMode type', () => {
    const getDefaultMode = importFresh();
    expect(['reading', 'mushaf']).toContain(getDefaultMode());
  });

  test('is deterministic', () => {
    const getDefaultMode = importFresh();
    expect(getDefaultMode()).toBe(getDefaultMode());
  });
});
