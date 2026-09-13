/**
 * The per-page header strip: Juz'/Hizb + the surah's names (story 6-2).
 *
 * The Juz'/Hizb wiring is asserted against `quran-data`'s own lookup functions — the thing under
 * test is that the PAGE reaches them and the label composes them, not the tables themselves
 * (which are quran-data's to verify).
 */

import { render, screen } from '@testing-library/react-native';
import { getHizbForPage, getJuzForPage, SURAH_METADATA } from 'quran-data';
import i18n from '@/i18n';
import { MushafPageHeader } from './MushafPageHeader';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('MushafPageHeader', () => {
  it('names the Juz’ and Hizb the page sits in', () => {
    render(<MushafPageHeader pageNumber={40} surahNumber={2} />);
    expect(screen.getByText(`Juz' ${getJuzForPage(40)} · Hizb ${getHizbForPage(40)}`)).toBeTruthy();
    // Anti-vacuity: page 40 is not in the first Juz', so a lookup hardwired to 1 reddens.
    expect(getJuzForPage(40)).toBeGreaterThan(1);
  });

  /**
   * ⚠️ THIS CASE REPLACES ONE THAT PINNED `البقرة · Al-Baqarah`, AND THE JOINED FORM IS THE DEFECT
   * (2026-09-13). The chrome title that overlays this same page printed `Al-Baqarah` alone, so one
   * screen carried two disagreeing renderings of one fact — and the Arabic half was only ever
   * there because the interface had no Arabic to put it in. One name, in the UI language, on both
   * surfaces. See `lib/surahName.ts`.
   */
  it('names the surah ONCE, with the transliteration under English', () => {
    render(<MushafPageHeader pageNumber={40} surahNumber={2} />);
    const meta = SURAH_METADATA[1];
    expect(screen.getByText(meta.nameTransliteration)).toBeTruthy();
    expect(screen.queryByText(`${meta.nameArabic} · ${meta.nameTransliteration}`)).toBeNull();
    expect(screen.queryByText(meta.nameArabic)).toBeNull();
  });

  it('names the surah in ARABIC under Arabic, still only once', async () => {
    await i18n.changeLanguage('ar');
    render(<MushafPageHeader pageNumber={40} surahNumber={2} />);
    const meta = SURAH_METADATA[1];
    expect(screen.getByText(meta.nameArabic)).toBeTruthy();
    expect(screen.queryByText(meta.nameTransliteration)).toBeNull();
  });

  it('draws the Juz’/Hizb numbers in Arabic-Indic digits under Arabic', async () => {
    // Story 8-1 shipped `الجزء 1 · الحزب 1` — Latin digits under a facsimile whose own ayah markers
    // the QPC font draws as `٦ ٧ ٨`. The expected string is a LITERAL, not `getJuzForPage(40)` run
    // back through the formatter: page 40 is Juz' 2 / Hizb 4, so neither a hardcoded `١` nor a
    // swapped pair can pass, and the case cannot restate whatever the code happens to compute.
    await i18n.changeLanguage('ar');
    render(<MushafPageHeader pageNumber={40} surahNumber={2} />);
    expect(screen.getByText('الجزء ٢ · الحزب ٤')).toBeTruthy();
  });

  it('renders nothing for a surah number outside the book', () => {
    render(<MushafPageHeader pageNumber={40} surahNumber={200} />);
    expect(screen.queryByTestId('mushaf-page-header-40')).toBeNull();
  });
});
