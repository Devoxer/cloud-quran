import { usePathname, useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { BackHandler } from 'react-native';

import { TABS } from '@/constants/navigation';

/** The mushaf — `TABS[0]`, the home surface. */
const HOME = TABS[0].href;

/**
 * Android hardware back on a tab that is not home goes HOME, rather than out of the app.
 *
 * ⚠️ `backBehavior="none"` ABOVE IS WHY THIS EXISTS. A tab switch is not history, so with nothing
 * to pop the system back left the app from Read, Bookmarks or Settings — a reader one tap from the
 * mushaf was dropped on the launcher (confirmed on `emulator-5556`, 2026-10-03). `"firstRoute"`
 * would fix the back key but make `router.canGoBack()` true on every tab, drawing `AppHeader`'s
 * back chevron where there is no push. So the navigator stays history-free and this handler takes
 * the one case it leaves: back at a tab root. ⚠️ IT RUNS BEFORE REACT NAVIGATION'S OWN HANDLER
 * (measured: an unconditional version sent back from Settings › Recitation to the mushaf instead of
 * Settings), so it defers whenever there is real history — `canGoBack()` — and navigation pops.
 * Sheets register their handlers later still and close first. On home it declines, and back leaves
 * the app as Android expects.
 */
function useBackToHome(): void {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pathname === HOME || router.canGoBack()) return false;
      router.navigate(HOME);
      return true;
    });
    return () => subscription.remove();
  }, [pathname, router]);
}

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
  useBackToHome();
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
