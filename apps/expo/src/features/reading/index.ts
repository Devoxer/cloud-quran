/**
 * Reading Mode — the public surface of the feature (story 6-1).
 *
 * `lint:layers` rule 4: siblings inside this feature import each other DIRECTLY (`./hooks/…`,
 * `./components/…`); importing this barrel from inside the feature would close a require cycle.
 * Everything outside comes through here.
 */

// `CHROME_BAR_HEIGHT` moved to `@/constants/navigation` in story 6-6 — the height is the
// app-wide chrome's, not this feature's, now that `AppHeader`/`AppTabBar` share it.
export { ReadingChrome, type ReadingChromeProps } from './components/ReadingChrome';
// story 6-3: `NextSurahButton` is deleted — `SurahNavigator` is prev + next, both ends wrapping.
export { nextSurah, prevSurah, SurahNavigator } from './components/SurahNavigator';
export { VerseRow, type VerseRowProps } from './components/VerseRow';
export { WelcomeBackBanner } from './components/WelcomeBackBanner';
// `CHROME_DWELL_MS` is deliberately NOT re-exported: it is the hook's own timing and its only
// reader outside the hook is that hook's test, which imports it directly.
export { CHROME_TRAVEL, type ChromeReveal, useChromeReveal } from './hooks/useChromeReveal';
export { type SurahContent, useSurah } from './hooks/useSurah';
// story 7-6: the surface tap and its empty-area rule — one gesture, both reading surfaces.
export { type SurfaceTap, useSurfaceTap } from './hooks/useSurfaceTap';
export { MushafPage, type MushafPageProps } from './mushaf/MushafPage';
