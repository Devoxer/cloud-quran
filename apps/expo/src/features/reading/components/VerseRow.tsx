/**
 * VerseRow — one ayah, in the Uthmani face (story 6-1; bookmark control folded back in 6-4).
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
 * ⚠️ STORY 7-1 SPENT THE TAP THIS SHAPE WAS RESERVING, AND STORY 7-8 CHANGED WHAT IT BUYS. The
 * press is on the ARABIC TEXT alone (`onSelectVerse`), not on the container — so the meta strip,
 * the margins and every gap between rows remain the "elsewhere" the chrome gesture needs, and
 * shape (2) is still the thing that must not come back.
 *
 * ⚠️ AND THAT PRESS NO LONGER MAKES A SOUND. Under 7-1 it was `onPressVerse` → `useVerseSeek`,
 * which STARTS playback in every state that is not already playing — so a mistap in a mosque was
 * one tap, from a cold launch and from paused, on a reading-first app. It now SELECTS the ayah:
 * the chrome reveals with this row outlined, and the contextual row inside the footer carries
 * play-from-here and the bookmark. Two taps to sound, deliberately (owner, 2026-09-10). Nothing
 * in this file may reach the audio engine again.
 *
 * So the row CONTAINER has no `onPress` and renders a `View`, not a `Pressable`. Adding one back
 * re-opens (2): put the verse-level gesture in `read.tsx` beside the surface one, where the two
 * can be composed and one can be given priority over the other.
 *
 * ⚠️ THE BOOKMARK CONTROL IS THE OTHER PRESSABLE INSIDE THE ROW (story 6-4, the pre-fork meta-row
 * shape folded back). It is a small target in the meta row — not the row tap of shape (2), so the
 * "elsewhere" the chrome gesture needs survives.
 *
 * ── ⚠️ THE DOUBLE-FIRE IS FIXED, AND THIS PARAGRAPH USED TO ARGUE THE OPPOSITE ────────────────
 *
 * Until story 7-6 both of this row's presses ALSO toggled the surface's chrome, and both 6-4's
 * design notes and this docblock recorded that as "named and accepted": RNGH's tap runs in a
 * different touch system, RN's `stopPropagation` cannot reach it, and 6-1's
 * `.cancelsTouchesInView(false)` is what lets these `Pressable`s receive the touch at all.
 * **The owner reversed that call on 2026-09-09.** Bookmarking an ayah or seeking to it now leaves
 * the chrome exactly as it was.
 *
 * The mechanism is `onInteractionStart`, wired to `onPressIn` on BOTH Pressables and owned by
 * `useSurfaceTap` — a touch-DOWN latch the surface tap reads at touch-UP, so the two touch
 * systems are ordered by physics rather than by a guess about dispatch order. See that hook for
 * why `onPress` would have been a race and why the reset is `onFinalize`. Nothing else about
 * these Pressables changed, and `cancelsTouchesInView(false)` is still required — the fix works
 * BECAUSE both systems see the touch, not by taking it away from one of them.
 *
 * ⚠️ AND STILL NO `accessibilityRole` ON THE ROW. The row is text, not a control. A role would
 * announce every ayah as a button; the bookmark control carries its own role and a label that
 * flips add/remove.
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '@/components/ui';
import { ARABIC_LINE_HEIGHT, stripDisplayMarks, UTHMANI_FONT_FAMILY } from '@/constants/arabic';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { FONT_WEIGHT } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';

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

/** Bookmark glyph size + the slop that carries its touch target to the 44pt HIG minimum. */
const BOOKMARK_ICON_SIZE = 20;
const BOOKMARK_HIT_SLOP = 12;

