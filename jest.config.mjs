export default {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.mjs', '<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.js'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.ts$': '<rootDir>/tests/typescript-transformer.cjs' },
  testTimeout: 30000,
  clearMocks: true,
  coverageProvider: 'v8',
  collectCoverageFrom: ['app/lib/local-booking-store.ts', 'scripts/realtime.ts'],
};
