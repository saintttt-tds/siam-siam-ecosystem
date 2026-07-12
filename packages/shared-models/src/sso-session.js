const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * SSO Session Model - Single Sign-On Session
 * 
 * Manages unified SSO sessions across all SiamSiam platforms.
 * A single SSO session allows seamless access to AxionPay,
 * AxionCommerce, AxionFly, and other platforms without re-authentication.
 * 
 * TABLE: sso_sessions
 */

class SsoSession extends BaseModel {
  static tableName = 'sso_sessions';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'unified_account_id', 'user_id',
    'session_token_hash', 'refresh_token_hash',
    'session_type', 'session_status',
    'ip_address', 'user_agent', 'device_id',
    'device_name', 'device_type', 'device_os',
    'location', 'country', 'city',
    'is_active', 'is_current', 'expires_at',
    'last_activity_at', 'last_activity_platform',
    'created_at_time', 'idle_timeout_seconds',
    'absolute_timeout_seconds', 'max_concurrent_sessions',
    'platforms_accessed', 'platform_count',
    'mfa_verified', 'mfa_verified_at', 'mfa_method',
    'authentication_level', 'authentication_method',
    'remember_me', 'trusted_device', 'trust_expires_at',
    'revoked_at', 'revocation_reason', 'revoked_by',
    'logout_initiated_from', 'logout_completed',
    'session_data', 'security_events',
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at',
  ];

  static casts = {
    idle_timeout_seconds: 'integer', absolute_timeout_seconds: 'integer',
    max_concurrent_sessions: 'integer', platform_count: 'integer',
    authentication_level: 'integer',
    is_active: 'boolean', is_current: 'boolean',
    mfa_verified: 'boolean', remember_me: 'boolean',
    trusted_device: 'boolean', logout_completed: 'boolean',
    location: 'json', platforms_accessed: 'json',
    session_data: 'json', security_events: 'json',
    metadata: 'json', tags: 'json',
  };

  static relations = {
    unifiedAccount: { type: 'belongsTo', model: 'UnifiedAccount', foreignKey: 'unified_account_id', ownerKey: 'id' },
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
  };

  static sessionTypes = { WEB: 'web', MOBILE: 'mobile', API: 'api', POS: 'pos', USSD: 'ussd' };
  static sessionStatuses = { ACTIVE: 'active', IDLE: 'idle', EXPIRED: 'expired', REVOKED: 'revoked', LOGGED_OUT: 'logged_out' };

  /**
   * Create a new SSO session
   */
  static async createSession(unifiedAccountId, userId, sessionData = {}) {
    const sessionToken = crypto.randomBytes(48).toString('base64');
    const refreshToken = crypto.randomBytes(64).toString('base64');
    const sessionTokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Check max concurrent sessions
    const maxSessions = sessionData.maxConcurrentSessions || 10;
    const activeCount = await this.count({ where: { unified_account_id: unifiedAccountId, is_active: true } });
    if (activeCount >= maxSessions) {
      // Remove oldest session
      await connectionPool.query(
        `UPDATE ${this.tableName} SET is_active = false, is_current = false, session_status = 'expired' WHERE unified_account_id = $1 AND is_active = true ORDER BY last_activity_at ASC LIMIT 1`,
        [unifiedAccountId]
      );
    }

    // Deactivate other current sessions
    await connectionPool.query(
      `UPDATE ${this.tableName} SET is_current = false WHERE unified_account_id = $1 AND is_current = true`,
      [unifiedAccountId]
    );

    const session = await this.create({
      unified_account_id: unifiedAccountId, user_id: userId,
      session_token_hash: sessionTokenHash, refresh_token_hash: refreshTokenHash,
      session_type: sessionData.sessionType || this.sessionTypes.WEB,
      session_status: this.sessionStatuses.ACTIVE,
      ip_address: sessionData.ipAddress, user_agent: sessionData.userAgent?.substring(0, 500),
      device_id: sessionData.deviceId, device_name: sessionData.deviceName,
      device_type: sessionData.deviceType, device_os: sessionData.deviceOs,
      location: sessionData.location, country: sessionData.country, city: sessionData.city,
      is_active: true, is_current: true,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      last_activity_at: new Date().toISOString(),
      idle_timeout_seconds: sessionData.idleTimeoutSeconds || 1800,
      absolute_timeout_seconds: sessionData.absoluteTimeoutSeconds || 28800,
      platforms_accessed: sessionData.initialPlatform ? [sessionData.initialPlatform] : [],
      platform_count: sessionData.initialPlatform ? 1 : 0,
      mfa_verified: sessionData.mfaVerified || false,
      mfa_method: sessionData.mfaMethod,
      authentication_level: sessionData.authenticationLevel || 1,
      authentication_method: sessionData.authenticationMethod,
      remember_me: sessionData.rememberMe || false,
      trusted_device: sessionData.trustedDevice || false,
      trust_expires_at: sessionData.trustedDevice ? new Date(Date.now() + 30 * 86400000).toISOString() : null,
      metadata: sessionData.metadata || {}, tenant_id: sessionData.tenantId,
    });

    return { session, sessionToken, refreshToken };
  }

  /**
   * Record platform access
   */
  static async recordPlatformAccess(sessionId, platform) {
    const session = await this.findById(sessionId);
    if (!session) return;

    const platforms = [...(session.platforms_accessed || [])];
    if (!platforms.includes(platform)) {
      platforms.push(platform);
      await this.update({ id: sessionId }, {
        platforms_accessed: platforms, platform_count: platforms.length,
        last_activity_at: new Date().toISOString(),
        last_activity_platform: platform,
      });
    } else {
      await this.update({ id: sessionId }, {
        last_activity_at: new Date().toISOString(),
        last_activity_platform: platform,
      });
    }
  }

  /**
   * Find active session by token hash
   */
  static async findByToken(sessionToken) {
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    return this.findOne({
      where: { session_token_hash: tokenHash, is_active: true, session_status: this.sessionStatuses.ACTIVE },
    });
  }

  /**
   * Deactivate all sessions for a unified account
   */
  static async deactivateAll(unifiedAccountId, exceptSessionId = null) {
    const text = `
      UPDATE ${this.tableName}
      SET is_active = false, is_current = false,
          session_status = 'revoked', revoked_at = NOW()
      WHERE unified_account_id = $1 AND is_active = true
        ${exceptSessionId ? 'AND id != $2' : ''}
    `;
    const values = [unifiedAccountId];
    if (exceptSessionId) values.push(exceptSessionId);
    await connectionPool.query(text, values);
  }
}

module.exports = SsoSession;