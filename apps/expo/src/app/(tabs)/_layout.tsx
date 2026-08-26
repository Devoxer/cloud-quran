import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { TABS } from '@/constants/navigation';
import { withAlpha } from '@/lib/color';
import { useTheme } from '@/lib/theme';

// Story 17.3.5: NativeTabs migration. `initialRouteName` moved from the
// `<Tabs>` prop to `unstable_settings` per the Expo Router idiom.
// story 5-1: `(discover)` was deleted with its feature. `index` is the placeholder home
// until epic 6 builds the reading surface.
export const unstable_settings = { initialRouteName: 'index' };

export default function TabLayout() {
  const { t } = useTranslation('navigation');
  const { colors } = useTheme();
  // story 5-1: the narrow audio selects went with the MiniPlayer. The rule they encoded still
  // holds for epic 7 — the tab layout must NOT re-render on position ticks (select flat fields,
  // never a snapshot object).
  // story 5-1: everything from here to the render belonged to the MiniPlayer — the
  // player-route gate, the active-audio derivation, and the BottomAccessory placement.
  // It went with the audio feature. Epic 7 rebuilds it; the constraints worth carrying are
  // recorded in the architecture, not left as dead code here.
  // story 5-1: the MiniPlayer's `books` query lived here — one subscription in the parent so the
  // iPad's twin BottomAccessory mounts did not each open their own. It went with the player, and
  // with it the last query in this file. Cloud Quran's player arrives in epic 7 and will need the
  // same single-subscription treatment for whatever it hydrates.

  // Story 17.3.5 follow-up #3: dropped the `showFullPlayer` context flag +
  // its useEffect-driven `router.push`. Two real bugs traced to that flag:
  //   (1) tapping MiniPlayer → minimize → MiniPlayer again was a no-op
  //       (showFullPlayer was still true from the first tap; the useEffect's
  //       deps didn't change so no push fired).
  //   (2) cold-launch could restore the player route from the previous
  //       session's navigation state and present an empty modal sheet (no
  //       audio loaded yet → screen returns null → user sees an empty sheet).
  // MiniPlayer.onPress now pushes the route directly; the route's
  // chevron-down calls router.back(). Single source of truth: the URL.
  // Story 19.6: bare `/player` now resolves to the ROOT-LEVEL modal route
  // (`app/player.tsx`), presented over the whole tab navigator so it covers the
  // native tab bar on both platforms; `router.back()` returns to the tab the user
  // was on. The push path string is unchanged by the hoist.
  // story 5-1: the mini-player and the /player modal route were deleted with the audio
  // feature. Cloud Quran's player arrives in epic 7.

  return (
    <>
      {/* Android-only theming so the Material BottomNav uses our palette; iOS is left
          on its native Liquid Glass surface (these props are gated to Android, so the
          iOS chrome is untouched — no code-file split). `tintColor` (selected color)
          applies to both. */}
      <NativeTabs
        sidebarAdaptable
        tintColor={colors.accent.primary}
        {...(Platform.OS === 'android'
          ? {
              backgroundColor: colors.background.secondary,
              iconColor: colors.text.secondary,
              indicatorColor: withAlpha(colors.accent.primary, 0.15), // selection pill, accent @ ~15%
              rippleColor: withAlpha(colors.accent.primary, 0.15),
            }
          : null)}
      >
        <NativeTabs.Trigger name="index" hidden />

        {TABS.map((tab) => (
          <NativeTabs.Trigger key={tab.name} name={tab.name}>
            <NativeTabs.Trigger.Icon sf={tab.icon.sf} md={tab.icon.md} />
            <NativeTabs.Trigger.Label>{t(tab.titleKey)}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}

        {/* story 5-1: the iOS 26+ NativeTabs.BottomAccessory mount for the MiniPlayer sat here.
            Epic 7 restores it — and the constraint that made it non-obvious: on iPad the accessory
            mounts its children TWICE (sidebar and compact) with non-shared state, so anything it
            renders must take its data as a prop from this parent, never fetch its own. */}
      </NativeTabs>

      {/* story 5-1: the JS-overlay MiniPlayer fallback for iOS 18-25, Android and web sat here. */}
    </>
  );
}