/**
 * The selection outline's stroke (story 7-8).
 *
 * ⚠️ THE BORDER IS ALWAYS THERE; ONLY ITS COLOUR CHANGES. A `borderWidth` that appears with the
 * selection would inset the Arabic by 1.5pt on every side the moment a reader pressed a verse —
 * i.e. selecting an ayah would RE-WRAP it mid-press. `'transparent'` when unselected costs
 * nothing to draw and makes the box identical in both states, which is the same discipline the
 * chrome's "revealing must not shift content" criterion is written from.
 *
 * ⚠️ AND THE READING COLUMN DID REFLOW ONCE, WHEN THIS ARRIVED — SAY IT PLAINLY RATHER THAN
 * IMPLYING OTHERWISE. Before story 7-8 the row had no border at all, so every row is now 3pt
 * taller and 3pt narrower in its text column than it was in 7-6, for every reader and whether or
 * not anything is selected. That was accepted: 1.5pt per side is under a pixel of Arabic at any
 * shipped font size, and the alternative — shaving the horizontal padding off the `SPACING` scale
 * to compensate — trades a measured token for an unmeasured one. The same change gave the row
 * `RADII.sm`, which rounds the RECITATION highlight as well as the outline; that is deliberate,
 * so the two cues share one shape. `VerseRow.test.tsx` pins all three numbers as literals.
 */
const SELECTION_BORDER_WIDTH = 1.5;

export interface VerseRowProps {
  /**
   * The surah THIS ROW belongs to — the bookmark toggle reports it back, so the toggle always
   * acts on the pair the row renders. ⚠️ Never let the screen substitute its "current surah"
   * ref: `goToSurah` and the focus resync both move that ref synchronously while the OLD surah's
   * rows are still on screen (a resync's rows load async from SQLite), and a press in that
   * window would mint the new surah paired with an old row's verse — 6-4's review caught the
   * shape. NOT rendered anywhere; the badge below shows the verse alone.
   */
  surah: number;
  /**
   * The ayah number, and the only thing the badge shows. ⚠️ NOT `{surah}:{verse}` — the whole list
   * is one surah and the chrome footer names it, so repeating it on all 286 rows of Al-Baqarah is
   * noise. The row used to print the pair as plain text on a line of its own, which is what made
   * the surface read as a debug view.
   */
  verse: number;
  /** The Uthmani text, exactly as the database holds it. Never transformed — `stripDisplayMarks`
   *  (`constants/arabic.ts`) touches only the rendered copy. */
  text: string;
  /** Points. Comes from the reader's synced preference when one exists — story 6.5 owns the picker. */
  fontSize: number;
  /** Whether this verse is bookmarked — decides the control's glyph, colour and label. */
  bookmarked: boolean;
  /**
   * Toggle this row's bookmark — called with the ROW's own `(surah, verse)` pair (see `surah`
   * above). ⚠️ Must be IDENTITY-STABLE across renders (`memo` below is load-bearing):
   * `read.tsx` passes one callback that reads its map through a ref.
   */
  onToggleBookmark: (surah: number, verse: number) => void;
  /**
   * Whether the recitation is on this ayah right now (story 7-1). A BOOLEAN on purpose: the
   * screen compares the active key once and hands each row a primitive, so `memo` below stays
   * effective and an ayah change re-renders exactly two rows — the one leaving and the one
   * arriving — rather than all 286 of Al-Baqarah ten times a second.
   */
  highlighted?: boolean;
  /**
   * SELECT this ayah (story 7-8) — reveal the chrome with this verse as the thing the contextual
   * row acts on. Called with the ROW's own `(surah, verse)` pair, for the reason spelled out on
   * `surah` above. ⚠️ Must be IDENTITY-STABLE, same as `onToggleBookmark`: an unstable callback
   * defeats the memo the highlight depends on.
   *
   * ⚠️ IT MUST NOT REACH THE AUDIO ENGINE, AND IT DID UNTIL 7-8. Under 7-1 this was
   * `onPressVerse` wired straight to `useVerseSeek`, whose `seekToVerse` calls `play()` in any
   * state that is not already playing — so on a reading-first app every verse press was one tap
   * from sound, from a cold launch and from paused. Sound now happens only when the reader
   * presses a play control; the row's play control is one press away and names the ayah.
   */
  onSelectVerse?: (surah: number, verse: number) => void;
  /**
   * Whether this ayah is the SELECTED one — draws the outline (story 7-8). A boolean for
   * `highlighted`'s reason: the screen compares once and hands each row a primitive, so `memo`
   * below stays effective.
   *
   * ⚠️ AN OUTLINE, NEVER A SECOND FILL. It has to coexist with `highlighted`'s `accent.faint`
   * background on the same ayah — two translucent fills blend into a third colour nobody authors
   * and nobody measures, while the text on top still owes the contrast gate an answer. A border
   * is a different CHANNEL, so the overlap needs nothing new.
   */
  selected?: boolean;
  /**
   * "A child took this touch" — fired on press-IN by BOTH of this row's controls (story 7-6), so
   * the surface's chrome tap can suppress itself for that touch. ⚠️ It must be `onPressIn` and
   * not `onPress`: touch-down is the only edge guaranteed to precede the gesture's touch-up
   * callback, and the two live in different touch systems that cannot otherwise be ordered.
   * Optional — the bookmarks list renders these rows with no surface gesture behind them.
   */
  onInteractionStart?: () => void;
  testID?: string;
}

