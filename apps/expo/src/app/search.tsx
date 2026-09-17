/**
 * `/search` — Quran search, a pushed ROOT route beside the index (story 6-7). NOT a tab: the tab
 * table is four entries and `TABS[0]` ordering is load-bearing, and search is a PICKER the reader
 * leaves as soon as it has answered, exactly like `/surahs`. Thin delegation (the pre-fork
 * shape); the screen lives in `features/search/`.
 */

import { useLocalSearchParams } from 'expo-router';
import { SearchScreen } from '@/features/search';

export default function Search() {
  // The opener's mode, validated: anything that is not the mushaf is reading mode.
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <SearchScreen mode={mode === 'mushaf' ? 'mushaf' : 'reading'} />;
}
