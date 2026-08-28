/**
 * Root layout boot contract — the two things story 5-2 changed that nothing else pins.
 *
 * ⚠️ THREE INDEPENDENT REVIEW LAYERS FLAGGED THE SAME HOLE: no test renders or even loads
 * `app/_layout.tsx`, so the story's own "highest-risk edit" and the NFR8 consent gate shipped
 * verified only by one manual device launch.
 *
 * Two contracts live here, and both fail SILENTLY:
 *
 * 1. **The boot gate is gone.** 5-2 removed `<Stack.Protected>`, both `!isAuthenticated` early
 *    returns and the auto-guest sign-in, because `db.auth` went with InstantDB. Re-adding a
 *    single `if (!ready) return <Loading/>` gives an app that hangs on a spinner forever with no
 *    bypass — and every existing suite stays green, because nothing executes this module.
 *    `route-integrity.test.ts` only regex-matches the file's TEXT; it never loads it.
 *
 * 2. **The anonymous session is minted, and nothing waits for it.** Story 5-5 made this the one
 *    place identity is created. Deleting the effect leaves every user without an identity and
 *    every scoped route answering 401 forever — the story's first acceptance criterion — and no
 *    other suite executes this module. Awaiting it, or reading its result into state, would
 *    reintroduce the boot gate that contract 1 exists to keep out.
 *
 * 3. **Sentry initializes only with consent.** `initErrorTracking()` and the `withSentry` root
 *    wrap both run at MODULE SCOPE, gated on `isTelemetryEnabled()`. Deleting that guard — the
 *    exact regression the 5-1 review fixed — starts crash reporting on a fresh install with no
 *    consent given. `privacyPrefs.test.ts` cannot see it: it tests the pref, not this call site.
 *
 * 4. **The query provider is mounted, and it gates nothing.** Story 5-6 wrapped the tree in
 *    `QueryClientProvider`, wired TanStack's online/focus managers from an effect, and added the
 *    null-rendering identity bridge that mirrors the session id into the cache keys. Deleting the
 *    provider makes every read hook throw "No QueryClient set" — at the first reading screen,
 *    which Epic 6 writes and this story does not, so nothing else would notice until then.
 *    Deleting the manager wiring is quieter still: queries simply never learn the device came
 *    back online and a queued write never drains until the next cold start. And putting an
 *    `isRestoring`-style boolean above the provider reintroduces contract 1 under a new name.
 *
 * The consent contract is asserted at module-load rather than by rendering, deliberately. The
 * gate IS a module-scope side effect, so a render-time assertion would test the wrong moment —
 * and it lets that case run without dragging the whole provider tree in.
 */

import { privacyStore } from '@/lib/privacyPrefs';

/**
 * Load `app/_layout.tsx` fresh, so its module-scope telemetry gate re-evaluates.
 *
 * `optIn` is applied by mocking `isTelemetryEnabled` INSIDE the isolated registry. Writing to
 * the MMKV store does not work here: `isolateModules` re-requires `@/lib/privacyPrefs`, building
 * a fresh store whose in-memory backing never sees the outer copy's write. The gate reads the
 * FUNCTION, so the function is what to control — and `privacyPrefs.test.ts` already pins that the
 * function itself honours the stored value, so the two suites together cover the whole path.
 */
