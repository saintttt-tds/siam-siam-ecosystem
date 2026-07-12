const crypto = require('crypto');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * Card/PAN Tokenization Service
 * 
 * Replaces sensitive card data with non-sensitive tokens for secure storage.
 * Tokens can be used for recurring payments, refunds, and transaction lookups
 * without storing actual card numbers.
 * 
 * TOKENIZATION PROCESS:
 * 1. Receive PAN from payment gateway
 * 2. Generate unique token
 * 3. Encrypt and store PAN in secure vault (HSM or encrypted DB)
 * 4. Return token to application
 * 5. Application uses token for all subsequent operations
 * 
 * TOKEN TYPES:
 * - Payment Token: For transaction processing
 * - Customer Token: For saved cards
 * - Subscription Token: For recurring billing
 * 
 * SECURITY:
 * - Tokens are random and non-reversible
 * - PAN stored encrypted (AES-256-GCM)
 * - Token-to-PAN mapping in secure vault
 * - Tokens can be revoked without affecting other tokens
 * 
 * @example
 *   const tokenization = require('@siamsiam/shared-utils').crypto.tokenization;
 *   const token = await tokenization.tokenize('4111111111111111', {
 *     userId: 'user_123',
 *     type: 'payment',
 *   });
 */

class TokenizationService {
  constructor() {
    // Token vault (PRODUCTION: Replace with encrypted database table)
    this.tokenVault = new Map();
    
    // Token prefixes for identification
    this.tokenPrefixes = {
      payment: 'tok_pay',
      customer: 'tok_cus',
      subscription: 'tok_sub',
      one_time: 'tok_one',
    };

    // Encryption for stored PANs
    this.algorithm = 'aes-256-gcm';
    this.encryptionKey = Buffer.from(config.encryption.key.padEnd(32).slice(0, 32));
  }

  /**
   * Tokenize a PAN (Primary Account Number)
   * @param {string} pan - Card number to tokenize
   * @param {Object} metadata - Token metadata
   * @param {string} metadata.userId - User identifier
   * @param {string} metadata.type - Token type (payment, customer, subscription)
   * @param {string} metadata.cardBrand - Card brand (visa, mastercard, etc.)
   * @returns {Object} Token information
   */
  tokenize(pan, metadata = {}) {
    if (!pan) throw new Error('PAN is required');

    const digits = pan.replace(/\D/g, '');
    const tokenId = this._generateToken(metadata.type || 'payment');
    
    // Encrypt PAN for storage
    const encryptedPAN = this._encryptPAN(digits);

    // Store in vault
    const tokenData = {
      tokenId,
      encryptedPAN,
      last4: digits.substring(digits.length - 4),
      first6: digits.substring(0, 6),
      cardBrand: metadata.cardBrand || this._detectCardBrand(digits),
      type: metadata.type || 'payment',
      userId: metadata.userId || null,
      createdAt: new Date().toISOString(),
      expiresAt: metadata.expiresAt || null,
      isActive: true,
      usageCount: 0,
      metadata: {
        ...metadata,
        tokenizedAt: new Date().toISOString(),
        tokenizedBy: process.env.SERVICE_NAME || 'payment-service',
      },
    };

    this.tokenVault.set(tokenId, tokenData);

    logger.info('PAN tokenized', {
      tokenId,
      last4: tokenData.last4,
      type: tokenData.type,
    });

    // Return token info (NEVER return encrypted PAN)
    return {
      token: tokenId,
      type: tokenData.type,
      last4: tokenData.last4,
      first6: tokenData.first6,
      cardBrand: tokenData.cardBrand,
      expiresAt: tokenData.expiresAt,
    };
  }

