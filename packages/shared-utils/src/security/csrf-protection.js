const crypto = require('crypto');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * CSRF (Cross-Site Request Forgery) Protection
 * 
 * Generates and validates CSRF tokens to prevent CSRF attacks.
 * Implements both Synchronizer Token Pattern and Double Submit Cookie.
 * 
 * STRATEGIES:
 * - Synchronizer Token: Server-stored token validated on each request
 * - Double Submit Cookie: Cookie + header match (stateless)
 * - Custom Header: Require custom header that can't be set cross-origin
 * 
 * PROTECTION FOR:
 * - State-changing requests (POST, PUT, DELETE, PATCH)
 * - Session-based authentication
 * - Cookie-based authentication
 * 
 * NOTE: SPA with JWT in Authorization header are inherently CSRF-safe
 * as browsers don't automatically send Authorization headers.
 * 
 * @example
 *   const csrf = require('@siamsiam/shared-utils').security.csrfProtection;
 *   
 *   // Generate token
 *   const token = csrf.generateToken(req.session.id);
 *   
 *   // Validate token
 *   app.post('/api/data', csrf.validateToken, (req, res) => { ... });
 */

class CSRFProtection {
  constructor() {
    this.tokenLength = 32;
    this.tokenTTL = 3600000; // 1 hour
    this.tokens = new Map(); // In-memory token store (use Redis in production)
    this.cookieName = 'XSRF-TOKEN';
    this.headerName = 'x-csrf-token';
    
    // Methods that require CSRF protection
    this.protectedMethods = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
    
    // Paths excluded from CSRF protection
    this.excludedPaths = [
      '/webhooks/',
      '/api/v1/auth/login',
      '/api/v1/auth/register',
      '/api/v1/payments/webhook',
    ];
  }

  /**
   * Generate a CSRF token
   * @param {string} sessionId - Session identifier to bind token to
   * @returns {string} CSRF token
   */
  generateToken(sessionId) {
    if (!sessionId) {
      throw new Error('Session ID required for CSRF token generation');
    }

    const token = crypto.randomBytes(this.tokenLength).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(token + sessionId)
      .digest('hex');

    // Store hashed token (not the raw token)
    this.tokens.set(hashedToken, {
      sessionId,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.tokenTTL,
    });

    // Cleanup old tokens
    this._cleanupExpiredTokens();

    return token;
  }

  /**
   * Validate CSRF token
   * @param {string} token - Token from request
   * @param {string} sessionId - Session identifier
   * @returns {boolean} True if token is valid
   */
  validateToken(token, sessionId) {
    if (!token || !sessionId) return false;

    const hashedToken = crypto
      .createHash('sha256')
      .update(token + sessionId)
      .digest('hex');

    const storedToken = this.tokens.get(hashedToken);

    if (!storedToken) return false;
    if (storedToken.sessionId !== sessionId) return false;
    if (Date.now() > storedToken.expiresAt) {
      this.tokens.delete(hashedToken);
      return false;
    }

    // One-time use - remove after validation
    this.tokens.delete(hashedToken);

    return true;
  }

  /**
   * Express middleware for CSRF protection
   */
  middleware(options = {}) {
    const {
      cookie = true,
      cookieName = this.cookieName,
      headerName = this.headerName,
      excludedPaths = this.excludedPaths,
      protectedMethods = this.protectedMethods,
      ignoreMethods = ['GET', 'HEAD', 'OPTIONS'],
    } = options;

    return async (req, res, next) => {
      try {
        // Skip excluded paths
        if (excludedPaths.some(path => req.path.startsWith(path))) {
          return next();
        }

        // Skip safe methods
        if (ignoreMethods.includes(req.method)) {
          return next();
        }

        // Generate token on GET requests
        if (req.method === 'GET' && cookie) {
          const token = this.generateToken(req.session?.id || req.ip);
          res.cookie(cookieName, token, {
            httpOnly: false, // Must be readable by JavaScript
            secure: config.isProduction,
            sameSite: 'strict',
            path: '/',
          });
        }

        // Validate token on state-changing requests
        if (protectedMethods.has(req.method)) {
          const token = req.headers[headerName] || req.body?._csrf || req.query?._csrf;
          const sessionId = req.session?.id || req.ip;

          if (!token) {
            logger.warn('CSRF token missing', {
              method: req.method,
              path: req.path,
              ip: req.ip,
            });
            return res.status(403).json({
              success: false,
              error: 'CSRF token missing',
            });
          }

          if (!this.validateToken(token, sessionId)) {
            logger.warn('CSRF token invalid', {
              method: req.method,
              path: req.path,
              ip: req.ip,
            });
            return res.status(403).json({
              success: false,
              error: 'CSRF token invalid or expired',
            });
          }
        }

        next();
      } catch (error) {
        logger.error('CSRF middleware error', { error: error.message });
        next();
      }
    };
  }

  /**
   * Generate a double-submit cookie pattern CSRF token
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  generateDoubleSubmitToken(req, res) {
    const token = crypto.randomBytes(this.tokenLength).toString('hex');
    
    // Set cookie
    res.cookie(this.cookieName, token, {
      httpOnly: true,    // Not accessible by JavaScript
      secure: config.isProduction,
      sameSite: 'strict',
      path: '/',
    });

    // Return token for client to include in header
    return token;
  }

  /**
   * Validate double-submit cookie token
   */
  validateDoubleSubmitToken(req) {
    const cookieToken = req.cookies?.[this.cookieName];
    const headerToken = req.headers[this.headerName];

    if (!cookieToken || !headerToken) return false;

    // Constant-time comparison
    try {
      return crypto.timingSafeEqual(
        Buffer.from(cookieToken),
        Buffer.from(headerToken)
      );
    } catch {
      return false;
    }
  }

  /**
   * Revoke all tokens for a session
   */
  revokeSessionTokens(sessionId) {
    let revoked = 0;
    
    for (const [hashedToken, storedToken] of this.tokens) {
      if (storedToken.sessionId === sessionId) {
        this.tokens.delete(hashedToken);
        revoked++;
      }
    }

    logger.debug(`Revoked ${revoked} CSRF tokens for session`, { sessionId });
  }

  /**
   * Clean up expired tokens
   * @private
   */
  _cleanupExpiredTokens() {
    const now = Date.now();
    let cleaned = 0;

    for (const [hashedToken, storedToken] of this.tokens) {
      if (now > storedToken.expiresAt) {
        this.tokens.delete(hashedToken);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned ${cleaned} expired CSRF tokens`);
    }
  }
}

// Export singleton instance
module.exports = new CSRFProtection();