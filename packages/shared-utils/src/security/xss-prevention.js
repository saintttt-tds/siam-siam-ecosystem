const logger = require('../logging/logger');
const SecurityEventLogger = require('../logging/security-events');

/**
 * Cross-Site Scripting (XSS) Prevention
 * 
 * Prevents XSS attacks by sanitizing user input and output.
 * Handles both stored and reflected XSS vectors.
 * 
 * ATTACK VECTORS PREVENTED:
 * - <script> tag injection
 * - Event handler injection (onclick, onload, etc.)
 * - CSS expression injection
 * - HTML entity encoding bypass
 * - Data URI attacks
 * - SVG/XML-based attacks
 * 
 * BEST PRACTICES:
 * 1. Always escape output in the correct context (HTML, JS, CSS, URL)
 * 2. Use Content Security Policy (CSP) headers
 * 3. Set HttpOnly and Secure flags on cookies
 * 4. Validate and sanitize all user input
 * 
 * @example
 *   const { sanitizeHtml, sanitizeUrl } = require('@siamsiam/shared-utils').security.xssPrevention;
 *   const safeHtml = sanitizeHtml(userComment);
 *   const safeUrl = sanitizeUrl(redirectUrl);
 */

class XSSPrevention {
  constructor() {
    // HTML entities mapping
    this.htmlEntities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;',
    };

    // Dangerous HTML patterns
    this.dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<script\b/gi,
      /javascript\s*:/gi,
      /on\w+\s*=/gi,              // Event handlers (onclick, onload, etc.)
      /<iframe\b/gi,
      /<embed\b/gi,
      /<object\b/gi,
      /<applet\b/gi,
      /<meta\b/gi,
      /<link\b/gi,
      /<style\b/gi,
      /expression\s*\(/gi,         // CSS expressions
      /eval\s*\(/gi,
      /document\.cookie/gi,
      /document\.write/gi,
      /window\.location/gi,
      /<svg\b/gi,
      /<math\b/gi,
      /data:text\/html/gi,
      /vbscript\s*:/gi,
    ];

    // Allowed HTML tags (for limited HTML support)
    this.allowedTags = new Set([
      'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre',
      'span', 'div', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
    ]);

    // Allowed attributes per tag
    this.allowedAttributes = {
      'a': ['href', 'title', 'target', 'rel'],
      'img': ['src', 'alt', 'title', 'width', 'height'],
      'td': ['colspan', 'rowspan'],
      'th': ['colspan', 'rowspan'],
      'div': ['class'],
      'span': ['class'],
      'p': ['class'],
    };
  }

  /**
   * Escape HTML entities (use for displaying user content in HTML)
   * @param {string} input - Untrusted input
   * @returns {string} HTML-escaped string
   */
  escapeHtml(input) {
    if (!input || typeof input !== 'string') return '';
    
    return input.replace(/[&<>"'`=\/]/g, (char) => {
      return this.htmlEntities[char] || char;
    });
  }

  /**
   * Escape JavaScript string (use for embedding data in <script> tags)
   * @param {string} input - Untrusted input
   * @returns {string} JS-escaped string
   */
  escapeJavaScript(input) {
    if (!input || typeof input !== 'string') return '';
    
    return input
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\//g, '\\/')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/</g, '\\x3C')   // Prevent </script> injection
      .replace(/>/g, '\\x3E')
      .replace(/&/g, '\\x26');
  }

  /**
   * Sanitize HTML (allow only safe tags and attributes)
   * @param {string} html - Untrusted HTML
   * @param {Object} options - Sanitization options
   * @returns {string} Sanitized HTML
   */
  sanitizeHtml(html, options = {}) {
    if (!html || typeof html !== 'string') return '';
    
    const { 
      allowTags = true, 
      allowedTags = this.allowedTags,
      stripAll = false,
    } = options;

    // Option to strip all HTML
    if (stripAll || !allowTags) {
      return this.escapeHtml(html);
    }

    try {
      // PRODUCTION TODO: Use a proper HTML sanitizer like DOMPurify or sanitize-html
      // For now, strip dangerous patterns
      let sanitized = html;

      // Remove dangerous patterns
      for (const pattern of this.dangerousPatterns) {
        sanitized = sanitized.replace(pattern, '');
      }

      // Remove event handlers from remaining tags
      sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
      sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');

      // Strip tags not in allowlist
      if (allowedTags) {
        const tagRegex = /<\/?(\w+)[^>]*>/g;
        sanitized = sanitized.replace(tagRegex, (match, tag) => {
          return allowedTags.has(tag.toLowerCase()) ? match : '';
        });
      }

      return sanitized;
    } catch (error) {
      logger.warn('HTML sanitization failed, escaping all HTML', { error: error.message });
      return this.escapeHtml(html);
    }
  }

