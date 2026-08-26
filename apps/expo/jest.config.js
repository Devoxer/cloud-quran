const expoPreset = require('jest-expo/jest-preset');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // ⚠️ story 5-5: `.mjs` IS NOT IN jest-expo's TRANSFORM KEY (`\.[jt]sx?$`), so an untransformed
  // `.mjs` reaches Jest's CJS runtime and dies on its first `import` line — with a message that
  // names the dependency and not the extension. `@better-auth/core` ships `.mjs` throughout, and
  // `transformIgnorePatterns` alone cannot help: that list only decides WHETHER to transform, and
  // a file matching no transform key is skipped regardless. Spread the preset's map rather than
  // replacing it — a bare `transform` key overrides the preset's asset transformers too, which
  // turns every image import in the suite into a parse error.
  transform: {
    ...expoPreset.transform,
    '\\.mjs$': expoPreset.transform['\\.[jt]sx?$'],
  },
  // Co-located layout (Story 17.5): tests live next to source as `<unit>.test.ts(x)`
  // under src/ and scripts/. EXCEPTION — route-screen tests: Expo Router requires
  // `src/app/` hold ONLY routes/layouts (docs.expo.dev/router/reference/testing), and
  // `web.output: "static"` FS-scans the route tree (ignoring Metro's blockList), so a
  // co-located `src/app/**/*.test.tsx` becomes a phantom route / `_layout` conflict on
  // web export. Those tests live under `src/__tests__/app/` (mirrors the route paths,
  // imports the screen via the `@/app/...` alias). rootDir-relative glob picks up both.
  testMatch: ['**/*.test.ts?(x)'],
  // workers/ now lives outside this rootDir (apps/expo) and uses Vitest; nothing to ignore here.
  testPathIgnorePatterns: ['/node_modules/'],
  transformIgnorePatterns: [
    // `standard-navigation` (pure-ESM, "type":"module") is a NEW direct dep of
    // expo-router@56.2.11 (added in the Story 22.21 SDK-56 patch-align bump; absent
    // at 56.2.8). expo-router/src/exports.ts eval-requires it, so every suite that
    // imports `useRouter` from expo-router red-fails with "Cannot use import
    // statement outside a module" until jest-expo is allowed to transpile it.
    //
    // story 5-5 added `better-auth` and `@better-auth/expo`. Both are `"type": "module"`
    // and ship ESM under a bare `.js` extension, so Jest's CJS runtime chokes on the first
    // `import` line — reached transitively through `lib/auth.ts` from `app/_layout.tsx`,
    // which is to say from most of the suite. `@better-auth/*` needs its own alternative
    // because the `@expo(nent)?/` one above does not match a scoped package that merely
    // CONTAINS "expo" in its subpath.
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|standard-navigation|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|uuid|@react-native-google-signin/.*|better-auth|@better-auth/.*|@better-fetch/.*|better-call|nanostores|invariant)',
  ],
  // Runs in jest's MAIN process — the only place that can see what sets the exit code.
  globalSetup: '<rootDir>/jest.global-setup.js',
  globalTeardown: '<rootDir>/jest.global-teardown.js',
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: [],
  moduleNameMapper: {
    // Strip the `.js` extension off RELATIVE imports so Jest's resolver finds the
    // `.ts` source. `@cloudquran/shared` uses NodeNext-style `.js` re-exports
    // (`export * from './schemas/index.js'`) for its bundler/NodeNext consumers, but
    // Jest's resolver looks for `index.js` literally and can't fall back to `index.ts`.
    // This bites only when app RUNTIME code imports a VALUE through the shared barrel
    // (type-only imports are erased before resolution); Story 17.8 relocated
    // DEFAULT_NOTIFICATION_PREFERENCES + the InstantDB schema there. Safe: app code
    // never uses `.js` extensions on its own relative imports. Must precede `@/*`.
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Mirrors tsconfig paths (Story 16.6): "@/*" -> src/*, "@/assets/*" -> assets/*.
    // Jest tries src first, then the app-root fallback, which covers @/assets/* requires.
    '^@/(.*)$': ['<rootDir>/src/$1', '<rootDir>/$1'],
  },
  collectCoverageFrom: [
    // Feature-first (Story 21.3): the domain code now lives under src/features/{x}/.
    'src/features/**/*.ts',
    'src/features/**/*.tsx',
    'src/constants/**/*.ts',
    // src/components is the shared remnant (ui/). story 5-2 deleted src/contexts/ (its one
    // provider was an analytics pass-through) and src/hooks/ (every hook in it was InstantDB
    // auth, a profile query or a store-review prompt gated on a deleted audio engine), so their
    // globs went with them rather than sitting here matching nothing.
    'src/components/**/*.ts',
    'src/components/**/*.tsx',
    'src/lib/**/*.ts',
    '!**/*.test.ts',
    '!**/*.test.tsx',
  ],
};