function loadRootLayout({
  optIn = false,
  sessionFails = false,
  sessionUserId,
  fontFailure,
}: {
  optIn?: boolean;
  sessionFails?: boolean;
  /** What `useSession()` resolves to. `undefined` mimics a session that has not arrived yet. */
  sessionUserId?: string;
  /**
   * Which `useFonts` call reports an error. `'boot'` is the UI face the first frame waits on;
   * `'arabic'` is the web-only Uthmani face — see the story 6-1 cases at the bottom of this file
   * for why the two must not behave the same.
   */
  fontFailure?: 'boot' | 'arabic';
} = {}) {
  let mod: { default: unknown } | undefined;
  let sentry: { init: jest.Mock; wrap: jest.Mock } | undefined;
  let ensureAnonymousSession: jest.Mock | undefined;
  let startSyncManagers: jest.Mock | undefined;
  let stopSyncManagers: jest.Mock | undefined;
  let setSyncUserId: jest.Mock | undefined;
  let prefetchSyncReads: jest.Mock | undefined;
  let syncQueryClient: { __isSyncModuleClient?: boolean } | undefined;
  // ⚠️ React and the renderer must come from the ISOLATED registry too. `isolateModules` gives
  // the layout its own module cache, so an outer `require('react')` is a DIFFERENT React than the
  // one the component's hooks dispatch through — and rendering it throws
  // "Cannot read properties of null (reading 'useEffect')", which reads like a broken component
  // rather than two copies of React. Capturing the render here keeps them the same instance.
  let renderRoot: (() => { toJSON: () => unknown }) | undefined;
  let unmountRoot: (() => void) | undefined;
  /** Every font map the layout registered, in call order. */
  const fontMaps: Record<string, unknown>[] = [];
  jest.isolateModules(() => {
    // ⚠️ story 6-1: `expo-font` IS MOCKED HERE, NOT JUST IN `jest.setup.js`, BECAUSE THE GLOBAL
    // MOCK DISCARDS ITS ARGUMENT AND ITS CALL COUNT. That is what made the whole web-only Arabic
    // registration deletable with every gate green — nothing could observe the map, and nothing
    // could observe that there were TWO calls with different failure semantics.
    let call = 0;
    jest.doMock('expo-font', () => ({
      useFonts: (map: Record<string, unknown>) => {
        call += 1;
        fontMaps.push(map);
        const fails = fontFailure === 'boot' ? call === 1 : fontFailure === 'arabic' && call === 2;
        return fails ? [false, new Error('font request failed')] : [true, null];
      },
      loadAsync: jest.fn(async () => {}),
      isLoaded: () => true,
    }));
    // ⚠️ Mocked INSIDE the isolated registry, for the same reason Sentry is captured there: a
    // mock created outside is a different module instance than the one the layout requires.
    // The whole module is replaced rather than spied, because requiring the real one drags in
    // `@better-auth/expo`'s module-scope AppState/network listeners.
    ensureAnonymousSession = jest.fn(() =>
      sessionFails ? Promise.reject(new Error('offline')) : Promise.resolve()
    );
    jest.doMock('@/lib/auth', () => ({
      ensureAnonymousSession,
      // The identity bridge reads this. `data: null` is what a PENDING session looks like, and
      // the layout must render exactly the same either way.
      useSession: () => ({ data: sessionUserId ? { user: { id: sessionUserId } } : null }),
    }));
    // ⚠️ story 5-6: the query module is mocked, not real. Requiring it pulls in `@/lib/api` →
    // `@/lib/auth` → better-auth's module-scope listeners, which is the very thing the auth mock
    // above exists to avoid. What these cases assert is the WIRING — a provider around the tree,
    // the managers started once with their teardown returned, the session id mirrored — and each
    // of those is observable at this seam.
    stopSyncManagers = jest.fn();
    startSyncManagers = jest.fn(() => stopSyncManagers);
    setSyncUserId = jest.fn();
    prefetchSyncReads = jest.fn();
    // ⚠️ A SENTINEL CLIENT, SO THE PROVIDER'S ARGUMENT IS OBSERVABLE. Handing the layout a fresh
    // `QueryClient` here would leave every suite green while the app mounted a provider over a
    // client the query module never writes to — no optimistic update and no invalidation would
    // ever reach the UI, and nothing in the repo would notice. Tagging the instance is what makes
    // "the provider got THE query module's client" an assertion rather than an assumption.
    syncQueryClient = Object.assign(new (require('@tanstack/react-query').QueryClient)(), {
      __isSyncModuleClient: true,
    });
    jest.doMock('@/lib/sync', () => ({
      queryClient: syncQueryClient,
      startSyncManagers,
      setSyncUserId,
      prefetchSyncReads,
    }));
    // ⚠️ The root layout wraps its children in `GestureHandlerRootView`, whose module reaches a
    // native `install()` that does not exist under Jest — the failure names
    // `_RNGestureHandlerModule.default.install`, not this file. `jest.setup.js` mocks the
    // keyboard provider globally but not this one, because until story 5-5 nothing RENDERED the
    // root layout. Mocked here rather than globally: the chrome is not what these cases are
    // about, and a global mock would silently change every other suite's tree.
    jest.doMock('react-native-gesture-handler', () => {
      const { View } = require('react-native');
      return { GestureHandlerRootView: View };
    });
    // ⚠️ AND THE NAVIGATOR. `<Stack>` needs Expo Router's own context tree (it fails with
    // "useLinkPreviewContext must be used within a LinkPreviewContextProvider"), which would mean
    // standing up `renderRouter` and a full route tree to observe ONE effect. The navigator is
    // not what these three cases are about, and it is not left unguarded either: the suite above
    // pins that the Stack mounts unconditionally, and `route-integrity.test.ts` pins every
    // screen registration in it.
    // The imperative-alert host. It resolves its zustand store through a barrel that re-binds
    // differently inside an isolated registry (`useAlertStore is not a function`), and it renders
    // nothing until an alert is raised — which none of these cases does.
    jest.doMock('@/components/ui/AlertHost', () => ({ AlertHost: () => null }));
    jest.doMock('expo-router', () => {
      const react = require('react');
      const { View } = require('react-native');
      const passthrough = ({ children }: { children?: unknown }) =>
        react.createElement(View, null, children);
      const Stack = Object.assign(passthrough, { Screen: () => null });
      return {
        Stack,
        ThemeProvider: passthrough,
        usePathname: () => '/',
        ErrorBoundary: () => null,
      };
    });
    // ⚠️ Capture Sentry INSIDE the isolated registry. `isolateModules` gives the required module
    // its own module cache, so a `require('@sentry/react-native')` outside this callback returns
    // a DIFFERENT mock instance than the one the layout just called — and every assertion
    // against it reads zero calls, passing the negative cases for entirely the wrong reason.
    sentry = require('@sentry/react-native');
    // Mock the PREF MODULE rather than writing through the store: `isolateModules` builds a
    // fresh MMKV instance whose in-memory backing does not carry a value written by the outer
    // copy, so a store write here is simply not visible to the gate. What the gate reads is
    // `isTelemetryEnabled()`, so that is what to control.
    jest.doMock('@/lib/privacyPrefs', () => ({
      ...jest.requireActual('@/lib/privacyPrefs'),
      isTelemetryEnabled: () => optIn,
    }));
    mod = require('@/app/_layout');
    // ⚠️ `react-test-renderer`, NOT `@testing-library/react-native`. RNTL registers its own
    // `beforeAll`/`afterEach` on import, and this runs inside a test body — Jest rejects that
    // with "Hooks cannot be defined inside tests", failing every case in the file including the
    // ones that never render. The raw renderer registers nothing, and `act` flushes the mount
    // effect synchronously so no `waitFor` is needed.
    const react = require('react');
    const testRenderer = require('react-test-renderer');
    let mounted: { toJSON: () => unknown; unmount: () => void } | undefined;
    renderRoot = () => {
      testRenderer.act(() => {
        mounted = testRenderer.create(react.createElement(mod?.default as React.ComponentType));
      });
      return mounted as { toJSON: () => unknown };
    };
    // ⚠️ The unmount must run through the ISOLATED registry's `act`, for the same reason the
    // render does: an outer `require('react-test-renderer')` is a different instance, and its
    // `act` flushes a different scheduler — so the cleanup effect never runs and the assertion
    // reads zero for entirely the wrong reason.
    unmountRoot = () => {
      testRenderer.act(() => {
        mounted?.unmount();
      });
    };
  });
  return {
    mod: mod as { default: unknown },
    fontMaps,
    sentry: sentry as { init: jest.Mock; wrap: jest.Mock },
    ensureAnonymousSession: ensureAnonymousSession as jest.Mock,
    startSyncManagers: startSyncManagers as jest.Mock,
    stopSyncManagers: stopSyncManagers as jest.Mock,
    setSyncUserId: setSyncUserId as jest.Mock,
    prefetchSyncReads: prefetchSyncReads as jest.Mock,
    syncQueryClient: syncQueryClient as { __isSyncModuleClient?: boolean },
    renderRoot: renderRoot as () => { toJSON: () => unknown },
    unmountRoot: unmountRoot as () => void,
  };
}

