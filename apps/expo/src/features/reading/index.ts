/**
 * Reading Mode — the public surface of the feature (story 6-1).
 *
 * `lint:layers` rule 4: siblings inside this feature import each other DIRECTLY (`./hooks/…`,
 * `./components/…`); importing this barrel from inside the feature would close a require cycle.
 * Everything outside comes through here.
 */

export { NextSurahButton, nextSurah } from './components/NextSurahButton';
export {
  CHROME_BAR_HEIGHT,
  ReadingChrome,
  type ReadingChromeProps,
} from './components/ReadingChrome';
export { VerseRow, type VerseRowProps } from './components/VerseRow';
export { CHROME_TRAVEL, type ChromeReveal, useChromeReveal } from './hooks/useChromeReveal';
export { type SurahContent, useSurah } from './hooks/useSurah';
