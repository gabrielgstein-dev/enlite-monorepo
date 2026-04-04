/** Jest config for schema-only tests (no API required, just database) */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/e2e'],
  testMatch: ['**/sql-schema-sync.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  // No setupFilesAfterEnv — these tests only need the database, not the API
  verbose: true,
  testTimeout: 60000,
  maxWorkers: 1,
};
