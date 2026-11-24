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
      'import-x/internal-regex': '^@(tests)?/',
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
      'import-x/no-cycle': 'error',
      // One way to name another file: the alias across folders, `./` within one.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['../*'], message: 'Use the @/ alias for a file in another folder.' },
            { group: ['./*/**'], message: 'Use the @/ alias for a file in another folder; ./ is for the same folder.' },
          ],
        },
      ],
      // Layers. Each folder may import only from the folders below it:
      //   routes, features -> server -> application -> infrastructure -> domain -> config, common
      // The measurement harness (eval) sits beside server, above application.
      'import-x/no-restricted-paths': [
        'error',
        {
          basePath: import.meta.dirname,
          zones: [
            { target: './src/common', from: './src', except: ['./common', './config'] },
            { target: './src/config', from: './src', except: ['./config', './common'] },
            { target: './src/domain', from: './src', except: ['./domain', './common'] },
            {
              target: './src/infrastructure',
              from: './src',
              except: ['./infrastructure', './domain', './common', './config'],
            },
            { target: './src/application', from: ['./src/server', './src/eval', './src/features', './src/routes'] },
            { target: './src/eval', from: ['./src/server', './src/features', './src/routes'] },
            { target: './src/server', from: ['./src/eval', './src/routes'] },
            // The one step down into the browser's code: the sign-in middleware's
            // browser half needs the signed-in user's token.
            { target: './src/server', from: './src/features', except: ['./auth/lib/id-token.ts'] },
            // The browser reaches the server only through server functions.
            {
              target: ['./src/features', './src/routes'],
              from: ['./src/application', './src/infrastructure', './src/eval', './src/server/middleware'],
            },
            { target: ['./src/features', './src/routes'], from: './src/config', except: ['./public-env.ts'] },
            { target: ['./src/features', './src/routes'], from: './src/common/logging' },
            { target: './src', from: ['./scripts', './tests'] },
          ],
        },
      ],
      // Every import is at the top of its file, where it can be seen.
      'no-restricted-syntax': [
        'error',
        { selector: 'ImportExpression', message: 'No dynamic import(). Import at the top of the file.' },
        { selector: 'TSImportType', message: "No inline import('…') types. Use `import type` at the top of the file." },
        // The environment is read in src/config and nowhere else.
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: 'Read settings through getConfig() from @/config/env.server.',
        },
        {
          selector: "MemberExpression[object.type='MetaProperty'][property.name='env']",
          message: 'Read browser settings through getPublicConfig() from @/config/public-env.',
        },
      ],
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

  // The one place the environment is read. The import rules above still apply.
  {
    files: ['src/config/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'ImportExpression', message: 'No dynamic import(). Import at the top of the file.' },
        { selector: 'TSImportType', message: "No inline import('…') types. Use `import type` at the top of the file." },
      ],
    },
  },

  // Tool configuration files must export a default.
  { files: ['*.config.{js,ts}'], rules: { 'import-x/no-default-export': 'off' } },
]);
