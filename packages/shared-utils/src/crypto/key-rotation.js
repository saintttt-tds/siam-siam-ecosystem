const crypto = require('crypto');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');
const AuditLogger = require('../logging/audit-logger');

/**
 * Encryption Key Rotation Service
 * 
 * Manages the lifecycle of cryptographic keys including:
 * - Scheduled key rotation (every 90 days recommended)
 * - Emergency key rotation (security incidents)
 * - Key versioning and tracking
 * - Graceful transition (old keys work during rotation)
 * - Audit logging of all key operations
 * 
 * KEY TYPES MANAGED:
 * - JWT signing keys (RS256 key pairs)
 * - Data encryption keys (AES-256)
 * - API signing keys
 * - Session encryption keys
 * 
 * ROTATION PROCESS:
 * 1. Generate new key (version N+1)
 * 2. New data uses new key
 * 3. Old data verified with old key (version N)
 * 4. Background re-encryption of old data
 * 5. Old key archived after grace period (24-48 hours)
 * 
 * @example
 *   const rotation = require('@siamsiam/shared-utils').crypto.keyRotation;
 *   await rotation.rotateKey('jwt_signing');
 *   const activeKey = rotation.getActiveKey('jwt_signing');
 */

class KeyRotationService {
  constructor() {
    // Key store with versioning: keyType -> { active: version, keys: { version: keyData } }
    this.keyStore = new Map();
    
    // Rotation schedules (milliseconds)
    this.rotationIntervals = {
      jwt_signing: 90 * 24 * 60 * 60 * 1000,      // 90 days
      data_encryption: 90 * 24 * 60 * 60 * 1000,   // 90 days
      api_signing: 180 * 24 * 60 * 60 * 1000,      // 180 days
      session_encryption: 30 * 24 * 60 * 60 * 1000, // 30 days
    };
    
    // Grace period for old keys (they still work for verification)
    this.gracePeriod = 48 * 60 * 60 * 1000; // 48 hours
    
    // Maximum key versions to retain
    this.maxVersions = 5;
    
    // Initialize with current keys
    this._initializeKeys();
  }

  /**
   * Rotate a specific key type
   * @param {string} keyType - Type of key to rotate
   * @param {Object} options - Rotation options
   * @returns {Object} New key metadata
   */
  async rotateKey(keyType, options = {}) {
    const { emergency = false, reason = null } = options;
    
    if (!this.keyStore.has(keyType)) {
      throw new Error(`Unknown key type: ${keyType}`);
    }

    const keyData = this.keyStore.get(keyType);
    const newVersion = keyData.active + 1;
    
    // Generate new key based on type
    const newKey = await this._generateKey(keyType);
    
    // Store new key
    keyData.keys[newVersion] = {
      key: newKey,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.gracePeriod).toISOString(),
      emergency,
      reason: reason || 'scheduled_rotation',
    };
    
    // Set as active
    const oldVersion = keyData.active;
    keyData.active = newVersion;
    
    // Mark old key for expiration (grace period)
    if (keyData.keys[oldVersion]) {
      keyData.keys[oldVersion].expiresAt = new Date(Date.now() + this.gracePeriod).toISOString();
    }
    
    // Cleanup old keys (keep last N versions)
    this._cleanupOldKeys(keyType);
    
    // Audit log
    AuditLogger.log({
      userId: 'system',
      action: `key_rotation.${keyType}`,
      category: 'security',
      resourceType: 'encryption_key',
      resourceId: `${keyType}_v${newVersion}`,
      status: 'success',
      changes: {
        oldVersion,
        newVersion,
        emergency,
        reason,
      },
    });

    logger.info(`Key rotated: ${keyType}`, {
      oldVersion,
      newVersion,
      emergency,
    });

