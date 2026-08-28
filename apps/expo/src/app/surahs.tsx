/**
 * `/surahs` — the Quran index, a pushed ROOT route (story 6-3). NOT a tab — the table grew to
 * four in 6-4 (Bookmarks, a destination collection), but the index stays a PICKER: a root push
 * gets native back-swipe, a real chevron, and covers the tab shell the way a picker should.
 * Thin delegation (the pre-fork shape); the screen lives in `features/quran-index/`.
 */

import { useLocalSearchParams } from 'expo-router';
import { QuranIndexScreen } from '@/features/quran-index';

export default function Surahs() {
  // The opener's mode, validated: anything that is not the mushaf is reading mode.
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <QuranIndexScreen mode={mode === 'mushaf' ? 'mushaf' : 'reading'} />;
}
