import { Tabs } from 'expo-router/js-tabs';

import { TABS } from '@/constants/navigation';

/**
 * The tab shell — a NAVIGATOR ONLY, since story 6-6. It paints no chrome: `tabBar` renders
 * nothing, the JS header is off, and the ONE tab bar every platform gets is
 * `components/ui/AppTabBar`, mounted by the surfaces themselves (the reading screens inside
 * `ReadingChrome`, riding the reveal; the settings shell statically in
 * `(tabs)/(profile)/_layout.tsx`). `<NativeTabs>` is gone — see architecture §9 for the third
 * flip and the three reasons that drove it, none of which is the dead web-rendering claim.
 *
 * ⚠️ TWO COLOUR RULES FROM THE `NativeTabs` DOCBLOCK THIS REPLACES SURVIVE AS REQUIREMENTS ON
 * `AppTabBar` (its docblock carries them now): the selected label must not land on
 * `accent.primary` over the selection pill (3.07:1 on terracotta·light, and terracotta's accent
 * is byte-locked), and the accent still marks the selection on the ICON, where WCAG 1.4.11's 3:1
 * is the applicable bar. `palettes.contrast.test.ts` § navigation chrome holds the pairs;
 * `tab-chrome.test.tsx` holds that they are the colours actually shipped.
 *
 * ⚠️ THE NAVIGATOR IS THE JS BOTTOM-TABS (react-navigation over react-native-screens), which is
 * what keeps navigation BEHAVIOUR native — screen lifecycle, per-tab state, lazy mounting —
 * while painting nothing. `backBehavior="none"` is deliberate: a tab switch is not history, so
 * `router.canGoBack()` answers false on every tab home and `AppHeader`'s back control appears
 * only where a real push exists (the settings sub-screens). Without it, every non-initial tab
 * would draw a phantom back chevron.
 *
 * ⚠️ NO `anchor` HERE, DELIBERATELY (expo-router 58, story 5-9). With `unstable_settings.anchor`
 * set, 58's static renderer pre-rendered EVERY tab URL as the anchor: `/read`, `/bookmarks` and
 * every settings page shipped the mushaf's HTML and the client hydrated onto it. The anchor only
 * restated the default anyway — the first declared screen is the initial route, and `TABS[0]` is
 * `index`, the mushaf. `tabs-layout.test.tsx` and `route-integrity.test.ts` hold both halves.
 */

export default function TabLayout() {
  return (
    <Tabs
      tabBar={() => null}
      backBehavior="none"
      screenOptions={{ headerShown: false, lazy: true }}
    >
      {/* ⚠️ DECLARED, OR NOTHING RENDERS (expo-router 58). An undeclared route is no longer a
          tab: with no `Tabs.Screen` children the navigator renders an empty screen on every
          platform, and only a dev-mode warning says why. Read from `TABS`, so the navigator and
          `AppTabBar` cannot disagree about which tabs exist. */}
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} />
      ))}
    </Tabs>
  );
}
