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
          /**
           * MODULE BOUNDARY — notification module
           *
           * External code must import via @modules/notification barrel:
           *   import { TwilioMessagingService, TokenService } from '@modules/notification'
           * Direct imports into subdirs bypass the barrel.
           */
          {
            group: [
              '*/modules/notification/domain/*',
              '@modules/notification/domain/*',
            ],
            message:
              "Import notification types via the barrel: import { ... } from '@modules/notification'.",
          },
          {
            group: [
              '*/modules/notification/infrastructure/*',
              '@modules/notification/infrastructure/*',
            ],
            message:
              "Import notification infrastructure via the barrel: import { ... } from '@modules/notification'.",
          },
          {
            group: [
              '*/modules/notification/application/*',
              '@modules/notification/application/*',
            ],
            message:
              "Import notification use cases via the barrel: import { ... } from '@modules/notification'.",
          },
          {
            group: [
              '*/modules/notification/interfaces/*',
              '@modules/notification/interfaces/*',
            ],
            message:
              "Import notification interfaces via the barrel: import { ... } from '@modules/notification'.",
          },
          /**
           * MODULE BOUNDARY — identity module
           *
           * External code must import via @modules/identity barrel:
           *   import { AuthMiddleware, AdminController } from '@modules/identity'
           * Direct imports into subdirs bypass the barrel.
           */
          {
            group: [
              '*/modules/identity/domain/*',
              '@modules/identity/domain/*',
            ],
            message:
              "Import identity types via the barrel: import { ... } from '@modules/identity'.",
          },
          {
            group: [
              '*/modules/identity/ports/*',
              '@modules/identity/ports/*',
            ],
            message:
              "Import identity ports via the barrel: import { ... } from '@modules/identity'.",
          },
          {
            group: [
              '*/modules/identity/infrastructure/*',
              '@modules/identity/infrastructure/*',
            ],
            message:
              "Import identity infrastructure via the barrel: import { ... } from '@modules/identity'.",
          },
          {
            group: [
              '*/modules/identity/application/*',
              '@modules/identity/application/*',
            ],
            message:
              "Import identity use cases via the barrel: import { ... } from '@modules/identity'.",
          },
          {
            group: [
              '*/modules/identity/interfaces/*',
              '@modules/identity/interfaces/*',
            ],
            message:
              "Import identity interfaces via the barrel: import { ... } from '@modules/identity'.",
          },
          /**
           * MODULE BOUNDARY — integration module
           *
           * External code must import via @modules/integration barrel:
           *   import { TalentumApiClient, SyncTalentumWorkersUseCase } from '@modules/integration'
           * Direct imports into subdirs bypass the barrel.
           */
          {
            group: [
              '*/modules/integration/domain/*',
              '@modules/integration/domain/*',
            ],
            message:
              "Import integration types via the barrel: import { ... } from '@modules/integration'.",
          },
          {
            group: [
              '*/modules/integration/ports/*',
              '@modules/integration/ports/*',
            ],
            message:
              "Import integration ports via the barrel: import { ... } from '@modules/integration'.",
          },
          {
            group: [
              '*/modules/integration/infrastructure/*',
              '@modules/integration/infrastructure/*',
            ],
            message:
              "Import integration infrastructure via the barrel: import { ... } from '@modules/integration'.",
          },
          {
            group: [
              '*/modules/integration/application/*',
              '@modules/integration/application/*',
            ],
            message:
              "Import integration use cases via the barrel: import { ... } from '@modules/integration'.",
          },
          {
            group: [
              '*/modules/integration/interfaces/*',
              '@modules/integration/interfaces/*',
            ],
            message:
              "Import integration interfaces via the barrel: import { ... } from '@modules/integration'.",
          },
          /**
           * MODULE BOUNDARY — worker module
           *
           * External code must import via @modules/worker barrel:
           *   import { WorkerRepository, WorkerControllerV2 } from '@modules/worker'
           * Direct imports into subdirs bypass the barrel.
           */
          {
            group: [
              '*/modules/worker/domain/*',
              '@modules/worker/domain/*',
            ],
            message:
              "Import worker types via the barrel: import { ... } from '@modules/worker'.",
          },
          {
            group: [
              '*/modules/worker/ports/*',
              '@modules/worker/ports/*',
            ],
            message:
              "Import worker ports via the barrel: import { ... } from '@modules/worker'.",
          },
          {
            group: [
              '*/modules/worker/infrastructure/*',
              '@modules/worker/infrastructure/*',
            ],
            message:
              "Import worker infrastructure via the barrel: import { ... } from '@modules/worker'.",
          },
          {
            group: [
              '*/modules/worker/application/*',
              '@modules/worker/application/*',
            ],
            message:
              "Import worker use cases via the barrel: import { ... } from '@modules/worker'.",
          },
          {
            group: [
              '*/modules/worker/interfaces/*',
              '@modules/worker/interfaces/*',
            ],
            message:
              "Import worker interfaces via the barrel: import { ... } from '@modules/worker'.",
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
      // Inside the notification module itself, direct internal imports are allowed.
      files: ['src/modules/notification/**/*.ts'],
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
    {
      // Inside the identity module itself, direct internal imports are allowed.
      files: ['src/modules/identity/**/*.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
    {
      // Inside the integration module itself, direct internal imports are allowed.
      files: ['src/modules/integration/**/*.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
    {
      // Inside the worker module itself, direct internal imports are allowed.
      files: ['src/modules/worker/**/*.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ],
};
