// packages/shared-config/eslint-config.js
/**
 * Shared ESLint Configuration
 * 
 * Consistent code quality rules across all SiamSiam services.
 * Extends recommended configurations with custom rules.
 */
module.exports = {
  root: true,
  
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  
  extends: [
    'eslint:recommended',
  ],
  
  plugins: [
    'security',
    'no-secrets',
  ],
  
  rules: {
    // Code style
    'indent': ['error', 2, { SwitchCase: 1 }],
    'quotes': ['error', 'single', { avoidEscape: true }],
    'semi': ['error', 'always'],
    'comma-dangle': ['error', 'always-multiline'],
    'no-trailing-spaces': 'error',
    'eol-last': ['error', 'always'],
    'max-len': ['warn', { code: 120, ignoreComments: true, ignoreStrings: true }],
    
    // Best practices
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    'no-debugger': 'error',
    'no-alert': 'error',
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    
    // Security
    'security/detect-object-injection': 'warn',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-non-literal-fs-filename': 'warn',
    'security/detect-eval-with-expression': 'error',
    'security/detect-pseudoRandomBytes': 'error',
    'no-secrets/no-secrets': ['error', { tolerance: 4.5 }],
    
    // Variables
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-var': 'error',
    'prefer-const': 'error',
    
    // Async/await
    'no-return-await': 'error',
    'require-await': 'warn',
    
    // Error handling
    'no-throw-literal': 'error',
    'prefer-promise-reject-errors': 'error',
    
    // Complexity
    'complexity': ['warn', 10],
    'max-depth': ['warn', 4],
    'max-params': ['warn', 4],
  },
  
  overrides: [
    // Test files
    {
      files: ['**/*.test.js', '**/*.spec.js', '**/tests/**'],
      env: {
        jest: true,
      },
      rules: {
        'max-len': 'off',
        'no-console': 'off',
        'no-secrets/no-secrets': 'off',
      },
    },
    
    // Configuration files
    {
      files: ['*.config.js', '.*rc.js'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
  
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '*.min.js',
  ],
};