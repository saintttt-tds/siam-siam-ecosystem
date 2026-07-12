const logger = require('../logging/logger');

/**
 * Browser and Client User-Agent Validator
 * 
 * Validates User-Agent strings to:
 * - Detect and block known bad bots
 * - Identify outdated browsers
 * - Detect automated tools and scrapers
 * - Prevent User-Agent spoofing
 * - Allow only supported browsers/clients
 * 
 * BOT DETECTION:
 * - Known crawler user agents
 * - Missing or empty user agents
 * - Unusually short user agents
 * - Headless browser signatures
 * - Automation tool signatures
 * 
 * @example
 *   const uaValidator = require('@siamsiam/shared-utils').security.userAgentValidator;
 *   
 *   const result = uaValidator.validate(userAgentString);
 *   if (result.isBot) { /* block or limit access * / }
 *   if (result.isOutdated) { /* warn user to upgrade * / }
 */

class UserAgentValidator {
  constructor() {
    // Known bot patterns
    this.botPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python-requests/i,
      /go-http-client/i,
      /java/i,
      /libwww/i,
      /httpclient/i,
      /nutch/i,
      /php/i,
      /perl/i,
      /ruby/i,
      /scrapy/i,
      /mechanize/i,
      /headless/i,
      /phantom/i,
      /selenium/i,
      /puppeteer/i,
      /playwright/i,
    ];

    // Known automation tool patterns
    this.automationPatterns = [
      /selenium/i,
      /puppeteer/i,
      /playwright/i,
      /webdriver/i,
      /cypress/i,
      /nightmare/i,
      /phantomjs/i,
      /headlesschrome/i,
      /headless/i,
    ];

    // Blocked user agents (complete strings)
    this.blockedAgents = [
      '', // Empty
      ' ',
      '-',
      'null',
      'undefined',
    ];

    // Minimum browser versions (for security)
    this.minimumBrowserVersions = {
      'Chrome': 80,
      'Firefox': 78,
      'Safari': 13,
      'Edge': 80,
      'Opera': 67,
    };

    // Valid browser families
    this.validBrowsers = [
      'Chrome', 'Firefox', 'Safari', 'Edge', 'Opera',
      'Samsung Browser', 'UC Browser', 'Mobile Safari',
    ];

