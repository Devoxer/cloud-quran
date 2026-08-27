/**
 * VerseRow — one ayah, in the Uthmani face (story 6-1).
 *
 * ⚠️ THE ROW SETS ITS OWN DIRECTION, AND THE APP STAYS LTR. Cloud Quran has no RTL
 * infrastructure — `I18nManager.forceRTL` is unbuilt tree-wide, the interface ships one locale,
 * and turning the whole app around is not this story's goal. What Arabic text actually needs is
 * `writingDirection: 'rtl'` + `textAlign: 'right'` on the text itself, which is local, reversible,
 * and does not touch a single other screen. (The pre-fork row wrote
 * `textAlign: I18nManager.isRTL ? 'left' : 'right'`, which assumes an app-wide flip this app does
 * not do — under a forced RTL it would have left-aligned the Arabic. Not carried across.)
 *
 * ⚠️ NO FIXED HEIGHT, ANYWHERE. Verse height varies with the Arabic length, the chosen font size
 * and the viewport width — Al-Baqarah's 286 verses run from a few words to a full screen. Story
 * 1-7.5 fixed the "scrolls to the wrong place" defect by REMOVING the height estimate, and
 * FlashList v2 dropped `getItemLayout` entirely, so there is nothing here to accidentally restore.
 *
 * ── ⚠️ THE ROW TAKES NO TAP, AND IT TOOK ONE FOR A ROUND. READ WHY BEFORE ADDING ONE BACK ────
 *
 * Three shapes were tried; the first two are both wrong and the reasons are different.
 *
 *   1. **A full-screen `Pressable` around the `FlashList` — BLOCKS SCROLLING OUTRIGHT.** It
 *      becomes the touch responder on touch START, and RN's `Pressability` cancels a press only
 *      when the touch leaves the view's bounds — a 400pt drag INSIDE a full-screen element never
 *      leaves them. Measured on the iOS simulator during this story: with the wrapper, zero
 *      scroll; without it, normal scroll. Jest cannot model responder negotiation.
 *   2. **A `Pressable` on each row — scrolls fine, and moves the tap to the wrong place.** It was
 *      the fix for (1) and it cost two things. There is then no "elsewhere" left to tap, so the
 *      chrome had to ship revealed to stay discoverable, which contradicts the frozen "when it
 *      renders, then it is immersive". And it spends the ONE gesture epic 7 has already been
 *      promised: "a tap on a verse plays audio from it and a tap elsewhere toggles chrome".
 *   3. **An RNGH `Gesture.Tap()` over the whole reading surface — what ships.** A gesture
 *      recogniser fails on movement and lets the drag reach the list, so a tap toggles and a drag
 *      scrolls. It lives in `read.tsx`; the row is plain text again, and the row's tap is free
 *      for the story that has a use for it.
 *
 * So this component has no `onPress` and renders a `View`, not a `Pressable`. Adding one back
 * re-opens (2): put the verse-level gesture in `read.tsx` beside the surface one, where the two
 * can be composed and one can be given priority over the other. ⚠️ The pre-fork row ALSO carried a
 * bookmark `Pressable` in its meta row — bookmarks are story 6.4, and a control per row would put
 * 286 buttons on Al-Baqarah, so that half is deliberately not folded back either.
 *
 * ⚠️ AND STILL NO `accessibilityRole`. The row is text, not a control. A role would announce every
 * ayah as a button and put 286 of them on Al-Baqarah.
 */

import { memo } from 'react';
import { Text, View } from 'react-native';
import { ARABIC_LINE_HEIGHT, UTHMANI_FONT_FAMILY } from '@/constants/arabic';
import { SPACING } from '@/constants/spacing';
import { FONT_WEIGHT } from '@/constants/typography';
import { useThemedStyles } from '@/lib/useThemedStyles';

/**
 * ⚠️ U+06DF (ARABIC SMALL HIGH ROUNDED ZERO) IS STRIPPED FOR DISPLAY, AND THIS IS A MEASURED FONT
 * DEFECT RATHER THAN A TASTE CALL — recovered from the pre-fork row, which had it and whose reason
 * story 6-1 shipped without (`_reference/prefork-reading/features/reading/VerseRow.tsx`).
 *
 * The mark means "this letter is written but not pronounced" and a printed mushaf draws it as a
 * tiny ring above the letter. **The KFGQPC face draws it at full letter size.** Re-measured in
 * Chromium on 2026-08-27 against this repo's own `KFGQPCUthmanicScriptHAFS.ttf`: rendered beside a
 * lone waw at 200px it is a solid black disc WIDER THAN THE WAW ITSELF, and in 2:5
 * (`أُو۟لَٰٓئِكَ`) it lands mid-word twice, so the word reads as though a bullet were punched
 * through it. 2,240 of the 6,236 verses carry at least one, so this is a third of the book.
 *
 * ⚠️ THIS IS A DISPLAY TRANSFORM AND NOTHING ELSE. The Quran-text non-negotiable says no runtime
 * path MUTATES the text: the database is opened `PRAGMA query_only = ON`, `text` arrives here
 * exactly as `uthmani_text` stores it, and the stripped copy is a local string that is rendered
 * and thrown away. Nothing persisted, nothing synced, nothing hashed sees it. A future search or
 * copy-to-clipboard must take `text`, not this.
 *
 * ⚠️ IT IS UNCONDITIONAL, NOT WEB-ONLY, THOUGH THE DEFECT WAS FIRST FOUND ON WEB. The same file is
 * bundled for iOS and Android, one reader may open the same ayah on a phone and on the desktop
 * shell, and a platform branch here would give them two different-looking mushafs. Removing the
 * strip is how you re-measure it; the geometry above is what to look for.
 */
