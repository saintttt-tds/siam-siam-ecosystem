const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Developer Model - API Developer Account
 * 
 * Represents a developer who registers to use the SiamSiam API.
 * Developers create applications, generate API keys, and configure webhooks.
 * 
 * TABLE: developers
 * 
 * ONBOARDING PROCESS:
 * 1. Developer registers with email/phone
 * 2. Email verification
 * 3. Company/individual profile completion
 * 4. Background check (for production access)
 * 5. Sandbox access granted immediately
 * 6. Production access after review
 * 
 * DEVELOPER TIERS:
 * - sandbox: Testing only, no production access
 * - basic: Limited production access, lower rate limits
 * - verified: Full production access, standard rate limits
 * - partner: High-volume access, dedicated support
 * - enterprise: Custom solutions, SLAs, priority support
 */

class Developer extends BaseModel {
  static tableName = 'developers';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id',
    // Profile
    'developer_type', 'company_name', 'individual_name',
    'display_name', 'description', 'website',
    'logo_url', 'profile_url',
    // Contact
    'contact_email', 'contact_phone', 'support_email',
    'technical_email', 'billing_email',
    // Address
    'address_line1', 'address_line2', 'city',
    'state', 'postal_code', 'country',
    // Verification
    'email_verified', 'email_verified_at',
    'phone_verified', 'phone_verified_at',
    'identity_verified', 'identity_verified_at',
    'background_check_status', 'background_check_date',
    'background_check_provider', 'background_check_ref',
    // Status & Tier
    'tier', 'status', 'is_active',
    'sandbox_enabled', 'production_enabled',
    'production_approved_at', 'production_approved_by',
    // Rate Limits & Quotas
    'rate_limit', 'burst_limit', 'daily_quota',
    'monthly_quota', 'concurrent_requests',
    // API Usage
    'total_api_calls', 'total_api_calls_30d',
    'last_api_call_at', 'total_applications',
    'max_applications', 'total_webhooks',
    // Webhook defaults
    'default_webhook_url', 'default_webhook_secret',
    'webhook_retry_enabled', 'webhook_max_retries',
    // Security
    'allowed_origins', 'ip_whitelist',
    'two_factor_enabled', 'two_factor_method',
    // Billing
    'billing_plan', 'billing_status',
    'payment_method_id', 'billing_email_verified',
    // Support
    'support_level', 'dedicated_agent_id',
    'sla_response_time_hours', 'sla_resolution_time_hours',
    // Agreements
    'terms_accepted', 'terms_accepted_at',
    'privacy_policy_accepted', 'data_processing_agreement',
    // Notifications
    'notification_email', 'notification_webhook',
    'notify_on_quota', 'quota_warning_threshold',
    'notify_on_errors', 'error_threshold',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    allowed_origins: 'json',
    ip_whitelist: 'json',
    metadata: 'json',
    tags: 'json',
    email_verified: 'boolean',
    phone_verified: 'boolean',
    identity_verified: 'boolean',
    sandbox_enabled: 'boolean',
    production_enabled: 'boolean',
    webhook_retry_enabled: 'boolean',
    two_factor_enabled: 'boolean',
    billing_email_verified: 'boolean',
    terms_accepted: 'boolean',
    privacy_policy_accepted: 'boolean',
    notify_on_quota: 'boolean',
    notify_on_errors: 'boolean',
    rate_limit: 'integer',
    burst_limit: 'integer',
    daily_quota: 'integer',
    monthly_quota: 'integer',
    concurrent_requests: 'integer',
    total_api_calls: 'integer',
    total_api_calls_30d: 'integer',
    total_applications: 'integer',
    max_applications: 'integer',
    total_webhooks: 'integer',
    webhook_max_retries: 'integer',
    quota_warning_threshold: 'float',
    error_threshold: 'float',
    sla_response_time_hours: 'integer',
    sla_resolution_time_hours: 'integer',
  };

  static relations = {
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
    applications: { type: 'hasMany', model: 'ApiApplication', foreignKey: 'developer_id', localKey: 'id' },
    apiKeys: { type: 'hasMany', model: 'ApiKey', foreignKey: 'developer_id', localKey: 'id' },
  };

  static developerTypes = {
    INDIVIDUAL: 'individual',
    COMPANY: 'company',
    ORGANIZATION: 'organization',
  };

  static tiers = {
    SANDBOX: {
      name: 'sandbox', rateLimit: 10, burstLimit: 20,
      dailyQuota: 100, monthlyQuota: 1000, maxApplications: 1,
      concurrentRequests: 2, supportLevel: 'community',
    },
    BASIC: {
      name: 'basic', rateLimit: 60, burstLimit: 120,
      dailyQuota: 10000, monthlyQuota: 100000, maxApplications: 3,
      concurrentRequests: 5, supportLevel: 'email',
    },
    VERIFIED: {
      name: 'verified', rateLimit: 300, burstLimit: 600,
      dailyQuota: 100000, monthlyQuota: 1000000, maxApplications: 10,
      concurrentRequests: 20, supportLevel: 'priority',
    },
    PARTNER: {
      name: 'partner', rateLimit: 1000, burstLimit: 2000,
      dailyQuota: 1000000, monthlyQuota: 10000000, maxApplications: 50,
      concurrentRequests: 100, supportLevel: 'dedicated',
      slaResponseHours: 4, slaResolutionHours: 24,
    },
    ENTERPRISE: {
      name: 'enterprise', rateLimit: 5000, burstLimit: 10000,
      dailyQuota: 10000000, monthlyQuota: 100000000, maxApplications: 200,
      concurrentRequests: 500, supportLevel: 'premium',
      slaResponseHours: 1, slaResolutionHours: 4,
    },
  };

  static statuses = {
    PENDING: 'pending',
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
    REVOKED: 'revoked',
    BANNED: 'banned',
  };

  static hooks = {
    beforeCreate: [
      async (data) => {
        if (!data.tier) {
          data.tier = 'sandbox';
          const tierConfig = Developer.tiers.SANDBOX;
          data.rate_limit = tierConfig.rateLimit;
          data.burst_limit = tierConfig.burstLimit;
          data.daily_quota = tierConfig.dailyQuota;
          data.monthly_quota = tierConfig.monthlyQuota;
          data.max_applications = tierConfig.maxApplications;
          data.concurrent_requests = tierConfig.concurrentRequests;
        }
      },
    ],
  };

  /**
   * Find developer by user ID
   */
  static async findByUser(userId) {
    return this.findOne({ where: { user_id: userId } });
  }

  /**
   * Find developer by contact email
   */
  static async findByEmail(email) {
    return this.findOne({
      where: { contact_email: email.toLowerCase().trim() },
    });
  }

  /**
   * Register a new developer
   */
  static async register(userId, developerData) {
    // Check if developer already exists
    const existing = await this.findByUser(userId);
    if (existing) {
      throw new Error('Developer account already exists for this user');
    }

    return this.create({
      user_id: userId,
      developer_type: developerData.developerType || this.developerTypes.INDIVIDUAL,
      company_name: developerData.companyName || null,
      individual_name: developerData.individualName || null,
      display_name: developerData.displayName || developerData.companyName || developerData.individualName,
      description: developerData.description || null,
      website: developerData.website || null,
      contact_email: developerData.contactEmail,
      contact_phone: developerData.contactPhone || null,
      support_email: developerData.supportEmail || developerData.contactEmail,
      technical_email: developerData.technicalEmail || developerData.contactEmail,
      billing_email: developerData.billingEmail || developerData.contactEmail,
      country: developerData.country || null,
      tier: this.tiers.SANDBOX.name,
      status: this.statuses.ACTIVE,
      is_active: true,
      sandbox_enabled: true,
      production_enabled: false,
      terms_accepted: developerData.termsAccepted || false,
      terms_accepted_at: developerData.termsAccepted ? new Date().toISOString() : null,
      privacy_policy_accepted: developerData.privacyAccepted || false,
      metadata: developerData.metadata || {},
      tenant_id: developerData.tenantId || null,
    });
  }

  /**
   * Approve developer for production access
   */
  static async approveProduction(developerId, approvedBy, tier = 'basic') {
    const tierConfig = this.tiers[tier.toUpperCase()] || this.tiers.BASIC;

    return this.update({ id: developerId }, {
      production_enabled: true,
      production_approved_at: new Date().toISOString(),
      production_approved_by: approvedBy,
      tier: tierConfig.name,
      rate_limit: tierConfig.rateLimit,
      burst_limit: tierConfig.burstLimit,
      daily_quota: tierConfig.dailyQuota,
      monthly_quota: tierConfig.monthlyQuota,
      max_applications: tierConfig.maxApplications,
      concurrent_requests: tierConfig.concurrentRequests,
      support_level: tierConfig.supportLevel,
      sla_response_time_hours: tierConfig.slaResponseHours || null,
      sla_resolution_time_hours: tierConfig.slaResolutionHours || null,
    });
  }

  /**
   * Upgrade developer tier
   */
  static async upgradeTier(developerId, newTier) {
    const tierConfig = this.tiers[newTier.toUpperCase()];
    if (!tierConfig) throw new Error(`Invalid tier: ${newTier}`);

    return this.update({ id: developerId }, {
      tier: tierConfig.name,
      rate_limit: tierConfig.rateLimit,
      burst_limit: tierConfig.burstLimit,
      daily_quota: tierConfig.dailyQuota,
      monthly_quota: tierConfig.monthlyQuota,
      max_applications: tierConfig.maxApplications,
      concurrent_requests: tierConfig.concurrentRequests,
      support_level: tierConfig.supportLevel,
    });
  }

  /**
   * Suspend a developer
   */
  static async suspend(developerId, reason) {
    // Deactivate all API keys
    await connectionPool.query(
      `UPDATE api_keys SET is_active = false WHERE developer_id = $1`,
      [developerId]
    );

    // Suspend all applications
    await connectionPool.query(
      `UPDATE api_applications SET is_suspended = true WHERE developer_id = $1`,
      [developerId]
    );

    return this.update({ id: developerId }, {
      status: this.statuses.SUSPENDED,
      is_active: false,
      production_enabled: false,
      notes: reason,
    });
  }

  /**
   * Record API usage
   */
  static async recordUsage(developerId, requestCount = 1) {
    await connectionPool.query(
      `UPDATE ${this.tableName}
       SET total_api_calls = total_api_calls + $2,
           total_api_calls_30d = total_api_calls_30d + $2,
           last_api_call_at = NOW()
       WHERE id = $1`,
      [developerId, requestCount]
    );
  }

  /**
   * Check if developer has reached quota
   */
  static async checkQuota(developerId) {
    const developer = await this.findById(developerId);
    if (!developer) return { allowed: false, reason: 'Developer not found' };

    if (developer.total_api_calls_30d >= developer.monthly_quota) {
      return { allowed: false, reason: 'Monthly quota exceeded', quota: developer.monthly_quota, used: developer.total_api_calls_30d };
    }

    return { allowed: true, remaining: developer.monthly_quota - developer.total_api_calls_30d };
  }

  /**
   * Generate webhook secret
   */
  static generateWebhookSecret() {
    return `whsec_${crypto.randomBytes(32).toString('hex')}`;
  }

  /**
   * Get developer statistics
   */
  static async getStats(developerId) {
    const developer = await this.findById(developerId, { with: ['applications', 'apiKeys'] });
    if (!developer) return null;

    const activeKeys = developer._relations.apiKeys?.filter(k => k.is_active)?.length || 0;
    const activeApps = developer._relations.applications?.filter(a => a.is_active && a.is_approved)?.length || 0;

    return {
      totalApiCalls: developer.total_api_calls,
      apiCalls30d: developer.total_api_calls_30d,
      quotaUsagePercent: developer.monthly_quota > 0 
        ? Math.round((developer.total_api_calls_30d / developer.monthly_quota) * 100) 
        : 0,
      activeApplications: activeApps,
      totalApplications: developer._relations.applications?.length || 0,
      activeApiKeys: activeKeys,
      tier: developer.tier,
      rateLimit: developer.rate_limit,
      dailyQuota: developer.daily_quota,
    };
  }
}

module.exports = Developer;