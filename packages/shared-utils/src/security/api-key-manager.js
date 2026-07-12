const crypto = require('crypto');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');
const AuditLogger = require('../logging/audit-logger');

/**
 * API Key Generation, Rotation, and Revocation
 * 
 * Manages the complete lifecycle of API keys for developers
 * and third-party integrations.
 * 
 * KEY FORMAT:
 *   Prefix: sk_live_ or sk_test_ (Stripe-like)
 *   Format: {prefix}_{random_string}
 *   Example: sk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
 * 
 * SECURITY:
 * - Keys are hashed before storage (SHA-256)
 * - Only the first 8 characters are shown after creation
 * - Keys can be rotated without service interruption
 * - Automatic expiry can be configured
 * - Rate limiting per API key
 * 
 * PRODUCTION TODO:
 * - Store hashed keys in database
 * - Implement key usage tracking
 * - Add key permission scoping
 * - Set up key expiry notifications
 * 
 * @example
 *   const apiKeys = require('@siamsiam/shared-utils').security.apiKeyManager;
 *   const key = await apiKeys.generateKey('sk_live', { userId: 123, appId: 456 });
 *   const isValid = await apiKeys.validateKey('sk_live_a1b2c3...');
 */

class ApiKeyManager {
  constructor() {
    this.keyPrefixes = {
      live: 'sk_live',
      test: 'sk_test',
    };

    this.keyLength = 32; // Random bytes
    this.prefixLength = 8; // Shown in UI for identification

    // In-memory key store (PRODUCTION: Replace with database)
    this.keys = new Map();
  }

  /**
   * Generate a new API key
   * @param {string} type - Key type ('live' or 'test')
   * @param {Object} metadata - Key metadata (userId, appId, permissions, etc.)
   * @returns {Object} Key info (full key only shown once)
   */
  generateKey(type = 'test', metadata = {}) {
    const prefix = this.keyPrefixes[type] || this.keyPrefixes.test;
    const random = crypto.randomBytes(this.keyLength).toString('hex');
    const fullKey = `${prefix}_${random}`;
    
    // Hash the key for storage
    const hashedKey = this._hashKey(fullKey);
    
    // Store key info
    const keyInfo = {
      id: this._generateKeyId(),
      prefix: fullKey.substring(0, prefix.length + this.prefixLength + 1),
      hashedKey,
      type,
      metadata,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: metadata.expiresAt || null,
      isActive: true,
      usageCount: 0,
      permissions: metadata.permissions || ['*'], // Default: all permissions
      rateLimit: metadata.rateLimit || 1000, // Requests per minute
      ipWhitelist: metadata.ipWhitelist || [],
      allowedOrigins: metadata.allowedOrigins || [],
    };

    this.keys.set(hashedKey, keyInfo);

    // Audit log
    AuditLogger.logApiKeyOperation(
      metadata.userId || 'system',
      metadata.appId || 'unknown',
      'created',
      { keyId: keyInfo.id, keyPrefix: keyInfo.prefix }
    );

    logger.info('API key generated', {
      keyId: keyInfo.id,
      prefix: keyInfo.prefix,
      type,
      userId: metadata.userId,
    });

    // Return full key only once
    return {
      id: keyInfo.id,
      key: fullKey, // Show full key only at creation time
      prefix: keyInfo.prefix,
      type,
      createdAt: keyInfo.createdAt,
      expiresAt: keyInfo.expiresAt,
    };
  }

  /**
   * Validate an API key
   * @param {string} key - Full API key to validate
   * @returns {Object|null} Key info if valid, null if invalid
   */
  validateKey(key) {
    if (!key) return null;

    const hashedKey = this._hashKey(key);
    const keyInfo = this.keys.get(hashedKey);

    if (!keyInfo) return null;
    if (!keyInfo.isActive) return null;
    
    // Check expiry
    if (keyInfo.expiresAt && new Date(keyInfo.expiresAt) < new Date()) {
      logger.debug('API key expired', { keyId: keyInfo.id });
      return null;
    }

    // Update usage
    keyInfo.lastUsedAt = new Date().toISOString();
    keyInfo.usageCount++;

    return {
      ...keyInfo,
      hashedKey: undefined, // Don't expose the hash
    };
  }

