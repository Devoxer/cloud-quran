import { getCalendars, getLocales } from 'expo-localization';
import {
  _resetLocalizationCache,
  getCachedLocale,
  getDeviceLocale,
  initLocalization,
} from './localization';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(),
  getCalendars: jest.fn(),
}));

const mockGetLocales = getLocales as jest.Mock;
const mockGetCalendars = getCalendars as jest.Mock;

function setLocale(
  overrides: Partial<{
    languageTag: string;
    languageCode: string | null;
    regionCode: string | null;
    textDirection: 'ltr' | 'rtl';
  }> = {},
  timeZone: string | null = 'America/Los_Angeles'
) {
  mockGetLocales.mockReturnValue([
    {
      languageTag: 'en-US',
      languageCode: 'en',
      regionCode: 'US',
      textDirection: 'ltr',
      ...overrides,
    },
  ]);
  mockGetCalendars.mockReturnValue([{ timeZone }]);
}

beforeEach(() => {
  jest.clearAllMocks();
  _resetLocalizationCache();
});

describe('getDeviceLocale', () => {
  it('maps the preferred locale + timezone', () => {
    setLocale({ languageTag: 'pl-PL', languageCode: 'pl', regionCode: 'PL' }, 'Europe/Warsaw');
    expect(getDeviceLocale()).toEqual({
      languageTag: 'pl-PL',
      languageCode: 'pl',
      regionCode: 'PL',
      textDirection: 'ltr',
      timeZone: 'Europe/Warsaw',
    });
  });

  it("falls back to 'UTC' when the calendar timezone is null", () => {
    setLocale({}, null);
    expect(getDeviceLocale().timeZone).toBe('UTC');
  });

  it("falls back to 'en' when languageCode is null", () => {
    setLocale({ languageCode: null });
    expect(getDeviceLocale().languageCode).toBe('en');
  });

  it('preserves rtl text direction', () => {
    setLocale({ languageTag: 'ar-EG', languageCode: 'ar', textDirection: 'rtl' });
    expect(getDeviceLocale().textDirection).toBe('rtl');
  });
});

describe('initLocalization', () => {
  it('reads the device locale once and caches it', () => {
    setLocale({ languageTag: 'fr-FR', languageCode: 'fr' });
    const first = initLocalization();
    const second = initLocalization();
    expect(first).toBe(second); // same cached reference
    expect(mockGetLocales).toHaveBeenCalledTimes(1);
    expect(first.languageTag).toBe('fr-FR');
  });

  it('exposes the cached locale via getCachedLocale', () => {
    setLocale();
    expect(getCachedLocale()).toBeNull();
    initLocalization();
    expect(getCachedLocale()).not.toBeNull();
    expect(getCachedLocale()?.languageTag).toBe('en-US');
  });
});
