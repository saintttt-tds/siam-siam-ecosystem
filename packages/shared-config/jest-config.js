// packages/shared-config/jest-config.js
/**
 * Shared Jest Configuration
 * 
 * Consistent testing configuration across all SiamSiam services.
 */
module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Root directory
  rootDir: process.cwd(),
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js',
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
  ],
  
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html',
    'json',
  ],
  
  // Module name mapping
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@siamsiam/shared-config$': '<rootDir>/../shared-config',
    '^@siamsiam/shared-utils$': '<rootDir>/../shared-utils',
    '^@siamsiam/shared-middleware$': '<rootDir>/../shared-middleware',
    '^@siamsiam/shared-models$': '<rootDir>/../shared-models',
  },
  
  // Setup files
  setupFilesAfterSetup: [],
  
  // Timeouts
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  
  // Global setup and teardown
  globalSetup: undefined,
  globalTeardown: undefined,
  
  // Transform
  transform: {},
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
  ],
  
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
  ],
};