  /**
   * Rotate an API key (old key continues working for 24h)
   * @param {string} key - Current API key
   * @returns {Object} New key info
   */
  rotateKey(key) {
    const hashedKey = this._hashKey(key);
    const oldKeyInfo = this.keys.get(hashedKey);

    if (!oldKeyInfo) {
      throw new Error('Invalid API key');
    }

    // Generate new key
    const newKey = this.generateKey(oldKeyInfo.type, {
      ...oldKeyInfo.metadata,
      userId: oldKeyInfo.metadata.userId,
      appId: oldKeyInfo.metadata.appId,
    });

    // Schedule old key for deletion (24h grace period)
    const oldKeyId = oldKeyInfo.id;
    setTimeout(() => {
      const oldHashedKey = Array.from(this.keys.entries())
        .find(([, info]) => info.id === oldKeyId)?.[0];
      if (oldHashedKey) {
        this.keys.delete(oldHashedKey);
        logger.info('Old API key removed after rotation grace period', {
          keyId: oldKeyId,
        });
      }
    }, 86400000); // 24 hours

    AuditLogger.logApiKeyOperation(
      oldKeyInfo.metadata.userId,
      oldKeyInfo.metadata.appId,
      'rotated',
      { oldKeyId, newKeyId: newKey.id }
    );

    logger.info('API key rotated', {
      oldKeyId,
      newKeyId: newKey.id,
      newPrefix: newKey.prefix,
    });

    return newKey;
  }

  /**
   * Revoke an API key
   * @param {string} key - API key to revoke
   */
  revokeKey(key) {
    const hashedKey = this._hashKey(key);
    const keyInfo = this.keys.get(hashedKey);

    if (!keyInfo) {
      throw new Error('API key not found');
    }

    keyInfo.isActive = false;
    keyInfo.revokedAt = new Date().toISOString();

    AuditLogger.logApiKeyOperation(
      keyInfo.metadata.userId,
      keyInfo.metadata.appId,
      'revoked',
      { keyId: keyInfo.id, prefix: keyInfo.prefix }
    );

    logger.info('API key revoked', {
      keyId: keyInfo.id,
      prefix: keyInfo.prefix,
    });

    return { success: true, keyId: keyInfo.id };
  }

  /**
   * Enable an API key
   */
  enableKey(key) {
    const hashedKey = this._hashKey(key);
    const keyInfo = this.keys.get(hashedKey);

    if (!keyInfo) {
      throw new Error('API key not found');
    }

    keyInfo.isActive = true;
    keyInfo.revokedAt = null;

    logger.info('API key enabled', { keyId: keyInfo.id });

    return { success: true, keyId: keyInfo.id };
  }

  /**
   * Get key info by prefix (safe for display)
   */
  getKeyByPrefix(prefix) {
    for (const [, keyInfo] of this.keys) {
      if (keyInfo.prefix === prefix) {
        return {
          id: keyInfo.id,
          prefix: keyInfo.prefix,
          type: keyInfo.type,
          createdAt: keyInfo.createdAt,
          lastUsedAt: keyInfo.lastUsedAt,
          expiresAt: keyInfo.expiresAt,
          isActive: keyInfo.isActive,
          usageCount: keyInfo.usageCount,
        };
      }
    }
    return null;
  }

  /**
   * List all keys for a user or application
   */
  listKeys(filter = {}) {
    const keys = [];

    for (const [, keyInfo] of this.keys) {
      if (filter.userId && keyInfo.metadata.userId !== filter.userId) continue;
      if (filter.appId && keyInfo.metadata.appId !== filter.appId) continue;
      if (filter.type && keyInfo.type !== filter.type) continue;

      keys.push({
        id: keyInfo.id,
        prefix: keyInfo.prefix,
        type: keyInfo.type,
        createdAt: keyInfo.createdAt,
        lastUsedAt: keyInfo.lastUsedAt,
        expiresAt: keyInfo.expiresAt,
        isActive: keyInfo.isActive,
        usageCount: keyInfo.usageCount,
      });
    }

    return keys;
  }

  /**
   * Set rate limit for a key
   */
  setRateLimit(key, requestsPerMinute) {
    const hashedKey = this._hashKey(key);
    const keyInfo = this.keys.get(hashedKey);

    if (!keyInfo) throw new Error('API key not found');

    keyInfo.rateLimit = requestsPerMinute;
    logger.info('API key rate limit updated', {
      keyId: keyInfo.id,
      rateLimit: requestsPerMinute,
    });
  }

  /**
   * Update key permissions
   */
  setPermissions(key, permissions) {
    const hashedKey = this._hashKey(key);
    const keyInfo = this.keys.get(hashedKey);

    if (!keyInfo) throw new Error('API key not found');

    keyInfo.permissions = permissions;
    logger.info('API key permissions updated', {
      keyId: keyInfo.id,
      permissions,
    });
  }

  /**
   * Get statistics about API keys
   */
  getStats() {
    let totalKeys = 0;
    let activeKeys = 0;
    let liveKeys = 0;
    let testKeys = 0;

    for (const [, keyInfo] of this.keys) {
      totalKeys++;
      if (keyInfo.isActive) activeKeys++;
      if (keyInfo.type === 'live') liveKeys++;
      if (keyInfo.type === 'test') testKeys++;
    }

    return {
      totalKeys,
      activeKeys,
      revokedKeys: totalKeys - activeKeys,
      liveKeys,
      testKeys,
    };
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Hash API key for secure storage
   * @private
   */
  _hashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Generate unique key ID
   * @private
   */
  _generateKeyId() {
    return `key_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }
}

// Export singleton instance
module.exports = new ApiKeyManager();