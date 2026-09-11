/**
 * MushafPage — one page of the Madinah mushaf, drawn from layout data + its per-page font
 * (story 6-2, adapted from the pre-fork `MushafMode/MushafPage.tsx`).
 *
 * ── ⚠️ HOOKS ARE UNCONDITIONAL — THIS IS THE CRASH BEING FIXED ───────────────────────────────
 *
 * The pre-fork component called `useCallback` AFTER its error and loading early returns, so the
 * hook count changed between the loading render and the loaded one and React threw on EVERY page
 * load — swallowed by an ErrorBoundary, which is why Epic 2 shipped believing it worked
 * (`mushaf-page-crash`; the harness stubbed React's hooks, making it structurally unobservable).
 * The shape here makes the defect unwritable rather than merely absent: every hook this
 * component needs runs before the first `return`, the async lifecycle lives in `useMushafPage`,
 * and the line renderer below is a HOOKLESS function — its styles arrive as a prop. The RNTL
 * regression case in `MushafPage.test.tsx` renders the loading→loaded transition with the REAL
 * renderer; moving any hook below an early return reddens it.
 *
 * ── What a page is ───────────────────────────────────────────────────────────────────────────
 *
 * Header strip (Juz'/Hizb + surah name) · the lines · the page number. Lines come in three
 * types: `surah-header` (framed Arabic name), `basmala` (the layout rows carry NO glyph — the
 * `BASMALA_TEXT` constant in the KFGQPC text face IS the render), and `text` — one `<Text>` per
 * line, one nested `<Text>` per word drawing `word.qpcV1` in the page's `QCF_P{NNN}` face,
 * joined by spaces, `writingDirection: 'rtl'` + centered. The column is `space-evenly`, which is
 * what stretches 15 lines to the Madinah proportions at any height. Pages 1–2 are the special
 * short pages (8 lines) and render centered inside a frame.
 *
 * ⚠️ VERSE IDENTITY COMES FROM `words[].location` ONLY — `verseRange` is display metadata that
 * drifted from its own words for 565 committed lines (regenerated this story) and nothing here
 * reads it. The highlight seam matches `activeVerseKey + ':'` against `location` so `"2:1"`
 * cannot match `2:15:x`; audio wiring itself is story 7-1's, this prop is the seam it plugs into.
 *
 * ── ⚠️ THIS PAGE OWNS ITS OWN TOUCHES — THERE IS NO SURFACE GESTURE ABOVE IT ────────────────
 *
 * Story 7-6 gave the mushaf a word press (a seek, until story 7-8 made it a SELECTION) under an
 * RNGH tap that toggled the chrome everywhere else. ⚠️ **That surface gesture is GONE (owner call
 * 2026-09-10) and must not come back.** THREE `Pressable` bands toggle the chrome — the page
 * header strip, the page number, and (owner call 2026-09-11) the whole text column between them.
 * Everything here follows from that:
 *
 * ⚠️ THE THIRD BAND RESTORES FULL COVERAGE WITHOUT RESTORING THE GESTURE, and the difference is
 * the entire point. 2026-09-10 traded the race away for dead margins; the owner's rule is that
 * every point on the screen must either select an ayah or reveal the chrome. A `Pressable` gets
 * that back inside RN's responder system, where nesting — not dispatch order — decides.
 *
 * ⚠️ NO CROSS-SYSTEM RACE IS POSSIBLE ANY MORE, which is the real prize. 7-6's suppression had
 * RNGH's recogniser and RN's responder both seeing one touch, with only their dispatch order
 * deciding whether a word press also toggled the chrome — measured leaking 2-4 times per 14
 * synthetic taps and logged in `deferred-work.md`. With one touch system left on this screen,
 * RN's responder decides alone: the deepest view that wants the touch gets it, always.
 *
 * ⚠️ AN INTER-WORD GAP REVEALS, IT DOES NOT SELECT — and it reveals again as of the third band.
 * The `' '` separators belong to the LINE, not to any word (they must, or a highlight bleeds
 * across them), so a tap landing between two words is not on any word's `<Text>` and falls
 * through to the band. Under 7-6 that flipped the chrome via the surface gesture (~one tap in
 * three across a line); between 2026-09-10 and 2026-09-11 it did nothing at all; now it reveals
 * with no ayah selected, which is what an empty area means everywhere else in the app.
 *
 * ⚠️ THE WORD PRESS ADDS NO VIEWS. `onPress` goes on the per-word `<Text>` that already exists
 * inside the line's `<Text>`. Wrapping words in `View`s or `GestureDetector`s would break the
 * justified RTL line the facsimile depends on — the words are nested text nodes in one flow.
 *
 * ⚠️ THE PRESS REPORTS `location`, LIKE THE HIGHLIGHT DOES — first two segments of
 * `"surah:verse:word"`. `verseRange` is the drifted display metadata nothing here may read.
 *
 * ⚠️ NO PER-WORD `accessibilityRole` OR LABEL, DELIBERATELY. `word.qpcV1` is QPC glyph ENCODING —
 * codepoints into a per-page font, not readable Arabic — so announcing ~150 buttons per page
 * would read as noise and bury the page's own label. The accessible route to the same action is
 * the reading surface's `verse-text-{verse}` button, which is labelled with its ayah. The two
 * chrome bands DO carry a role and a label, because they are real controls with no sibling.
 *
 * ⚠️ SINCE STORY 7-8 THE WORD PRESS SELECTS RATHER THAN SEEKS, AND NOTHING HERE MAKES A SOUND.
 * 7-6 wired it to `useVerseSeek`, which plays whenever the player is not already playing — so on
 * the app's PRIMARY surface, where every word is a press target, a mistap was one tap from
 * recitation out loud. The pressed word's ayah is now selected (`onSelectVerse`), the chrome
 * reveals with its words underlined (`selectedVerseKey`), and the contextual row in the footer is
 * the only path from a verse to audio.
 *
 * ⚠️ THE U+06DF STRIP DOES NOT APPLY HERE. `word.qpcV1` is QPC glyph ENCODING — codepoints into a
 * per-page font — not Uthmani text in the KFGQPC face; and the two strings this file does set in
 * that face (basmala, surah names) carry no U+06DF. Quran display text is never mutated.
 */

