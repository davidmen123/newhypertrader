import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import path from "path";

export default [
  {
    ignores: ["node_modules/", "dist/", "build/", "drizzle/*"],
  },
  {
    files: ["client/src/**/*.{ts,tsx}", "server/**/*.ts", "shared/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        React: true,
        google: true,
      },
      parser: tsParser,
      parserOptions: {
        project: path.join(path.dirname(import.meta.url).replace("file://", ""), "tsconfig.json"),
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": ["warn"],
      "@typescript-eslint/prefer-nullish-coalescing": ["warn"],
      "@typescript-eslint/prefer-optional-chain": ["warn"],
      "@typescript-eslint/explicit-function-return-type": ["off"],
      "@typescript-eslint/explicit-module-boundary-types": ["off"],
      "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "sort-imports": ["warn", { ignoreDeclarationSort: true }],
      "no-undef": ["off"],
    },
  },
];