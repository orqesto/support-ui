import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';
import noUpwardImports from './scripts/eslint/no-upward-imports.js';

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    ignores: ['dist', 'node_modules', 'scripts', '*.config.js', '*.config.ts'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
      import: importPlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        project: './tsconfig.app.json',
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // TypeScript strict rules
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
        },
      ],

      // React rules
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/jsx-uses-react': 'off',
      'react/jsx-no-target-blank': 'error',
      'react/jsx-key': 'error',
      'react/no-array-index-key': 'warn',
      'react/self-closing-comp': 'error',
      'react/jsx-curly-brace-presence': [
        'error',
        {
          props: 'never',
          children: 'never',
        },
      ],

      // React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Naming
      'id-length': ['error', { min: 2, exceptions: ['_'], properties: 'never' }],

      // General code quality
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'arrow-body-style': ['error', 'as-needed'],
      'object-shorthand': ['error', 'always'],
      eqeqeq: ['error', 'always'],
      curly: ['error', 'multi-line'],

      // File size
      'max-lines': ['error', { max: 650, skipBlankLines: true, skipComments: true }],

      // Import rules
      'import/no-duplicates': 'error',
      'import/newline-after-import': 'error',

      // Accessibility
      'jsx-a11y/anchor-is-valid': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
    },
  },
  // Tests: a Button out of use is aria-disabled, never natively disabled (it keeps keyboard
  // focus), so jest-dom's toBeDisabled/toBeEnabled and `.disabled` reads miss it — and
  // `.not.toBeDisabled()` passes on a busy Button. Use `toBeInactive()` (src/test/inactive.ts).
  {
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.property.name=/^toBe(Disabled|Enabled)$/]',
          message:
            'Use toBeInactive() / .not.toBeInactive(): a Button out of use is aria-disabled, not disabled.',
        },
        {
          selector:
            "CallExpression[callee.name='expect'] > MemberExpression[property.name='disabled']",
          message:
            'Use expect(element).toBeInactive(): a Button out of use is aria-disabled, not disabled.',
        },
        {
          selector:
            "CallExpression[callee.name='expect'] > ChainExpression > MemberExpression[property.name='disabled']",
          message:
            'Use expect(element).toBeInactive(): a Button out of use is aria-disabled, not disabled.',
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(toHaveAttribute|toHaveProperty)$/][arguments.0.value='disabled']",
          message:
            'Use toBeInactive() / .not.toBeInactive(): a Button out of use is aria-disabled, not disabled.',
        },
      ],
    },
  },
  // Override for Typography folder - disable strict unsafe rules for CVA
  {
    files: ['**/Typography/**/*.ts', '**/Typography/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  // Module boundaries (modularity task F1): the design system and lib never import a component,
  // page or feature. scripts/ci/check-boundaries.mjs counts the same imports for every lower layer
  // and holds them to .ci/baselines/boundaries.json; this makes any NEW one in ui/ or lib/ an error.
  {
    files: ['src/components/ui/**/*.{ts,tsx}', 'src/lib/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/__tests__/**'],
    plugins: { boundaries: { rules: { 'no-upward-imports': noUpwardImports } } },
    rules: { 'boundaries/no-upward-imports': 'error' },
  },
  // The upward imports that existed when the rule came in. Task F2 removes them (move the shared
  // piece down) and then deletes this block; the ratchet baseline already stops each of these
  // files from gaining another one. Do not add files here.
  {
    files: [
      'src/components/ui/DateRangePicker/dateRangeValue.ts',
      'src/lib/api-client.ts',
      'src/lib/importRange.ts',
      'src/lib/reportPeriod.ts',
    ],
    rules: { 'boundaries/no-upward-imports': 'off' },
  },
  prettierConfig,
];
