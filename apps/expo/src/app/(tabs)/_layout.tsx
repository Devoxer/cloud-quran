import { Tabs } from 'expo-router/js-tabs';

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
 * ⚠️ `initialRouteName` must name a segment that EXISTS — a missing anchor does not error,
 * expo-router falls back to alphabetical order silently. `route-integrity.test.ts` checks it
 * against the filesystem. `index` is the mushaf, the home surface (`TABS[0]`).
 */
export const unstable_settings = { initialRouteName: 'index' };

export default function TabLayout() {
  return (
    <Tabs
      tabBar={() => null}
      backBehavior="none"
      screenOptions={{ headerShown: false, lazy: true }}
    />
  );
}