import type { MushafLine } from 'quran-data';
import { SURAH_COUNT, SURAH_METADATA } from 'quran-data';
import { Fragment, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorView } from '@/components/ui';
import { UTHMANI_FONT_FAMILY } from '@/constants/arabic';
import {
  BASMALA_SCALE,
  BASMALA_TEXT,
  MUSHAF_GLYPH_SCALE,
  MUSHAF_HEIGHT_BUDGET,
  MUSHAF_LINE_HEIGHT_RATIO,
  MUSHAF_WEB_MAX_WIDTH,
} from '@/constants/mushaf';
import { OPACITY } from '@/constants/opacity';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE } from '@/constants/typography';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { MushafPageHeader } from './MushafPageHeader';
import { useMushafPage } from './useMushafPage';

/** Pages 1–2 are the short, centered pages — verified: exactly those two have 8 lines. */
const SPECIAL_PAGE_MAX = 2;
/** Skeleton line counts while loading, mirroring the real line counts. */
const PAGE_LINES = 15;
const SPECIAL_PAGE_LINES = 8;

export interface MushafPageProps {
  /** The page to draw, 1–604. */
  pageNumber: number;
  /**
   * The verse whose words highlight — `"{surah}:{verse}"`, or null/undefined for none. The seam
   * epic 7 plugs audio into; nothing in this story sets it outside tests.
   */
  activeVerseKey?: string | null;
  /**
   * Reports this page's failure STATE — not a one-off event — so the screen can reveal the chrome
   * for the page the reader is actually looking at (an error surface with a hidden exit is a
   * trap). ⚠️ BOTH TRANSITIONS ARE REPORTED, and that is the point: a page usually fails while it
   * is still an off-screen neighbour, so the screen has to be able to ask "is the page I just
   * became current on in a failed state?" as well as hear "this page just failed". A successful
   * retry reports `false` so the screen's record does not go stale.
   */
  onErrorChange?: (page: number, failed: boolean) => void;
  /**
   * SELECT the ayah a pressed WORD belongs to (story 7-8; it was a SEEK in 7-6). Called with the
   * pair parsed out of that word's `location`, never with anything the screen believes it is
   * showing — a word carries exact verse identity, so a press selects the whole ayah it belongs
   * to. ⚠️ Must be IDENTITY-STABLE: this component is rendered from FlashList's `renderPage`,
   * whose own identity is what keeps every page from re-rendering per turn. Optional — and it is
   * what makes a word pressable AT ALL: without it no word takes a touch, so a page with no
   * chrome behind it renders plain glyphs.
   *
   * ⚠️ IT MUST NOT REACH THE AUDIO ENGINE. 7-6 wired this to `useVerseSeek`, which starts
   * playback in any state that is not already playing — and 7-6 had just made every word on the
   * app's primary surface a press target, so a mistap was one tap from sound out loud. The row
   * inside the chrome's footer is where a verse turns into audio now.
   */
  onSelectVerse?: (surah: number, verse: number) => void;
  /**
   * The SELECTED ayah — `"{surah}:{verse}"`, or null (story 7-8). Its words draw the selection
   * underline. ⚠️ A DIFFERENT CHANNEL FROM `activeVerseKey`'S FILL, on purpose: the recited ayah
   * and the selected one are frequently the same, and two stacked translucent backgrounds blend
   * into a third colour nobody authored — worse here than in reading mode, because inline words
   * are individually painted spans and stacked fills also SEAM between them.
   */
  selectedVerseKey?: string | null;
  /**
   * Flip the chrome. ⚠️ WIRED TO THE PAGE HEADER STRIP AND THE PAGE NUMBER ONLY — those two bands
   * are the mushaf's whole chrome-toggle surface (owner call 2026-09-10). Optional; a page with
   * no chrome behind it draws both bands as plain, unpressable text.
   */
  onToggleChrome?: () => void;
}

