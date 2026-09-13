/**
 * `lib/surahName.ts` — the one door that decides which of a surah's three names an interface
 * prints (story 8-1 follow-up).
 *
 * ⚠️ THE LANGUAGE IS DRIVEN THROUGH `i18n.changeLanguage`, NOT THROUGH A MOCK. The predicate under
 * this module is `isArabicUi()` → `getLanguage()` → `i18n.language`, which is exactly what boot
 * commits, so switching the real thing exercises the real chain (the convention `voicePreference`
 * and `formatTime` already follow). A `jest.mock` of `@/lib/rtl` here would pass with the wiring
 * removed, which is the failure mode this story's F1 was.
 */
import i18n from '@/i18n';
import { surahDisplayName, surahIndexNames } from './surahName';

const AL_BAQARAH = {
  nameArabic: 'البقرة',
  nameEnglish: 'The Cow',
  nameTransliteration: 'Al-Baqarah',
};

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('surahDisplayName — ONE name, in the UI language', () => {
  it('is the transliteration under English', async () => {
    await i18n.changeLanguage('en');
    expect(surahDisplayName(AL_BAQARAH)).toBe('Al-Baqarah');
  });

  it('is the Arabic name under Arabic', async () => {
    await i18n.changeLanguage('ar');
    expect(surahDisplayName(AL_BAQARAH)).toBe('البقرة');
  });

  it('never returns the English MEANING, in either language', async () => {
    // `nameEnglish` is "The Cow" — a gloss, not a name. It belongs to the index's supporting line
    // and nowhere else, and a resolver that reached for it would read plausibly at every site.
    for (const language of ['en', 'ar']) {
      await i18n.changeLanguage(language);
      expect(surahDisplayName(AL_BAQARAH)).not.toBe('The Cow');
    }
  });

  it('answers null for a surah the table cannot name, in both languages', async () => {
    for (const language of ['en', 'ar']) {
      await i18n.changeLanguage(language);
      // `SURAH_METADATA[114]` is `undefined`; callers fall back to the number themselves.
      expect(surahDisplayName(undefined)).toBeNull();
      expect(surahDisplayName(null)).toBeNull();
    }
  });
});

describe('surahIndexNames — the cross-script picker row', () => {
  it('under English: transliteration, the meaning, and the Arabic name in the trailing slot', async () => {
    await i18n.changeLanguage('en');
    expect(surahIndexNames(AL_BAQARAH)).toEqual({
      title: 'Al-Baqarah',
      gloss: 'The Cow',
      trailing: 'البقرة',
    });
  });

  it('under Arabic: the Arabic name, the ROMANIZATION as gloss, and NO trailing slot', async () => {
    // ⚠️ The gloss is the romanization rather than "The Cow": `quran-data` has no Arabic gloss, so
    // the English meaning inside an Arabic subtitle is the same mixed-script defect the titles had.
    // And the trailing slot goes away rather than repeating the title.
    await i18n.changeLanguage('ar');
    expect(surahIndexNames(AL_BAQARAH)).toEqual({
      title: 'البقرة',
      gloss: 'Al-Baqarah',
      trailing: null,
    });
  });

  it('shows each script exactly once, whichever language is in force', async () => {
    // The property the two cases above are instances of: a row never prints one script twice, and
    // never omits the other. This is what would redden if someone "simplified" the Arabic branch
    // back to the English one.
    for (const language of ['en', 'ar']) {
      await i18n.changeLanguage(language);
      const slots = surahIndexNames(AL_BAQARAH);
      const printed = [slots.title, slots.gloss, slots.trailing].filter(
        (slot): slot is string => slot !== null
      );
      expect(printed.filter((name) => name === 'البقرة')).toHaveLength(1);
      expect(printed.filter((name) => name === 'Al-Baqarah')).toHaveLength(1);
    }
  });

  it('agrees with surahDisplayName on the title', async () => {
    for (const language of ['en', 'ar']) {
      await i18n.changeLanguage(language);
      expect(surahIndexNames(AL_BAQARAH).title).toBe(surahDisplayName(AL_BAQARAH));
    }
  });
});