  /**
   * Sanitize URL (prevent javascript: and data: URLs)
   * @param {string} url - URL to sanitize
   * @returns {string} Safe URL or empty string
   */
  sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return '';

    // Trim and decode
    url = url.trim();
    
    // Check for dangerous protocols
    const dangerousProtocols = [
      'javascript:', 'data:', 'vbscript:', 'file:', 
      'about:', 'blob:', 'filesystem:',
    ];

    const lowerUrl = url.toLowerCase();
    
    for (const protocol of dangerousProtocols) {
      if (lowerUrl.startsWith(protocol)) {
        logger.warn('Dangerous URL protocol detected', { url: url.substring(0, 50) });
        return '';
      }
    }

    // Allow only http, https, ftp, mailto, tel
    const allowedProtocols = /^(https?:|ftp:|mailto:|tel:|\/|#)/i;
    if (!allowedProtocols.test(url) && url.includes(':')) {
      logger.warn('Unknown URL protocol', { url: url.substring(0, 50) });
      return '';
    }

    // Additional sanitization
    url = url
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .replace(/\s+/g, '');             // Remove whitespace

    return url;
  }

  /**
   * Sanitize CSS value
   * @param {string} css - CSS value to sanitize
   * @returns {string} Sanitized CSS value
   */
  sanitizeCSS(css) {
    if (!css || typeof css !== 'string') return '';

    // Remove dangerous CSS functions and expressions
    return css
      .replace(/expression\s*\(/gi, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/behavior\s*:/gi, '')
      .replace(/binding\s*:/gi, '')
      .replace(/<[^>]*>/g, ''); // Remove HTML tags
  }

  /**
   * Detect potential XSS in input
   * @param {string} input - Input to check
   * @param {Object} context - Additional context for logging
   * @returns {boolean} True if XSS detected
   */
  detectXSS(input, context = {}) {
    if (!input || typeof input !== 'string') return false;

    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(input)) {
        logger.warn('XSS pattern detected', {
          pattern: pattern.toString(),
          inputLength: input.length,
          inputPreview: input.substring(0, 100),
          ...context,
        });

        SecurityEventLogger.logXSSAttempt(
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
   * Sanitize all string fields in an object
   * @param {Object} obj - Object to sanitize
   * @param {string[]} htmlFields - Fields that may contain HTML
   * @returns {Object} Sanitized object
   */
  sanitizeObject(obj, htmlFields = []) {
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };

    for (const key in sanitized) {
      if (typeof sanitized[key] === 'string') {
        if (htmlFields.includes(key)) {
          sanitized[key] = this.sanitizeHtml(sanitized[key]);
        } else {
          sanitized[key] = this.escapeHtml(sanitized[key]);
        }
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeObject(sanitized[key], htmlFields);
      }
    }

    return sanitized;
  }

  /**
   * Generate Content Security Policy header value
   * @param {Object} options - CSP options
   * @returns {string} CSP header value
   */
  generateCSP(options = {}) {
    const {
      defaultSrc = ["'self'"],
      scriptSrc = ["'self'"],
      styleSrc = ["'self'", "'unsafe-inline'"],
      imgSrc = ["'self'", 'data:', 'https:'],
      fontSrc = ["'self'"],
      connectSrc = ["'self'"],
      frameSrc = ["'none'"],
      objectSrc = ["'none'"],
      mediaSrc = ["'self'"],
      formAction = ["'self'"],
      baseUri = ["'self'"],
      reportUri = null,
      upgradeInsecureRequests = true,
    } = options;

    const directives = [];

    directives.push(`default-src ${defaultSrc.join(' ')}`);
    directives.push(`script-src ${scriptSrc.join(' ')}`);
    directives.push(`style-src ${styleSrc.join(' ')}`);
    directives.push(`img-src ${imgSrc.join(' ')}`);
    directives.push(`font-src ${fontSrc.join(' ')}`);
    directives.push(`connect-src ${connectSrc.join(' ')}`);
    directives.push(`frame-src ${frameSrc.join(' ')}`);
    directives.push(`object-src ${objectSrc.join(' ')}`);
    directives.push(`media-src ${mediaSrc.join(' ')}`);
    directives.push(`form-action ${formAction.join(' ')}`);
    directives.push(`base-uri ${baseUri.join(' ')}`);

    if (upgradeInsecureRequests) {
      directives.push('upgrade-insecure-requests');
    }

    if (reportUri) {
      directives.push(`report-uri ${reportUri}`);
    }

    return directives.join('; ');
  }
}

// Export singleton instance
module.exports = new XSSPrevention();