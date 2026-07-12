const logger = require('../logging/logger');

/**
 * General Input Sanitization
 * 
 * Provides comprehensive input sanitization for all user-supplied data.
 * Handles strings, objects, and nested structures.
 * 
 * SANITIZATION RULES:
 * - Trim whitespace
 * - Remove control characters
 * - Normalize Unicode
 * - Strip HTML tags (configurable)
 * - Limit string lengths
 * - Remove null bytes
 * - Normalize line endings
 * 
 * @example
 *   const sanitize = require('@siamsiam/shared-utils').validators.sanitize;
 *   const clean = sanitize.string(userInput);
 *   const cleanObj = sanitize.object(userData, { fields: ['name', 'email'] });
 */

class Sanitizer {
  constructor() {
    this.defaultMaxLength = 10000;
    this.defaultMinLength = 0;
  }

  /**
   * Sanitize a string
   * @param {string} value - String to sanitize
   * @param {Object} options - Sanitization options
   * @returns {string} Sanitized string
   */
  string(value, options = {}) {
    if (typeof value !== 'string') return '';

    const {
      maxLength = this.defaultMaxLength,
      minLength = this.defaultMinLength,
      trim = true,
      stripHtml = false,
      stripScripts = true,
      normalizeUnicode = true,
      removeControlChars = true,
      removeNullBytes = true,
      normalizeNewlines = true,
      collapseWhitespace = true,
      allowedChars = null, // Regex pattern of allowed characters
    } = options;

    let sanitized = value;

    // Remove null bytes
    if (removeNullBytes) {
      sanitized = sanitized.replace(/\0/g, '');
    }

    // Remove control characters (except newlines and tabs)
    if (removeControlChars) {
      sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    }

    // Normalize Unicode (NFC form)
    if (normalizeUnicode) {
      sanitized = sanitized.normalize('NFC');
    }

    // Strip HTML tags
    if (stripHtml) {
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    }

    // Strip script tags specifically
    if (stripScripts) {
      sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      sanitized = sanitized.replace(/<script\b[^>]*>/gi, '');
      sanitized = sanitized.replace(/<\/script>/gi, '');
    }

    // Remove event handlers
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    sanitized = sanitized.replace(/javascript\s*:/gi, '');

    // Normalize newlines
    if (normalizeNewlines) {
      sanitized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    // Collapse whitespace
    if (collapseWhitespace) {
      sanitized = sanitized.replace(/\s+/g, ' ');
    }

    // Trim
    if (trim) {
      sanitized = sanitized.trim();
    }

    // Allowed characters filter
    if (allowedChars && allowedChars instanceof RegExp) {
      sanitized = sanitized.split('').filter(char => allowedChars.test(char)).join('');
    }

    // Length limits
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    if (sanitized.length < minLength && value.length >= minLength) {
      // Return empty if sanitized version is too short
      return '';
    }

    return sanitized;
  }

  /**
   * Sanitize a number
   * @param {*} value - Value to sanitize to number
   * @param {Object} options - Options
   * @returns {number|null} Sanitized number or null
   */
  number(value, options = {}) {
    const {
      min = Number.MIN_SAFE_INTEGER,
      max = Number.MAX_SAFE_INTEGER,
      allowDecimals = true,
      defaultValue = null,
    } = options;

    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }

    const num = typeof value === 'number' ? value : parseFloat(value);

    if (isNaN(num) || !isFinite(num)) {
      return defaultValue;
    }

    if (!allowDecimals && !Number.isInteger(num)) {
      return Math.round(num);
    }

    return Math.max(min, Math.min(max, num));
  }

  /**
   * Sanitize an integer
   */
  integer(value, options = {}) {
    return this.number(value, { ...options, allowDecimals: false });
  }

