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
  globalIgnores([
    'dist/',
    '.output/',
    '.tanstack/',
    'src/routeTree.gen.ts',
    'data/',
    'evals/',
    'config/',
    'docs/',
  ]),

  js.configs.recommended,
  tsConfigs.strictTypeChecked,
  tsConfigs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  ...pluginRouter.configs['flat/recommended'],

  {
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({ alwaysTryTypes: true }),
        createNodeResolver(),
      ],
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
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
          ],
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
            {
              group: ['../*'],
              message: 'Use the @/ alias for a file in another folder.',
            },
            {
              group: ['./*/**'],
              message:
                'Use the @/ alias for a file in another folder; ./ is for the same folder.',
            },
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
            {
              target: './src/common',
              from: './src',
              except: ['./common', './config'],
            },
            {
              target: './src/config',
              from: './src',
              except: ['./config', './common'],
            },
            {
              target: './src/domain',
              from: './src',
              except: ['./domain', './common'],
            },
            {
              target: './src/infrastructure',
              from: './src',
              except: ['./infrastructure', './domain', './common', './config'],
            },
            {
              target: './src/application',
              from: [
                './src/server',
                './src/eval',
                './src/features',
                './src/routes',
              ],
            },
            {
              target: './src/eval',
              from: ['./src/server', './src/features', './src/routes'],
            },
            { target: './src/server', from: ['./src/eval', './src/routes'] },
            // The one step down into the browser's code: the sign-in middleware's
            // browser half needs the signed-in user's token.
            {
              target: './src/server',
              from: './src/features',
              except: ['./auth/lib/id-token.ts'],
            },
            // The browser reaches the server only through server functions.
            {
              target: ['./src/features', './src/routes'],
              from: [
                './src/application',
                './src/infrastructure',
                './src/eval',
                './src/server/middleware',
              ],
            },
            {
              target: ['./src/features', './src/routes'],
              from: './src/config',
              except: ['./public-env.ts'],
            },
            {
              target: ['./src/features', './src/routes'],
              from: './src/common/logging',
            },
            { target: './src', from: ['./scripts', './tests'] },
          ],
        },
      ],
      // Every import is at the top of its file, where it can be seen.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message: 'No dynamic import(). Import at the top of the file.',
        },
        {
          selector: 'TSImportType',
          message:
            "No inline import('…') types. Use `import type` at the top of the file.",
        },
        // The environment is read in src/config and nowhere else.
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env']",
          message:
            'Read settings through getConfig() from @/config/env.server.',
        },
        {
          selector:
            "MemberExpression[object.type='MetaProperty'][property.name='env']",
          message:
            'Read browser settings through getPublicConfig() from @/config/public-env.',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // House style: Array<T>, and interfaces for the shape of an object.
      '@typescript-eslint/array-type': ['error', { default: 'generic' }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      // A number or a yes/no in a sentence is fine. Nothing, or an object, is a bug.
      // A Secret prints as [REDACTED], which is the point of it.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allowBoolean: true,
          allow: [
            { from: 'lib', name: ['Error', 'URL', 'URLSearchParams'] },
            { from: 'file', name: 'Secret', path: 'src/config/secret.ts' },
          ],
        },
      ],
      // `||` on text is often meant: an empty string should fall through. On
      // anything else, `??` is required.
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true, boolean: true } },
      ],
      // This one rewrites a cast as `!`, which the rule against `!` then rejects.
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
      // What an exported function returns is part of its contract.
      '@typescript-eslint/explicit-module-boundary-types': 'error',
    },
  },

  // React: the two long-standing hook rules. The newer compiler rules in this
  // plugin's recommended set would force changes to working effects.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // The one place the environment is read. The import rules above still apply.
  {
    files: ['src/config/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message: 'No dynamic import(). Import at the top of the file.',
        },
        {
          selector: 'TSImportType',
          message:
            "No inline import('…') types. Use `import type` at the top of the file.",
        },
      ],
    },
  },

  // Application code logs through the logger. The command-line scripts print:
  // their output is the product.
  { files: ['src/**'], rules: { 'no-console': 'error' } },

  // The rules test signs in through Firebase's test kit, whose database handle
  // is the older "compat" class. It is the same object underneath, and the
  // test kit's own documentation passes it to these functions.
  {
    files: ['tests/integration/firestore-rules.test.ts'],
    rules: { '@typescript-eslint/no-unsafe-class-instance-assignment': 'off' },
  },

  // Tool configuration files must export a default.
  {
    files: ['*.config.{js,ts}'],
    rules: { 'import-x/no-default-export': 'off' },
  },

  // Plain JavaScript (this file) has no types to check against. Last, so that
  // it switches off every type-aware rule set above.
  { files: ['**/*.js'], extends: [tsConfigs.disableTypeChecked] },
]);
