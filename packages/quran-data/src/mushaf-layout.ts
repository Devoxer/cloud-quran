export interface MushafWord {
  /** Word location as "surah:verse:wordIndex" e.g. "2:1:1" */
  location: string;
  /** Arabic text of the word */
  word: string;
  /** QPC v1 glyph character(s) — render with per-page QCF_P### font */
  qpcV1: string;
  /** QPC v2 glyph character(s) — alternative font version */
  qpcV2: string;
  /** For cross-page words: the page whose font encodes qpcV1/V2 glyphs.
   *  When present, use QCF_P{fontPage} instead of the current page's font. */
  fontPage?: number;
}

export interface MushafLine {
  /** Line number on the page (1-based) */
  line: number;
  /** Line type determines rendering style */
  type: 'surah-header' | 'basmala' | 'text';
  /** Full Arabic text of the line */
  text?: string;
  /** Surah number string for surah-header lines (e.g. "001") */
  surah?: string;
  /** Verse range for text lines (e.g. "2:1-2:5") */
  verseRange?: string;
  /** Word-by-word data for text and basmala lines */
  words?: MushafWord[];
  /** QPC v1 glyph for basmala line (line-level, not in words) */
  qpcV1?: string;
  /** QPC v2 glyph for basmala line (line-level, not in words) */
  qpcV2?: string;
}

export interface MushafPageLayout {
  /** Page number (1-604) */
  page: number;
  /** Lines on this page */
  lines: MushafLine[];
}

