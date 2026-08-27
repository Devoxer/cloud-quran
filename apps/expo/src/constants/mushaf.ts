/**
 * Mushaf rendering tokens — the per-page QPC V1 geometry and where its fonts come from
 * (story 6-2, adapted from the pre-fork `MushafMode/` at `_reference/prefork-reading/`).
 *
 * Separate from `arabic.ts` on purpose: that file is the Uthmani READING scale, reader-adjustable
 * between 20–44px. The mushaf's size is not adjustable at all — every page is a fixed 15-line
 * (8 on pages 1–2) facsimile of the Madinah print, and its glyph size is a RATIO of the container
 * width because that is what keeps a line's pre-composed glyphs on one line at every device width.
 */

/**
 * Where the 604 per-page QPC V1 woff2 fonts live — the app's OWN CDN (R2 bucket `gp-cdn`,
 * story 3-6), uploaded by `scripts/prepare-fonts.ts`.
 *
 * ⚠️ NEVER `raw.githubusercontent.com`, WHICH IS WHERE THE PRE-FORK LOADER POINTED. A mushaf font
 * is fetched per PAGE, so the request log of whatever host serves it is a record of which pages a
 * reader opens — reading position is special-category data (GDPR Art. 9), and Cloudflare is the
 * only processor the privacy disclosure names. GitHub is not on that list and must not learn it.
 */
export const MUSHAF_FONT_CDN_BASE = 'https://cdn.nobleachievements.com/fonts/qpc-v1';

/**
 * Glyph size as a fraction of the container width — ONE number, because the constraint is a fact
 * about the fonts and not about the platform.
 *
 * ⚠️ THIS REPLACED THE PRE-FORK'S `{ native: 0.065, web: 0.059 }`, AND 0.065 WAS SIMPLY TOO BIG.
 * It could never have been observed: the pre-fork page component crashed on every load, so its
 * "measured" native ratio was never seen rendering. At 0.065 every line of an ordinary page wraps
 * to a second visual row on a 390pt iPhone — 15 data lines become ~28, the column overflows and
 * the page number is drawn through the last line. Confirmed on the simulator before this change.
 *
 * The ceiling is measured, not guessed: every text line of all 604 pages was laid out in Chromium
 * with its own `QCF_P{NNN}` face at a 100px reference size (2026-08-27, harness described in the
 * story's Implementation Notes). The widest line in the book is **page 254 line 13** (13:41) at
 * **15.92× the font size**, so the largest scale that fits any line into the container width is
 * **0.0628**; the median page's widest line wants 14.63× (0.0684). 0.060 leaves ~4.5% of headroom
 * against that hard ceiling for CoreText-vs-Blink advance rounding, and gives the median page the
 * ~12% side margin a printed mushaf has.
 *
 * ⚠️ THE MEASUREMENT ONLY HOLDS IF THE WHOLE LINE IS IN THE PAGE FACE AT THIS SIZE — including
 * the spaces between words. `MushafPage` puts `fontFamily`/`fontSize` on the LINE's `Text`, not
 * only on each word's, because a raw `' '` child inherits the parent and would otherwise be a
 * system-font space at RN's default 14pt: ~4pt of unbudgeted width per word, which is most of
 * what pushed page 50 over the edge.
 */
export const MUSHAF_GLYPH_SCALE = 0.06;

/** The web container cap the glyph scale is measured against (pre-fork `MushafPage.tsx:77`). */
export const MUSHAF_WEB_MAX_WIDTH = 700;

/**
 * The share of the window's inset-free height the 15 lines may occupy — the HEIGHT half of the
 * glyph size, and the reason it is a `Math.min` rather than the width alone.
 *
 * ⚠️ WITHOUT THIS THE MUSHAF IS UNUSABLE ON A WIDE, SHORT WINDOW. The width-driven size is right
 * on a phone in portrait, where height is never the binding constraint (measured: 390pt wide ⇒
 * 23.4pt glyphs ⇒ 15 lines want 492pt of 751 available). It is badly wrong wherever the window is
 * wider than it is tall: measured on an iPad Pro 13" simulator, portrait (1032 × 1376) already
 * pushes the last line into the page number, and LANDSCAPE (1376 × 1032) asks for 82.6pt glyphs
 * and 1,734pt of lines in a ~1,010pt column — a page several times too large to read. The app
 * ships `supportsTablet: true` and the iPad Info.plist allows all four orientations, so this is a
 * shipping surface, not a hypothetical. (The pre-fork hit the same wall and capped by height only
 * in its web dual-page spread — `pageHeight / 1.75`; its single-page path had no cap and never
 * rendered.)
 *
 * 0.86 is measured with a little slack toward capping EARLY: on the phone the 15 lines sit inside
 * 663 of the 751 inset-free points (88%), the rest going to the header strip, the page number and
 * the column's vertical padding. Capping early only makes the text slightly smaller on a wide
 * screen; capping late is the overflow this constant exists to prevent.
 */
export const MUSHAF_HEIGHT_BUDGET = 0.86;

/**
 * Line height as a multiple of the glyph size.
 *
 * ⚠️ DELIBERATELY NOT `ARABIC_LINE_HEIGHT` (2). That ratio exists because the KFGQPC TEXT face
 * stacks vowel marks above/below the baseline and needs air between wrapped lines. QPC page
 * glyphs are PRE-COMPOSED per line — the marks are inside the glyph box already, one line of the
 * data is one line on screen, and 15 of them must fit a phone screen. At 2 they do not.
 */
export const MUSHAF_LINE_HEIGHT_RATIO = 1.4;

/** Basmala scale relative to the glyph size (pre-fork `MushafPage.tsx:263-264`). */
export const BASMALA_SCALE = 0.8;

/**
 * The basmala, in Uthmani script — rendered in the KFGQPC text face, not a QPC page font.
 *
 * ⚠️ THE CONSTANT IS THE RENDER, NOT A FALLBACK. The layout data's basmala lines are
 * `{line, type}` ONLY — no glyph, no words, no text (verified against all 604 pages in
 * `lib/mushafLayout.test.ts`) — so there is nothing in the data to draw. This string is Quran
 * text and is never mutated; the U+06DF display strip does not apply (it carries none).
 */
export const BASMALA_TEXT = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';