    // Valid OS families
    this.validOS = [
      'Windows', 'Mac OS', 'Linux', 'Android', 'iOS',
      'Chrome OS', 'Ubuntu',
    ];
  }

  /**
   * Validate a User-Agent string
   * @param {string} userAgent - User-Agent string to validate
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  validate(userAgent, options = {}) {
    const result = {
      isValid: true,
      isBot: false,
      isAutomation: false,
      isBlocked: false,
      isOutdated: false,
      isSuspicious: false,
      browser: null,
      os: null,
      device: null,
      warnings: [],
      score: 0, // 0 = clean, 100 = definitely malicious
    };

    // Check for empty or null user agent
    if (!userAgent || this.blockedAgents.includes(userAgent.trim())) {
      result.isValid = false;
      result.isBlocked = true;
      result.warnings.push('Empty or blocked user agent');
      result.score = 100;
      return result;
    }

    // Length check
    if (userAgent.length < 10) {
      result.isSuspicious = true;
      result.warnings.push('User agent too short');
      result.score += 30;
    }

    if (userAgent.length > 500) {
      result.isSuspicious = true;
      result.warnings.push('User agent too long (possible buffer overflow attempt)');
      result.score += 20;
    }

    // Check for control characters
    if (/[\x00-\x1F\x7F]/.test(userAgent)) {
      result.isSuspicious = true;
      result.warnings.push('User agent contains control characters');
      result.score += 50;
    }

    // Parse user agent
    const parsed = this._parseUserAgent(userAgent);
    result.browser = parsed.browser;
    result.os = parsed.os;
    result.device = parsed.device;

    // Check for bots
    if (this._isBot(userAgent)) {
      result.isBot = true;
      result.isSuspicious = true;
      result.warnings.push('Bot user agent detected');
      result.score += 60;

      // Known good bots (Googlebot, Bingbot)
      if (this._isKnownGoodBot(userAgent)) {
        result.isBot = false; // Allow good bots
        result.isSuspicious = false;
        result.warnings = [];
        result.score = 0;
      }
    }

    // Check for automation tools
    if (this._isAutomation(userAgent)) {
      result.isAutomation = true;
      result.isSuspicious = true;
      result.warnings.push('Automation tool detected');
      result.score += 80;
    }

    // Check browser version
    if (parsed.browser && parsed.version) {
      const minVersion = this.minimumBrowserVersions[parsed.browser];
      if (minVersion && parsed.version < minVersion) {
        result.isOutdated = true;
        result.warnings.push(`Outdated browser: ${parsed.browser} ${parsed.version}`);
        result.score += 20;
      }
    }

    // Check for suspicious combinations
    if (this._isSuspiciousCombination(parsed)) {
      result.isSuspicious = true;
      result.warnings.push('Suspicious browser/OS combination');
      result.score += 40;
    }

    // Final validity check
    if (result.score >= 70) {
      result.isValid = false;
    }

    return result;
  }

  /**
   * Express middleware for User-Agent validation
   */
  middleware(options = {}) {
    const {
      blockBots = true,
      blockAutomation = true,
      blockOutdated = false,
      blockEmpty = true,
      excludePaths = [],
      customBlockHandler = null,
    } = options;

    return (req, res, next) => {
      // Skip excluded paths
      if (excludePaths.some(p => req.path.startsWith(p))) {
        return next();
      }

      const userAgent = req.headers['user-agent'] || '';
      const result = this.validate(userAgent);

      // Store validation result on request for downstream use
      req.userAgentValidation = result;

      // Determine if request should be blocked
      let shouldBlock = false;
      let blockReason = '';

      if (blockEmpty && result.isBlocked) {
        shouldBlock = true;
        blockReason = 'Empty or invalid user agent';
      }
      if (blockBots && result.isBot) {
        shouldBlock = true;
        blockReason = 'Bot user agent not allowed';
      }
      if (blockAutomation && result.isAutomation) {
        shouldBlock = true;
        blockReason = 'Automation tools not allowed';
      }
      if (blockOutdated && result.isOutdated) {
        shouldBlock = true;
        blockReason = 'Outdated browser version';
      }

      if (shouldBlock) {
        logger.warn('Request blocked by User-Agent filter', {
          userAgent: userAgent.substring(0, 100),
          path: req.path,
          reason: blockReason,
          score: result.score,
        });

        if (customBlockHandler) {
          return customBlockHandler(req, res, result);
        }

        return res.status(403).json({
          success: false,
          error: 'Access denied',
          reason: blockReason,
        });
      }

      next();
    };
  }

  /**
   * Check if user agent is suspicious for API calls
   * API clients should use proper SDK user agents
   */
  validateApiClient(userAgent) {
    if (!userAgent) return { valid: false, reason: 'Missing User-Agent' };

    // SDK user agents should match: SiamSiam-SDK/{version} ({language})
    const sdkPattern = /^SiamSiam-SDK\/[\d.]+ \(.+\)$/;
    if (sdkPattern.test(userAgent)) {
      return { valid: true, type: 'sdk' };
    }

    // Check for common programming language HTTP clients
    if (/node-fetch|axios|got|request|superagent/i.test(userAgent)) {
      return { valid: true, type: 'custom' };
    }

    // Unknown client - might be direct HTTP calls
    return { 
      valid: true, 
      type: 'unknown',
      warning: 'Consider using official SiamSiam SDK',
    };
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Check if user agent is a bot
   * @private
   */
  _isBot(userAgent) {
    return this.botPatterns.some(pattern => pattern.test(userAgent));
  }

  /**
   * Check if user agent is a known good bot
   * @private
   */
  _isKnownGoodBot(userAgent) {
    const goodBots = [
      /googlebot/i,
      /bingbot/i,
      /slurp/i,        // Yahoo
      /duckduckbot/i,
      /baiduspider/i,
      /yandexbot/i,
      /facebookexternalhit/i,
      /twitterbot/i,
      /linkedinbot/i,
      /whatsapp/i,
      /telegrambot/i,
    ];

    return goodBots.some(pattern => pattern.test(userAgent));
  }

  /**
   * Check if user agent indicates automation
   * @private
   */
  _isAutomation(userAgent) {
    return this.automationPatterns.some(pattern => pattern.test(userAgent));
  }

  /**
   * Parse user agent string
   * @private
   */
  _parseUserAgent(userAgent) {
    const result = {
      browser: null,
      version: null,
      os: null,
      device: 'desktop',
    };

    // Detect browser
    if (/edg/i.test(userAgent)) {
      result.browser = 'Edge';
    } else if (/chrome/i.test(userAgent) && !/edg/i.test(userAgent)) {
      result.browser = 'Chrome';
    } else if (/firefox/i.test(userAgent)) {
      result.browser = 'Firefox';
    } else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) {
      result.browser = 'Safari';
    } else if (/opera|opr/i.test(userAgent)) {
      result.browser = 'Opera';
    }

    // Extract version
    const versionMatch = userAgent.match(new RegExp(`${result.browser}\\/([\\d.]+)`, 'i'));
    if (versionMatch) {
      result.version = parseFloat(versionMatch[1]);
    }

    // Detect OS
    if (/windows/i.test(userAgent)) result.os = 'Windows';
    else if (/mac os/i.test(userAgent)) result.os = 'Mac OS';
    else if (/linux/i.test(userAgent) && !/android/i.test(userAgent)) result.os = 'Linux';
    else if (/android/i.test(userAgent)) result.os = 'Android';
    else if (/ios|iphone|ipad/i.test(userAgent)) result.os = 'iOS';

    // Detect device
    if (/mobile/i.test(userAgent)) result.device = 'mobile';
    else if (/tablet/i.test(userAgent)) result.device = 'tablet';
    else if (/android/i.test(userAgent) && !/mobile/i.test(userAgent)) result.device = 'tablet';

    return result;
  }

  /**
   * Check for suspicious browser/OS combinations
   * @private
   */
  _isSuspiciousCombination(parsed) {
    // Safari on Windows (Safari for Windows discontinued in 2012)
    if (parsed.browser === 'Safari' && parsed.os === 'Windows') {
      return true;
    }

    // Edge on Mac (possible but suspicious for older versions)
    if (parsed.browser === 'Edge' && parsed.os === 'Mac OS' && parsed.version < 79) {
      return true;
    }

    return false;
  }
}

// Export singleton instance
module.exports = new UserAgentValidator();