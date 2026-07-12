const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * API Key Model - API Authentication Key
 * 
 * Manages API keys for developer applications.
 * Keys are hashed before storage and never stored in plain text.
 * 
 * TABLE: api_keys
 * 
 * KEY FORMAT:
 * - Live: sk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
 * - Test: sk_test_z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k
 * 
 * SECURITY:
 * - Keys hashed with SHA-256 before storage
 * - Only prefix shown after creation (first 12 chars)
 * - Automatic expiry support
 * - Rate limiting per key
 * - IP whitelist support
 * - Usage tracking for anomaly detection
 */

class ApiKey extends BaseModel {
  static tableName = 'api_keys';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'application_id', 'developer_id',
    // Key data (NEVER store plain text key)
    'key_hash', 'key_prefix', 'key_type',
    // Key metadata
    'name', 'description',
    // Permissions and limits
    'permissions', 'scopes',
    'rate_limit', 'rate_limit_window', 'burst_limit',
    // Security
    'ip_whitelist', 'allowed_origins', 'is_active',
    // Usage tracking
    'last_used_at', 'last_used_ip', 'usage_count',
    'total_requests', 'total_errors',
    // Expiry
    'expires_at', 'never_expires',
    // Rotation
    'rotated_from', 'rotated_at', 'rotation_reason',
    // Metadata
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    permissions: 'json',
    scopes: 'json',
    ip_whitelist: 'json',
    allowed_origins: 'json',
    metadata: 'json',
    tags: 'json',
    is_active: 'boolean',
    never_expires: 'boolean',
    rate_limit: 'integer',
    burst_limit: 'integer',
    usage_count: 'integer',
    total_requests: 'integer',
    total_errors: 'integer',
  };

  static relations = {
    application: {
      type: 'belongsTo',
      model: 'ApiApplication',
      foreignKey: 'application_id',
      ownerKey: 'id',
    },
  };

  // Key type constants
  static keyTypes = {
    LIVE: 'live',
    TEST: 'test',
  };

  // Key prefixes for identification
  static keyPrefixes = {
    live: 'sk_live',
    test: 'sk_test',
  };

  /**
   * Generate a new API key (plain text only returned once!)
   * @param {string} applicationId - Application ID
   * @param {string} developerId - Developer ID
   * @param {Object} options - Key generation options
   * @returns {Promise<Object>} Key info with plain text key
   */
  static async generateKey(applicationId, developerId, options = {}) {
    const keyType = options.type || this.keyTypes.TEST;
    const prefix = this.keyPrefixes[keyType];
    
    // Generate random key
    const randomPart = crypto.randomBytes(32).toString('hex');
    const fullKey = `${prefix}_${randomPart}`;
    
    // Hash key for storage (NEVER store plain text)
    const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');
    
    // Key prefix for display (first 12 chars)
    const keyPrefix = fullKey.substring(0, 12);

    const keyRecord = await this.create({
      application_id: applicationId,
      developer_id: developerId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      key_type: keyType,
      name: options.name || `Key ${Date.now()}`,
      description: options.description || null,
      permissions: options.permissions || ['*'],
      scopes: options.scopes || [],
      rate_limit: options.rateLimit || 100,
      burst_limit: options.burstLimit || 200,
      ip_whitelist: options.ipWhitelist || [],
      allowed_origins: options.allowedOrigins || [],
      is_active: true,
      never_expires: options.neverExpires || false,
      expires_at: options.expiresAt || null,
      metadata: options.metadata || {},
    });

    return {
      key: keyRecord,
      plainTextKey: fullKey, // ONLY RETURNED ONCE
      keyPrefix,
      keyType,
      message: 'Store this key securely. It will not be shown again.',
    };
  }

  /**
   * Validate an API key against stored hash
   * @param {string} plainTextKey - API key to validate
   * @returns {Promise<Object|null>} Key record if valid, null if invalid
   */
  static async validateKey(plainTextKey) {
    if (!plainTextKey) return null;

    const keyHash = crypto.createHash('sha256').update(plainTextKey).digest('hex');
    
    const keyRecord = await this.findOne({
      where: {
        key_hash: keyHash,
        is_active: true,
      },
      with: ['application'],
    });

    if (!keyRecord) return null;

    // Check expiration
    if (!keyRecord.never_expires && keyRecord.expires_at) {
      if (new Date(keyRecord.expires_at) < new Date()) {
        return null;
      }
    }

    // Check application is active
    if (keyRecord._relations.application) {
      const app = keyRecord._relations.application;
      if (!app.is_active || !app.is_approved || app.is_suspended) {
        return null;
      }
    }

    return keyRecord;
  }

  /**
   * Record API key usage
   * @param {string} keyId - Key ID
   * @param {string} ipAddress - Request IP
   * @param {boolean} isError - Whether request resulted in error
   */
  static async recordUsage(keyId, ipAddress, isError = false) {
    const updates = {
      last_used_at: new Date().toISOString(),
      last_used_ip: ipAddress,
      usage_count: connectionPool.raw('usage_count + 1'),
      total_requests: connectionPool.raw('total_requests + 1'),
    };

    if (isError) {
      updates.total_errors = connectionPool.raw('total_errors + 1');
    }

    await connectionPool.query(
      `UPDATE ${this.tableName}
       SET last_used_at = $1, last_used_ip = $2,
           usage_count = usage_count + 1,
           total_requests = total_requests + 1
           ${isError ? ', total_errors = total_errors + 1' : ''}
       WHERE id = $3`,
      [updates.last_used_at, ipAddress, keyId]
    );
  }

  /**
   * Rotate an API key (deactivate old, generate new)
   * @param {string} keyId - Key ID to rotate
   * @param {string} reason - Rotation reason
   * @returns {Promise<Object>} New key info
   */
  static async rotateKey(keyId, reason = 'manual_rotation') {
    const oldKey = await this.findById(keyId);
    if (!oldKey) throw new Error('Key not found');

    // Deactivate old key
    await this.update({ id: keyId }, {
      is_active: false,
      rotated_at: new Date().toISOString(),
      rotation_reason: reason,
    });

    // Generate new key
    return this.generateKey(oldKey.application_id, oldKey.developer_id, {
      name: `${oldKey.name} (Rotated)`,
      type: oldKey.key_type,
      permissions: oldKey.permissions,
      scopes: oldKey.scopes,
      rateLimit: oldKey.rate_limit,
      ipWhitelist: oldKey.ip_whitelist,
      rotatedFrom: keyId,
    });
  }

  /**
   * Revoke an API key
   * @param {string} keyId - Key ID to revoke
   */
  static async revokeKey(keyId) {
    return this.update({ id: keyId }, {
      is_active: false,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Find active keys for an application
   * @param {string} applicationId - Application ID
   */
  static async findByApplication(applicationId) {
    return this.findAll({
      where: { application_id: applicationId, is_active: true },
      orderBy: { created_at: 'DESC' },
    });
  }

  /**
   * Get key usage statistics
   * @param {string} keyId - Key ID
   */
  static async getUsageStats(keyId) {
    const text = `
      SELECT
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*) as request_count,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
      FROM api_request_logs
      WHERE api_key_id = $1
        AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY DATE_TRUNC('hour', created_at)
      ORDER BY hour DESC
    `;
    
    const result = await connectionPool.query(text, [keyId]);
    return result.rows;
  }
}

module.exports = ApiKey;