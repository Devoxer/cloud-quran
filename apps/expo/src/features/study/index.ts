/**
 * The study sheet — the public surface of the feature (story 8-3).
 *
 * `lint:layers` rule 4: files inside this feature import each other DIRECTLY (`../lib/…`); only
 * the outside world comes through here.
 *
 * ⚠️ ONE EXPORT, AND THAT IS THE WHOLE SURFACE. `ReadingChrome` renders the sheet beside
 * `ReciterSheet` and `PlaybackOptionsSheet`, outside both animated bars, and nothing else in the
 * app touches this feature — a second entry point is an "Ask First" in the story's frozen scope.
 * The scope model, the type table and both hooks are deliberately NOT here: `features/packs`'
 * barrel records the reason, and it is the one this repo keeps paying for — an export with no
 * outside caller is a surface the feature then owes compatibility to.
 */

export { StudySheet, type StudySheetProps } from './components/StudySheet';
