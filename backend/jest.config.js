/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/tests/**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/soporte/entorno.ts'],
  globalSetup: '<rootDir>/tests/soporte/preparar-base.ts',
  clearMocks: true,
};
