import type { MushafPageLayout } from 'quran-data';

import allLayouts from '@/data/mushaf-layouts.json';

const layoutMap = allLayouts as unknown as Record<string, MushafPageLayout>;

/**
 * Get the mushaf layout data for a given page.
 * Data is bundled locally (generated from zonetecde/mushaf-layout at build time).
 */
export async function getPageLayout(page: number): Promise<MushafPageLayout> {
  const layout = layoutMap[String(page)];
  if (!layout) {
    throw new Error(`No layout data for page ${page}`);
  }
  return layout;
}

/** No-op — data is bundled, no cache to clear */
export function clearLayoutCache(): void {
  // Data is imported statically, nothing to clear
}
