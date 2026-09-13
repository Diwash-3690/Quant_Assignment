import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "dist/**",
      "build/**",
    ],
  },

  js.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },

  {
    rules: {
      "no-unused-vars": "warn",
    },
  },
];