/**
 * mushafFonts — load the per-page QPC V1 faces the mushaf renders with (story 6-2, adapted from
 * the pre-fork `services/mushaf-fonts.ts`, recoverable at `ab66525`).
 *
 * One page = one font. Each `QCF_P{NNN}.woff2` encodes that page's pre-composed line glyphs, so
 * rendering page N requires face `QCF_P{NNN}` and nothing else — `fontPage` cross-page machinery
 * exists in the layout types and occurs ZERO times in all 604 pages, so it is not ported.
 *
 * ── The order of the branches is the contract ────────────────────────────────────────────────
 *
 * 1. **`Font.isLoaded` short-circuit** — a face already registered this session is free.
 * 2. **Patched fonts WIN, before any platform or network branch.** SIX glyphs across the
 *    upstream copies for pages 154/161/166/302/472/566 contain a two-point contour whose first
 *    point is off-curve, which makes CoreText and Skia discard the WHOLE glyph and leave a
 *    word-shaped hole at its advance — affected words 7:35:8, 7:84:8, 7:135:8, 18:80:9, 40:49:4,
 *    68:47:5. The repaired files are bundled at `assets/fonts/qpc-patched/`; loading them first
 *    means those six pages never fetch, never miss, and never draw a hole in the text.
 *
 *    ⚠️ THE SET WAS FOUND BY SWEEPING, NOT BY REPORTS, AND THE FIRST FOUR WERE INCOMPLETE.
 *    `node scripts/lint-mushaf-glyphs.mjs --corpus <clone>` rasterises all 88,246 glyph slots the
 *    layout references across all 604 pages and selects exactly these six. Page 302 (`18:80:9`)
 *    was a reader report; page 472 (`40:49:4`) nobody had ever noticed. Page 566's glyph has TWO
 *    such contours and the original patch repaired ONE, so `68:47:5` stayed invisible while the
 *    prose credited the second contour to `69:5:3` — a different codepoint that has always been
 *    sound. `lint:mushaf-glyphs` runs on every push and pins this list against the files on disk.
 * 3. **Web** — load straight from the CDN URL; the browser's HTTP cache is the disk cache.
 * 4. **Native** — download once into a DOCUMENT-directory cache, then load from disk.
 *
 * ⚠️ THE FORMAT IS PER-PLATFORM, AND ANDROID IS THE REASON. Android's `Typeface` loader accepts
 * TTF/OTF and **not WOFF2** — and `Font.loadAsync` RESOLVES ANYWAY, so `loadPageFont` returned a
 * family name, `MushafPage` rendered, no error surface appeared, and every page drew in the system
 * fallback. What the reader saw was not a blank page or an obviously wrong font: QPC V1 maps a
 * page's ligatures onto Arabic Presentation Forms-A from U+FB51, so with no face applied those
 * codepoints render as their LITERAL Unicode meaning — a run of disconnected Arabic letters that
 * reads as plausible Arabic. The app silently displayed text that was not the Quran, under a
 * correctly-rendered basmala. Measured on a Pixel 9 Pro emulator, 2026-08-28; the file was present
 * and byte-identical to the CDN's, so nothing about the download was wrong.
 *
 * Native therefore fetches `.ttf` and web keeps `.woff2` (~2.8× smaller, and browsers handle it).
 * The BUNDLED patched six are TTF only — one file each, valid on every platform, and a woff2 copy
 * would reintroduce exactly this bug for the six pages that are supposed to be the safe ones.
 *
 * ⚠️ THE CACHE LIVES IN THE DOCUMENT DIRECTORY, NOT `Paths.cache` (the pre-fork choice, changed
 * deliberately). The OS may evict the cache directory under disk pressure, and an evicted page
 * font is a broken offline promise — a page the reader HAS visited would stop rendering in
 * airplane mode. The document directory is not evicted.
 *
 * ⚠️ FONTS COME FROM THE APP'S OWN CDN ONLY (`constants/mushaf.ts` for why raw.githubusercontent
 * is forbidden: a per-page fetch discloses which pages a reader opens, and only Cloudflare is a
 * named processor).
 *
 * `lint:layers` rule 5: this is a shared `lib/` module — it must not import features, and it
 * imports only `expo-font`, `expo-file-system`, `react-native`'s Platform and constants.
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as Font from 'expo-font';
import { TOTAL_PAGES } from 'quran-data';
import { Platform } from 'react-native';
import { MUSHAF_FONT_CDN_BASE } from '@/constants/mushaf';

/**
 * Pages whose repaired fonts ship in the bundle. Keys are the page numbers; values are Metro
 * asset module ids (`require` of a `.ttf`, which `metro.config.js` lists in `assetExts`).
 */
