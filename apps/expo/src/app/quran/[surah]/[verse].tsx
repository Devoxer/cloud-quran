import { Redirect, useLocalSearchParams } from 'expo-router';
import { SURAH_METADATA } from 'quran-data';

import { useUIStore } from '@/theme/useUIStore';

export default function DeepLinkVerse() {
  const { surah, verse } = useLocalSearchParams<{ surah: string; verse: string }>();
  const surahNum = Number(surah);
  const verseNum = Number(verse);

  const surahMeta = SURAH_METADATA.find((s) => s.number === surahNum);
  const isValid =
    surahMeta != null &&
    Number.isInteger(surahNum) &&
    Number.isInteger(verseNum) &&
    verseNum >= 1 &&
    verseNum <= surahMeta.verseCount;

  // Set navigation target synchronously before Redirect fires — Zustand state
  // is external to React so this is safe during render and avoids the timing
  // issue where useEffect would fire after Redirect's useLayoutEffect.
  if (isValid) {
    useUIStore.getState().navigateToVerse(surahNum, verseNum);
  }

  return <Redirect href="/(tabs)" />;
}
