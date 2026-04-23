/**
 * ESLint configuration for worker-functions.
 *
 * Enforces module boundaries for:
 *   - src/modules/case/  — external code must import via barrel (index.ts)
 *   - src/modules/audit/ — external code must import via @modules/audit barrel
 *   - src/shared/        — external code must import via @shared barrel, not direct subdirs
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
          /**
           * MODULE BOUNDARY — audit module
           *
           * External code must import via the @modules/audit barrel:
           *   import { PlacementAuditRepository, Blacklist } from '@modules/audit'
           * Direct imports into subdirs (e.g. '@modules/audit/domain/...') bypass the barrel.
           */
          {
            group: ['*/modules/audit/domain/*', '@modules/audit/domain/*'],
            message:
              "Import audit types via the barrel: import { ... } from '@modules/audit'.",
          },
          {
            group: ['*/modules/audit/infrastructure/*', '@modules/audit/infrastructure/*'],
            message:
              "Import audit infrastructure via the barrel: import { ... } from '@modules/audit'.",
          },
          /**
           * MODULE BOUNDARY — shared infra
           *
           * External code must import via the @shared barrel:
           *   import { DatabaseConnection, KMSEncryptionService } from '@shared'
           * Direct imports into subdirs (e.g. '@shared/database/...') bypass the barrel
           * and make internal reshuffling of shared harder. Use the barrel.
           */
          {
            group: [
              '*/shared/database/*',
              '*/shared/security/*',
              '*/shared/events/*',
              '*/shared/utils/*',
              '*/shared/services/*',
            ],
            message:
              "Import shared infra via the barrel: import { ... } from '@shared'.",
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
    {
      // Inside the audit module itself, direct internal imports are allowed.
      files: ['src/modules/audit/**/*.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
    {
      // Inside src/shared/ itself, direct relative imports between subdirs are allowed.
      files: ['src/shared/**/*.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ],
};
