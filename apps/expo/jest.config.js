/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    // Bun stores deps in node_modules/.bun/<pkg>@<ver>/node_modules/<pkg>/...
    // We need to transform all RN/Expo ecosystem packages regardless of location.
    'node_modules/(?!(\\.bun/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?(-[^/]*)?|@expo(nent)?|@expo-google-fonts|react-navigation|@react-navigation|react-native-svg|react-native-mmkv|react-native-gesture-handler|react-native-reanimated|react-native-screens|react-native-safe-area-context|react-native-web|react-native-nitro-modules|react-native-worklets|quran-data|shared)(/|$))',
  ],
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.woff2$': '<rootDir>/src/test/__mocks__/fileMock.js',
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/jest-setup.ts'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
};