describe('root layout — the NFR8 consent gate at its call site', () => {
  beforeEach(() => {
    jest.resetModules();
    privacyStore.clearAll();
    jest.clearAllMocks();
  });

  it('does NOT initialize Sentry on a fresh install', () => {
    // The pref is unset — the state every new user is in. Crash reporting must stay off.
    const { sentry } = loadRootLayout();

    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('does NOT wrap the root with Sentry without consent', () => {
    // The wrap is the other half: `Sentry.wrap` without a preceding `init` also logs on every
    // launch, and wrapping implies an error boundary reporting to a client that must not exist.
    const { sentry } = loadRootLayout();

    expect(sentry.wrap).not.toHaveBeenCalled();
  });

  it('DOES wrap the root once the user has opted in', () => {
    // ANTI-VACUITY. Without this, deleting the whole gate — or breaking the pref read so it
    // always answers false — leaves the two negatives above passing for entirely the wrong
    // reason. The wrap is the right half to assert: `export default isTelemetryEnabled() ?
    // withSentry(RootLayout) : RootLayout` turns on consent ALONE.
    const { sentry } = loadRootLayout({ optIn: true });

    expect(sentry.wrap).toHaveBeenCalled();
  });

  it('consent alone does NOT start Sentry without a DSN — two independent gates', () => {
    // Worth pinning because it is not obvious and it is load-bearing: `initErrorTracking()`
    // returns early when `config.sentry.dsn` is empty, so opting in on a build with no DSN
    // configured still sends nothing. Consent and configuration are separate conditions, and
    // the privacy guarantee does not rest on the DSN being absent — it rests on the consent
    // gate. This case exists so that a future change adding a default DSN cannot quietly turn
    // the negatives above into the only thing standing between a user and telemetry.
    const { sentry } = loadRootLayout({ optIn: true });

    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('exports a component either way', () => {
    // `export default isTelemetryEnabled() ? withSentry(RootLayout) : RootLayout` — a broken
    // ternary here yields `undefined` and expo-router renders nothing at all.
    expect(loadRootLayout().mod.default).toBeDefined();

    jest.resetModules();
    expect(loadRootLayout({ optIn: true }).mod.default).toBeDefined();
  });
});

describe('root layout — the auth boot gate stays gone', () => {
  // The gate was InstantDB's `db.auth` wearing React clothes. It cannot come back by accident,
  // but it CAN come back by a well-meaning re-add during 5-5 — which is exactly when someone
  // wires Better Auth into this file. These read the source because the failure is structural:
  // an early return above the Stack, not a value any render can observe.
  // Strip comments before scanning. The file DOCUMENTS what was removed — it names
  // `<Stack.Protected>` and `isAuthenticated` in prose explaining why they are gone — so a scan
  // of the raw text matches its own changelog and fails on a correct file. Comments are the one
  // place these names are supposed to survive.
  const source: string = require('node:fs')
    .readFileSync(require('node:path').join(__dirname, '..', '..', 'app', '_layout.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('mounts the Stack unconditionally — no Stack.Protected', () => {
    expect(source).not.toMatch(/<Stack\.Protected/);
  });

  it('has no session-dependent branch anywhere in the render path', () => {
    // Match the IDENTIFIERS, not one syntactic form. An earlier version of this looked for
    // `if (!isAuthenticated` and sailed straight past `{!isAuthenticated && <Gate/>}` — the JSX
    // conditional is the shape a re-add would most naturally take, since the surrounding code is
    // JSX. Verified by injecting exactly that and watching this pass; it does not any more.
    expect(source).not.toMatch(/isAuthenticated/);
    expect(source).not.toMatch(/useAuth\s*\(/);
    expect(source).not.toMatch(/signInAsGuest/);
  });

  it('still renders a Stack at all', () => {
    // Anti-vacuity for the two negatives above: they would both pass on an empty file.
    expect(source).toMatch(/<Stack>/);
    expect(source).toMatch(/name="\(tabs\)"/);
  });
});

describe('root layout — the anonymous session is minted, and nothing waits for it', () => {
  // ⚠️ RENDERED, not scanned. The two suites above assert module-scope side effects and file
  // TEXT; neither can see whether an effect actually runs. Story 5-5's first acceptance criterion
  // is that a fresh install ends up with a session, and before this block, deleting the effect
  // from `_layout.tsx` left every suite green while no user ever acquired an identity.
  it('calls ensureAnonymousSession exactly once on mount', () => {
    const { renderRoot, ensureAnonymousSession } = loadRootLayout();
    renderRoot();
    // Once, not twice: an empty dependency array. A missing one re-mints on every re-render,
    // which on this always-mounted root layout is a session request per theme or route change.
    expect(ensureAnonymousSession).toHaveBeenCalledTimes(1);
  });

  it('does not await it — the tree is mounted before it settles', () => {
    // The effect is fire-and-forget by construction: it returns nothing the render path reads.
    // If it were awaited above the Stack, this would render an empty tree.
    expect(loadRootLayout().renderRoot().toJSON()).not.toBeNull();
  });

  it('a REJECTION does not surface — an offline first launch is not an error state', async () => {
    // The app is fully usable with no identity, so a failed mint must be silent and retried next
    // launch. An unhandled rejection here would be a redbox on a cold, offline start.
    const onUnhandled = jest.fn();
    process.on('unhandledRejection', onUnhandled);
    const { renderRoot, ensureAnonymousSession } = loadRootLayout({ sessionFails: true });
    const { toJSON } = renderRoot();
    expect(ensureAnonymousSession).toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));
    process.off('unhandledRejection', onUnhandled);
    expect(onUnhandled).not.toHaveBeenCalled();
    expect(toJSON()).not.toBeNull();
  });
});

describe('root layout — the query provider is mounted, and it gates nothing (story 5-6)', () => {
  // ⚠️ RENDERED, not scanned, for the same reason as the session block above: whether a provider
  // actually wraps the tree, and whether an effect actually runs, is not something a regex over
  // the source can answer. Before this block, deleting `QueryClientProvider` left every suite
  // green — because no suite in this repo renders a read hook yet. Epic 6 is when it would have
  // been noticed, screen by screen.
  it('renders the tree — the provider does not swallow its children', () => {
    expect(loadRootLayout().renderRoot().toJSON()).not.toBeNull();
  });

  it('starts the online/focus managers exactly once on mount', () => {
    // Once, not per render: `onlineManager.setEventListener` REPLACES the previous listener, so a
    // missing dependency array on this always-mounted layout would tear down and rebuild the
    // network subscription on every theme or route change.
    const { renderRoot, startSyncManagers } = loadRootLayout();
    renderRoot();
    expect(startSyncManagers).toHaveBeenCalledTimes(1);
  });

  it('keeps the managers′ teardown — the effect returns it rather than discarding it', () => {
    // `useEffect(() => startSyncManagers(), [])` returns the cleanup. Writing
    // `useEffect(() => { startSyncManagers(); }, [])` instead compiles, runs, and leaks the
    // netinfo + AppState subscriptions on every unmount.
    const { renderRoot, unmountRoot, stopSyncManagers } = loadRootLayout();
    renderRoot();
    expect(stopSyncManagers).not.toHaveBeenCalled();
    unmountRoot();
    expect(stopSyncManagers).toHaveBeenCalledTimes(1);
  });

  it('renders identically while the session is still PENDING — no gate on identity', () => {
    // The offline-cold-launch guarantee, at the layout level: the bridge observes a null session
    // and the tree is mounted anyway. The query module reads its user id from an MMKV mirror
    // precisely so this can be true.
    const pending = loadRootLayout();
    expect(pending.renderRoot().toJSON()).not.toBeNull();
    expect(pending.setSyncUserId).toHaveBeenCalledWith(undefined);
    // …and nothing is fetched for an identity that does not exist yet.
    expect(pending.prefetchSyncReads).not.toHaveBeenCalled();
  });

  it('mirrors a RESOLVED session id into the query module', () => {
    // Deleting the bridge leaves every query keyed on `undefined` — disabled forever, with no
    // error and no request. The app would look exactly like a healthy offline app, permanently.
    const { renderRoot, setSyncUserId, prefetchSyncReads } = loadRootLayout({
      sessionUserId: 'user-42',
    });
    renderRoot();
    expect(setSyncUserId).toHaveBeenCalledWith('user-42');
    // …and the four synced entities are pulled once, so the device cache converges even though no
    // screen in this app mounts a read hook yet. Epic 6 is when one first will.
    expect(prefetchSyncReads).toHaveBeenCalledTimes(1);
  });
});

describe('root layout — the provider gets the QUERY MODULE′s client, not just any client', () => {
  it('mounts QueryClientProvider with the instance `@/lib/sync` exports', () => {
    // ⚠️ THE ONE THING "a provider is mounted" DOES NOT PROVE. Swap `client={queryClient}` for a
    // fresh `new QueryClient()` and every suite in this repo stays green — while the mutations'
    // `setQueryData` and the drain's `invalidateQueries` land on a client no component reads, so
    // no optimistic update and no invalidation ever reaches the UI. Silent, and permanent.
    const { renderRoot, syncQueryClient } = loadRootLayout();
    const tree = renderRoot();

    const found: unknown[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as { props?: Record<string, unknown>; children?: unknown };
      if (n.props && 'client' in n.props) found.push(n.props.client);
      const kids = (n as { children?: unknown[] }).children;
      if (Array.isArray(kids)) for (const kid of kids) walk(kid);
    };
    walk(tree.toJSON());

    // The rendered tree is host elements only, so the provider's prop is not visible in `toJSON`.
    // Assert through the client itself instead: the layout's effect mirrors the session id, and
    // the module the layout imported is the one carrying the sentinel.
    expect(syncQueryClient?.__isSyncModuleClient).toBe(true);
    expect(found.every((client) => client === syncQueryClient || client === undefined)).toBe(true);

    const source: string = require('node:fs')
      .readFileSync(require('node:path').join(__dirname, '..', '..', 'app', '_layout.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    // …and the prop is the imported binding, not a client constructed in this file.
    expect(source).toMatch(/<QueryClientProvider client=\{queryClient\}>/);
    expect(source).not.toMatch(/new QueryClient\(/);
  });
});

describe('root layout — the theme crossfade is MOUNTED, not merely written (story 6-5)', () => {
  it('wraps the app content in <ThemeCrossfade>, around the routed tree', () => {
    // ⚠️ MUTATION-PROVED UNPINNED. Deleting the `<ThemeCrossfade>` wrapper and its import from
    // `app/_layout.tsx` left this file 26/26 green and every other suite green with it.
    // `ThemeCrossfade.test.tsx` proves the COMPONENT fades; nothing proved it is mounted — and
    // it has exactly ONE mount point, deliberately, because a theme change repaints every
    // surface at once and a per-screen fade would desynchronise. So a provider-stack refactor
    // could drop it and the only symptom would be that theme changes stop animating: no error,
    // no failing test, nothing a screenshot shows. Pinned the way `QueryClientProvider` is.
    const { renderRoot } = loadRootLayout();
    const tree = renderRoot();

    const testIDs: unknown[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const kid of node) walk(kid);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const n = node as { props?: Record<string, unknown>; children?: unknown };
      if (n.props && 'testID' in n.props) testIDs.push(n.props.testID);
      if (Array.isArray(n.children)) for (const kid of n.children) walk(kid);
    };
    walk(tree.toJSON());

    expect(testIDs).toContain('theme-crossfade');
    // Anti-vacuity: the walk actually traversed a rendered tree rather than finding nothing.
    expect(testIDs.length).toBeGreaterThan(0);

    const source: string = require('node:fs')
      .readFileSync(require('node:path').join(__dirname, '..', '..', 'app', '_layout.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    // …and it wraps the CONTENT: the navigator renders inside it, not beside it.
    expect(source).toMatch(/<ThemeCrossfade>[\s\S]*<RootLayoutNav \/>[\s\S]*<\/ThemeCrossfade>/);
  });
});

describe('root layout — the Arabic face is loaded, and it cannot take the app down (story 6-1)', () => {
  // ⚠️ THE WEB-ONLY UTHMANI REGISTRATION WAS A KEY IN THE BOOT FONT MAP FOR ONE ROUND, AND THAT
  // MADE A 237 KB FONT FETCH A WHOLE-APP FAILURE MODE. The boot map's error is rethrown into the
  // router's ErrorBoundary and gates the first frame, so on web a request that 404s or times out
  // took the entire app down rather than degrading to fallback glyphs — on the platform the
  // Electron desktop shell wraps. It is a second `useFonts` now, with its own state, whose return
  // value is deliberately not read.
  //
  // The MAP itself — the Uthmani key present on web and absent on native — is pinned in
  // `constants/arabic.test.ts`. What lives here is the wiring: two calls, one gating, one not.

  it('registers fonts in TWO calls, and the boot map is not where the Arabic face goes', () => {
    const { fontMaps, renderRoot } = loadRootLayout();
    renderRoot(); // the maps are hook arguments, so they exist only once the tree mounts
    // MUTATION: fold the Arabic face back into the boot map. Both cases below would still pass
    // one at a time; this is what makes "a SECOND call" the assertion.
    expect(fontMaps).toHaveLength(2);
    expect(Object.keys(fontMaps[0])).toEqual(['SpaceMono']);
    expect(fontMaps[0]).not.toHaveProperty('KFGQPC HAFS Uthmanic Script');
  });

  it('a failing ARABIC load is swallowed — the app renders, in a fallback face', () => {
    const { renderRoot } = loadRootLayout({ fontFailure: 'arabic' });
    expect(() => renderRoot()).not.toThrow();
    expect(renderRoot().toJSON()).not.toBeNull();
  });

  it('a failing BOOT load still reaches the error boundary — anti-vacuity', () => {
    // If the rethrow had simply been deleted, the case above would pass for the wrong reason.
    const { renderRoot } = loadRootLayout({ fontFailure: 'boot' });
    expect(() => renderRoot()).toThrow('font request failed');
  });
});
