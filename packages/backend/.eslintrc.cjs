/** @type {import('eslint').Linter.Config} */
module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint/eslint-plugin"],
  extends: [
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended",
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: [".eslintrc.cjs", "dist/", "node_modules/", "**/*.js"],
  rules: {
    // Backend-specific overrides from global config
    "@typescript-eslint/explicit-function-return-type": "warn", // Relaxed from "error"
    "@typescript-eslint/explicit-module-boundary-types": "warn", // Relaxed from "error"
    "@typescript-eslint/no-explicit-any": "warn", // Relaxed from "error" for queue/blockchain flexibility
    "@typescript-eslint/no-unsafe-member-access": "warn", // Relaxed from "error" for blockchain interactions
    "@typescript-eslint/no-unsafe-assignment": "warn",
    "@typescript-eslint/no-unsafe-argument": "warn",
    "@typescript-eslint/no-unsafe-return": "warn",

    // Keep strict promise handling (as requested)
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/no-floating-promises": "error",

    // Other rules from global config
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "_+", ignoreRestSiblings: true },
    ],
    "@typescript-eslint/prefer-as-const": "warn",

    // Additional backend-specific rules
    "no-console": "warn", // Allow console for logging but warn
    "prefer-const": "error",
    "no-var": "error",
  },
};
