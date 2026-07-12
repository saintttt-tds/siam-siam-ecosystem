const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Platform Link Model - Linked Platform Account
 * 
 * Links a unified SSO account to individual platform accounts.
 * Manages OAuth tokens, platform-specific preferences, and sync status.
 * 
 * TABLE: platform_links
 */

class PlatformLink extends BaseModel {
  static tableName = 'platform_links';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'unified_account_id', 'platform',
    'platform_user_id', 'platform_email', 'platform_phone',
    'access_token_hash', 'refresh_token_hash',
    'token_expires_at', 'token_scope', 'token_type',
    'is_active', 'is_primary', 'linked_at',
    'last_synced_at', 'sync_status', 'sync_error',
    'profile_data', 'preferences', 'permissions',
    'unlinked_at', 'unlink_reason',
    'metadata', 'tags', 'tenant_id', 'version',
    'created_at', 'updated_at',
  ];

  static casts = {
    is_active: 'boolean', is_primary: 'boolean',
    profile_data: 'json', preferences: 'json', permissions: 'json',
    metadata: 'json', tags: 'json',
  };

  static platforms = {
    AXIONPAY: 'axionpay', AXION_COMMERCE: 'axion_commerce',
    AXIONFLY: 'axionfly', AXIONPOS: 'axionpos',
    CORPORATE_FX: 'corporate_fx',
  };

  static relations = {
    unifiedAccount: { type: 'belongsTo', model: 'UnifiedAccount', foreignKey: 'unified_account_id', ownerKey: 'id' },
  };

  /**
   * Link a platform to a unified account
   */
  static async link(unifiedAccountId, platform, platformUserId, tokens = {}, options = {}) {
    const existing = await this.findOne({ where: { unified_account_id: unifiedAccountId, platform, is_active: true } });
    if (existing) throw new Error(`Platform ${platform} is already linked`);

    return this.create({
      unified_account_id: unifiedAccountId, platform, platform_user_id: platformUserId,
      platform_email: options.platformEmail, platform_phone: options.platformPhone,
      access_token_hash: tokens.accessToken ? crypto.createHash('sha256').update(tokens.accessToken).digest('hex') : null,
      refresh_token_hash: tokens.refreshToken ? crypto.createHash('sha256').update(tokens.refreshToken).digest('hex') : null,
      token_expires_at: tokens.expiresAt, token_scope: tokens.scope, token_type: tokens.tokenType || 'Bearer',
      is_active: true, is_primary: options.isPrimary || false,
      linked_at: new Date().toISOString(), sync_status: 'pending',
      profile_data: options.profileData, preferences: options.preferences,
      permissions: options.permissions, metadata: options.metadata || {},
      tenant_id: options.tenantId,
    });
  }

  /**
   * Unlink a platform
   */
  static async unlink(linkId, reason = null) {
    return this.update({ id: linkId }, {
      is_active: false, unlinked_at: new Date().toISOString(),
      unlink_reason: reason, access_token_hash: null, refresh_token_hash: null,
    });
  }

  /**
   * Find all linked platforms for a unified account
   */
  static async findByUnifiedAccount(unifiedAccountId) {
    return this.findAll({ where: { unified_account_id: unifiedAccountId, is_active: true } });
  }

  /**
   * Update sync status
   */
  static async updateSyncStatus(linkId, status, error = null) {
    return this.update({ id: linkId }, { last_synced_at: new Date().toISOString(), sync_status: status, sync_error: error?.substring(0, 500) });
  }

  /**
   * Update tokens after refresh
   */
  static async updateTokens(linkId, tokens) {
    const updates = { token_expires_at: tokens.expiresAt };
    if (tokens.accessToken) updates.access_token_hash = crypto.createHash('sha256').update(tokens.accessToken).digest('hex');
    if (tokens.refreshToken) updates.refresh_token_hash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    return this.update({ id: linkId }, updates);
  }
}

module.exports = PlatformLink;