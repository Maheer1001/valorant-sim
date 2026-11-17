import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "tools/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}", "vite.config.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: [
      "src/sim/**/*.ts",
      "src/tactics/**/*.ts",
      "src/learning/**/*.ts",
      "src/persistence/**/*.ts",
      "src/rules/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["react", "react-dom"],
          patterns: ["react/*", "**/ui/**", "**/tactics/**", "**/learning/**", "**/persistence/**"],
        },
      ],
    },
  },
);
