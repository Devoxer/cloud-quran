import { SURAH_METADATA } from 'quran-data';

export function formatNowPlayingTitle(
  surahNumber: number,
  verseKey: string,
  reciterName: string,
): string {
  const surah = SURAH_METADATA[surahNumber - 1];
  const surahName = surah?.nameTransliteration ?? String(surahNumber);
  const verseNumber = verseKey.split(':')[1] ?? '1';
  return `Surah ${surahName} : ${verseNumber} — ${reciterName}`;
}
