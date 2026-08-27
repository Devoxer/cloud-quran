import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
// SDK 56: expo-router no longer depends on react-navigation; it re-exports ThemeProvider.
import { ThemeProvider as NavigationThemeProvider, Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import 'react-native-reanimated';

import { AlertHost } from '@/components/ui/AlertHost';
import { UTHMANI_WEB_FONT } from '@/constants/arabic';
import { initI18n } from '@/i18n';
import { ensureAnonymousSession, useSession } from '@/lib/auth';
import { validateConfig } from '@/lib/config';
import { addBreadcrumb, initErrorTracking, setSentryDeviceContext, withSentry } from '@/lib/errors';
import { initLocalization } from '@/lib/localization';
import { createNavigationTheme } from '@/lib/nav-theme';
// Side-effect import: keeps the present-but-unwired baseline native-module
// wrappers (secure-store / clipboard / sharing) in the bundle graph. Story 17.9.
import '@/lib/nativeBaseline';
import { initializeNotifications } from '@/lib/notifications';
import { isTelemetryEnabled } from '@/lib/privacyPrefs';
import { prefetchSyncReads, queryClient, setSyncUserId, startSyncManagers } from '@/lib/sync';
import { useTheme } from '@/lib/theme';

// Initialize error tracking early, before any other code — but ONLY with consent.
// Story 5-1 review: this used to run unconditionally, gated inside `initErrorTracking` on DSN
// presence alone. Cloud Quran's rule is opt-IN, PII-scrubbed Sentry as the single exception to
// zero third-party telemetry (PRD NFR8), so presence of a DSN is not consent. `isTelemetryEnabled`
// reads the device-local MMKV pref; `(profile)/privacy-settings.tsx` is the opt-in surface.
if (isTelemetryEnabled()) {
  initErrorTracking();
}

// Read device locale + timezone once (the localization DATA layer — Story 17.9), then
// initialize i18next synchronously (Story 20.2).
//
// ⚠️ THIS ORDER IS LOAD-BEARING AGAIN as of Story 24.13, reversing the 20.6 note that used to
// stand here ("`initI18n()` never reads `getCachedLocale()`"). It does now: `initI18n()` takes its
// `lng` from `getStoredLanguage()`, which seeds an UNSET preference from the device locale via
// `deviceSeedLanguage()` → `getCachedLocale()` (§ D1 — safe because exposure is the compile-time
// `EXPOSED_LANGUAGES`, not an async DB read). Swap these two lines and the cache is still `null`
// when i18next initializes, so every device-seeded launch silently falls back to `en` — with no
// error and no test signal outside `language.test.ts`.
initLocalization();
initI18n();

// Attach additive device/app context to Sentry (additive only — Sentry-RN
// already auto-captures app version / OS / device model). Fire-and-forget;
// never blocks boot. (Story 17.9)
void setSentryDeviceContext();

// Initialize push notifications handler early, before any notifications can be received
// This sets up the foreground handler and creates Android notification channels
initializeNotifications();

// INTENTIONAL: Module-level validateConfig() execution
// This runs once when the module loads, before React renders.
// Purpose: Early detection of missing environment variables during development.
// The return value is intentionally ignored (void) since the function only logs
// warnings to console - it never blocks app startup or throws errors.
void validateConfig();

// story 5-2: `void initRevenueCat()` sat here. Cloud Quran is free and waqf-funded — there is no
// entitlement concept, no purchase flow and no SDK to boot. Nothing replaces it.

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // ⚠️ story 6-1: THE UTHMANI FACE, IN ITS OWN `useFonts`, AND THE SEPARATION IS THE FIX.
  //
  // The face is installed by the **expo-font config plugin** (`app.json`), which is NATIVE-ONLY —
  // it edits the Xcode target's `UIAppFonts` and copies into Android's assets, and does nothing at
  // all for `expo export --platform web`. Without this call the face is silently absent on web,
  // which is the platform the Electron desktop shell wraps: Arabic still renders, in a fallback
  // face, with no error anywhere. (`epic-1-retro-2026-03-20.md:118` recorded the trap; nothing in
  // the tree acted on it until a screen actually set the family.)
  //
  // ⚠️ IT WAS A KEY IN THE MAP ABOVE FOR ONE ROUND, WHICH MADE A 237 KB FONT FETCH A WHOLE-APP
  // FAILURE MODE. That map's `error` is rethrown into the router's ErrorBoundary three lines up,
  // and it gates the first frame — so on web a font request that 404s or times out took the
  // entire app down rather than degrading to fallback glyphs. A second call has its own state:
  // its return value is deliberately not read, nothing waits for it, and a failure means Arabic
  // in a fallback face on ONE screen. The map is empty on native (`UTHMANI_WEB_FONT`), where the
  // config plugin has already installed the face, so this is a no-op there.
  useFonts(UTHMANI_WEB_FONT);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree. ⚠️ Only the boot
  // font map's error reaches it — see the Arabic call above for why that face must not.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // ⚠️ story 5-5: THE SESSION IS MINTED HERE, AND NOTHING WAITS FOR IT. An effect with no
  // state, no branch and no return value — it runs AFTER the first paint, by definition, so it
  // cannot gate anything. Cloud Quran is anonymous-first and local-first: every reading surface
  // works with no identity at all, so a session is an enhancement that arrives whenever the
  // network allows, and an offline first launch is a silent no-op that retries next time.
  //
  // What used to stand in this file was InstantDB's `db.auth` wearing React clothes — a
  // `<Stack.Protected>` guard, two `!isAuthenticated` early returns and a stall timeout. That is
  // what `__tests__/app/root-layout-boot.test.tsx:116-148` scans this source to keep out, and
  // why a session read here must never become a value the render path can branch on.
  //
  // Module scope would work too and is where the other boot calls live; an effect is used
  // because a network call at IMPORT time leaks a live handle into every Jest suite that
  // requires this file (the runner force-exits and warns), and an effect nobody mounts is inert.
  useEffect(() => {
    // ⚠️ THE `.catch` IS NOT REDUNDANT WITH THE ONE INSIDE. `ensureAnonymousSession` swallows its
    // own failures today, so nothing can reject here — but this repo has already shipped exactly
    // this shape once (a boot promise with no `.catch`, which Node 24 turns into a non-zero
    // exit), and the call site is what survives a refactor of the callee. A rejected boot promise
    // must never become a redbox on a cold, offline start.
    void ensureAnonymousSession().catch(() => {});
  }, []);

  // ⚠️ story 5-6: the query cache's ONLINE and FOCUS signals. TanStack's `onlineManager` and
  // `focusManager` have no React Native defaults — left unwired, a query would never know the
  // device came back online and a queued write would never drain until the next cold start.
  // `startSyncManagers` returns its own teardown; nothing here is read by the render path.
  useEffect(() => startSyncManagers(), []);

  // Story 5-1 review: the notification listener block was deleted, not left inert. After the
  // domain deletion its handler computed `parseNotificationData(response)`, discarded it, and had
  // a comments-only body — while still registering two subscriptions and calling
  // `getLastNotificationResponse()` (whose promise carried no `.catch`, which Node 24 turns into
  // a non-zero exit). Cloud Quran's reminders are story 8-4 and are explicitly not streak-based,
  // so this is rebuilt there rather than carried as dead wiring.

  if (!loaded) {
    return null;
  }

  return (
    // ⚠️ story 5-6: `QueryClientProvider` GATES NOTHING ON A REMOTE ANSWER. It renders its
    // children with whatever the synchronous MMKV cache holds — there is no `isRestoring`, no
    // persist-client and no boolean derived from the network, which is why
    // `@tanstack/react-query-persist-client` is deliberately not a dependency (its restore is
    // asynchronous, which is a boot gate wearing a different name). See `lib/sync.ts`.
    //
    // ⚠️ IT IS NOT "UNCONDITIONAL", AND THE FIRST DRAFT OF THIS COMMENT SAID IT WAS. This whole
    // subtree sits below `if (!loaded) return null` — the FONT gate, which predates this story
    // and is a local, synchronous, bounded wait rather than a remote one. Writing "unconditional"
    // over a conditional is how a comment stops being checkable; the claim that matters is about
    // the network, and that one is true.
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={styles.gestureRoot}>
        {/* Mirrors the resolved session id into the query/cache keys. Renders null. */}
        <SyncIdentityBridge />
        {/* KeyboardProvider (react-native-keyboard-controller) — outermost
          app-content provider so KeyboardAwareScrollView works on every
          routed form. Sits just inside the gesture root, above the
          gesture-driven BottomSheets. Story 17.6. */}
        <KeyboardProvider>
          {/* Theme is a provider-free hook (@/lib/theme) — no <ThemeProvider> here.
              story 5-2: <AnalyticsProvider> wrapped this subtree. It was a pass-through with
              zero useAnalytics() consumers, and Cloud Quran ships zero third-party analytics
              (PRD NFR8), so it was removed rather than emptied. */}
          <RootLayoutNav />
          {/* story 5-1: the audio engine host mounted here in the source app. Cloud Quran's
              engine arrives in epic 7 (surah tracks + per-ayah offsets) and re-mounts as a
              null-rendering sibling in this exact position — NOT wrapped around the tree, so
              its position ticks stay off the nav graph. */}
          {/* Single mounted host for the imperative useAlert() native alert. */}
          <AlertHost />
        </KeyboardProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

/**
 * The one place the session id reaches the query cache (story 5-6).
 *
 * ⚠️ IT RENDERS NULL AND BRANCHES ON NOTHING. `lib/sync.ts` keys every query and every MMKV cache
 * entry on the user id, and it reads that id from an MMKV MIRROR rather than from `useSession()` —
 * because `useSession()` is pending on a cold offline launch, and keying reads off a pending
 * network answer is the boot gate this layout exists to keep out. This component is the bridge:
 * it observes the session and writes a RESOLVED id into the mirror. It cannot gate anything,
 * because it renders nothing and nobody reads its result.
 *
 * ⚠️ IT IS ITS OWN COMPONENT, NOT AN EFFECT IN `RootLayout`. `useSession()` re-renders its caller
 * on every session change; hoisting it into the layout would re-render the whole tree — including
 * the navigator — each time the session store ticks. A null-rendering sibling absorbs that.
 *
 * ⚠️ `lib/sync.ts` MUST NOT IMPORT `@/lib/auth` ITSELF: `auth.ts` → `accountTeardown.ts` →
 * `sync.ts` is a fixed chain (sign-out clears the outbox), so a `sync` → `auth` edge closes a
 * require cycle. A route may import both, which is why the bridge lives here.
 */
function SyncIdentityBridge() {
  const { data } = useSession();
  const userId = data?.user?.id;
  useEffect(() => {
    setSyncUserId(userId);
    // ⚠️ AND PULL, ONCE PER RESOLVED IDENTITY. Nothing else in the app reads the four synced
    // entities yet (Epic 6 owns the reading surfaces), and even once it does, a reader who never
    // opens the screen that mounts a given hook would never learn what their other device wrote.
    // Fire-and-forget, offline-safe, and it gates nothing — see `prefetchSyncReads`.
    if (userId) prefetchSyncReads();
  }, [userId]);
  return null;
}

function RootLayoutNav() {
  const { colors, isDark } = useTheme();
  // `useTranslation('navigation')` was dropped here with the `player` Stack.Screen — its only
  // reader was that screen's `title: t('titles.nowPlaying')`. Epic 7 brings both back together.

  // Memoize navigation theme to prevent unnecessary re-renders
  const navigationTheme = useMemo(() => createNavigationTheme(colors, isDark), [colors, isDark]);

  // story 5-1: the streak reminder was here. Cloud Quran's reminders are story 8-4, and
  // they are explicitly NOT streak-based — no guilt messaging (epic 1 acceptance).

  // Track navigation changes for Sentry breadcrumbs (Story 14.2 - AC#1)
  const pathname = usePathname();
  const previousPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (pathname && pathname !== previousPathRef.current) {
      addBreadcrumb('navigation', `Navigated to ${pathname}`, { from: previousPathRef.current });
      previousPathRef.current = pathname;
    }
  }, [pathname]);

  // Story 17.3.5 follow-up #6 (user direction): removed the cold-launch
  // reset. Expo Router's default state restoration is the canonical
  // behavior (Apple Music / Apple Podcasts restore the last tab on cold
  // launch). The reset was also interfering with tab navigation in
  // unexpected ways. `+native-intent.tsx` still catches genuine system
  // deep-links (push notifications etc.).

  // ⚠️ story 5-2: THE STACK MOUNTS UNCONDITIONALLY, and that is the point of this edit.
  // What used to stand here was wisdom-fruits' auth boot gate: `useAuth()` +
  // `useAuthEffects()`, an auto-guest sign-in effect, a 10s stall timeout with a retry
  // takeover, a cold-boot `/(welcome)` bounce, two `!isAuthenticated` early returns and a
  // `<Stack.Protected>` guard. All of it was InstantDB's `db.auth` wearing React clothes, and
  // with the SDK gone `isAuthenticated` could never turn true — the spinner would have hung
  // forever with no bypass. Cloud Quran is anonymous and local-only until story 5-5 brings
  // Better Auth in; there is no session to wait for, so there is nothing to gate on.
  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack>
        {/* ⚠️ story 6-6: THE ROOT STACK IS ONE TAB SHELL, AND EVERY PIECE OF CHROME IS OURS.
            `app/index.tsx` (the `/` redirect), `app/read.tsx` and `app/mushaf.tsx` are all GONE:
            the reading surfaces are TAB ROUTES now (`(tabs)/index.tsx` — the mushaf, serving `/`
            directly — and `(tabs)/read.tsx`), immersive because their chrome overlays and starts
            hidden, not because a `fullScreenModal` covered the bar. `headerShown: false` is set
            PER SCREEN here, never as a `screenOptions` blanket on this Stack — the anti-vacuity
            half of `custom-chrome.test.ts` scans for exactly that blanket, so "no native chrome"
            stays a per-surface decision with our components in its place.

            The root-modal slot this Stack used to carry is not abolished — epic 7's player is a
            genuinely modal surface and returns HERE, beside `(tabs)`, when it exists. What it
            must never carry again is a native header control; `lint:header-controls` owns that,
            and the reading chrome's controls live in `AppHeader`'s `leading`/`trailing` slots. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* +not-found auto-registers into this Stack; without this registration it would draw
            the ONE native stack header left in the app. Its content carries its own title and
            the "go home" link (`HOME_HREF`). */}
        <Stack.Screen name="+not-found" options={{ headerShown: false }} />
        {/* Story 5-1 review: `subscription` and `player` Stack.Screen registrations were
            removed. Both route files went with the domain deletion, so expo-router logged
            `[Layout children]: No route named "…" exists` and dropped them on every boot.
            The player returns in epic 7 (recitation audio) and there is no subscription
            screen — Cloud Quran has no monetization surface. */}
      </Stack>
    </NavigationThemeProvider>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
});

// Wrap with Sentry error boundary for production error tracking
// Wrap only when crash reporting is actually on. `withSentry` is `Sentry.wrap`, and wrapping
// without a preceding `Sentry.init` logs "App Start Span could not be finished. `Sentry.wrap` was
// called before `Sentry.init`" on EVERY launch — which, now that telemetry is opt-in and off by
// default (see the gate at the top of this file), would be every user. Same condition, same
// module scope, so the two cannot drift apart.
export default isTelemetryEnabled() ? withSentry(RootLayout) : RootLayout;
