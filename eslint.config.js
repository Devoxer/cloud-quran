const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const simpleImportSort = require('eslint-plugin-simple-import-sort');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = defineConfig([
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            // React and react-native
            ['^react', '^react-native'],
            // Expo
            ['^expo'],
            // Third-party packages
            ['^@?\\w'],
            // Internal packages (workspace)
            ['^(quran-data|shared)'],
            // Internal aliases
            ['^@/'],
            // Relative imports
            ['^\\.'],
          ],
        },
      ],
      'simple-import-sort/exports': 'error',
      // require() is needed for CJS configs and React Native image imports
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  eslintConfigPrettier,
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      '.expo/',
      '*.tsbuildinfo',
      '_bmad/',
      '_bmad-output/',
    ],
  },
]);
