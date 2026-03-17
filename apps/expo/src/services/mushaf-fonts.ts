import { Directory, File, Paths } from 'expo-file-system';
import * as Font from 'expo-font';
import { TOTAL_PAGES } from 'quran-data';
import { Platform } from 'react-native';

const FONT_CDN_BASE = 'https://raw.githubusercontent.com/nuqayah/qpc-fonts/master/mushaf-woff2';

/**
 * Pages with patched fonts bundled locally.
 * These fonts have degenerate TrueType contours (0 on-curve points) that cause
 * Safari/CoreText to render the affected glyphs as invisible. The patched fonts
 * add an on-curve midpoint to fix rendering.
 * Affected words: 7:35:8, 7:84:8, 7:135:8, 68:47:5, 69:5:3
 */
const PATCHED_FONTS: Record<number, any> = {
  154: require('@/assets/fonts/qpc-patched/QCF_P154.woff2'),
  161: require('@/assets/fonts/qpc-patched/QCF_P161.woff2'),
  166: require('@/assets/fonts/qpc-patched/QCF_P166.woff2'),
  566: require('@/assets/fonts/qpc-patched/QCF_P566.woff2'),
};

/** Get the font family name for a given page number */
export function getPageFontFamily(page: number): string {
  return `QCF_P${String(page).padStart(3, '0')}`;
}

/** Get the CDN URL for a page's font file */
function getFontUrl(page: number): string {
  return `${FONT_CDN_BASE}/${getPageFontFamily(page)}.woff2`;
}

/** Check if a page's font is already cached on disk */
export function isPageFontCached(page: number): boolean {
  if (Platform.OS === 'web') return false;
  const file = new File(Paths.cache, 'qpc-fonts', `${getPageFontFamily(page)}.woff2`);
  return file.exists;
}

/**
 * Load a page's QPC font, downloading and caching if necessary.
 * @returns The font family name to use in styles
 */
export async function loadPageFont(page: number): Promise<string> {
  const fontName = getPageFontFamily(page);

  // Already loaded in memory
  if (Font.isLoaded(fontName)) {
    return fontName;
  }

  // Use bundled patched font if available (fixes degenerate TrueType contours)
  if (PATCHED_FONTS[page]) {
    await Font.loadAsync({ [fontName]: PATCHED_FONTS[page] });
    return fontName;
  }

  if (Platform.OS === 'web') {
    // On web, load directly from CDN — browser handles caching
    await Font.loadAsync({ [fontName]: getFontUrl(page) });
    return fontName;
  }

  // Native: check disk cache, download if missing, then load
  const cacheDir = new Directory(Paths.cache, 'qpc-fonts');
  const fontFile = new File(cacheDir, `${fontName}.woff2`);

  if (!fontFile.exists) {
    // Ensure cache directory exists
    if (!cacheDir.exists) {
      cacheDir.create({ intermediates: true });
    }
    // Download font to cache
    await File.downloadFileAsync(getFontUrl(page), fontFile, { idempotent: true });
  }

  // Load from disk into memory
  await Font.loadAsync({ [fontName]: fontFile.uri });
  return fontName;
}

/**
 * Pre-fetch fonts for adjacent pages in the background.
 * Does not throw — failures are silently ignored.
 */
export async function preloadAdjacentFonts(currentPage: number): Promise<void> {
  const pages: number[] = [];
  for (let offset = -2; offset <= 2; offset++) {
    const p = currentPage + offset;
    if (p >= 1 && p <= TOTAL_PAGES && p !== currentPage) {
      pages.push(p);
    }
  }

  await Promise.allSettled(pages.map((p) => loadPageFont(p)));
}
