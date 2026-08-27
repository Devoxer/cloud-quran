/**
 * AppHeader — THE header. One component, drawn in the RN view tree on iOS, Android and web alike
 * (story 6-6); there is no native stack header anywhere in this app.
 *
 * ⚠️ THE SLOTS ARE `leading` / `trailing`, AND THOSE NAMES ARE LOAD-BEARING. `headerLeft` and
 * `headerRight` are RESERVED WORDS in this codebase: `lint:header-controls` is an identifier
 * match, so it fires on our own in-tree props too, and the sanctioned answer is these names —
 * never a file exemption, which would blind the gate to a real native-slot assignment added
 * later. The gate itself stays even though no native header exists to install a control into:
 * under custom chrome the Apple-silicon-Mac click defect is *impossible* rather than merely
 * forbidden, and the gate is what keeps a future native header from silently re-opening it.
 *
 * ⚠️ THE BACK CONTROL IS HISTORY-CONDITIONAL: present when there is history to pop, ABSENT — not
 * inert — otherwise. A tab home reached cold has nothing to pop and draws no chevron; a pushed
 * settings screen does. This is what the old front-door redirect fought for with `dismissAll()`
 * (a phantom chevron on the app's most common entry); under 6-6 the home surface serves `/`
 * directly, so the history is simply real.
 *
 * ⚠️ `showBack` EXISTS BECAUSE THE DEFAULT (`router.canGoBack()`) IS COMPUTED OVER THE *FOCUSED*
 * PATH AND CAN BE ONE COMMIT STALE — measured on the simulator: a shell that re-renders off
 * `useSegments()` renders the PUSHED screen's title in the same commit in which the container's
 * focus-listener chain still answers for the pre-push screen, so the chevron missed its first
 * frame and nothing re-rendered it after. A layout that knows its own stack passes `showBack`
 * derived from the SAME segments as its title (the settings shell does: focused leaf ≠ the stack
 * root), so the two cannot disagree. The reading chrome keeps the default: its header renders at
 * REVEAL time, always after any transition has settled — and a hidden header cannot show a stale
 * answer.
 *
 * ⚠️ `pointerEvents="box-none"` ALWAYS. On the reading surfaces this bar overlays a scrolling
 * surface, and a 56pt band at `auto` swallows any drag that starts inside it — an invisible dead
 * zone over the verse being read. `box-none` gives touches to the CHILDREN (the controls) and
 * lets everything else fall through. In the settings shell the bar occupies layout and nothing
 * sits behind it, so the pass-through is harmless there.
 *
 * ⚠️ `onTitlePress` IS 6.3's SURAH/PAGE PICKER ENTRY, and it is inert-by-absence: with no
 * handler the title is plain text — never a dead control. Story 6.3 lands the picker route and
 * passes the handler in the same change (the pre-fork chrome's `Verse {n} of {count}` pressable
 * is the precedent for the title area being the jump affordance).
 *
 * Colours: the bar is `background.secondary`, the title `text.primary` (held at AAA on that
 * surface), the back chevron `accent.primary` (held at WCAG 1.4.11's 3:1) — all pinned in
 * `constants/palettes.contrast.test.ts` § navigation chrome. Platform differences are confined
 * to the safe-area inset; the control set is identical everywhere (`chrome-parity.test.tsx`).
 */

import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHROME_BAR_HEIGHT } from '@/constants/navigation';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { HeaderActionButton } from './HeaderActionButton';
import { Text } from './Themed';

export interface AppHeaderProps {
  title: string;
  /** Start-edge slot (after the back control). ⚠️ Never name a prop `headerLeft` — reserved. */
  leading?: ReactNode;
  /** End-edge slot. ⚠️ Never name a prop `headerRight` — reserved. */
  trailing?: ReactNode;
  /** 6.3's picker entry: when set, the title becomes the pressable jump affordance. */
  onTitlePress?: () => void;
  /**
   * Whether the back control renders. Omitted → `router.canGoBack()`. Pass it from a shell that
   * knows its own stack — see the docblock for the measured one-commit staleness this closes.
   */
  showBack?: boolean;
  /**
   * Whether the bar is currently reachable. `false` takes the back control and the title entry out
   * of the WEB KEYBOARD tab order — see `ReadingChrome`'s note on the third accessibility tree.
   */
  interactive?: boolean;
  testID?: string;
}

export function AppHeader({
  title,
  leading,
  trailing,
  onTitlePress,
  showBack,
  interactive = true,
  testID = 'app-header',
}: AppHeaderProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles((theme) => ({
    bar: {
      backgroundColor: theme.colors.background.secondary,
      borderBottomWidth: 1,
      // ⚠️ `text.secondary`, NOT `background.tertiary` — the bar floats OVER the reading page, so
      // this edge is the only thing saying where chrome stops and the Quran starts. Measured:
      // tertiary-on-page is 1.21–1.49:1 and tertiary-on-bar 1.09–1.25:1, i.e. the same 1.11–1.24:1
      // band that made story 6-0 reject a background-toned edge in the first place. This restores
      // 6-0's measured choice (≥6.0:1 in all twelve slices) and `palettes.contrast.test.ts` now
      // gates it, so a palette edit cannot quietly walk it back down.
      borderBottomColor: theme.colors.text.secondary,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
    },
    title: {
      flex: 1,
      color: theme.colors.text.primary,
      marginHorizontal: SPACING.sm,
      fontSize: FONT_SIZE.h2,
      fontWeight: FONT_WEIGHT.semibold,
      lineHeight: FONT_SIZE.h2 * LINE_HEIGHT.heading2,
    },
    titlePress: {
      flex: 1,
    },
    titleInPress: {
      flex: 0,
    },
  }));

  // Height is composed from a constant and a runtime inset — geometry, not theme, so inline.
  const barSize = { height: CHROME_BAR_HEIGHT + insets.top, paddingTop: insets.top };

  const titleText = (
    <Text
      style={[styles.title, onTitlePress ? styles.titleInPress : null]}
      numberOfLines={1}
      testID="chrome-title"
    >
      {title}
    </Text>
  );

  return (
    <View style={[styles.bar, barSize]} pointerEvents="box-none" testID={testID}>
      {(showBack ?? router.canGoBack()) ? (
        <HeaderActionButton
          name="chevron-back"
          onPress={() => router.back()}
          color={colors.accent.primary}
          accessibilityLabel={t('common:actions.back')}
          focusable={interactive}
          testID="chrome-back"
        />
      ) : null}
      {leading}
      {onTitlePress ? (
        <Pressable
          onPress={onTitlePress}
          style={styles.titlePress}
          accessibilityRole="button"
          focusable={interactive}
          tabIndex={interactive ? 0 : -1}
          testID="chrome-title-entry"
        >
          {titleText}
        </Pressable>
      ) : (
        titleText
      )}
      {trailing}
    </View>
  );
}