const useStyles = () =>
  useThemedStyles((theme) => ({
    container: {
      flex: 1,
      justifyContent: 'space-between',
      backgroundColor: theme.colors.background.primary,
    },
    /** The reveal band that is everything between the header strip and the page number. */
    pageBand: {
      flex: 1,
    },
    pageContent: {
      flex: 1,
      justifyContent: 'space-evenly',
      paddingVertical: SPACING.md,
    },
    specialPageContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
    },
    specialPageFrame: {
      borderWidth: 1.5,
      borderRadius: RADII.lg,
      paddingVertical: SPACING.xxxl,
      paddingHorizontal: SPACING.lg,
      width: '100%',
      alignItems: 'center',
      gap: SPACING.sm,
      borderColor: theme.colors.border,
    },
    skeletonLine: {
      height: SPACING.xl,
      borderRadius: RADII.sm,
      marginVertical: SPACING.xs,
      marginHorizontal: SPACING.xl,
      backgroundColor: theme.colors.background.tertiary,
      opacity: OPACITY.overlay,
    },
    surahHeaderFrame: {
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.xl,
      marginHorizontal: SPACING.lg,
      borderWidth: 2,
      borderRadius: RADII.xl,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background.secondary,
    },
    surahHeaderText: {
      color: theme.colors.text.primary,
      fontFamily: UTHMANI_FONT_FAMILY,
      writingDirection: 'rtl',
      textAlign: 'center',
    },
    basmalaLine: {
      flexDirection: 'row',
      justifyContent: 'center',
    },
    arabicLine: {
      color: theme.colors.text.primary,
      writingDirection: 'rtl',
      textAlign: 'center',
    },
    highlightedWord: {
      backgroundColor: theme.colors.accent.faint,
    },
    /**
     * The selection, on an inline span (story 7-8).
     *
     * ⚠️ AN UNDERLINE RATHER THAN A BORDER, AND THAT IS A PLATFORM FACT, NOT A PREFERENCE. These
     * words are nested `<Text>` nodes inside the line's justified RTL flow — on iOS a nested Text
     * is an attributed-string RANGE, and border styles are simply not applied to ranges (a
     * background colour IS, which is why the highlight above works). Wrapping each word in a
     * `View` to get a real border would take it out of the line flow and break the facsimile. A
     * text decoration is the outline channel that exists here.
     *
     * ⚠️ `textDecorationColor` IS iOS + WEB ONLY — ANDROID DRAWS THE UNDERLINE IN `text.primary`,
     * THE WORD'S OWN COLOUR, AND THAT PAIR IS GATED TOO. `palettes.contrast.test.ts` measures
     * BOTH the authored `accent.soft` and the Android fallback against the page and against the
     * `accent.faint` fill, so the colour a reader actually sees on the app's primary surface is
     * measured on every palette slice rather than assumed from the one platform that honours the
     * token. It degrades to a visible underline rather than to nothing, and it is still not a
     * fill, so the "never a second fill" rule holds on all three.
     *
     * ⚠️ AND IT DRAWS AS ONE STROKE, NOT ONE DASH PER WORD — see `bridged` in the line renderer.
     */
    selectedWord: {
      textDecorationLine: 'underline' as const,
      textDecorationStyle: 'solid' as const,
      textDecorationColor: theme.colors.accent.soft,
    },
    pageNumber: {
      color: theme.colors.text.secondary,
      fontSize: FONT_SIZE.caption,
      textAlign: 'center',
      paddingVertical: SPACING.xs,
    },
  }));

