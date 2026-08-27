/**
 * AppTabBar — THE tab bar. `TABS`-driven, one row, drawn in the RN view tree on iOS, Android and
 * web alike (story 6-6); the navigator in `(tabs)/_layout.tsx` renders no bar of its own.
 *
 * ⚠️ TWO COLOUR RULES SURVIVE FROM THE `NativeTabs` LAYOUT THIS REPLACES, and both are measured,
 * not taste (they were that layout's docblock; the layout died, the requirements did not):
 *
 *   1. **The selected LABEL must not land on `accent.primary` over the selection pill.** The
 *      accent as ~12sp text on `withAlpha(accent, 0.15)`-over-bar measures **3.07:1** on
 *      terracotta·light — under the 4.5 WCAG AA bar for small text — and terracotta's accent is
 *      byte-locked to the live default, so it cannot be tuned. The selected label is therefore
 *      `text.primary`, always.
 *   2. **The accent still marks the selection — on the ICON**, a non-text component where WCAG
 *      1.4.11's 3:1 applies (3.07 clears it, with almost no headroom). This is also Material 3's
 *      own default (selected label `onSurface`, selected icon on the container).
 *
 *      Both pairs are held in `constants/palettes.contrast.test.ts` § navigation chrome, and the
 *      RESOLVED colours are asserted per platform × palette × scheme in
 *      `__tests__/app/tab-chrome.test.tsx` — the palette gate proves a colour is legible; only a
 *      render proves it is the colour shipped.
 *
 * ⚠️ `pointerEvents="box-none"`, LIKE THE HEADER: on the reading surfaces this bar overlays the
 * page and rides the reveal, and a hidden-or-revealing band must never swallow a drag. The tab
 * items themselves are the touch targets.
 *
 * ⚠️ NO ANIMATION IN THIS FILE, BY DESIGN. On the reading surfaces the bar is animated by the
 * ONE driver (`useChromeReveal`) from the wrapper that mounts it — a `useSharedValue` or
 * `withTiming` here would be a second driver at a second speed, which is the recorded
 * `chrome-render-storm` defect. `ReadingChrome.test.tsx`'s one-driver count scans this file.
 *
 * Selection is read from `useSegments()`: `segments[1]` is the tab segment under `(tabs)`, and
 * the group index (the mushaf, serving `/`) may yield none — absence means the first tab.
 */

import { useRouter, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHROME_BAR_HEIGHT, TABS } from '@/constants/navigation';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { withAlpha } from '@/lib/color';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Icon } from './Icon';
import { Text } from './Themed';

/** The selection pill's alpha — mirrored by the contrast gate's `INDICATOR_ALPHA`. */
export const TAB_INDICATOR_ALPHA = 0.15;

/** Tab icon glyph size — between the header action's 24 and the label, sized for a 56pt bar. */
const TAB_ICON_SIZE = 22;

export interface AppTabBarProps {
  testID?: string;
  /**
   * Whether the bar is currently reachable. `false` takes every tab out of the WEB KEYBOARD tab
   * order — see `ReadingChrome`'s note on the third accessibility tree. Defaults to `true` so the
   * settings shell, where the bar is always live, needs no prop.
   */
  interactive?: boolean;
}

export function AppTabBar({ testID = 'app-tab-bar', interactive = true }: AppTabBarProps = {}) {
  const router = useRouter();
  const segments: string[] = useSegments();
  const { t } = useTranslation('navigation');
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles((theme) => ({
    bar: {
      backgroundColor: theme.colors.background.secondary,
      borderTopWidth: 1,
      // See `AppHeader`'s edge: same reason, same measurement, same gate. The tab bar overlays the
      // last line of the page, so a 1.09:1 edge is not a delimiter.
      borderTopColor: theme.colors.text.secondary,
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pill: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: RADII.pill,
    },
    pillSelected: {
      backgroundColor: withAlpha(theme.colors.accent.primary, TAB_INDICATOR_ALPHA),
    },
    label: {
      fontSize: FONT_SIZE.caption,
      fontWeight: FONT_WEIGHT.medium,
      color: theme.colors.text.secondary,
    },
    labelSelected: {
      color: theme.colors.text.primary,
    },
  }));

  const active = segments[1] ?? TABS[0]?.name;
  const barSize = { height: CHROME_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom };

  return (
    <View
      style={[styles.bar, barSize]}
      pointerEvents="box-none"
      // Three `role="tab"` children need an owning tablist, or assistive tech reports tabs that
      // belong to nothing.
      accessibilityRole="tablist"
      testID={testID}
    >
      {TABS.map((tab) => {
        const selected = tab.name === active;
        const label = t(tab.titleKey);
        return (
          <Pressable
            key={tab.name}
            onPress={() => router.navigate(tab.href)}
            style={styles.item}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            focusable={interactive}
            tabIndex={interactive ? 0 : -1}
            testID={`chrome-tab-${tab.name}`}
          >
            <View
              style={[styles.pill, selected ? styles.pillSelected : null]}
              testID={`chrome-tab-${tab.name}-pill`}
            >
              <Icon
                name={tab.icon}
                size={TAB_ICON_SIZE}
                color={selected ? colors.accent.primary : colors.text.secondary}
                testID={`chrome-tab-${tab.name}-icon`}
              />
              <Text style={[styles.label, selected ? styles.labelSelected : null]}>{label}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