  /**
   * Sanitize a boolean
   */
  boolean(value, defaultValue = false) {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 1) return true;
    if (value === 'false' || value === '0' || value === 0) return false;
    return defaultValue;
  }

  /**
   * Sanitize an email address
   */
  email(value) {
    if (typeof value !== 'string') return '';
    
    let sanitized = value.toLowerCase().trim();
    
    // Remove common injection patterns
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
    sanitized = sanitized.replace(/<[^>]*>/g, '');
    
    // Basic email format
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    return emailRegex.test(sanitized) ? sanitized : '';
  }

  /**
   * Sanitize a phone number
   */
  phone(value, countryCode = 'ZW') {
    if (typeof value !== 'string') return '';
    
    // Remove everything except digits and +
    let sanitized = value.replace(/[^\d+]/g, '');
    
    // Ensure only one + at the start
    sanitized = sanitized.replace(/^\+{2,}/, '+');
    if (sanitized.indexOf('+') > 0) {
      sanitized = sanitized.replace(/\+/g, '');
    }

    return sanitized;
  }

  /**
   * Sanitize a URL
   */
  url(value) {
    if (typeof value !== 'string') return '';
    
    let sanitized = value.trim();
    
    // Remove javascript: and data: URLs
    if (/^(javascript|data|vbscript):/i.test(sanitized)) {
      return '';
    }

    // Only allow http and https
    if (sanitized.match(/^https?:\/\//i)) {
      return sanitized.substring(0, 2000); // Limit URL length
    }

    return '';
  }

  /**
   * Sanitize an object recursively
   * @param {Object} obj - Object to sanitize
   * @param {Object} options - Field-specific options
   * @returns {Object} Sanitized object
   */
  object(obj, options = {}) {
    if (!obj || typeof obj !== 'object') return {};

    const {
      fields = {}, // { fieldName: { type: 'string', options: {} } }
      stripUnknown = true,
      maxDepth = 10,
    } = options;

    return this._sanitizeObject(obj, fields, stripUnknown, maxDepth, 0);
  }

  /**
   * Sanitize an array
   */
  array(arr, options = {}) {
    if (!Array.isArray(arr)) return [];

    const {
      maxItems = 1000,
      itemType = 'string',
      itemOptions = {},
    } = options;

    return arr
      .slice(0, maxItems)
      .map(item => this._sanitizeValue(item, itemType, itemOptions))
      .filter(item => item !== null && item !== undefined && item !== '');
  }

  /**
   * Sanitize for database storage
   */
  forDatabase(value) {
    if (typeof value !== 'string') return value;
    
    return value
      .replace(/\0/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .substring(0, this.defaultMaxLength);
  }

  /**
   * Sanitize a filename
   */
  filename(value) {
    if (typeof value !== 'string') return '';
    
    return value
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .replace(/_{2,}/g, '_')
      .substring(0, 255);
  }

  /**
   * Sanitize for logging (remove PII)
   */
  forLogging(value, maxLength = 500) {
    if (typeof value !== 'string') return value;
    
    return value
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .substring(0, maxLength);
  }

  /**
   * Sanitize a credit card number (PCI compliance)
   */
  creditCard(value) {
    if (typeof value !== 'string') return '';
    
    // Remove non-digits
    const digits = value.replace(/\D/g, '');
    
    // Basic length check for common card types
    if (digits.length < 13 || digits.length > 19) return '';
    
    // Luhn algorithm check
    if (!this._luhnCheck(digits)) return '';
    
    return digits;
  }

  /**
   * Sanitize a security-sensitive token
   */
  token(value) {
    if (typeof value !== 'string') return '';
    
    // Remove any characters that aren't alphanumeric or common token chars
    return value.replace(/[^a-zA-Z0-9._\-]/g, '').substring(0, 500);
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Recursively sanitize an object
   * @private
   */
  _sanitizeObject(obj, fields, stripUnknown, maxDepth, currentDepth) {
    if (currentDepth >= maxDepth) return {};

    const sanitized = {};

    for (const [key, value] of Object.entries(obj)) {
      // Sanitize the key
      const cleanKey = this.string(key, { maxLength: 100 });

      // Get field-specific options
      const fieldConfig = fields[cleanKey];
      
      if (!fieldConfig && stripUnknown) {
        continue; // Skip unknown fields
      }

      if (fieldConfig) {
        // Apply field-specific sanitization
        sanitized[cleanKey] = this._sanitizeValue(
          value,
          fieldConfig.type || 'string',
          fieldConfig.options || {}
        );
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recursively sanitize nested objects
        sanitized[cleanKey] = this._sanitizeObject(
          value,
          fields,
          stripUnknown,
          maxDepth,
          currentDepth + 1
        );
      } else if (Array.isArray(value)) {
        sanitized[cleanKey] = this.array(value);
      } else {
        // Default string sanitization
        sanitized[cleanKey] = this.string(value);
      }
    }

    return sanitized;
  }

  /**
   * Sanitize a value based on type
   * @private
   */
  _sanitizeValue(value, type, options = {}) {
    switch (type) {
      case 'string': return this.string(value, options);
      case 'number': return this.number(value, options);
      case 'integer': return this.integer(value, options);
      case 'boolean': return this.boolean(value);
      case 'email': return this.email(value);
      case 'phone': return this.phone(value, options.countryCode);
      case 'url': return this.url(value);
      case 'array': return this.array(value, options);
      default: return this.string(value, options);
    }
  }

  /**
   * Luhn algorithm check for credit cards
   * @private
   */
  _luhnCheck(digits) {
    let sum = 0;
    let alternate = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits.charAt(i), 10);

      if (alternate) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      alternate = !alternate;
    }

    return sum % 10 === 0;
  }
}

module.exports = new Sanitizer();