    return {
      keyType,
      oldVersion,
      newVersion,
      active: true,
    };
  }

  /**
   * Get the active key for a key type
   * @param {string} keyType - Type of key
   * @returns {Object} Active key data
   */
  getActiveKey(keyType) {
    const keyData = this.keyStore.get(keyType);
    if (!keyData) throw new Error(`Unknown key type: ${keyType}`);
    
    const activeKey = keyData.keys[keyData.active];
    if (!activeKey) throw new Error(`No active key for: ${keyType}`);
    
    return {
      version: keyData.active,
      key: activeKey.key,
      createdAt: activeKey.createdAt,
    };
  }

  /**
   * Get a specific version of a key
   * @param {string} keyType - Type of key
   * @param {number} version - Key version
   * @returns {Object|null} Key data or null if not found/expired
   */
  getKey(keyType, version) {
    const keyData = this.keyStore.get(keyType);
    if (!keyData) return null;
    
    const key = keyData.keys[version];
    if (!key) return null;
    
    // Check expiration
    if (new Date(key.expiresAt) < new Date()) {
      return null; // Key expired
    }
    
    return {
      version,
      key: key.key,
      createdAt: key.createdAt,
      expiresAt: key.expiresAt,
    };
  }

  /**
   * Get all active keys (current + grace period)
   * @param {string} keyType - Type of key
   * @returns {Array} Array of active key versions
   */
  getActiveKeys(keyType) {
    const keyData = this.keyStore.get(keyType);
    if (!keyData) return [];
    
    const now = new Date();
    const activeKeys = [];
    
    for (const [version, key] of Object.entries(keyData.keys)) {
      if (new Date(key.expiresAt) > now) {
        activeKeys.push({
          version: parseInt(version),
          key: key.key,
          createdAt: key.createdAt,
          expiresAt: key.expiresAt,
          isActive: parseInt(version) === keyData.active,
        });
      }
    }
    
    return activeKeys.sort((a, b) => b.version - a.version);
  }

  /**
   * Check if key rotation is due
   * @param {string} keyType - Type of key
   * @returns {boolean} True if rotation is due
   */
  isRotationDue(keyType) {
    const keyData = this.keyStore.get(keyType);
    if (!keyData) return true;
    
    const activeKey = keyData.keys[keyData.active];
    if (!activeKey) return true;
    
    const interval = this.rotationIntervals[keyType] || this.rotationIntervals.data_encryption;
    const createdAt = new Date(activeKey.createdAt).getTime();
    
    return (Date.now() - createdAt) >= interval;
  }

  /**
   * Get all keys that need rotation
   * @returns {Array} Key types needing rotation
   */
  getKeysNeedingRotation() {
    const needsRotation = [];
    
    for (const keyType of this.keyStore.keys()) {
      if (this.isRotationDue(keyType)) {
        needsRotation.push(keyType);
      }
    }
    
    return needsRotation;
  }

  /**
   * Perform all scheduled rotations
   * @returns {Object} Rotation results
   */
  async performScheduledRotations() {
    const results = [];
    const keysNeedingRotation = this.getKeysNeedingRotation();
    
    for (const keyType of keysNeedingRotation) {
      try {
        const result = await this.rotateKey(keyType);
        results.push({ keyType, success: true, ...result });
      } catch (error) {
        logger.error(`Scheduled rotation failed: ${keyType}`, { error: error.message });
        results.push({ keyType, success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Emergency rotate all keys (security incident response)
   */
  async emergencyRotateAll(reason) {
    logger.warn('EMERGENCY KEY ROTATION INITIATED', { reason });
    
    const results = [];
    
    for (const keyType of this.keyStore.keys()) {
      try {
        const result = await this.rotateKey(keyType, { emergency: true, reason });
        results.push({ keyType, success: true, ...result });
      } catch (error) {
        logger.error(`Emergency rotation failed: ${keyType}`, { error: error.message });
        results.push({ keyType, success: false, error: error.message });
      }
    }
    
    logger.warn('EMERGENCY KEY ROTATION COMPLETED', {
      totalKeys: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    });
    
    return results;
  }

  /**
   * Get key rotation status
   */
  getStatus() {
    const status = {};
    
    for (const [keyType, keyData] of this.keyStore) {
      const activeKey = keyData.keys[keyData.active];
      status[keyType] = {
        activeVersion: keyData.active,
        totalVersions: Object.keys(keyData.keys).length,
        createdAt: activeKey?.createdAt || null,
        rotationDue: this.isRotationDue(keyType),
        nextRotation: activeKey 
          ? new Date(new Date(activeKey.createdAt).getTime() + (this.rotationIntervals[keyType] || 0)).toISOString()
          : null,
      };
    }
    
    return status;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Initialize default keys on first run
   * @private
   */
  _initializeKeys() {
    // PRODUCTION: Keys should be loaded from Vault/KMS, not generated here
    const keyTypes = Object.keys(this.rotationIntervals);
    
    for (const keyType of keyTypes) {
      if (!this.keyStore.has(keyType)) {
        const initialKey = this._generateKeySync(keyType);
        
        this.keyStore.set(keyType, {
          active: 1,
          keys: {
            1: {
              key: initialKey,
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
              emergency: false,
              reason: 'initial_key',
            },
          },
        });
      }
    }
    
    logger.info('Key rotation service initialized with default keys');
  }

  /**
   * Generate a new key based on type
   * @private
   */
  async _generateKey(keyType) {
    switch (keyType) {
      case 'jwt_signing':
        // RSA key pair for JWT RS256 signing
        return crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
      
      case 'data_encryption':
        // AES-256 key for data encryption
        return {
          key: crypto.randomBytes(32).toString('base64'),
          algorithm: 'aes-256-gcm',
        };
      
      case 'api_signing':
        // HMAC key for API request signing
        return {
          key: crypto.randomBytes(32).toString('base64'),
          algorithm: 'hmac-sha256',
        };
      
      case 'session_encryption':
        // AES-256 key for session data
        return {
          key: crypto.randomBytes(32).toString('base64'),
          algorithm: 'aes-256-gcm',
        };
      
      default:
        return crypto.randomBytes(32).toString('base64');
    }
  }

  /**
   * Synchronous key generation for initialization
   * @private
   */
  _generateKeySync(keyType) {
    return this._generateKey(keyType);
  }

  /**
   * Clean up old key versions beyond max retention
   * @private
   */
  _cleanupOldKeys(keyType) {
    const keyData = this.keyStore.get(keyType);
    if (!keyData) return;
    
    const versions = Object.keys(keyData.keys).map(Number).sort((a, b) => b - a);
    
    if (versions.length > this.maxVersions) {
      const versionsToDelete = versions.slice(this.maxVersions);
      for (const version of versionsToDelete) {
        delete keyData.keys[version];
        logger.debug(`Cleaned up old key version: ${keyType} v${version}`);
      }
    }
  }
}

// Export singleton instance
module.exports = new KeyRotationService();