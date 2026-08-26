/**
 * ReadingChrome — the reader's header and footer, overlaid and animated as ONE thing (story 6-1).
 *
 * ⚠️ IT OVERLAYS. BOTH BARS ARE `position: 'absolute'`, AND THAT IS AN ACCEPTANCE CRITERION, NOT
 * A STYLING CHOICE. "Revealing chrome must not shift content" — a bar that occupies layout pushes
 * the verse the reader is mid-sentence on. So the list fills the whole screen, the bars float over
 * it, and the list reserves padding for them permanently (see `read.tsx`) rather than reserving it
 * only while they are shown.
 *
 * ⚠️ NO CONTROL HERE GOES IN A NATIVE HEADER SLOT. `lint:header-controls` forbids `headerLeft`,
 * `headerRight`, `unstable_header*Items` and `<Stack.Toolbar placement="left"|"right">` outright,
 * its exemption map ships empty, and this story keeps it that way. The defect it prevents: on an
 * Apple-silicon Mac running the iPhone build, a control in the native stack header is drawn
 * perfectly and never receives a mouse click, while the same control in the RN view tree works —
 * and `Platform` cannot distinguish that runtime, so tsc, jest, RNTL, Biome and screenshots are
 * all blind to it. Both wisdom-fruits root modals put their close button in a header slot; this
 * one does not.
 *
 * ⚠️ THE CLOSE CONTROL IS THE ROUTE'S ONLY EXIT. `fullScreenModal` has no dismiss gesture and web
 * never had one, so this button is the way out on every platform. `canGoBack()` is checked because
 * a direct URL load or a deep link has nothing to pop, and the no-history target is `HOME_HREF`
 * and **not** `/` — `/` is itself a redirect that pops the root stack, so routing the exit through
 * it leaves a chromeless screen for a blank one while a queued pop settles.
 *
 * ⚠️ THE BARS ARE ALWAYS MOUNTED. Unmounting the hidden chrome would make the reveal a mount
 * rather than an animation (nothing to fade FROM), and it is what let the pre-fork build reach for
 * `display: 'none'` on the tab bar — which cannot animate, which is exactly the two-speed defect.
 * Hidden means `opacity: 0` plus `pointerEvents: 'none'`, so a dismissed bar cannot eat a tap.
 */

import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { HOME_HREF } from '@/constants/navigation';
import { RADII } from '@/constants/radii';
import { MIN_TOUCH_TARGET, SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { useThemedStyles } from '@/lib/useThemedStyles';
import type { ChromeReveal } from '../hooks/useChromeReveal';

/**
 * The visible height of one bar's own content, excluding the safe-area inset it sits above/below.
 * Exported because `read.tsx` reserves exactly this much list padding at each end — the top and
 * bottom offsets are `CHROME_BAR_HEIGHT + insets.{top,bottom}`.
 *
 * ⚠️ `useTabBarHeight()` IS NOT PART OF THAT SUM ON THIS ROUTE, AND SAYING SO IS THE POINT. The
 * `tab-bar-covers-last-verse` defect existed because `MINI_PLAYER_HEIGHT` was exported, correct,
 * and consumed by nobody — so the temptation here is to import the tab-bar height to prove the
 * lesson was learned. `/read` is a ROOT SIBLING of `(tabs)`: it is outside the tab navigator, no
 * tab bar is on screen, and reserving 49pt for one would float the last verse above nothing.
 * What must be cleared is the safe-area inset and this story's own footer, which is what is
 * reserved. The first genuine consumer of `useTabBarHeight()` is a screen INSIDE the tabs.
 */
export const CHROME_BAR_HEIGHT = 56;

export interface ReadingChromeProps {
  reveal: ChromeReveal;
  /** Shown in the header. `null` while the metadata read is in flight. */
  title: string | null;
  /** Shown in the footer — the verse the reader is on and its mushaf page. */
  footnote: string;
}

export function ReadingChrome({ reveal, title, footnote }: ReadingChromeProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles((theme) => ({
    bar: {
      position: 'absolute',
      left: 0,
      right: 0,
      backgroundColor: theme.colors.background.secondary,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
    },
    header: {
      top: 0,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.background.tertiary,
    },
    footer: {
      bottom: 0,
      borderTopWidth: 1,
      borderTopColor: theme.colors.background.tertiary,
      justifyContent: 'center',
    },
    // ⚠️ `text.primary` on `background.secondary` and an ACCENT border, which is the same split
    // the placeholder's door made and for the same measured reason: `accent.primary` on
    // `background.primary` measures 4.05:1 on terracotta·light, under the 4.5 AA needs for small
    // text, and terracotta's accent is byte-locked to the live default so it cannot be tuned.
    // The accent marks the control as a control (WCAG 1.4.11's 3:1 for a non-text component)
    // while the label stays on a pair held at AAA. Pinned in `palettes.contrast.test.ts`.
    close: {
      minWidth: MIN_TOUCH_TARGET,
      minHeight: MIN_TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.md,
      backgroundColor: theme.colors.background.secondary,
      borderColor: theme.colors.accent.primary,
      borderWidth: 1,
      borderRadius: RADII.pill,
    },
    closeLabel: {
      color: theme.colors.text.primary,
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.semibold,
    },
    title: {
      flex: 1,
      color: theme.colors.text.primary,
      marginLeft: SPACING.md,
      fontSize: FONT_SIZE.h2,
      fontWeight: FONT_WEIGHT.semibold,
      lineHeight: FONT_SIZE.h2 * LINE_HEIGHT.heading2,
    },
    footnote: {
      color: theme.colors.text.secondary,
      fontSize: FONT_SIZE.bodySmall,
      textAlign: 'center',
      width: '100%',
    },
  }));

  // Height is composed from a constant and a runtime inset, so it belongs in an inline style —
  // and it holds no theme token, which is what `lint:style` scan 3 actually forbids.
  const headerSize = { height: CHROME_BAR_HEIGHT + insets.top, paddingTop: insets.top };
  const footerSize = { height: CHROME_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom };
  const interactive = reveal.visible ? ('auto' as const) : ('none' as const);

  return (
    <>
      <Animated.View
        style={[styles.bar, styles.header, headerSize, reveal.headerStyle]}
        pointerEvents={interactive}
        testID="reading-chrome-header"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.close')}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace(HOME_HREF);
          }}
          style={styles.close}
          testID="reading-close"
        >
          <Text style={styles.closeLabel}>{t('common:actions.close')}</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title ?? ''}
        </Text>
      </Animated.View>

      <Animated.View
        style={[styles.bar, styles.footer, footerSize, reveal.footerStyle]}
        pointerEvents={interactive}
        testID="reading-chrome-footer"
      >
        <Text style={styles.footnote} numberOfLines={1}>
          {footnote}
        </Text>
      </Animated.View>
    </>
  );
}
