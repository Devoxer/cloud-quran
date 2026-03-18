import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SURAH_METADATA, type SurahMetadata } from 'quran-data';

const dataDir = resolve(process.cwd(), '../../packages/quran-data/data');

interface XmlAya {
  '@_index': string;
  '@_text': string;
}

interface XmlSura {
  '@_index': string;
  '@_name': string;
  aya: XmlAya | XmlAya[];
}

interface XmlQuran {
  quran: { sura: XmlSura[] };
}

interface TafsirEntry {
  surah_number: number;
  verse_number: number;
  text: string;
}

function parseXml(filename: string): Map<string, string> {
  const xml = readFileSync(resolve(dataDir, filename), 'utf-8');
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml) as XmlQuran;
  const map = new Map<string, string>();

  for (const sura of parsed.quran.sura) {
    const ayas = Array.isArray(sura.aya) ? sura.aya : [sura.aya];
    for (const aya of ayas) {
      map.set(`${sura['@_index']}:${aya['@_index']}`, aya['@_text']);
    }
  }
  return map;
}

// Load all data once at build time
const arabicText = parseXml('quran-uthmani.xml');
const englishText = parseXml('en.sahih.xml');

// Load tafsir and index by surah:verse
const tafsirRaw: TafsirEntry[] = JSON.parse(
  readFileSync(resolve(dataDir, 'tafsir-ibn-kathir.json'), 'utf-8'),
);
const tafsirMap = new Map<string, string>();
for (const entry of tafsirRaw) {
  tafsirMap.set(`${entry.surah_number}:${entry.verse_number}`, entry.text);
}

export function getVerseData(surah: number, verse: number) {
  const key = `${surah}:${verse}`;
  return {
    arabic: arabicText.get(key) ?? '',
    translation: englishText.get(key) ?? '',
    tafsir: tafsirMap.get(key) ?? '',
  };
}

export function getTafsirExcerpt(text: string, maxLength = 300): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${truncated.slice(0, lastSpace > 0 ? lastSpace : maxLength)}…`;
}

export { SURAH_METADATA, type SurahMetadata };