type MushafStyles = ReturnType<typeof useStyles>;

export function MushafPage({
  pageNumber,
  activeVerseKey,
  onErrorChange,
  onSelectVerse,
  selectedVerseKey,
  onToggleChrome,
}: MushafPageProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const content = useMushafPage(pageNumber);
  const styles = useStyles();

  // The error → chrome-reveal seam. An effect rather than a render-time call because revealing
  // is a state change in the PARENT; the screen decides whether this page is the visible one.
  // Reports the STATE on every change — a recovery is as load-bearing as a failure (see the prop).
  const { error, loading, reload } = content;
  useEffect(() => {
    if (loading) return; // "not answered yet" is neither a failure nor a recovery
    onErrorChange?.(pageNumber, error !== null);
  }, [error, loading, onErrorChange, pageNumber]);

  // ⚠️ EVERYTHING ABOVE THIS LINE IS A HOOK; NOTHING BELOW IT IS. The two early returns that
  // follow are exactly where the pre-fork component put its 12th hook.

  // Per-render geometry (cannot live in the themed factory, which memoizes on the theme):
  // glyph size is a MEASURED ratio of the container width (`constants/mushaf.ts` carries the
  // measurement and why it is one number), with the web container capped first so a desktop
  // window does not scale one line past legibility.
  const isWeb = Platform.OS === 'web';
  const containerWidth = isWeb ? Math.min(screenWidth, MUSHAF_WEB_MAX_WIDTH) : screenWidth;
  // ⚠️ THE SMALLER OF THE TWO CONSTRAINTS, ALWAYS 15 LINES. Width binds on a phone in portrait;
  // height binds on any window wider than it is tall (an iPad in landscape asks for glyphs three
  // times too big). `PAGE_LINES` even on the 8-line pages 1–2, so the mushaf does not change size
  // from page to page. See `MUSHAF_HEIGHT_BUDGET` for the measurements.
  const usableHeight = Math.max(0, screenHeight - insets.top - insets.bottom);
  const glyphFontSize = Math.min(
    containerWidth * MUSHAF_GLYPH_SCALE,
    (usableHeight * MUSHAF_HEIGHT_BUDGET) / (PAGE_LINES * MUSHAF_LINE_HEIGHT_RATIO)
  );
  const safeArea = { paddingTop: insets.top, paddingBottom: insets.bottom };
  const isSpecialPage = pageNumber <= SPECIAL_PAGE_MAX;

  if (content.error !== null) {
    return (
      <View
        style={[styles.container, safeArea]}
        accessibilityLabel={t('common:mushaf.pageErrorA11y', { page: pageNumber })}
        testID={`mushaf-page-error-${pageNumber}`}
      >
        {/* ⚠️ THE RETRY REPORTS THE TOUCH TOO, AND HERE IT MATTERS MOST: this surface was
            revealed STICKILY by the screen's `show()` because the chrome carries the only exit.
            A retry that also ran the chrome toggle would hide that exit — and clear the sticky
            mark — at the moment the reader was trying to recover. */}
        <ErrorView
          title={t('common:mushaf.pageErrorTitle')}
          message={t('common:mushaf.pageErrorBody')}
          onAction={reload}
          fullScreen
          testID={`mushaf-page-retry-${pageNumber}`}
        />
      </View>
    );
  }

  if (content.loading || !content.layout || !content.fontFamily) {
    return (
      <View
        style={[styles.container, safeArea]}
        accessibilityLabel={t('common:mushaf.pageLoadingA11y', { page: pageNumber })}
        testID={`mushaf-page-loading-${pageNumber}`}
      >
        {Array.from({ length: isSpecialPage ? SPECIAL_PAGE_LINES : PAGE_LINES }, (_, i) => (
          <View key={`skeleton-${i}`} style={styles.skeletonLine} />
        ))}
      </View>
    );
  }

  const { layout, fontFamily } = content;

  // The surah this page opens in — first text line's first word, `location` being ground truth.
  const firstLocation = layout.lines.find((l) => l.type === 'text' && l.words?.length)?.words?.[0]
    ?.location;
  const surahNumber = firstLocation ? Number.parseInt(firstLocation.split(':')[0], 10) : 1;
  const surahName = SURAH_METADATA[surahNumber - 1]?.nameTransliteration ?? '';
  const activePrefix = activeVerseKey ? `${activeVerseKey}:` : null;
  // The same `+ ':'` guard the highlight uses — without it "2:1" matches every word of 2:15.
  const selectedPrefix = selectedVerseKey ? `${selectedVerseKey}:` : null;

  const lines = layout.lines.map((line) => (
    <MushafLineView
      key={line.line}
      line={line}
      fontFamily={fontFamily}
      glyphFontSize={glyphFontSize}
      activePrefix={activePrefix}
      selectedPrefix={selectedPrefix}
      styles={styles}
      onSelectVerse={onSelectVerse}
      onToggleChrome={onToggleChrome}
    />
  ));

  return (
    <View
      style={[styles.container, safeArea]}
      accessibilityLabel={t('common:mushaf.pageA11y', { page: pageNumber, name: surahName })}
      testID={`mushaf-page-${pageNumber}`}
    >
      {/* ⚠️ BAND ONE OF TWO. `Pressable`, not a gesture: with no surface recogniser left on this
          screen there is no second touch system to race, so RN's responder decides alone. */}
      <Pressable
        onPress={onToggleChrome}
        disabled={!onToggleChrome}
        accessibilityRole={onToggleChrome ? 'button' : undefined}
        accessibilityLabel={onToggleChrome ? t('common:mushaf.toggleChrome') : undefined}
        testID={`mushaf-chrome-band-header-${pageNumber}`}
      >
        <MushafPageHeader pageNumber={pageNumber} surahNumber={surahNumber} />
      </Pressable>
      {/* ⚠️ BAND THREE, AND IT IS THE WHOLE REST OF THE PAGE (owner call 2026-09-11: "all the
          screen should either select a verse or reveal the chrome"). Before this, the two bands
          above and below were the ONLY reveal targets and the entire text column — the margins
          beside the lines, the gaps between them, a special page's frame — was dead.

          ⚠️ IT IS A `Pressable`, NOT A RESTORED SURFACE GESTURE, AND THAT DISTINCTION IS THE
          POINT. The RNGH recogniser this screen carried until 2026-09-10 lived in a DIFFERENT
          touch system from the word presses inside it, and nothing sequences the two — which is
          the leak `useSurfaceTap` still lives with on the reading surface. Here the word `<Text>`
          and this `Pressable` are both RN responders, so nesting decides: the innermost responder
          that accepts the touch wins, the word press never reaches this handler, and the race is
          unwritable rather than merely unlikely.

          ⚠️ AND IT MUST NOT EAT THE PAGE TURN. `onPress` fires on release only; the horizontal
          pager claims the responder on MOVE, so a swipe turns the page and never reveals. Verified
          on the emulator — re-verify on any change here, because a mushaf that cannot be turned is
          a worse regression than a dead margin. */}
      <Pressable
        style={styles.pageBand}
        onPress={onToggleChrome}
        disabled={!onToggleChrome}
        accessibilityRole={onToggleChrome ? 'button' : undefined}
        accessibilityLabel={onToggleChrome ? t('common:mushaf.toggleChrome') : undefined}
        testID={`mushaf-chrome-band-page-${pageNumber}`}
      >
        {isSpecialPage ? (
          <View style={styles.specialPageContent}>
            <View style={styles.specialPageFrame} testID="mushaf-special-frame">
              {lines}
            </View>
          </View>
        ) : (
          <View style={styles.pageContent}>{lines}</View>
        )}
      </Pressable>
      {/* Band two. A bare numeral — no run of two letters, so `lint:i18n` leaves the text alone. */}
      <Pressable
        onPress={onToggleChrome}
        disabled={!onToggleChrome}
        accessibilityRole={onToggleChrome ? 'button' : undefined}
        accessibilityLabel={onToggleChrome ? t('common:mushaf.toggleChrome') : undefined}
        testID={`mushaf-chrome-band-footer-${pageNumber}`}
      >
        <Text style={styles.pageNumber}>{pageNumber}</Text>
      </Pressable>
    </View>
  );
}

