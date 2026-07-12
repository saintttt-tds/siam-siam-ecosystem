const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Unified Account Model - Cross-Platform SSO Account
 * 
 * Central account entity that links user identities across all
 * SiamSiam platforms (AxionPay, AxionCommerce, AxionFly, etc.).
 * Enables Single Sign-On, unified profile, and cross-platform sync.
 * 
 * TABLE: unified_accounts
 */

class UnifiedAccount extends BaseModel {
  static tableName = 'unified_accounts';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'primary_user_id',
    'account_number', 'account_status',
    'email', 'email_verified', 'email_verified_at',
    'phone', 'phone_verified', 'phone_verified_at',
    'display_name', 'first_name', 'last_name',
    'date_of_birth', 'gender', 'profile_picture_url',
    'cover_photo_url', 'bio', 'website',
    'language', 'locale', 'timezone', 'currency',
    'nationality', 'country', 'city', 'address',
    'identity_verified', 'identity_verified_at',
    'identity_verification_method', 'kyc_level',
    'primary_platform', 'platform_joined_at',
    'linked_platforms', 'platform_count',
    'sso_enabled', 'sso_provider', 'sso_provider_id',
    'last_sso_login', 'last_platform_login',
    'last_active_platform', 'last_activity_at',
    'preferences', 'notification_preferences',
    'privacy_settings', 'marketing_consent',
    'data_processing_consent', 'gdpr_consent',
    'terms_accepted', 'terms_accepted_at',
    'terms_version', 'privacy_policy_accepted',
    'is_active', 'is_suspended', 'suspension_reason',
    'suspended_at', 'suspended_until',
    'deletion_requested', 'deletion_requested_at',
    'deletion_scheduled_at', 'deletion_completed_at',
    'total_platforms_used', 'total_orders',
    'total_spent', 'total_saved', 'loyalty_points',
    'referral_code', 'referred_by',
    'security_questions_set', 'two_factor_enabled',
    'two_factor_methods', 'backup_email',
    'backup_phone', 'recovery_email',
    'account_recovery_enabled', 'recovery_codes_generated',
    'last_security_review_at', 'security_score',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    email_verified: 'boolean', phone_verified: 'boolean',
    identity_verified: 'boolean', sso_enabled: 'boolean',
    marketing_consent: 'boolean', data_processing_consent: 'boolean',
    gdpr_consent: 'boolean', terms_accepted: 'boolean',
    privacy_policy_accepted: 'boolean', is_active: 'boolean',
    is_suspended: 'boolean', deletion_requested: 'boolean',
    account_recovery_enabled: 'boolean', recovery_codes_generated: 'boolean',
    two_factor_enabled: 'boolean', security_questions_set: 'boolean',
    kyc_level: 'integer', platform_count: 'integer',
    total_platforms_used: 'integer', total_orders: 'integer',
    total_spent: 'float', total_saved: 'float', loyalty_points: 'integer',
    security_score: 'float',
    linked_platforms: 'json', preferences: 'json',
    notification_preferences: 'json', privacy_settings: 'json',
    two_factor_methods: 'json', metadata: 'json', tags: 'json',
  };

  static relations = {
    primaryUser: { type: 'belongsTo', model: 'User', foreignKey: 'primary_user_id', ownerKey: 'id' },
    platformLinks: { type: 'hasMany', model: 'PlatformLink', foreignKey: 'unified_account_id', localKey: 'id' },
    ssoSessions: { type: 'hasMany', model: 'SsoSession', foreignKey: 'unified_account_id', localKey: 'id' },
  };

  static platforms = {
    AXIONPAY: 'axionpay', AXION_COMMERCE: 'axion_commerce',
    AXIONFLY: 'axionfly', AXIONPOS: 'axionpos',
    CORPORATE_FX: 'corporate_fx',
  };

  static accountStatuses = {
    ACTIVE: 'active', SUSPENDED: 'suspended', DELETION_REQUESTED: 'deletion_requested',
    DELETED: 'deleted', LOCKED: 'locked', UNDER_REVIEW: 'under_review',
  };

  static generateAccountNumber() {
    return `UA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
  }

  /**
   * Create a unified account
   */
  static async createAccount(userId, accountData) {
    const existing = await this.findOne({ where: { primary_user_id: userId } });
    if (existing) throw new Error('Unified account already exists for this user');

    return this.create({
      primary_user_id: userId, account_number: this.generateAccountNumber(),
      account_status: this.accountStatuses.ACTIVE,
      email: accountData.email?.toLowerCase(), email_verified: accountData.emailVerified || false,
      phone: accountData.phone, phone_verified: accountData.phoneVerified || false,
      display_name: accountData.displayName || accountData.firstName + ' ' + accountData.lastName,
      first_name: accountData.firstName, last_name: accountData.lastName,
      date_of_birth: accountData.dateOfBirth, gender: accountData.gender,
      language: accountData.language || 'en', locale: accountData.locale || 'en_ZW',
      timezone: accountData.timezone || 'Africa/Harare',
      currency: accountData.currency || 'USD', country: accountData.country,
      primary_platform: accountData.primaryPlatform || this.platforms.AXIONPAY,
      platform_joined_at: new Date().toISOString(),
      linked_platforms: [accountData.primaryPlatform || this.platforms.AXIONPAY],
      platform_count: 1, sso_enabled: accountData.ssoEnabled !== false,
      preferences: accountData.preferences || {},
      notification_preferences: accountData.notificationPreferences || {},
      privacy_settings: accountData.privacySettings || {},
      terms_accepted: accountData.termsAccepted || false,
      terms_accepted_at: accountData.termsAccepted ? new Date().toISOString() : null,
      terms_version: accountData.termsVersion || '1.0',
      is_active: true, referral_code: accountData.referralCode,
      referred_by: accountData.referredBy,
      metadata: accountData.metadata || {}, tenant_id: accountData.tenantId,
    });
  }

  /**
   * Find account by email
   */
  static async findByEmail(email) {
    return this.findOne({ where: { email: email?.toLowerCase().trim(), is_active: true } });
  }

  /**
   * Find account by phone
   */
  static async findByPhone(phone) {
    return this.findOne({ where: { phone, is_active: true } });
  }

  /**
   * Link a platform to unified account
   */
  static async linkPlatform(accountId, platform, platformUserId, options = {}) {
    const account = await this.findById(accountId);
    if (!account) throw new Error('Unified account not found');

    const linked = [...(account.linked_platforms || [])];
    if (!linked.includes(platform)) {
      linked.push(platform);
      await this.update({ id: accountId }, {
        linked_platforms: linked,
        platform_count: linked.length,
        last_active_platform: platform,
        last_activity_at: new Date().toISOString(),
        total_platforms_used: linked.length,
      });
    }

    const PlatformLink = require('./platform-link');
    return PlatformLink.link(accountId, platform, platformUserId, options.tokens || {}, options);
  }

  /**
   * Get all linked platforms for an account
   */
  static async getLinkedPlatforms(accountId) {
    const account = await this.findById(accountId);
    return account?.linked_platforms || [];
  }

  /**
   * Suspend unified account (affects all platforms)
   */
  static async suspend(accountId, reason, suspendedBy) {
    // Suspend on all linked platforms
    const account = await this.findById(accountId);
    if (account?.linked_platforms) {
      for (const platform of account.linked_platforms) {
        await connectionPool.query(
          `UPDATE ${platform}_users SET is_active = false, suspension_reason = $2 WHERE unified_account_id = $1`,
          [accountId, reason]
        );
      }
    }

    return this.update({ id: accountId }, {
      account_status: this.accountStatuses.SUSPENDED,
      is_active: false, is_suspended: true,
      suspension_reason: reason, suspended_at: new Date().toISOString(),
    });
  }

  /**
   * Request account deletion (GDPR right to be forgotten)
   */
  static async requestDeletion(accountId) {
    return this.update({ id: accountId }, {
      account_status: this.accountStatuses.DELETION_REQUESTED,
      deletion_requested: true, deletion_requested_at: new Date().toISOString(),
      deletion_scheduled_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
  }

  /**
   * Sync profile data to all linked platforms
   */
  static async syncProfile(accountId) {
    const account = await this.findById(accountId, { with: ['platformLinks'] });
    if (!account) return;

    const profileData = {
      display_name: account.display_name, first_name: account.first_name,
      last_name: account.last_name, email: account.email, phone: account.phone,
      profile_picture_url: account.profile_picture_url, language: account.language,
      timezone: account.timezone, currency: account.currency,
    };

    for (const link of account._relations?.platformLinks || []) {
      if (link.is_active) {
        // PRODUCTION: Call platform-specific sync API
        await connectionPool.query(
          `UPDATE ${link.platform}_users SET display_name = $2, profile_picture_url = $3 WHERE id = $1`,
          [link.platform_user_id, profileData.display_name, profileData.profile_picture_url]
        );
      }
    }
  }
}

module.exports = UnifiedAccount;