const SMALL_HIGH_ROUNDED_ZERO = /\u06DF/g;

/**
 * The ayah badge's geometry, all expressed as ratios of the reader's chosen verse size (story
 * 6.5 owns the picker), so the badge grows with the text instead of stranding a 13pt ring beside
 * 44pt Arabic. The three numbers come from the pre-fork row and are asserted at two sizes in
 * `VerseRow.test.tsx` rather than restated from these constants — a geometry test that reads the
 * same constant the component does proves nothing.
 */
const BADGE_UNIT_RATIO = 0.45;
const BADGE_NUMBER_RATIO = 1.1;
const BADGE_BORDER_WIDTH = 1.5;

export interface VerseRowProps {
  /**
   * The ayah number, and the only thing the badge shows. ⚠️ NOT `{surah}:{verse}` — the whole list
   * is one surah and the chrome footer names it, so repeating it on all 286 rows of Al-Baqarah is
   * noise. The row used to print the pair as plain text on a line of its own, which is what made
   * the surface read as a debug view.
   */
  verse: number;
  /** The Uthmani text, exactly as the database holds it. Never transformed — see the strip above. */
  text: string;
  /** Points. Comes from the reader's synced preference when one exists — story 6.5 owns the picker. */
  fontSize: number;
  testID?: string;
}

function VerseRowInner({ verse, text, fontSize, testID }: VerseRowProps) {
  const styles = useThemedStyles((theme) => ({
    row: {
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
    },
    // ⚠️ `text.secondary`, NOT `text.tertiary`. The numeral is small text, and tertiary is only
    // gated at 3:1 (AA large) by `palettes.contrast.test.ts` while secondary is held at 4.5:1 on
    // every palette × scheme. The ring is a non-text component (WCAG 1.4.11, 3:1) and clears its
    // bar on the same token, so both halves take one colour.
    badge: {
      alignSelf: 'flex-end',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.sm,
      borderWidth: BADGE_BORDER_WIDTH,
      borderColor: theme.colors.text.secondary,
    },
    badgeNumber: {
      color: theme.colors.text.secondary,
      fontWeight: FONT_WEIGHT.semibold,
      textAlign: 'center',
    },
    arabic: {
      color: theme.colors.text.primary,
      fontFamily: UTHMANI_FONT_FAMILY,
      textAlign: 'right',
      writingDirection: 'rtl',
    },
  }));

  /**
   * ⚠️ PER-RENDER VALUES, SO THEY CANNOT LIVE IN THE THEMED FACTORY, which memoizes on the THEME
   * and would freeze the badge at whatever size the reader first opened. `lint:style` scan 3 is
   * satisfied because no THEME TOKEN appears inline — only geometry does; every colour above
   * stays in the factory. `Math.round` keeps the ring on a whole pixel; a fractional radius blurs
   * the stroke on a 2× screen.
   */
  const badgeUnit = Math.round(fontSize * BADGE_UNIT_RATIO);
  const badgeSize = { width: badgeUnit * 2, height: badgeUnit * 2, borderRadius: badgeUnit };
  const badgeNumberSize = { fontSize: badgeUnit * BADGE_NUMBER_RATIO };

  return (
    <View style={styles.row} testID={testID}>
      {/* A bare numeral: no run of two letters, so `lint:i18n` correctly leaves it alone. */}
      <View style={[styles.badge, badgeSize]} testID={`ayah-badge-${verse}`}>
        <Text style={[styles.badgeNumber, badgeNumberSize]}>{verse}</Text>
      </View>
      <Text style={[styles.arabic, { fontSize, lineHeight: fontSize * ARABIC_LINE_HEIGHT }]}>
        {text.replace(SMALL_HIGH_ROUNDED_ZERO, '')}
      </Text>
    </View>
  );
}

/**
 * ⚠️ MEMOIZED, AND IT IS LOAD-BEARING RATHER THAN HYGIENE. FlashList re-renders its rows on every
 * list-level state change, and this screen has two that tick while the reader scrolls: the
 * visible verse (every viewability callback) and the chrome flag (every tap). Without `memo`,
 * one chrome toggle re-renders all 286 rows of Al-Baqarah, each of which re-runs
 * `useThemedStyles` and re-measures a full paragraph of Arabic.
 *
 * `VerseRow.test.tsx` asserts the identity — `React.memo` leaves an observable `$$typeof` and a
 * `type` pointing at the inner function, so stripping it reddens rather than merely slowing.
 */
export const VerseRow = memo(VerseRowInner);