interface MushafLineViewProps {
  line: MushafLine;
  fontFamily: string;
  glyphFontSize: number;
  /** `activeVerseKey + ':'`, pre-built once per page — or null when nothing highlights. */
  activePrefix: string | null;
  /** `selectedVerseKey + ':'`, same shape — or null when nothing is selected (story 7-8). */
  selectedPrefix: string | null;
  /** The page's themed styles — passed down so this stays a HOOKLESS function (see header). */
  styles: MushafStyles;
  /** Select a pressed word's ayah. A PROP, not a hook — the renderer stays hookless. */
  onSelectVerse?: (surah: number, verse: number) => void;
  /**
   * ⚠️ REVEAL FROM THE LINE ITSELF — BELT AND BRACES OVER THE PAGE BAND, AND HONESTLY LABELLED
   * AS SUCH. A line's `<Text>` spans the FULL WIDTH of the column while its glyphs do not, so
   * whether a tap in the run-in either side reaches the band depends on how the platform
   * hit-tests a text view holding pressable spans — which is exactly the kind of thing that
   * differs between iOS and Android and is invisible to every gate.
   *
   * ⚠️ THE OWNER REPORTED THE DEAD RUN-IN ON iOS ("the empty area in the left and the right
   * don't reveal nothing, and sometimes other areas") AND I COULD NOT REPRODUCE IT ON ANDROID:
   * A/B'd on the emulator against the band-only build, the same point revealed either way. So
   * this is NOT a measured Android fix and must not be written up as one. What it buys is that
   * the reveal no longer DEPENDS on hit-testing on any platform — the line answers for itself.
   * Nested word spans still win where they are (pinned by test, and driven on the emulator).
   */
  onToggleChrome?: () => void;
}

