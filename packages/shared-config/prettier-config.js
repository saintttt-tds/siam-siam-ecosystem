// packages/shared-config/prettier-config.js
/**
 * Shared Prettier Configuration
 * 
 * Consistent code formatting across all SiamSiam services.
 */
module.exports = {
  // Line length
  printWidth: 100,
  tabWidth: 2,
  
  // Quotes
  singleQuote: true,
  jsxSingleQuote: false,
  
  // Semicolons
  semi: true,
  
  // Trailing commas
  trailingComma: 'es5',
  
  // Brackets
  bracketSpacing: true,
  bracketSameLine: false,
  
  // Arrow functions
  arrowParens: 'always',
  
  // End of line
  endOfLine: 'lf',
  
  // HTML whitespace sensitivity
  htmlWhitespaceSensitivity: 'css',
  
  // Vue files
  vueIndentScriptAndStyle: false,
  
  // Embedded language formatting
  embeddedLanguageFormatting: 'auto',
  
  // Override for specific files
  overrides: [
    {
      files: '*.md',
      options: {
        proseWrap: 'always',
        printWidth: 80,
      },
    },
    {
      files: '*.{json,yml,yaml}',
      options: {
        tabWidth: 2,
      },
    },
  ],
};