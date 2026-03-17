export interface Verse {
  surah: number; // 1-114
  verse: number; // verse within surah
  textUthmani: string; // Uthmani script text
  textSimple: string; // Simple Arabic text
}

export interface Surah {
  number: number; // 1-114
  nameArabic: string; // Arabic name
  nameEnglish: string; // English name
  nameTransliteration: string; // Transliterated name
  verseCount: number;
  revelationType: 'meccan' | 'medinan';
  order: number; // Revelation order
}

export interface Page {
  pageNumber: number; // 1-604
  surah: number;
  startVerse: number;
  endVerse: number;
}

export interface VerseTiming {
  surah: number;
  verse: number;
  startTime: number; // milliseconds
  endTime: number; // milliseconds
  reciterId: string;
}
