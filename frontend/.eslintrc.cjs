/**
 * ESLint configuration (ESLint 8 + typescript-eslint 8, legacy config format).
 * The ruleset focuses on correctness: unused code, unsafe any, hook misuse and
 * accidental browser-global leaks.
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '*.config.js', '*.config.ts', '.eslintrc.cjs', 'playwright.config.ts'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-refresh'],
  rules: {
    // Hooks are intentionally co-located with their providers/components in a
    // few files (theme, toasts, signal builder). That only means Fast Refresh
    // reloads those modules fully, so the rule is not useful here.
    'react-refresh/only-export-components': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'smart'],
    'prefer-const': 'error',
  },
  overrides: [
    {
      files: ['src/tests/**/*.ts', 'src/tests/**/*.tsx', '**/*.test.ts', '**/*.test.tsx'],
      env: { node: true },
      rules: { 'no-console': 'off', '@typescript-eslint/no-explicit-any': 'off' },
    },
    {
      files: ['src/core/**/*.ts'],
      rules: { 'no-console': 'error' },
    },
  ],
};
