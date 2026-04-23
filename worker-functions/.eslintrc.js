/**
 * ESLint configuration for worker-functions.
 *
 * Primary purpose: enforce module boundary for src/modules/case/.
 * External code must only import from src/modules/case/index.ts (the barrel).
 * Direct imports into domain/, infrastructure/, or application/ sub-layers
 * are forbidden outside the module itself.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: [],
  rules: {
    /**
     * MODULE BOUNDARY — case module
     *
     * Only imports via src/modules/case/index (barrel) are allowed externally.
     * Violators must refactor to import from 'src/modules/case' or '../../modules/case'.
     *
     * Pattern covers both relative paths like:
     *   ../../modules/case/domain/PatientIdentity
     *   ../modules/case/infrastructure/PatientResponsibleRepository
     * and absolute-style paths from tsconfig paths aliases (none configured for modules/).
     */
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['*/modules/case/domain/*'],
            message:
              "Import case domain types via the barrel: import { ... } from 'src/modules/case' (or relative path to index.ts).",
          },
          {
            group: ['*/modules/case/infrastructure/*'],
            message:
              "Import case infrastructure via the barrel: import { ... } from 'src/modules/case' (or relative path to index.ts).",
          },
          {
            group: ['*/modules/case/application/*'],
            message:
              "Import case application via the barrel: import { ... } from 'src/modules/case' (or relative path to index.ts).",
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // Inside the case module itself, direct internal imports are allowed.
      files: ['src/modules/case/**/*.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ],
};
