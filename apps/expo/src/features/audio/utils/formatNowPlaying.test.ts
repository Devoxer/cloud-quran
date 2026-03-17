import { formatNowPlayingTitle } from './formatNowPlaying';

describe('formatNowPlayingTitle', () => {
  it('formats with surah transliteration name', () => {
    expect(formatNowPlayingTitle(1, '1:3', 'Mishary Rashid Al-Afasy')).toBe(
      'Surah Al-Fatihah : 3 — Mishary Rashid Al-Afasy',
    );
  });

  it('formats Al-Baqarah verse 255', () => {
    expect(formatNowPlayingTitle(2, '2:255', 'Mishary Rashid Al-Afasy')).toBe(
      'Surah Al-Baqarah : 255 — Mishary Rashid Al-Afasy',
    );
  });

  it('formats with different reciter', () => {
    expect(formatNowPlayingTitle(36, '36:1', 'Abdul Rahman Al-Sudais')).toBe(
      'Surah Ya-Sin : 1 — Abdul Rahman Al-Sudais',
    );
  });

  it('formats last surah', () => {
    expect(formatNowPlayingTitle(114, '114:6', 'Abu Bakr Al-Shatri')).toBe(
      'Surah An-Nas : 6 — Abu Bakr Al-Shatri',
    );
  });

  it('falls back to generic name for invalid surah number', () => {
    expect(formatNowPlayingTitle(999, '999:1', 'Reciter')).toBe('Surah 999 : 1 — Reciter');
  });
});
