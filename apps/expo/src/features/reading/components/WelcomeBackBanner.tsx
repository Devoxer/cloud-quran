/**
 * WelcomeBackBanner — the warm return-after-absence notice on the home surface (story 6-3; the
 * 7-day gate and 4s timer are adapted from `_reference/prefork-reading/…/WelcomeBackBanner.tsx`).
 *
 * ⚠️ IT SITS BELOW THE HEADER ZONE: `top = insets.top + CHROME_BAR_HEIGHT + SPACING.sm`. The
 * pre-fork banner's `top: insets.top + spacing.sm` IS the recorded `welcome-banner-overlap`
 * defect — it shared the header's Y with a higher z-index and covered the surah title for four
 * seconds whenever the chrome was revealed. The placement is pinned by `WelcomeBackBanner.test.tsx`.
 *
 * ⚠️ IT IS NOT CHROME AND MUST NEVER RIDE `useChromeReveal`. The one-driver rule is about the two
 * bars that must move as one; this is a transient notice with its own lifecycle (gone at 4s or on
 * page movement), and revealing the chrome must not summon it. Its own fade is therefore its own
 * Reanimated driver — EXCLUDED BY FILENAME from `ReadingChrome.test.tsx`'s one-driver walk, with
 * a companion case proving this file never touches the reveal.
 *
 * ⚠️ THE 7-DAY QUESTION IS ASKED ONCE, AT MOUNT. The home surface mounts once per run under lazy
 * tabs, so mount time IS app-open time; re-asking on every render would pop the banner mid-read
 * the moment a stale row synced in. It reads `useReadingPosition()` directly — `usePosition`
 * deliberately strips `updatedAt`, and widening it for one consumer would hand every screen a
 * timestamp it has no business comparing.
 *
 * No streak, no guilt, no session summary — the epic's acceptance. The copy names the surah and
 * leaves.
 */

import { SURAH_METADATA } from 'quran-data';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { DURATIONS, EASINGS } from '@/constants/animation';
import { CHROME_BAR_HEIGHT } from '@/constants/navigation';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE } from '@/constants/typography';
import { useReadingPosition } from '@/lib/sync';
import { useThemedStyles } from '@/lib/useThemedStyles';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
/** How long the banner stays before fading itself out. */
const BANNER_DISMISS_MS = 4000;

export interface WelcomeBackBannerProps {
  /** Screen-driven dismissal — the mushaf flips it on the first REAL page move. */
  dismissed: boolean;
}

export function WelcomeBackBanner({ dismissed }: WelcomeBackBannerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: row } = useReadingPosition();
  // Answered ONCE, from the MMKV-seeded row available on the first render — see the docblock.
  const [visible, setVisible] = useState(
    () =>
      row != null &&
      typeof row.updatedAt === 'number' &&
      Date.now() - row.updatedAt >= SEVEN_DAYS_MS
  );
  // The banner's own fade — deliberately NOT the chrome's reveal driver (see the docblock).
  const opacity = useSharedValue(0);

  const styles = useThemedStyles((theme) => ({
    card: {
      position: 'absolute',
      left: SPACING.lg,
      right: SPACING.lg,
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderRadius: RADII.md,
      borderWidth: 1,
      backgroundColor: theme.colors.background.secondary,
      // The same edge pair the header bar uses — already contrast-gated on every palette × scheme.
      borderColor: theme.colors.text.secondary,
    },
    copy: {
      color: theme.colors.text.primary,
      fontSize: FONT_SIZE.body,
      textAlign: 'center',
    },
  }));

  useEffect(() => {
    if (!visible) return;
    opacity.value = withTiming(1, { duration: DURATIONS.standard, easing: EASINGS.standard });
    const timer = setTimeout(() => {
      opacity.value = withTiming(
        0,
        { duration: DURATIONS.standard, easing: EASINGS.standard },
        (finished) => {
          if (finished) runOnJS(setVisible)(false);
        }
      );
    }, BANNER_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible, opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!visible || dismissed) return null;

  // Clamp, never trust: the row comes out of MMKV. A surah outside the book names nothing true,
  // so a corrupt row shows no banner rather than warmly greeting a surah nobody was reading.
  const metadata = SURAH_METADATA[(row?.surah ?? 0) - 1];
  if (!metadata) return null;

  // Geometry composed from a constant and a runtime inset — inline, like the header's own size.
  const belowHeader = { top: insets.top + CHROME_BAR_HEIGHT + SPACING.sm };

  return (
    <Animated.View
      // ⚠️ `none`, NEVER THE DEFAULT. This is an OPAQUE absolutely-positioned card sitting over
      // the mushaf for four seconds, and it is mounted OUTSIDE the `GestureDetector` that owns
      // the chrome-reveal tap — so with default `pointerEvents` a band across the page silently
      // answers nothing at all: the reader taps to reveal the chrome and the app looks dead.
      // It carries no controls, so it never needs a touch.
      pointerEvents="none"
      style={[styles.card, belowHeader, fade]}
      // A notice that disappears on its own has to be SPOKEN, not just drawn — nothing else
      // announces it, and it is gone before a screen-reader user could explore to it.
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      testID="welcome-back-banner"
    >
      <Text style={styles.copy}>
        {t('common:reading.welcomeBack', { name: metadata.nameTransliteration })}
      </Text>
    </Animated.View>
  );
}
