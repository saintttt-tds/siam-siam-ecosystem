const dns = require('dns').promises;
const logger = require('../logging/logger');

/**
 * Email Validator with MX Record Check
 * 
 * Comprehensive email validation including:
 * - Format validation (RFC 5322)
 * - Domain MX record verification
 * - Disposable email detection
 * - Role-based email detection
 * - Common typo suggestions
 * 
 * @example
 *   const email = require('@siamsiam/shared-utils').validators.emailValidator;
 *   const result = await email.validate('user@example.com');
 *   if (result.valid) { /* email is valid * / }
 */

class EmailValidator {
  constructor() {
    // Common disposable email domains
    this.disposableDomains = new Set([
      'mailinator.com', 'guerrillamail.com', 'tempmail.com',
      '10minutemail.com', 'yopmail.com', 'throwaway.email',
      'sharklasers.com', 'trashmail.com', 'temp-mail.org',
      'fakeinbox.com', 'guerrillamail.org', 'mailnesia.com',
    ]);

    // Role-based email prefixes
    this.rolePrefixes = new Set([
      'admin', 'administrator', 'webmaster', 'hostmaster',
      'postmaster', 'info', 'support', 'sales', 'contact',
      'help', 'noreply', 'no-reply', 'donotreply',
      'billing', 'marketing', 'hr', 'jobs', 'careers',
    ]);

    // Common email provider domains (for typo detection)
    this.commonDomains = new Map([
      ['gmail.com', ['gmial.com', 'gmail.co', 'gmai.com']],
      ['yahoo.com', ['yaho.com', 'yahooo.com', 'yahho.com']],
      ['hotmail.com', ['hotmail.co', 'hotmai.com', 'hotmal.com']],
      ['outlook.com', ['outlok.com', 'outlook.co']],
    ]);

    // Maximum lengths
    this.maxLocalLength = 64;
    this.maxDomainLength = 255;
    this.maxTotalLength = 254;
  }

  /**
   * Validate email address
   * @param {string} email - Email to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result
   */
  async validate(email, options = {}) {
    const {
      checkMX = false,           // Verify MX records
      checkDisposable = true,    // Check disposable domains
      checkRole = false,         // Allow/disallow role-based emails
      suggestTypo = true,        // Suggest corrections for typos
    } = options;

    if (!email) {
      return { valid: false, error: 'Email is required' };
    }

    if (typeof email !== 'string') {
      return { valid: false, error: 'Email must be a string' };
    }

    // Trim and lowercase
    email = email.trim().toLowerCase();

    // Length check
    if (email.length > this.maxTotalLength) {
      return { valid: false, error: `Email too long (max ${this.maxTotalLength} characters)` };
    }

    // Basic format check
    const formatResult = this._checkFormat(email);
    if (!formatResult.valid) {
      return formatResult;
    }

    const [localPart, domain] = email.split('@');

    // Local part length
    if (localPart.length > this.maxLocalLength) {
      return { valid: false, error: 'Local part too long' };
    }

    // Domain length
    if (domain.length > this.maxDomainLength) {
      return { valid: false, error: 'Domain too long' };
    }

    // Check disposable domains
    if (checkDisposable && this.disposableDomains.has(domain)) {
      return { 
        valid: false, 
        error: 'Disposable email addresses are not allowed',
        isDisposable: true,
      };
    }

    // Check role-based emails
    if (checkRole && this.rolePrefixes.has(localPart)) {
      return {
        valid: false,
        error: 'Role-based email addresses are not allowed',
        isRole: true,
      };
    }

    // Check for common typos
    let suggestion = null;
    if (suggestTypo) {
      suggestion = this._detectTypo(domain);
    }

    // Check MX records
    let mxValid = null;
    if (checkMX) {
      mxValid = await this._checkMX(domain);
      if (!mxValid) {
        return {
          valid: false,
          error: 'Domain does not accept email (no MX records)',
          noMX: true,
        };
      }
    }

    return {
      valid: true,
      email,
      localPart,
      domain,
      normalized: email,
      suggestion,
      mxValid,
      isDisposable: this.disposableDomains.has(domain),
      isRole: this.rolePrefixes.has(localPart),
    };
  }

  /**
   * Quick format validation (sync)
   */
  isValidFormat(email) {
    return this._checkFormat(email?.trim()?.toLowerCase()).valid;
  }

  /**
   * Check if email is disposable
   */
  isDisposable(email) {
    if (!email || !email.includes('@')) return false;
    const domain = email.split('@')[1].toLowerCase();
    return this.disposableDomains.has(domain);
  }

  /**
   * Normalize email (lowercase, trim, remove dots for Gmail)
   */
  normalize(email) {
    if (!email) return '';
    
    let [localPart, domain] = email.trim().toLowerCase().split('@');
    
    // Gmail: remove dots from local part
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      localPart = localPart.replace(/\./g, '');
      domain = 'gmail.com';
    }
    
    return `${localPart}@${domain}`;
  }

  /**
   * Mask email for display
   */
  mask(email) {
    if (!email || !email.includes('@')) return '***@***.***';
    const [local, domain] = email.split('@');
    return `${local[0]}***@${domain[0]}***.${domain.split('.').pop()}`;
  }

  // ==================== PRIVATE ====================

  /**
   * Check email format
   * @private
   */
  _checkFormat(email) {
    // RFC 5322 simplified regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    if (!emailRegex.test(email)) {
      return { valid: false, error: 'Invalid email format' };
    }

    // Check for consecutive dots
    if (email.includes('..')) {
      return { valid: false, error: 'Email contains consecutive dots' };
    }

    // Check for dot at start or end of local part
    const localPart = email.split('@')[0];
    if (localPart.startsWith('.') || localPart.endsWith('.')) {
      return { valid: false, error: 'Local part starts or ends with a dot' };
    }

    return { valid: true };
  }

  /**
   * Check MX records for domain
   * @private
   */
  async _checkMX(domain) {
    try {
      const addresses = await dns.resolveMx(domain);
      return addresses && addresses.length > 0;
    } catch (error) {
      logger.debug(`MX check failed for ${domain}`, { error: error.message });
      return false;
    }
  }

  /**
   * Detect common typos in domain
   * @private
   */
  _detectTypo(domain) {
    for (const [correct, typos] of this.commonDomains) {
      if (typos.includes(domain)) {
        return correct;
      }
    }
    return null;
  }
}

module.exports = new EmailValidator();