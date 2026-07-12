const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Webhook Endpoint Model - Registered Webhook URL
 * 
 * Stores webhook endpoint registrations for applications.
 * Each endpoint subscribes to specific event types and
 * receives HTTP POST notifications when events occur.
 * 
 * TABLE: webhook_endpoints
 */

class WebhookEndpoint extends BaseModel {
  static tableName = 'webhook_endpoints';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'application_id', 'developer_id',
    'endpoint_name', 'endpoint_url', 'description',
    'secret', 'secret_hash', 'secret_rotated_at',
    'secret_version', 'previous_secret_hash',
    'events', 'event_count', 'is_active', 'is_verified',
    'is_paused', 'paused_reason', 'paused_at', 'paused_by',
    'verification_method', 'verification_token',
    'verification_sent_at', 'verified_at', 'verified_by',
    'last_delivery_at', 'last_delivery_status',
    'last_response_code', 'last_response_time_ms',
    'last_error', 'last_error_at',
    'success_count', 'failure_count', 'total_deliveries',
    'success_rate', 'avg_response_time_ms',
    'consecutive_failures', 'max_consecutive_failures',
    'failure_action', 'consecutive_failure_paused',
    'retry_enabled', 'retry_count', 'retry_delays',
    'retry_strategy', 'timeout_seconds',
    'rate_limit', 'rate_limit_period_seconds',
    'custom_headers', 'secret_header_name',
    'signature_algorithm', 'signature_header_name',
    'payload_format', 'max_payload_size_bytes',
    'ip_whitelist', 'allowed_ips',
    'ssl_verification_enabled', 'ssl_certificate_check',
    'health_check_url', 'health_check_method',
    'health_check_interval_seconds', 'last_health_check_at',
    'health_status', 'health_check_response_time_ms',
    'disabled_at', 'disabled_reason', 'disabled_by',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    events: 'json', custom_headers: 'json', retry_delays: 'json',
    ip_whitelist: 'json', allowed_ips: 'json', metadata: 'json', tags: 'json',
    event_count: 'integer', success_count: 'integer', failure_count: 'integer',
    total_deliveries: 'integer', consecutive_failures: 'integer',
    max_consecutive_failures: 'integer', retry_count: 'integer',
    timeout_seconds: 'integer', rate_limit: 'integer',
    rate_limit_period_seconds: 'integer', max_payload_size_bytes: 'integer',
    health_check_interval_seconds: 'integer',
    last_response_code: 'integer', last_response_time_ms: 'integer',
    avg_response_time_ms: 'float', success_rate: 'float',
    health_check_response_time_ms: 'integer', secret_version: 'integer',
    is_active: 'boolean', is_verified: 'boolean', is_paused: 'boolean',
    retry_enabled: 'boolean', consecutive_failure_paused: 'boolean',
    ssl_verification_enabled: 'boolean', ssl_certificate_check: 'boolean',
  };

  static relations = {
    application: { type: 'belongsTo', model: 'ApiApplication', foreignKey: 'application_id', ownerKey: 'id' },
    deliveries: { type: 'hasMany', model: 'WebhookDelivery', foreignKey: 'endpoint_id', localKey: 'id' },
  };

  static availableEvents = [
    'payment.completed', 'payment.failed', 'payment.refunded',
    'refund.processed', 'refund.failed',
    'order.created', 'order.confirmed', 'order.shipped',
    'order.delivered', 'order.cancelled',
    'delivery.status_updated', 'delivery.completed', 'delivery.failed',
    'user.created', 'user.updated', 'user.deleted',
    'merchant.verified', 'merchant.suspended',
    'dispute.created', 'dispute.resolved',
    'settlement.completed', 'wallet.credited', 'wallet.debited',
    'subscription.created', 'subscription.cancelled',
  ];

  static generateSecret() { return `whsec_${crypto.randomBytes(32).toString('hex')}`; }

  /**
   * Register a webhook endpoint
   */
  static async register(applicationId, endpointData) {
    const secret = this.generateSecret();
    const secretHash = crypto.createHash('sha256').update(secret).digest('hex');

    return this.create({
      application_id: applicationId, developer_id: endpointData.developerId,
      endpoint_name: endpointData.endpointName, endpoint_url: endpointData.endpointUrl,
      description: endpointData.description?.substring(0, 500),
      secret: secretHash, secret_version: 1,
      events: endpointData.events || [], event_count: (endpointData.events || []).length,
      is_active: true, is_verified: false,
      verification_method: endpointData.verificationMethod || 'token',
      verification_token: crypto.randomBytes(16).toString('hex'),
      retry_enabled: endpointData.retryEnabled !== false, retry_count: endpointData.retryCount || 6,
      retry_delays: endpointData.retryDelays || [0, 30, 120, 300, 900, 3600],
      timeout_seconds: endpointData.timeoutSeconds || 10,
      custom_headers: endpointData.customHeaders || {},
      signature_algorithm: endpointData.signatureAlgorithm || 'hmac_sha256',
      signature_header_name: endpointData.signatureHeaderName || 'X-SiamSiam-Signature',
      max_consecutive_failures: endpointData.maxConsecutiveFailures || 10,
      failure_action: endpointData.failureAction || 'pause',
      metadata: endpointData.metadata || {}, tenant_id: endpointData.tenantId,
    });
  }

  /**
   * Find endpoints by application
   */
  static async findByApplication(applicationId) {
    return this.findAll({ where: { application_id: applicationId, is_active: true } });
  }

  /**
   * Find endpoints subscribed to an event
   */
  static async findByEvent(eventType) {
    return this.findAll({
      where: { is_active: true, is_verified: true, is_paused: false },
    });
  }

  /**
   * Verify an endpoint
   */
  static async verify(endpointId, verifiedBy) {
    return this.update({ id: endpointId }, {
      is_verified: true, verified_at: new Date().toISOString(), verified_by: verifiedBy,
    });
  }

  /**
   * Record a delivery result
   */
  static async recordDelivery(endpointId, success, metadata = {}) {
    const updates = {
      last_delivery_at: new Date().toISOString(),
      last_delivery_status: success ? 'delivered' : 'failed',
      total_deliveries: connectionPool.raw('total_deliveries + 1'),
    };
    if (success) {
      updates.success_count = connectionPool.raw('success_count + 1');
      updates.consecutive_failures = 0;
    } else {
      updates.failure_count = connectionPool.raw('failure_count + 1');
      updates.consecutive_failures = connectionPool.raw('consecutive_failures + 1');
      updates.last_error = metadata.error?.substring(0, 500);
      updates.last_error_at = new Date().toISOString();
    }
    if (metadata.responseCode) updates.last_response_code = metadata.responseCode;
    if (metadata.responseTimeMs) updates.last_response_time_ms = metadata.responseTimeMs;
    return this.update({ id: endpointId }, updates);
  }

  /**
   * Pause an endpoint due to failures
   */
  static async pause(endpointId, reason) {
    return this.update({ id: endpointId }, {
      is_paused: true, paused_reason: reason, paused_at: new Date().toISOString(),
    });
  }
}

module.exports = WebhookEndpoint;