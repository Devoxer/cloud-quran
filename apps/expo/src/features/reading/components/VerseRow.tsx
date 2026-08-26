/**
 * VerseRow — one ayah, in the Uthmani face (story 6-1).
 *
 * ⚠️ THE ROW SETS ITS OWN DIRECTION, AND THE APP STAYS LTR. Cloud Quran has no RTL
 * infrastructure — `I18nManager.forceRTL` is unbuilt tree-wide, the interface ships one locale,
 * and turning the whole app around is not this story's goal. What Arabic text actually needs is
 * `writingDirection: 'rtl'` + `textAlign: 'right'` on the text itself, which is local, reversible,
 * and does not touch a single other screen. The verse NUMBER is deliberately LTR: `2:255` is a
 * reference, not prose.
 *
 * ⚠️ NO FIXED HEIGHT, ANYWHERE. Verse height varies with the Arabic length, the chosen font size
 * and the viewport width — Al-Baqarah's 286 verses run from a few words to a full screen. Story
 * 1-7.5 fixed the "scrolls to the wrong place" defect by REMOVING the height estimate, and
 * FlashList v2 dropped `getItemLayout` entirely, so there is nothing here to accidentally restore.
 *
 * ⚠️ THE ROW OWNS THE TAP, AND IT HAS TO — A FULL-SCREEN `Pressable` AROUND THE LIST BLOCKS
 * SCROLLING OUTRIGHT. That was the first shape written, and it is wrong for a reason no test in
 * this repo can see: a `Pressable` wrapping a `FlashList` becomes the touch responder on touch
 * START, and RN's `Pressability` cancels a press only when the touch leaves the view's bounds —
 * a 400pt drag INSIDE a full-screen element never leaves them. So the list never got the
 * responder, the surface did not scroll at all, and every scroll gesture landed as a chrome
 * toggle. Measured on the iOS simulator during this story: with the wrapper, zero scroll; with it
 * replaced by a plain `View`, the list scrolled normally. Jest's renderer cannot reproduce
 * responder negotiation, so nothing but a device would have caught it.
 *
 * A `Pressable` INSIDE the scroll view is the shape that works: the `ScrollView` claims the
 * responder on move and cancels the child press, which is exactly the tap-vs-scroll distinction
 * the reader expects. The cost is that a tap on the padding BELOW the last verse does not toggle;
 * the rows cover essentially the whole reading surface, so that is a fair trade for a list that
 * scrolls.
 *
 * ⚠️ NO `accessibilityRole` ON IT. The row is not a button — it is the text, made tappable. Giving
 * it a role would announce every ayah as a control and would put 286 buttons on Al-Baqarah.
 * Epic 7 gives this tap its real job (play from this verse); until then it toggles chrome, which
 * is what a tap on the reading surface means.
 */

import { memo } from 'react';
import { Pressable, Text } from 'react-native';
import { ARABIC_LINE_HEIGHT, UTHMANI_FONT_FAMILY } from '@/constants/arabic';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { useThemedStyles } from '@/lib/useThemedStyles';

export interface VerseRowProps {
  surah: number;
  verse: number;
  /** The Uthmani text, exactly as the database holds it. Never transformed. */
  text: string;
  /** Points. Comes from the reader's synced preference when one exists — story 6.5 owns the picker. */
  fontSize: number;
  /** Tapping the verse. Chrome toggle today; "play from here" once epic 7 lands. */
  onPress?: () => void;
  testID?: string;
}

function VerseRowInner({ surah, verse, text, fontSize, onPress, testID }: VerseRowProps) {
  const styles = useThemedStyles((theme) => ({
    row: {
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
    },
    reference: {
      color: theme.colors.text.tertiary,
      fontSize: FONT_SIZE.caption,
      fontWeight: FONT_WEIGHT.medium,
      marginBottom: SPACING.xs,
      textAlign: 'right',
    },
    arabic: {
      color: theme.colors.text.primary,
      fontFamily: UTHMANI_FONT_FAMILY,
      textAlign: 'right',
      writingDirection: 'rtl',
    },
  }));

  return (
    <Pressable style={styles.row} onPress={onPress} testID={testID}>
      {/* `2:255` — no run of two letters, so it is a reference rather than copy, and
          `lint:i18n` correctly leaves it alone. */}
      <Text style={styles.reference}>{`${surah}:${verse}`}</Text>
      {/* ⚠️ The size and line height are per-render values, so they cannot live in the themed
          factory (which memoizes on the THEME). `StyleSheet.flatten` is not needed — an array
          style composes the factory style with the one dynamic pair, and `lint:style` scan 3 is
          satisfied because no THEME TOKEN appears inline. */}
      <Text style={[styles.arabic, { fontSize, lineHeight: fontSize * ARABIC_LINE_HEIGHT }]}>
        {text}
      </Text>
    </Pressable>
  );
}

/**
 * Memoized because FlashList re-renders rows on every list-level state change — and this screen
 * has two that tick while the reader scrolls (the visible verse, the chrome flag). Without it,
 * toggling chrome re-renders all 286 verses of Al-Baqarah.
 */
export const VerseRow = memo(VerseRowInner);
