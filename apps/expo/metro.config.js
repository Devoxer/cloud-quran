// Learn more https://docs.expo.io/guides/customizing-metro
// Sentry (v8): `getSentryExpoConfig` wraps Expo's `getDefaultConfig` and injects the
// Debug-ID serializer + source-map wiring that crash symbolication needs. With the
// `@sentry/react-native/expo` plugin in app.json, a bare `getDefaultConfig` leaves
// Debug IDs uninjected → release stack traces don't symbolicate. It returns the same
// MetroConfig object, so every resolver customization below is unaffected.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// Expo SDK 52+ auto-detects the workspace root and configures Metro for monorepos.
// `getSentryExpoConfig` delegates to `getDefaultConfig` internally, so this still holds —
// getDefaultConfig(__dirname) yields
//   watchFolders     = [<root>/node_modules, apps/expo, workers, landing]
//   nodeModulesPaths = [apps/expo/node_modules, <root>/node_modules]
// which satisfies Story 16.3 AC #12 (Metro resolves the hoisted root node_modules
// from apps/expo). Manually overriding watchFolders replaces these richer defaults
// and trips `expo-doctor` ("watchFolders does not contain all entries from Expo's
// defaults"), so we keep the canonical auto-config. The Hono RPC resolver patch
// (unstable_enablePackageExports) is added at the bottom (Story 17.1).

// TS path aliases (@/*, @/assets/*, @cloudquran/shared) need NO extra Metro
// config: @expo/cli enables tsconfig `paths` resolution by default
// (instantiateMetro `isTsconfigPathsEnabled ?? true`) and resolveWithTsConfigPaths
// matches the most-specific alias via the same longest-prefix algorithm TypeScript
// uses (matchTsConfigPathAlias), so @/assets/* wins over @/* for asset require()s.
// @cloudquran/shared resolves as a normal hoisted workspace package via its
// node_modules symlink (declared in package.json as `workspace:*`). Adding a
// babel-plugin-module-resolver or resolver.alias here would be redundant — Story 16.6 AC #3.

// Tree-shaking (Story 16.9, SDK 56): `transformer.experimentalImportSupport` is enabled by
// DEFAULT in SDK 54+ (https://docs.expo.dev/guides/tree-shaking/), so Story 16.8's curated
// per-feature barrels already get ES-import-level dead-code elimination with NO extra config —
// that's why nothing is added here. The aggressive graph pass (EXPO_UNSTABLE_TREE_SHAKING=1 +
// EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1) is intentionally NOT enabled: it's flagged "very
// experimental" by Expo and has an OPEN production-crash bug with react-native-reanimated
// (expo/expo#41620 — "Native part of Worklets doesn't seem to be initialized"), and this app
// uses reanimated on nearly every screen. Revisit when #41620 is resolved.

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

// Hono RPC (Story 17.1): the typed client imports `hono/client`, which Metro can't
// resolve from the worker workspace without package-exports resolution. These two
// resolver flags are the documented fix (STACK-CHEAT-SHEET § "Hono RPC — shared types").
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require'];

// `.js`-extension re-export fallback (Story 17.8): `packages/shared` writes its barrel
// re-exports with explicit `.js` extensions (`export * from './profile.js'`) because the
// NodeNext-resolution `tools/` consumers require them. But `unstable_enablePackageExports`
// (above) makes Metro honor that literal `.js` and NOT fall back to the `.ts` source — so a
// RUNTIME VALUE import through the barrel (the schema default + DEFAULT_NOTIFICATION_PREFERENCES,
// first introduced in 17.8) fails to bundle ("Unable to resolve ./instant.schema.js"). tsc
// (bundler/NodeNext) + Vitest + jest (via its `.js`-strip moduleNameMapper) all resolve fine;
// only Metro needs this. Try the literal request first (so a real `.js` still wins), then retry
// with the extension stripped so Metro resolves the `.ts` sibling. Mirrors jest.config.js's mapper.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return resolve(context, moduleName, platform);
    } catch {
      return resolve(context, moduleName.slice(0, -3), platform);
    }
  }
  return resolve(context, moduleName, platform);
};

// Keep co-located test files out of the Metro bundle. Tests sit next to source as
// siblings (`*.test.tsx`); this blockList ensures a test file never ships in the app
// bundle. NOTE: this is bundle hygiene, NOT the route-tree fix — Metro's blockList does
// NOT filter Expo Router's route scan, and `web.output: "static"` FS-scans `src/app/`
// directly. So ROUTE-screen tests are kept structurally OUT of the route tree (under
// `src/__tests__/app/`, see jest.config.js); a co-located `src/app/**/*.test.tsx` would
// become a phantom route / `_layout` conflict on web export regardless of this list. jest
// is unaffected (jest-expo uses its own resolver). The `node:fs` meta-tests (ac-12,
// route-paths) live there too.
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]),
  /\.(test|spec)\.[jt]sx?$/,
];

// ── Cloud Quran additions (story 5-1) ────────────────────────────────────────
// These four lines are SILENT if dropped: the app builds, typechecks and tests green,
// then fails at runtime on require('@/data/quran.db'), on web SQLite, and on every
// mushaf glyph. They are not interchangeable with the resolver config above — merge,
// never replace.
config.resolver.assetExts.push('db'); // the bundled Quran text — 4.2 MB SQLite
config.resolver.assetExts.push('wasm'); // expo-sqlite on web
config.resolver.assetExts.push('woff2'); // the patched QCF mushaf page fonts

// SharedArrayBuffer needs cross-origin isolation for web SQLite.
const baseEnhance = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const inner = baseEnhance ? baseEnhance(middleware, server) : middleware;
    return (req, res, next) => {
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      return inner(req, res, next);
    };
  },
};

module.exports = config;
