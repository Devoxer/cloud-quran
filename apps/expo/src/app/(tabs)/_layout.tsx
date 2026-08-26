import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { TABS } from '@/constants/navigation';
import { withAlpha } from '@/lib/color';
import { useTheme } from '@/lib/theme';

// Story 17.3.5: NativeTabs migration. `initialRouteName` moved from the
// `<Tabs>` prop to `unstable_settings` per the Expo Router idiom.
//
// ⚠️ story 6-0: this anchored on `index`, the hidden placeholder route that used to live in this
// group. That route MOVED OUT — it is now `app/read.tsx`, a root-level sibling of `(tabs)`
// presented as a modal, which is the only way a screen escapes the native tab bar. An
// `initialRouteName` naming a segment that no longer exists does not error: expo-router falls
// back to alphabetical order, silently. `route-integrity.test.ts` checks every layout's anchor
// against the filesystem for exactly that reason. `(profile)` is the only remaining segment —
// Cloud Quran's own tabs (Read, Mushaf, Bookmarks, Settings) arrive with 6.1–6.4.
export const unstable_settings = { initialRouteName: '(profile)' };

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
      {/* THE TAB BAR'S ENTIRE THEMING SURFACE. Three groups, split by what each platform's
          chrome actually reads — not by taste.

          `tintColor` is the SELECTED-state tint upstream falls back to when nothing more specific
          is given. Since `labelStyle.selected` is now supplied below, what `tintColor` actually
          colours here is the selected ICON on iOS and Android, and web's
          `--expo-router-tabs-active-text-color` only when no selected label colour is set — which
          is no longer the case. Treat it as the icon tint, not as "the selected colour".

          ⚠️ `labelStyle` IS NOT PLATFORM-GATED, and the gate it used to sit behind was a real
          defect. `NativeBottomTabsNavigator` derives `selectedLabelStyle = { color: tintColor }`
          whenever `tintColor` is set and no selected label colour is, and `appearance.ios.ts`
          writes that into the UITabBarAppearance unconditionally — so gating this to android||web
          left iOS shipping exactly the pair the rule below exists to remove.

          The `default` half also fixes a drift: Android's unselected LABEL fell back to Material
          You's wallpaper-derived `onSurfaceVariant` while the unselected ICON beside it used our
          `text.secondary` (`appearance.android.ts`). Same row, two colour systems.

          ⚠️ The `selected` half is a CONTRAST fix, and it is the one non-obvious call here. Left
          unset, the selected label falls back to `tintColor` — the accent as ~12sp text on the
          selection pill, and terracotta·light measures **3.07:1** on that blend, under the 4.5
          WCAG AA needs for small text. The palette rule is "tune the hue, never the bar", but
          terracotta's accent is byte-locked to the live default and cannot be tuned — so the
          third answer applies: don't put small text on that pair at all. The accent still marks
          the selection through the ICON, where the applicable bar is WCAG 1.4.11's 3:1 for a
          non-text component. This is also Material 3's own default (selected label `onSurface`,
          selected icon `onSecondaryContainer`). Held at AA in `palettes.contrast.test.ts`.

          ⚠️ story 6-0 widened the SURFACE group from Android to **Android + web**, because it was
          not merely "unverified on web" — it was ABSENT there. expo-router renders the web tab
          bar as a Radix pill whose CSS falls back to HARDCODED greys when the vars are unset
          (`native-tabs.module.css`: pill `#272727`, selected pill `#444444`, unselected label
          `#8b8b8b`). Gating these props to Android left every palette × scheme rendering the same
          dark-grey pill on web. The web view reads `backgroundColor` and `indicatorColor` off the
          SCREEN options, and `<NativeTabs>`' top-level props flow into those. Web renders no
          icons, so `iconColor` stays Android-only, and the web focus ring — which no prop reaches
          — is themed from CSS in `app/+html.tsx`.

          ⚠️ `backgroundColor` STAYS OFF iOS. Setting it overrides the iOS 26 UITabBarAppearance
          and kills the Liquid Glass material the chrome reversal was chosen to keep. That
          rationale is about the SURFACE only — it never covered a label colour, which is why
          `labelStyle` moved out of the gate.

          Every value is a palette token, so all six palettes × both schemes follow; the pairs are
          held to WCAG in `constants/palettes.contrast.test.ts` § navigation chrome. */}
      <NativeTabs
        sidebarAdaptable
        tintColor={colors.accent.primary}
        labelStyle={{
          default: { color: colors.text.secondary },
          selected: { color: colors.text.primary },
        }}
        {...(Platform.OS === 'android' || Platform.OS === 'web'
          ? {
              backgroundColor: colors.background.secondary,
              indicatorColor: withAlpha(colors.accent.primary, 0.15), // selection pill, accent @ ~15%
            }
          : null)}
        {...(Platform.OS === 'android'
          ? {
              iconColor: colors.text.secondary,
              rippleColor: withAlpha(colors.accent.primary, 0.15),
            }
          : null)}
      >
        {/* story 6-0: a hidden trigger for the `index` route stood here. That route moved to
            `app/read.tsx` — a root-level modal — so a trigger for it would name a segment this
            group no longer contains. (Written without the JSX: `route-integrity.test.ts` matches
            every `name=` prop in a layout against the filesystem over the RAW source, comments
            included, so quoting the deleted registration reds the guard it exists to satisfy.) */}
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