  /**
   * Detokenize - Retrieve original PAN from token
   * SECURITY: This should only be called by authorized payment services
   * @param {string} token - Token to detokenize
   * @param {Object} context - Request context for audit logging
   * @returns {string|null} Original PAN or null if not found
   */
  detokenize(token, context = {}) {
    const tokenData = this.tokenVault.get(token);
    
    if (!tokenData) {
      logger.warn('Token not found', { token, requestedBy: context.userId });
      return null;
    }

    if (!tokenData.isActive) {
      logger.warn('Token is inactive', { token, requestedBy: context.userId });
      return null;
    }

    // Check expiration
    if (tokenData.expiresAt && new Date(tokenData.expiresAt) < new Date()) {
      logger.warn('Token expired', { token, expiresAt: tokenData.expiresAt });
      return null;
    }

    // Update usage
    tokenData.usageCount++;
    tokenData.lastUsedAt = new Date().toISOString();
    tokenData.lastUsedBy = context.userId || 'system';

    // Decrypt and return PAN
    const pan = this._decryptPAN(tokenData.encryptedPAN);

    logger.info('Token detokenized', {
      token,
      last4: tokenData.last4,
      usageCount: tokenData.usageCount,
    });

    return pan;
  }

  /**
   * Get token metadata without revealing PAN
   * @param {string} token - Token
   * @returns {Object|null} Token metadata (without PAN)
   */
  getTokenInfo(token) {
    const tokenData = this.tokenVault.get(token);
    if (!tokenData) return null;

    return {
      token,
      type: tokenData.type,
      last4: tokenData.last4,
      first6: tokenData.first6,
      cardBrand: tokenData.cardBrand,
      userId: tokenData.userId,
      createdAt: tokenData.createdAt,
      expiresAt: tokenData.expiresAt,
      isActive: tokenData.isActive,
      usageCount: tokenData.usageCount,
      lastUsedAt: tokenData.lastUsedAt || null,
    };
  }

  /**
   * Revoke/deactivate a token
   * @param {string} token - Token to revoke
   * @returns {boolean} True if revoked
   */
  revokeToken(token) {
    const tokenData = this.tokenVault.get(token);
    if (!tokenData) return false;

    tokenData.isActive = false;
    tokenData.revokedAt = new Date().toISOString();

    logger.info('Token revoked', { token, last4: tokenData.last4 });
    return true;
  }

  /**
   * Get all tokens for a user
   * @param {string} userId - User identifier
   * @returns {Array} List of token metadata (without PAN)
   */
  getTokensByUser(userId) {
    const tokens = [];

    for (const [token, tokenData] of this.tokenVault) {
      if (tokenData.userId === userId) {
        tokens.push(this.getTokenInfo(token));
      }
    }

    return tokens;
  }

  /**
   * Get vault statistics
   * @returns {Object} Statistics
   */
  getStats() {
    let activeTokens = 0;
    let revokedTokens = 0;
    const byType = {};

    for (const [, tokenData] of this.tokenVault) {
      if (tokenData.isActive) activeTokens++;
      else revokedTokens++;
      byType[tokenData.type] = (byType[tokenData.type] || 0) + 1;
    }

    return {
      totalTokens: this.tokenVault.size,
      activeTokens,
      revokedTokens,
      byType,
    };
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Generate unique token
   * @private
   */
  _generateToken(type) {
    const prefix = this.tokenPrefixes[type] || 'tok';
    const random = crypto.randomBytes(16).toString('hex');
    return `${prefix}_${random}`;
  }

  /**
   * Encrypt PAN for vault storage
   * @private
   */
  _encryptPAN(pan) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv, {
      authTagLength: 16,
    });

    let encrypted = cipher.update(pan, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return `v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt PAN from vault
   * @private
   */
  _decryptPAN(encryptedPAN) {
    const parts = encryptedPAN.split(':');
    if (parts[0] !== 'v1' || parts.length !== 4) {
      throw new Error('Invalid encrypted PAN format');
    }

    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const ciphertext = parts[3];

    const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv, {
      authTagLength: 16,
    });

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Detect card brand from PAN
   * @private
   */
  _detectCardBrand(pan) {
    if (pan.startsWith('4')) return 'visa';
    if (/^5[1-5]/.test(pan)) return 'mastercard';
    if (/^3[47]/.test(pan)) return 'amex';
    if (/^6(?:011|5)/.test(pan)) return 'discover';
    return 'unknown';
  }
}

// Export singleton instance
module.exports = new TokenizationService();