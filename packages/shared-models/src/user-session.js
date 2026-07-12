const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * User Session Model
 * 
 * Tracks active user login sessions with comprehensive security data.
 * Each session represents a unique login instance from a device.
 * 
 * TABLE: user_sessions
 * 
 * SECURITY FEATURES:
 * - Token hashing (SHA-256, never stored in plain text)
 * - Device fingerprinting for fraud detection
 * - IP address and geolocation tracking
 * - Automatic expiry
 * - Session revocation support
 * - Concurrent session limits
 * 
 * SESSION LIFECYCLE:
 * 1. Created on successful login
 * 2. Active during user activity
 * 3. Refreshed on token refresh
 * 4. Expired after inactivity timeout
 * 5. Revoked on logout or security event
 */

class UserSession extends BaseModel {
  static tableName = 'user_sessions';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id',
    // Token data (hashed)
    'access_token_hash', 'refresh_token_hash',
    // Device information
    'device_id', 'device_name', 'device_type',
    'device_os', 'device_os_version', 'browser',
    'browser_version', 'is_mobile', 'is_tablet',
    // Network information
    'ip_address', 'user_agent', 'location',
    // Session state
    'is_active', 'is_current', 'expires_at',
    'last_activity_at', 'last_ip_address',
    // Security
    'is_trusted', 'trusted_at', 'mfa_verified',
    'mfa_method',
    // Metadata
    'login_method', 'login_source',
    'session_data', 'metadata',
    'tenant_id', 'version',
    'created_at', 'updated_at',
  ];

  static casts = {
    is_active: 'boolean',
    is_current: 'boolean',
    is_mobile: 'boolean',
    is_tablet: 'boolean',
    is_trusted: 'boolean',
    mfa_verified: 'boolean',
    location: 'json',
    session_data: 'json',
    metadata: 'json',
  };

  static relations = {
    user: {
      type: 'belongsTo',
      model: 'User',
      foreignKey: 'user_id',
      ownerKey: 'id',
    },
  };

  // Session configuration
  static accessTokenTTL = 15 * 60 * 1000; // 15 minutes
  static refreshTokenTTL = 7 * 24 * 60 * 60 * 1000; // 7 days
  static inactivityTimeout = 30 * 60 * 1000; // 30 minutes
  static maxSessionsPerUser = 10;

  /**
   * Create a new session after successful authentication
   * @param {string} userId - Authenticated user ID
   * @param {Object} sessionData - Session initialization data
   * @returns {Promise<Object>} Session with plain tokens (only returned once!)
   */
  static async createSession(userId, sessionData = {}) {
    // Check session limits
    const activeSessionCount = await this.count({
      where: { user_id: userId, is_active: true },
    });
    
    if (activeSessionCount >= this.maxSessionsPerUser) {
      // Remove oldest session
      await this._removeOldestSession(userId);
    }

    // Generate tokens
    const accessToken = crypto.randomBytes(48).toString('base64');
    const refreshToken = crypto.randomBytes(64).toString('base64');
    
    // Hash tokens for storage
    const accessTokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Parse user agent
    const deviceInfo = this._parseUserAgent(sessionData.userAgent || '');

    const session = await this.create({
      user_id: userId,
      access_token_hash: accessTokenHash,
      refresh_token_hash: refreshTokenHash,
      device_id: sessionData.deviceId || crypto.randomUUID(),
      device_name: deviceInfo.deviceName,
      device_type: deviceInfo.deviceType,
      device_os: deviceInfo.os,
      device_os_version: deviceInfo.osVersion,
      browser: deviceInfo.browser,
      browser_version: deviceInfo.browserVersion,
      is_mobile: deviceInfo.isMobile,
      is_tablet: deviceInfo.isTablet,
      ip_address: sessionData.ipAddress,
      user_agent: sessionData.userAgent?.substring(0, 500),
      location: sessionData.location || null,
      is_active: true,
      is_current: true,
      is_trusted: sessionData.isTrusted || false,
      mfa_verified: sessionData.mfaVerified || false,
      mfa_method: sessionData.mfaMethod || null,
      login_method: sessionData.loginMethod || 'password',
      login_source: sessionData.loginSource || 'web',
      expires_at: new Date(Date.now() + this.refreshTokenTTL).toISOString(),
      last_activity_at: new Date().toISOString(),
      session_data: sessionData.sessionData || {},
      metadata: sessionData.metadata || {},
    });

    return {
      session: session,
      accessToken,  // Only returned once!
      refreshToken, // Only returned once!
      expiresIn: this.accessTokenTTL / 1000,
    };
  }

  /**
   * Refresh session tokens
   * @param {string} refreshToken - Current refresh token
   * @returns {Promise<Object|null>} New tokens or null if invalid
   */
  static async refreshSession(refreshToken) {
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    const session = await this.findOne({
      where: {
        refresh_token_hash: refreshTokenHash,
        is_active: true,
      },
    });

    if (!session) return null;
    if (new Date(session.expires_at) < new Date()) {
      await this.deactivateSession(session.id);
      return null;
    }

    // Generate new tokens
    const newAccessToken = crypto.randomBytes(48).toString('base64');
    const newRefreshToken = crypto.randomBytes(64).toString('base64');
    
    const newAccessTokenHash = crypto.createHash('sha256').update(newAccessToken).digest('hex');
    const newRefreshTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

    await session._performUpdate({
      access_token_hash: newAccessTokenHash,
      refresh_token_hash: newRefreshTokenHash,
      last_activity_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + this.refreshTokenTTL).toISOString(),
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.accessTokenTTL / 1000,
    };
  }

  /**
   * Deactivate a session (logout)
   */
  static async deactivateSession(sessionId) {
    return this.update({ id: sessionId }, {
      is_active: false,
      is_current: false,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Deactivate all sessions for a user (force logout all devices)
   * @param {string} userId - User ID
   * @param {string} exceptSessionId - Session to keep active
   */
  static async deactivateAllForUser(userId, exceptSessionId = null) {
    const text = `
      UPDATE ${this.tableName}
      SET is_active = false, is_current = false, updated_at = NOW()
      WHERE user_id = $1 AND is_active = true
      ${exceptSessionId ? 'AND id != $2' : ''}
    `;
    const values = [userId];
    if (exceptSessionId) values.push(exceptSessionId);
    
    const result = await connectionPool.query(text, values);
    
    logger.info('All user sessions deactivated', {
      userId,
      sessionsDeactivated: result.rowCount,
      exceptSessionId,
    });
  }

  /**
   * Update session activity timestamp
   */
  static async updateActivity(sessionId, ipAddress = null) {
    const updates = {
      last_activity_at: new Date().toISOString(),
    };
    
    if (ipAddress) {
      updates.last_ip_address = ipAddress;
    }
    
    return this.update({ id: sessionId }, updates);
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpired() {
    const result = await connectionPool.query(
      `UPDATE ${this.tableName}
       SET is_active = false, is_current = false
       WHERE is_active = true AND expires_at < NOW()`
    );
    
    if (result.rowCount > 0) {
      logger.info('Cleaned up expired sessions', { count: result.rowCount });
    }
  }

  /**
   * Trust a device session
   */
  static async trustSession(sessionId) {
    return this.update({ id: sessionId }, {
      is_trusted: true,
      trusted_at: new Date().toISOString(),
    });
  }

  /**
   * Get active sessions for a user with device info
   */
  static async getActiveSessions(userId) {
    return this.findAll({
      where: { user_id: userId, is_active: true },
      orderBy: { last_activity_at: 'DESC' },
    });
  }

  /**
   * Parse user agent string into device information
   * @private
   */
  static _parseUserAgent(userAgent) {
    const info = {
      deviceName: 'Unknown Device',
      deviceType: 'unknown',
      os: 'Unknown',
      osVersion: null,
      browser: 'Unknown',
      browserVersion: null,
      isMobile: false,
      isTablet: false,
    };

    if (!userAgent) return info;

    // Detect mobile/tablet
    info.isMobile = /Mobile|Android.*Mobile|iPhone|iPod/.test(userAgent);
    info.isTablet = /iPad|Android(?!.*Mobile)|Tablet/.test(userAgent);

    // Detect OS
    if (/Windows/.test(userAgent)) {
      info.os = 'Windows';
      info.osVersion = (userAgent.match(/Windows NT (\d+\.\d+)/) || [])[1];
    } else if (/Mac OS/.test(userAgent)) {
      info.os = 'macOS';
      info.osVersion = (userAgent.match(/Mac OS X (\d+[._]\d+)/) || [])[1]?.replace('_', '.');
    } else if (/Android/.test(userAgent)) {
      info.os = 'Android';
      info.osVersion = (userAgent.match(/Android (\d+\.\d+)/) || [])[1];
    } else if (/iPhone|iPad|iPod/.test(userAgent)) {
      info.os = 'iOS';
      info.osVersion = (userAgent.match(/OS (\d+[._]\d+)/) || [])[1]?.replace('_', '.');
    } else if (/Linux/.test(userAgent)) {
      info.os = 'Linux';
    }

    // Detect browser
    if (/Edge/.test(userAgent)) {
      info.browser = 'Edge';
      info.browserVersion = (userAgent.match(/Edge\/(\d+)/) || [])[1];
    } else if (/Chrome/.test(userAgent) && !/Edge/.test(userAgent)) {
      info.browser = 'Chrome';
      info.browserVersion = (userAgent.match(/Chrome\/(\d+)/) || [])[1];
    } else if (/Firefox/.test(userAgent)) {
      info.browser = 'Firefox';
      info.browserVersion = (userAgent.match(/Firefox\/(\d+)/) || [])[1];
    } else if (/Safari/.test(userAgent) && !/Chrome/.test(userAgent)) {
      info.browser = 'Safari';
      info.browserVersion = (userAgent.match(/Version\/(\d+)/) || [])[1];
    }

    // Build device name
    if (info.isMobile) {
      info.deviceName = `${info.os} Mobile`;
    } else if (info.isTablet) {
      info.deviceName = `${info.os} Tablet`;
    } else {
      info.deviceName = `${info.os} Desktop`;
    }

    return info;
  }

  /**
   * Remove oldest session for a user
   * @private
   */
  static async _removeOldestSession(userId) {
    const oldest = await this.findOne({
      where: { user_id: userId, is_active: true },
      orderBy: { last_activity_at: 'ASC' },
    });
    
    if (oldest) {
      await this.deactivateSession(oldest.id);
    }
  }
}

module.exports = UserSession;