const PATCHED_FONTS: Record<number, number> = {
  154: require('@/assets/fonts/qpc-patched/QCF_P154.ttf'),
  161: require('@/assets/fonts/qpc-patched/QCF_P161.ttf'),
  166: require('@/assets/fonts/qpc-patched/QCF_P166.ttf'),
  302: require('@/assets/fonts/qpc-patched/QCF_P302.ttf'),
  472: require('@/assets/fonts/qpc-patched/QCF_P472.ttf'),
  566: require('@/assets/fonts/qpc-patched/QCF_P566.ttf'),
};

/** The pages `PATCHED_FONTS` covers — exported so the test pins the exact set. */
export const PATCHED_FONT_PAGES = [154, 161, 166, 302, 472, 566] as const;

/** Subdirectory of the document directory the downloaded faces live in. */
const FONT_CACHE_DIR = 'qpc-fonts';

/**
 * A page font that could not be loaded — named so `useMushafPage` can turn the rejection into an
 * error VALUE (a retry surface) rather than letting an anonymous network error look like a bug.
 */
export class MushafFontError extends Error {
  readonly page: number;
  constructor(page: number, cause: unknown) {
    super(`Font for mushaf page ${page} could not be loaded`, { cause });
    this.name = 'MushafFontError';
    this.page = page;
  }
}

/** The registered family name for a page — `QCF_P001` … `QCF_P604`, same string on every
 *  platform because `Font.loadAsync` registers it under exactly the key we pass (the
 *  `constants/arabic.ts` per-platform trap applies to config-plugin fonts, not to these). */
export function getPageFontFamily(page: number): string {
  return `QCF_P${String(page).padStart(3, '0')}`;
}

/**
 * The face format this platform can actually load. See the header: Android cannot parse WOFF2 and
 * `Font.loadAsync` does not fail when it tries, so this is a correctness switch, not an
 * optimisation. iOS takes TTF too, so native is one branch rather than two.
 *
 * ⚠️ A FUNCTION, NOT A MODULE-LOAD CONSTANT. `Platform.OS` is fixed in production, but a
 * const evaluated at import time freezes the answer before any test can set the platform — which
 * would leave the web branch permanently asserting the native extension, i.e. the one thing this
 * split exists to keep apart would be untestable.
 */
function fontExt(): string {
  return Platform.OS === 'web' ? 'woff2' : 'ttf';
}

/** CDN URL for a page's font, in this platform's format. */
function getFontUrl(page: number): string {
  return `${MUSHAF_FONT_CDN_BASE}/${getPageFontFamily(page)}.${fontExt()}`;
}

/**
 * Load one page's font, downloading and caching if necessary. Resolves to the family name;
 * rejects with `MushafFontError` (offline + uncached is the expected instance of it).
 */
export async function loadPageFont(page: number): Promise<string> {
  const fontName = getPageFontFamily(page);

  if (Font.isLoaded(fontName)) return fontName;

  try {
    // Patched faces first — bundled, so no network on any platform. See the header.
    const patched = PATCHED_FONTS[page];
    if (patched !== undefined) {
      await Font.loadAsync({ [fontName]: patched });
      return fontName;
    }

    if (Platform.OS === 'web') {
      await Font.loadAsync({ [fontName]: getFontUrl(page) });
      return fontName;
    }

    // Native: document-directory cache, download on first visit, load from disk.
    const cacheDir = new Directory(Paths.document, FONT_CACHE_DIR);
    const fontFile = new File(cacheDir, `${fontName}.${fontExt()}`);
    if (!fontFile.exists) {
      if (!cacheDir.exists) cacheDir.create({ intermediates: true });
      await File.downloadFileAsync(getFontUrl(page), fontFile, { idempotent: true });
    }
    await Font.loadAsync({ [fontName]: fontFile.uri });
    return fontName;
  } catch (cause) {
    throw new MushafFontError(page, cause);
  }
}

/**
 * Fire-and-forget prefetch of the ±2 neighbouring pages' fonts, clamped to 1–604.
 * Never throws — a neighbour that cannot be fetched becomes that page's own retry surface
 * when (if) the reader arrives on it.
 */
export async function preloadAdjacentPageFonts(currentPage: number): Promise<void> {
  const pages: number[] = [];
  for (let offset = -2; offset <= 2; offset++) {
    const page = currentPage + offset;
    if (page >= 1 && page <= TOTAL_PAGES && page !== currentPage) pages.push(page);
  }
  await Promise.allSettled(pages.map((page) => loadPageFont(page)));
}
