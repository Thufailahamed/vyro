const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*'],
  },
  {
    rules: {
      // Web-only rule: React Native <Text> renders HTML entities literally.
      'react/no-unescaped-entities': 'off',
    },
  },
]);
