// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      // App is in French: apostrophes in JSX text (d'appli, n'existe…) are
      // intentional and don't need HTML entity escaping.
      "react/no-unescaped-entities": "off",
    },
  },
]);
