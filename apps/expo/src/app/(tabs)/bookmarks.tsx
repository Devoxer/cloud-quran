/**
 * `/bookmarks` — the Bookmarks tab (story 6-4). Thin delegation (the `surahs.tsx` shape); the
 * screen lives in `features/bookmarks/`. Landed TOGETHER with its `TABS` entry, as
 * `constants/navigation.ts` reserves — a tab without its segment makes `expo export` emit no
 * bundle at all.
 */

import { BookmarksScreen } from '@/features/bookmarks';

export default function Bookmarks() {
  return <BookmarksScreen />;
}
