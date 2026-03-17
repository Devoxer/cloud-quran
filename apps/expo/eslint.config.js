// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const rootConfig = require('../../eslint.config.js');

module.exports = defineConfig([
  expoConfig,
  ...rootConfig,
  {
    ignores: ['dist/*'],
  },
]);
