const crypto = require('crypto');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * HMAC Request Signature Verification
 * 
 * Provides request signing and verification for secure API communication.
 * Ensures request integrity, authenticity, and prevents replay attacks.
 * 
 * SIGNING PROCESS:
 * 1. Create canonical request string
 * 2. Sign with HMAC-SHA256 using shared secret
 * 3. Include signature in request header
 * 4. Server verifies signature matches
 * 
 * REPLAY PROTECTION:
 * - Nonce + Timestamp in signature
 * - Requests valid for 5 minutes
 * - Nonces tracked to prevent reuse
 * 
 * HEADERS:
 *   X-Signature: t=1234567890,v1=abcdef1234567890
 *   X-Nonce: random_nonce_string
 * 
 * @example
 *   const signing = require('@siamsiam/shared-utils').security.requestSigning;
 *   
 *   // Sign a request
 *   const signature = signing.signRequest(method, path, body, secret);
 *   
 *   // Verify a request
 *   const isValid = signing.verifyRequest(method, path, body, signature, secret);
 */

class RequestSigning {
  constructor() {
    this.signatureVersion = 'v1';
    this.maxTimestampAge = 300000; // 5 minutes
    this.usedNonces = new Set();
    this.nonceCleanupInterval = null;
  }

  /**
   * Sign a request
   * @param {string} method - HTTP method
   * @param {string} path - Request path
   * @param {Object|string} body - Request body
   * @param {string} secret - Shared secret
   * @param {Object} options - Additional options
   * @returns {Object} Signature components
   */
  signRequest(method, path, body, secret, options = {}) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = options.nonce || this._generateNonce();
    const payload = typeof body === 'string' ? body : JSON.stringify(body || {});
    
    // Create canonical request
    const canonicalRequest = this._createCanonicalRequest(
      method, path, payload, timestamp, nonce
    );
    
    // Sign
    const signature = this._sign(canonicalRequest, secret);
    
    return {
      timestamp,
      nonce,
      signature: `${this.signatureVersion}=${signature}`,
      header: `t=${timestamp},${this.signatureVersion}=${signature}`,
    };
  }

  /**
   * Verify a signed request
   * @param {string} method - HTTP method
   * @param {string} path - Request path
   * @param {string} rawBody - Raw request body
   * @param {string} signatureHeader - X-Signature header value
   * @param {string} secret - Shared secret
   * @param {string} nonce - X-Nonce header value
   * @returns {boolean} True if signature is valid
   */
  verifyRequest(method, path, rawBody, signatureHeader, secret, nonce) {
    try {
      // Parse signature header
      const { timestamp, signature } = this._parseSignatureHeader(signatureHeader);
      
      if (!timestamp || !signature) {
        logger.warn('Invalid signature header format');
        return false;
      }

      // Check timestamp freshness (replay protection)
      const now = Math.floor(Date.now() / 1000);
      const timestampNum = parseInt(timestamp, 10);
      
      if (Math.abs(now - timestampNum) > this.maxTimestampAge / 1000) {
        logger.warn('Request timestamp too old', {
          timestampAge: Math.abs(now - timestampNum),
        });
        return false;
      }

      // Check nonce (replay protection)
      if (nonce) {
        if (this.usedNonces.has(nonce)) {
          logger.warn('Nonce already used', { nonce });
          return false;
        }
        this.usedNonces.add(nonce);
        this._scheduleNonceCleanup();
      }

      // Recreate canonical request
      const canonicalRequest = this._createCanonicalRequest(
        method, path, rawBody, timestamp, nonce
      );
      
      // Verify signature
      const expectedSignature = this._sign(canonicalRequest, secret);
      const [version, actualSignature] = signature.split('=');
      
      // Constant-time comparison
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(actualSignature)
      );
    } catch (error) {
      logger.error('Signature verification failed', { error: error.message });
      return false;
    }
  }

  /**
   * Generate a signing secret
   */
  generateSecret(length = 32) {
    return crypto.randomBytes(length).toString('base64');
  }

  /**
   * Create Express middleware for signature verification
   */
  middleware(options = {}) {
    const {
      secret = null,
      secretProvider = null,
      excludePaths = [],
      required = true,
    } = options;

    return (req, res, next) => {
      // Skip excluded paths
      if (excludePaths.some(p => req.path.startsWith(p))) {
        return next();
      }

      const signatureHeader = req.headers['x-signature'];
      const nonceHeader = req.headers['x-nonce'];

      if (!signatureHeader) {
        if (required) {
          return res.status(401).json({
            success: false,
            error: 'Request signature required',
          });
        }
        return next();
      }

      // Get secret
      const signingSecret = secretProvider 
        ? secretProvider(req) 
        : secret;

      if (!signingSecret) {
        return res.status(500).json({
          success: false,
          error: 'Signing secret not configured',
        });
      }

      // Get raw body
      const rawBody = req.rawBody || JSON.stringify(req.body);

      const isValid = this.verifyRequest(
        req.method,
        req.originalUrl,
        rawBody,
        signatureHeader,
        signingSecret,
        nonceHeader
      );

      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid request signature',
        });
      }

      next();
    };
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Create canonical request string for signing
   * @private
   */
  _createCanonicalRequest(method, path, body, timestamp, nonce) {
    const parts = [
      method.toUpperCase(),
      path,
      timestamp,
      nonce || '',
      crypto.createHash('sha256').update(body).digest('hex'),
    ];
    
    return parts.join('\n');
  }

  /**
   * Sign data with HMAC-SHA256
   * @private
   */
  _sign(data, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex');
  }

  /**
   * Parse signature header
   * @private
   */
  _parseSignatureHeader(header) {
    if (!header) return {};
    
    const parts = {};
    const items = header.split(',');
    
    for (const item of items) {
      const [key, ...valueParts] = item.split('=');
      const value = valueParts.join('=');
      parts[key.trim()] = value.trim();
    }
    
    return {
      timestamp: parts.t,
      signature: parts[this.signatureVersion] || parts.v1,
    };
  }

  /**
   * Generate a random nonce
   * @private
   */
  _generateNonce() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Schedule periodic cleanup of used nonces
   * @private
   */
  _scheduleNonceCleanup() {
    if (this.nonceCleanupInterval) return;

    this.nonceCleanupInterval = setInterval(() => {
      // Clear all nonces older than 10 minutes
      this.usedNonces.clear();
      logger.debug('Nonce cache cleared');
    }, 600000); // 10 minutes

    if (this.nonceCleanupInterval.unref) {
      this.nonceCleanupInterval.unref();
    }
  }
}

// Export singleton instance
module.exports = new RequestSigning();