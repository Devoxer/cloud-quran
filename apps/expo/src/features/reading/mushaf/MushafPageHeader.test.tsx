/**
 * The per-page header strip: Juz'/Hizb + the surah's names (story 6-2).
 *
 * The Juz'/Hizb wiring is asserted against `quran-data`'s own lookup functions — the thing under
 * test is that the PAGE reaches them and the label composes them, not the tables themselves
 * (which are quran-data's to verify).
 */

import { render, screen } from '@testing-library/react-native';
import { getHizbForPage, getJuzForPage, SURAH_METADATA } from 'quran-data';
import { MushafPageHeader } from './MushafPageHeader';

describe('MushafPageHeader', () => {
  it('names the Juz’ and Hizb the page sits in', () => {
    render(<MushafPageHeader pageNumber={40} surahNumber={2} />);
    expect(screen.getByText(`Juz' ${getJuzForPage(40)} · Hizb ${getHizbForPage(40)}`)).toBeTruthy();
    // Anti-vacuity: page 40 is not in the first Juz', so a lookup hardwired to 1 reddens.
    expect(getJuzForPage(40)).toBeGreaterThan(1);
  });

  it('names the surah in Arabic and transliteration, from the metadata table', () => {
    render(<MushafPageHeader pageNumber={40} surahNumber={2} />);
    const meta = SURAH_METADATA[1];
    expect(screen.getByText(`${meta.nameArabic} · ${meta.nameTransliteration}`)).toBeTruthy();
  });

  it('renders nothing for a surah number outside the book', () => {
    render(<MushafPageHeader pageNumber={40} surahNumber={200} />);
    expect(screen.queryByTestId('mushaf-page-header-40')).toBeNull();
  });
});