function VerseRowInner({
  surah,
  verse,
  text,
  fontSize,
  bookmarked,
  onToggleBookmark,
  highlighted = false,
  onSelectVerse,
  selected = false,
  onInteractionStart,
  testID,
}: VerseRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles((theme) => ({
    row: {
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      // See `SELECTION_BORDER_WIDTH`: the stroke is permanent, the colour is what moves.
      borderWidth: SELECTION_BORDER_WIDTH,
      borderColor: 'transparent',
      borderRadius: RADII.sm,
    },
    // The pre-fork meta row: bookmark control at the visual LEFT, ayah badge at the RIGHT (the
    // Arabic below is right-aligned, so the badge stays column-aligned with the verse it labels).
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    // ⚠️ `text.secondary`, NOT `text.tertiary`. The numeral is small text, and tertiary is only
    // gated at 3:1 (AA large) by `palettes.contrast.test.ts` while secondary is held at 4.5:1 on
    // every palette × scheme. The ring is a non-text component (WCAG 1.4.11, 3:1) and clears its
    // bar on the same token, so both halves take one colour.
    badge: {
      alignItems: 'center',
      justifyContent: 'center',
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
    /**
     * ⚠️ THE SAME TOKEN THE MUSHAF PAGE ALREADY HIGHLIGHTS WITH (`accent.faint`), so the two
     * renderers say "here" in one visual language rather than two. It is a BACKGROUND, never a
     * change to the text colour or weight: the Arabic must render identically whether or not
     * audio is on it.
     */
    highlighted: {
      backgroundColor: theme.colors.accent.faint,
    },
    /**
     * ⚠️ `accent.soft`, AND THE GATE IS WHAT PICKED IT (story 7-8). The outline is a non-text
     * component, so WCAG 1.4.11's 3:1 applies — and it must clear that on the PAGE and on the
     * `accent.faint` fill above, because the recited ayah and the selected one are often the
     * same. `accent.soft` measures 4.40–11.29 over that fill across all twelve palette slices;
     * `accent.primary` measures 3.50 on terracotta·light. Both are pinned in
     * `palettes.contrast.test.ts`.
     */
    selected: {
      borderColor: theme.colors.accent.soft,
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
    <View
      style={[styles.row, highlighted && styles.highlighted, selected && styles.selected]}
      testID={testID}
    >
      <View style={styles.meta}>
        {/* ⚠️ The FILLED state is `accent.primary` on `background.primary` — measured 2026-08-28
            at ≥ 4.05:1 on every palette × scheme against WCAG 1.4.11's 3:1 non-text bar, pinned
            in `palettes.contrast.test.ts`. Outline is `text.secondary` (4.5:1, the badge
            precedent). The indicator flips on the SAME interaction because `addBookmark` applies
            the local cache synchronously — no optimistic-update code here. */}
        <Pressable
          onPress={() => onToggleBookmark(surah, verse)}
          onPressIn={onInteractionStart}
          hitSlop={BOOKMARK_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={bookmarked ? t('common:bookmarks.remove') : t('common:bookmarks.add')}
          // The label says which ACTION is available; `selected` announces the current STATE as
          // state, which is the half a screen reader otherwise never hears.
          accessibilityState={{ selected: bookmarked }}
          testID={`bookmark-toggle-${verse}`}
        >
          <Icon
            name={bookmarked ? 'bookmark' : 'bookmark-outline'}
            size={BOOKMARK_ICON_SIZE}
            color={bookmarked ? colors.accent.primary : colors.text.secondary}
            // Decorative — the Pressable carries the label. `IconFrame` derives Android's
            // `importantForAccessibility="no-hide-descendants"` from this same flag.
            accessibilityElementsHidden
            testID={`bookmark-icon-${verse}`}
          />
        </Pressable>
        {/* A bare numeral: no run of two letters, so `lint:i18n` correctly leaves it alone. */}
        <View style={[styles.badge, badgeSize]} testID={`ayah-badge-${verse}`}>
          <Text style={[styles.badgeNumber, badgeNumberSize]}>{verse}</Text>
        </View>
      </View>
      {/* ⚠️ THE PRESS IS ON THE TEXT, NOT ON THE ROW. The row's meta strip already holds the
          bookmark control, and a press target wrapping both would make every bookmark tap also
          select. `onSelectVerse` is optional so a surface that has no chrome to select into —
          the bookmarks list — renders the same row with no press target at all. */}
      <Pressable
        onPress={onSelectVerse ? () => onSelectVerse(surah, verse) : undefined}
        // ⚠️ REPORTED EVEN WHEN `onSelectVerse` IS ABSENT — but `disabled` below stops the
        // Pressable taking the touch at all in that case, so this only ever fires on a surface
        // that offers a selection. The two flags stay independent on purpose: a row could gain a
        // press with nothing behind it, and it would still owe the surface the suppression.
        onPressIn={onInteractionStart}
        disabled={!onSelectVerse}
        accessibilityRole={onSelectVerse ? 'button' : undefined}
        accessibilityLabel={onSelectVerse ? t('player:a11y.selectVerse', { verse }) : undefined}
        // The current state, as state — a screen reader otherwise never hears which ayah the
        // contextual row is acting on.
        accessibilityState={onSelectVerse ? { selected } : undefined}
        testID={`verse-text-${verse}`}
      >
        <Text style={[styles.arabic, { fontSize, lineHeight: fontSize * ARABIC_LINE_HEIGHT }]}>
          {stripDisplayMarks(text)}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * ⚠️ MEMOIZED, AND IT IS LOAD-BEARING RATHER THAN HYGIENE. FlashList re-renders its rows on every
 * list-level state change, and this screen has two that tick while the reader scrolls: the
 * visible verse (every viewability callback) and the chrome flag (every tap). Without `memo`,
 * one chrome toggle re-renders all 286 rows of Al-Baqarah, each of which re-runs
 * `useThemedStyles` and re-measures a full paragraph of Arabic. The 6-4 props keep it effective:
 * `bookmarked` is a boolean and `onToggleBookmark` is one stable callback, so toggling ONE verse
 * re-renders one row.
 *
 * `VerseRow.test.tsx` asserts the identity — `React.memo` leaves an observable `$$typeof` and a
 * `type` pointing at the inner function, so stripping it reddens rather than merely slowing.
 */
export const VerseRow = memo(VerseRowInner);
