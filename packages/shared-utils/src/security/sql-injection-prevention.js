const logger = require('../logging/logger');
const SecurityEventLogger = require('../logging/security-events');

/**
 * SQL Injection Prevention
 * 
 * Detects and prevents SQL injection attempts through:
 * - Input pattern matching for SQL keywords and syntax
 * - Character escaping and sanitization
 * - Parameterized query enforcement
 * - Blocklist of dangerous SQL patterns
 * 
 * NOTE: The PRIMARY defense is always parameterized queries ($1, $2, etc.).
 * This module provides an ADDITIONAL layer of defense.
 * 
 * DETECTION PATTERNS:
 * - SQL comment sequences (--, /*)
 * - Union-based injection (UNION SELECT)
 * - Boolean-based injection (OR 1=1)
 * - Time-based injection (SLEEP, WAITFOR)
 * - Stacked queries (multiple statements)
 * - System stored procedures (xp_cmdshell, etc.)
 * 
 * @example
 *   const { sanitize, detectInjection } = require('@siamsiam/shared-utils').security.sqlInjectionPrevention;
 *   
 *   if (detectInjection(userInput)) {
 *     throw new Error('Potential SQL injection detected');
 *   }
 *   
 *   const safe = sanitize(userInput);
 */

class SQLInjectionPrevention {
  constructor() {
    // Dangerous SQL patterns to detect
    this.injectionPatterns = [
      // SQL comments
      /(\s|^)--\s/,                    // Single-line comment
      /\/\*.*\*\//,                    // Multi-line comment
      
      // Union-based injection
      /\bUNION\s+(ALL\s+)?SELECT\b/i,
      
      // Boolean-based injection
      /\bOR\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i,
      /\bAND\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i,
      /'\s*OR\s+'1'\s*=\s*'1/i,
      
      // Time-based injection
      /\bSLEEP\s*\(/i,
      /\bWAITFOR\s+DELAY\b/i,
      /\bBENCHMARK\s*\(/i,
      /\bPG_SLEEP\s*\(/i,
      
      // Stacked queries
      /;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|EXECUTE)\b/i,
      
      // System stored procedures
      /\bxp_cmdshell\b/i,
      /\bsp_executesql\b/i,
      /\bEXEC\s*\(/i,
      
      // Database enumeration
      /\bINFORMATION_SCHEMA\b/i,
      /\bINFORMATION_SCHEMA\./i,
      /\bTABLE_SCHEMA\b/i,
      /\bTABLE_NAME\b/i,
      
      // Dangerous functions
      /\bLOAD_FILE\s*\(/i,
      /\bINTO\s+(OUT|DUMP)FILE\b/i,
      /\bSELECT.*INTO.*FROM\b/i,
      
      // Hex/char encoding (evasion)
      /0x[0-9a-fA-F]{4,}/,            // Hex encoded strings
      /\bCHAR\s*\([0-9,\s]+\)/i,       // CHAR() function encoding
      /\bCONCAT\s*\(/i,
      
      // Comment-based evasion
      /\/\*!.*\*\//,                   // MySQL conditional comments
    ];

    // Characters that should be escaped
    this.dangerousChars = /['"\\;]/g;
    
    // Maximum allowed string length for SQL values
    this.maxStringLength = 10000;
  }

  /**
   * Detect potential SQL injection in input
   * @param {string} input - Input to check
   * @param {Object} context - Additional context for logging
   * @returns {boolean} True if injection detected
   */
  detectInjection(input, context = {}) {
    if (!input || typeof input !== 'string') return false;

    // Check against known injection patterns
    for (const pattern of this.injectionPatterns) {
      if (pattern.test(input)) {
        logger.warn('SQL injection pattern detected', {
          pattern: pattern.toString(),
          inputLength: input.length,
          inputPreview: input.substring(0, 100),
          ...context,
        });

        SecurityEventLogger.logSQLInjectionAttempt(
          context.ip || 'unknown',
          input,
          context.endpoint || 'unknown'
        );

        return true;
      }
    }

    return false;
  }

  /**
   * Sanitize input for safe SQL usage
   * ALWAYS prefer parameterized queries over sanitization
   * @param {string} input - Input to sanitize
   * @returns {string} Sanitized input
   */
  sanitize(input) {
    if (!input || typeof input !== 'string') return input;

    // Truncate to max length
    let sanitized = input.substring(0, this.maxStringLength);

    // Escape dangerous characters
    sanitized = sanitized
      .replace(/'/g, "''")      // Escape single quotes (PostgreSQL standard)
      .replace(/\\/g, '\\\\')   // Escape backslashes
      .replace(/;/g, '')        // Remove semicolons
      .replace(/--/g, '')       // Remove comment sequences
      .replace(/\/\*/g, '')     // Remove block comment starts
      .replace(/\*\//g, '');    // Remove block comment ends

    return sanitized;
  }

  /**
   * Validate and sanitize SQL identifier (table name, column name)
   * @param {string} identifier - SQL identifier to validate
   * @returns {string} Sanitized identifier or throws error
   */
  validateIdentifier(identifier) {
    if (!identifier || typeof identifier !== 'string') {
      throw new Error('Invalid SQL identifier');
    }

    // Identifiers should only contain alphanumeric, underscore, and optionally quotes
    const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$|^"[^"]*"$/;
    
    if (!validPattern.test(identifier)) {
      logger.warn('Invalid SQL identifier detected', { identifier });
      throw new Error(`Invalid SQL identifier: ${identifier}`);
    }

    return identifier;
  }

  /**
   * Validate and sanitize SQL value for direct use (NOT RECOMMENDED)
   * Always prefer parameterized queries instead
   * @param {*} value - Value to sanitize
   * @param {string} type - Expected type ('string', 'number', 'boolean')
   * @returns {string} Safe SQL value literal
   */
  sanitizeValue(value, type = 'string') {
    if (value === null || value === undefined) {
      return 'NULL';
    }

    switch (type) {
      case 'number':
        const num = Number(value);
        if (isNaN(num) || !isFinite(num)) {
          throw new Error('Invalid numeric value');
        }
        return num.toString();

      case 'boolean':
        return value ? 'TRUE' : 'FALSE';

      case 'string':
      default:
        if (typeof value !== 'string') {
          value = String(value);
        }
        // Escape and quote
        const sanitized = this.sanitize(value);
        return `'${sanitized}'`;
    }
  }

  /**
   * Add SQL injection patterns dynamically
   * @param {RegExp} pattern - Regex pattern to add
   */
  addPattern(pattern) {
    if (pattern instanceof RegExp) {
      this.injectionPatterns.push(pattern);
    }
  }

  /**
   * Check if a query uses parameterized values
   * @param {string} query - SQL query to check
   * @returns {boolean} True if query uses parameterized values
   */
  isParameterizedQuery(query) {
    return /\$\d+/.test(query) || /:[a-zA-Z_]\w*/.test(query);
  }
}

// Export singleton instance
module.exports = new SQLInjectionPrevention();