/**
 * The `(surah, verse)` a word belongs to, from `location` (`"surah:verse:word"`) — the ONE
 * source of verse identity on this page, exactly as the highlight seam uses it.
 *
 * ⚠️ RANGE, NOT JUST INTEGER-NESS. `Number.parseInt` is happy with `'0'` and `'-1'`, so a
 * malformed `'0:0:1'` would have produced `playSurah(0, 0)` — a request for a surah that does
 * not exist — rather than a word that is simply not pressable. Answering `null` is what makes a
 * bad row inert: the word then takes no touch at all (see the render below).
 */
function verseAt(location: string): { surah: number; verse: number } | null {
  const [rawSurah, rawVerse] = location.split(':');
  const surah = Number.parseInt(rawSurah, 10);
  const verse = Number.parseInt(rawVerse, 10);
  if (!Number.isInteger(surah) || surah < 1 || surah > SURAH_COUNT) return null;
  if (!Number.isInteger(verse) || verse < 1) return null;
  return { surah, verse };
}

/**
 * One line. Deliberately hook-free: dispatching on `line.type` with early returns is safe only
 * in a function that calls no hooks at all — which is also why the styles arrive as a prop.
 */
function MushafLineView({
  line,
  fontFamily,
  glyphFontSize,
  activePrefix,
  selectedPrefix,
  styles,
  onSelectVerse,
  onToggleChrome,
}: MushafLineViewProps) {
  if (line.type === 'surah-header') {
    const surahNumber = Number.parseInt(line.surah ?? '0', 10);
    const metadata = surahNumber > 0 ? SURAH_METADATA[surahNumber - 1] : null;
    return (
      <View style={styles.surahHeaderFrame}>
        <Text style={[styles.surahHeaderText, { fontSize: glyphFontSize }]}>
          {metadata?.nameArabic ?? line.text ?? ''}
        </Text>
      </View>
    );
  }

  if (line.type === 'basmala') {
    // The data's basmala rows are `{line, type}` only — the constant IS the render (see
    // `constants/mushaf.ts`), in the KFGQPC TEXT face rather than the page font.
    const basmalaSize = glyphFontSize * BASMALA_SCALE;
    return (
      <View style={styles.basmalaLine}>
        <Text
          style={[
            styles.arabicLine,
            {
              fontFamily: UTHMANI_FONT_FAMILY,
              fontSize: basmalaSize,
              lineHeight: basmalaSize * MUSHAF_LINE_HEIGHT_RATIO,
            },
          ]}
        >
          {BASMALA_TEXT}
        </Text>
      </View>
    );
  }

  if (!line.words) return null;

  return (
    // ⚠️ THE FACE AND THE SIZE LIVE ON THE LINE, NOT ONLY ON EACH WORD. The `' '` separators
    // below are raw children of THIS `Text` and inherit its style: without these two properties
    // every gap between words is a system-font space at RN's default 14pt — width the measured
    // `MUSHAF_GLYPH_SCALE` ceiling does not budget for, and enough of it to wrap an ordinary
    // page's every line onto a second row (the defect the simulator smoke caught).
    <Text
      testID={`mushaf-line-${line.line}`}
      // ⚠️ GATED, LIKE THE WORD'S HANDLER BELOW AND FOR THE SAME REASON — RN `Text` becomes
      // pressable on a handler ALONE, so an unconditional one on a page with no chrome behind it
      // would swallow the touch and do nothing.
      onPress={onToggleChrome}
      suppressHighlighting
      style={[
        styles.arabicLine,
        {
          fontFamily,
          fontSize: glyphFontSize,
          lineHeight: glyphFontSize * MUSHAF_LINE_HEIGHT_RATIO,
        },
      ]}
    >
      {line.words.map((word, i) => {
        // The `+ ':'` in the prefix is what stops "2:1" matching 2:15's words.
        const isActive = activePrefix !== null && word.location.startsWith(activePrefix);
        const isSelected = selectedPrefix !== null && word.location.startsWith(selectedPrefix);
        /**
         * ⚠️ THE SEPARATOR JOINS THE UNDERLINE WHEN BOTH ITS NEIGHBOURS ARE SELECTED, AND THAT
         * IS THE WHOLE POINT OF THE CHANNEL (story 7-8's review). The separators are raw children
         * of the LINE so a background highlight cannot bleed across them — which for a
         * DECORATION meant the selection drew as a row of disconnected dashes, one per word,
         * exactly the seaming the story used to reject a second fill. A decoration is not a fill:
         * carrying it across the gap is what makes one ayah read as one stroke.
         */
        const bridged =
          isSelected &&
          i > 0 &&
          selectedPrefix !== null &&
          (line.words?.[i - 1]?.location.startsWith(selectedPrefix) ?? false);
        // Parsed per word from `location` — the same ground truth the highlight above reads.
        const at = onSelectVerse ? verseAt(word.location) : null;
        return (
          <Fragment key={word.location}>
            {/* Outside the word's Text so a highlight never bleeds into it — see `bridged`. */}
            {i > 0 &&
              (bridged ? (
                <Text style={styles.selectedWord} testID={`mushaf-gap-${word.location}`}>
                  {' '}
                </Text>
              ) : (
                ' '
              ))}
            <Text
              // ⚠️ HANDLERS ON THE EXISTING `<Text>`, NO WRAPPER. A `View` or a
              // `GestureDetector` here would take the word out of the line's justified RTL flow
              // and break the facsimile.
              // ⚠️ BOTH HANDLERS ARE GATED ON THE SAME `at`, AND THE SYMMETRY IS THE POINT. RN
              // `Text` becomes pressable on `onPressIn` ALONE, so an unconditional reporter made
              // a word with an unparseable `location` — or a page handed a reporter and no
              // seek — swallow the touch and suppress the chrome while doing nothing at all.
              // `VerseRow` avoids the same trap with `disabled={!onSelectVerse}`.
              onPress={at ? () => onSelectVerse?.(at.surah, at.verse) : undefined}
              // ⚠️ iOS DRAWS A PRESS HIGHLIGHT OVER PRESSABLE TEXT BY DEFAULT — a grey rectangle
              // flashing across a facsimile whose whole premise is faithful rendering.
              suppressHighlighting
              style={[
                { fontFamily, fontSize: glyphFontSize },
                isActive && styles.highlightedWord,
                isSelected && styles.selectedWord,
              ]}
              testID={`mushaf-word-${word.location}`}
            >
              {word.qpcV1}
            </Text>
          </Fragment>
        );
      })}
    </Text>
  );
}
