// @ts-check
import js from '@eslint/js';
import pluginRouter from '@tanstack/eslint-plugin-router';
import { defineConfig, globalIgnores } from 'eslint/config';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { createNodeResolver, importX } from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import { configs as tsConfigs } from 'typescript-eslint';

export default defineConfig([
  // Generated files, and folders that hold data and write-ups, not code.
  globalIgnores(['dist/', '.output/', '.tanstack/', 'src/routeTree.gen.ts', 'data/', 'evals/', 'config/', 'docs/']),

  js.configs.recommended,
  tsConfigs.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  ...pluginRouter.configs['flat/recommended'],

  {
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true }), createNodeResolver()],
      'import-x/internal-regex': '^@/',
    },
    rules: {
      // Imports: one order everywhere, and types imported as types.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      'import-x/consistent-type-specifier-style': ['error', 'prefer-top-level'],
      'import-x/no-unresolved': ['error', { ignore: ['\\?url$'] }],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-default-export': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // React: the two long-standing hook rules. The newer compiler rules in this
  // plugin's recommended set would force changes to working effects.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error' },
  },

  // Tool configuration files must export a default.
  { files: ['*.config.{js,ts}'], rules: { 'import-x/no-default-export': 'off' } },
]);
