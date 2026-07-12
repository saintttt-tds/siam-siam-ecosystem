const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * API Application Model - Registered API Application
 * 
 * Represents an application registered by a developer for API access.
 * Each application can have multiple API keys and webhook endpoints.
 * 
 * TABLE: api_applications
 * 
 * LIFECYCLE:
 * 1. Developer submits application for review
 * 2. Admin reviews and approves/rejects
 * 3. Developer generates API keys
 * 4. Developer configures webhooks
 * 5. Application goes live in production
 * 
 * COMPLIANCE:
 * - Applications undergo background checks
 * - Rate limits enforced per application
 * - Sandbox mode for testing
 * - Usage analytics tracked
 */

class ApiApplication extends BaseModel {
  static tableName = 'api_applications';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'developer_id', 'name', 'description',
    'website', 'logo_url', 'privacy_policy_url', 'terms_of_service_url',
    // Application type
    'application_type', 'platform',
    // Redirect/OAuth
    'redirect_urls', 'allowed_origins',
    // Scopes and permissions
    'scopes', 'permissions',
    // Approval status
    'is_approved', 'is_active', 'is_suspended',
    'approved_at', 'approved_by', 'rejection_reason',
    // Rate limiting
    'rate_limit', 'rate_limit_window', 'burst_limit',
    // Webhook defaults
    'default_webhook_url', 'webhook_secret',
    // Sandbox
    'sandbox_mode', 'sandbox_expires_at',
    // Usage tracking
    'total_api_calls', 'last_api_call_at',
    // Compliance
    'background_check_status', 'background_check_date',
    'compliance_notes', 'data_retention_days',
    // Metadata
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    redirect_urls: 'json',
    allowed_origins: 'json',
    scopes: 'json',
    permissions: 'json',
    metadata: 'json',
    tags: 'json',
    is_approved: 'boolean',
    is_active: 'boolean',
    is_suspended: 'boolean',
    sandbox_mode: 'boolean',
    rate_limit: 'integer',
    burst_limit: 'integer',
    total_api_calls: 'integer',
    data_retention_days: 'integer',
  };

  static relations = {
    developer: {
      type: 'belongsTo',
      model: 'Developer',
      foreignKey: 'developer_id',
      ownerKey: 'id',
    },
    apiKeys: {
      type: 'hasMany',
      model: 'ApiKey',
      foreignKey: 'application_id',
      localKey: 'id',
    },
    webhookEndpoints: {
      type: 'hasMany',
      model: 'WebhookEndpoint',
      foreignKey: 'application_id',
      localKey: 'id',
    },
  };

  // Application status constants
  static approvalStatuses = {
    PENDING: 'pending',
    UNDER_REVIEW: 'under_review',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    SUSPENDED: 'suspended',
    REVOKED: 'revoked',
  };

  // Available API scopes
  static availableScopes = [
    'read:users', 'write:users',
    'read:orders', 'write:orders',
    'read:payments', 'write:payments', 'process:refunds',
    'read:deliveries', 'write:deliveries',
    'read:products', 'write:products',
    'read:merchants', 'write:merchants',
    'read:analytics',
    'webhooks:receive',
  ];

  /**
   * Find applications by developer
   * @param {string} developerId - Developer ID
   */
  static async findByDeveloper(developerId) {
    return this.findAll({
      where: { developer_id: developerId },
      orderBy: { created_at: 'DESC' },
    });
  }

  /**
   * Find active application by ID with API keys
   * @param {string} applicationId - Application ID
   */
  static async findActive(applicationId) {
    return this.findById(applicationId, {
      where: { is_active: true, is_approved: true, is_suspended: false },
      with: ['apiKeys', 'webhookEndpoints'],
    });
  }

  /**
   * Submit application for review
   * @param {string} applicationId - Application ID
   */
  static async submitForReview(applicationId) {
    return this.update({ id: applicationId }, {
      is_approved: false,
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Approve an application
   * @param {string} applicationId - Application ID
   * @param {string} adminId - Approving admin ID
   * @param {Object} options - Approval options
   */
  static async approve(applicationId, adminId, options = {}) {
    return this.update({ id: applicationId }, {
      is_approved: true,
      approved_at: new Date().toISOString(),
      approved_by: adminId,
      sandbox_mode: options.sandboxMode !== false,
      rate_limit: options.rateLimit || 100,
      burst_limit: options.burstLimit || 200,
      scopes: options.scopes || [],
    });
  }

  /**
   * Reject an application
   * @param {string} applicationId - Application ID
   * @param {string} adminId - Rejecting admin ID
   * @param {string} reason - Rejection reason
   */
  static async reject(applicationId, adminId, reason) {
    return this.update({ id: applicationId }, {
      is_approved: false,
      rejection_reason: reason,
      approved_by: adminId,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Suspend an application
   * @param {string} applicationId - Application ID
   * @param {string} reason - Suspension reason
   */
  static async suspend(applicationId, reason) {
    // Deactivate all API keys
    await connectionPool.query(
      `UPDATE api_keys SET is_active = false WHERE application_id = $1`,
      [applicationId]
    );

    return this.update({ id: applicationId }, {
      is_suspended: true,
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Record API call for rate limiting
   * @param {string} applicationId - Application ID
   */
  static async recordApiCall(applicationId) {
    await connectionPool.query(
      `UPDATE ${this.tableName}
       SET total_api_calls = total_api_calls + 1,
           last_api_call_at = NOW()
       WHERE id = $1`,
      [applicationId]
    );
  }

  /**
   * Get applications pending review
   */
  static async getPendingReview() {
    return this.findAll({
      where: { is_approved: false, is_active: true, rejection_reason: null },
      orderBy: { created_at: 'ASC' },
      with: ['developer'],
    });
  }

  /**
   * Generate webhook secret
   */
  static generateWebhookSecret() {
    return `whsec_${crypto.randomBytes(32).toString('hex')}`;
  }
}

module.exports = ApiApplication;