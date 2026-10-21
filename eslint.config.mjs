import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.expo/**',
      'android/**',
      'ios/**',
      'reference/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The web client is a direct port of the reference React app. Keep the
    // shared rules for new packages, but do not fail on the reference code's
    // existing `any`, unused-import and assignment idioms while the port is
    // being validated end-to-end.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-useless-assignment': 'off',
      'no-constant-binary-expression': 'off',
      'prefer-const': 'off',
    },
  },
  {
    files: ['**/*.config.{js,mjs,cjs,ts}', '**/vite.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
