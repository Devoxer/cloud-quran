/**
 * ReadingChrome — the reading surfaces' chrome: `AppHeader` + `AppTabBar`, overlaid and animated
 * as ONE thing (story 6-1; re-composed onto the app-wide chrome components in story 6-6).
 *
 * ⚠️ IT OVERLAYS. BOTH BARS ARE `position: 'absolute'`, AND THAT IS AN ACCEPTANCE CRITERION, NOT
 * A STYLING CHOICE. "Revealing chrome must not shift content" — a bar that occupies layout pushes
 * the verse the reader is mid-sentence on. So the surface fills the whole screen, the bars float
 * over it, and the lists reserve `CHROME_BAR_HEIGHT + insets` permanently (see `(tabs)/read.tsx`)
 * rather than reserving it only while the bars are shown.
 *
 * ⚠️ BOTH BARS RIDE THE ONE DRIVER. The pre-fork build faded its header over 250ms while the tab
 * bar flipped `display: 'none'` with no animation at all — two mechanisms, two speeds, one
 * visibly broken transition (`chrome-render-storm`). Story 6-6 put the tab bar INTO the revealed
 * chrome, which makes the one-driver rule structural: this component wraps both bars in the same
 * `useChromeReveal` progress, and `AppHeader` / `AppTabBar` themselves contain no animation at
 * all (`ReadingChrome.test.tsx` counts drivers across the feature AND those two components).
 *
 * ⚠️ THE TAB BAR IS THE WAY OUT. These surfaces are tab routes (6-6): a tap reveals the chrome,
 * and the tab bar switches away — there is no close button and no `fullScreenModal` to escape
 * any more. The header's back control is history-conditional inside `AppHeader` (absent on a
 * cold tab home, never inert). The MODE TOGGLE is the third control: it navigates between the
 * two renderers and carries NO position of its own — one position, two renderers, and the
 * screens re-resolve the saved pair on focus, so the toggle cannot desynchronise them.
 *
 * ⚠️ THE BARS ARE ALWAYS MOUNTED. Unmounting the hidden chrome would make the reveal a mount
 * rather than an animation (nothing to fade FROM), and it is what let the pre-fork build reach
 * for `display: 'none'`. Hidden means `opacity: 0` plus `pointerEvents: 'none'`.
 *
 * ⚠️ AND HIDDEN MEANS HIDDEN FROM VOICEOVER AND TALKBACK TOO. `pointerEvents` reasons about the
 * TOUCH tree only; a bar at `opacity: 0` is still a first-class citizen of the ACCESSIBILITY
 * tree, so a screen-reader user swiping the reading surface would land on controls nobody can
 * see. `accessibilityElementsHidden` (iOS) + `importantForAccessibility="no-hide-descendants"`
 * (Android) is the pair.
 *
 * ⚠️ AND THERE IS A THIRD TREE THE FIRST CUT MISSED: WEB KEYBOARD FOCUS. Neither `pointerEvents`
 * nor the two native props above touches the DOM tab order, so on web a reader on the immersive
 * reading surface could press Tab and land on an INVISIBLE tab control — no focus ring to see,
 * because the bar it lives in is at `opacity: 0`, and Enter would navigate them away. Observed in
 * Chromium at `localhost:8081`: one Tab from a cold reading surface focused `chrome-tab-(profile)`.
 * `focusable` (react-native-web renders `tabIndex={-1}`; inert on native) rides `interactive` with
 * everything else, so all three trees hide together.
 *
 * ⚠️ REVEALED MEANS `box-none`, NOT `auto` — the bars are 56pt bands over a scrolling surface,
 * and `auto` would swallow any drag that starts inside them. The prop follows
 * `reveal.interactive`, NOT `reveal.visible`: flipping on `visible` makes the controls live
 * while still transparent, so a second tap 100ms after the first would land on an invisible
 * control. `useChromeReveal` turns `interactive` on from the animation's own completion.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppHeader, AppTabBar, HeaderActionButton } from '@/components/ui';
import { HOME_HREF, READ_HREF } from '@/constants/navigation';
import { useTheme } from '@/lib/theme';
import type { ChromeReveal } from '../hooks/useChromeReveal';

export interface ReadingChromeProps {
  reveal: ChromeReveal;
  /** Shown in the header. `null` while the metadata read is in flight. */
  title: string | null;
  /** Which renderer mounts this chrome — decides where the mode toggle goes. */
  mode: 'reading' | 'mushaf';
}

export function ReadingChrome({ reveal, title, mode }: ReadingChromeProps) {
  const { t } = useTranslation('navigation');
  const { colors } = useTheme();
  const router = useRouter();

  // See the header for all three: `box-none` rather than `auto`, keyed on `interactive` rather
  // than `visible`, and the accessibility tree hidden alongside the touch tree.
  /**
   * ⚠️ THE TITLE IS THE INDEX ENTRY, AND `AppHeader` DRAWS A CHEVRON BESIDE IT TO SAY SO.
   * Story 6-3 shipped this behind a press on plain text and the app's own author could not find
   * it — a control nobody can see does not exist. Two answers were tried and rejected before the
   * chevron: a SEARCH MAGNIFIER in the trailing slot (the universal signal for text search, which
   * this is not and which the Quran will eventually want — spending that icon here would mislead
   * now and collide later), and a FIFTH TAB (which would not have helped at all: both bars ride
   * the same `useChromeReveal`, so a tab is exactly as hidden as the header until the reader taps
   * the page — and every other tab is somewhere you STAY, while the index bounces you straight
   * back out).
   */
  const openIndex = useCallback(
    () => router.push({ pathname: '/surahs', params: { mode } }),
    [router, mode]
  );

  const touches = reveal.interactive ? ('box-none' as const) : ('none' as const);
  const hidden = !reveal.interactive;
  const offscreen = {
    accessibilityElementsHidden: hidden,
    importantForAccessibility: hidden ? ('no-hide-descendants' as const) : ('auto' as const),
  };

  return (
    <>
      <Animated.View
        style={[styles.slot, styles.top, reveal.headerStyle]}
        pointerEvents={touches}
        {...offscreen}
        testID="reading-chrome-header"
      >
        {/* story 6-3: the title IS the index entry. The pushed route carries the opener's mode so
            a selection writes — and, on a deep link, exits — toward the surface it came from. */}
        <AppHeader
          title={title ?? ''}
          interactive={reveal.interactive}
          onTitlePress={openIndex}
          titleHint={t('index.titleHint')}
          leading={
            <HeaderActionButton
              name={mode === 'reading' ? 'view-agenda' : 'view-list'}
              onPress={() => router.navigate(mode === 'reading' ? HOME_HREF : READ_HREF)}
              color={colors.accent.primary}
              accessibilityLabel={t(
                mode === 'reading' ? 'actions.openMushaf' : 'actions.openReading'
              )}
              focusable={reveal.interactive}
              testID="chrome-mode-toggle"
            />
          }
        />
      </Animated.View>

      <Animated.View
        style={[styles.slot, styles.bottom, reveal.footerStyle]}
        pointerEvents={touches}
        {...offscreen}
        testID="reading-chrome-footer"
      >
        <AppTabBar interactive={reveal.interactive} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  top: {
    top: 0,
  },
  bottom: {
    bottom: 0,
  },
});
