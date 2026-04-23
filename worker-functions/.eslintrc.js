/**
 * ESLint configuration for worker-functions.
 *
 * Enforces module boundaries for ALL 9 modules + shared infra (target 7C).
 * Patterns and overrides generated from .eslint-module-boundaries.js factory.
 *
 * External code MUST import via barrels. Direct imports into subdirs bypass
 * the boundary and make extraction to microservices harder later.
 */
const { buildPatterns, buildOverrides } = require('./.eslint-module-boundaries');

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: [],
  rules: {
    'no-restricted-imports': [
      'error',
      { patterns: buildPatterns() },
    ],
  },
  overrides: buildOverrides(),
};
