const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Webhook Delivery Model - Webhook Delivery Attempt Log
 * 
 * Records each attempt to deliver a webhook event to an endpoint.
 * Tracks retry attempts, response codes, errors, and timing.
 * 
 * TABLE: webhook_deliveries
 */

class WebhookDelivery extends BaseModel {
  static tableName = 'webhook_deliveries';
  static primaryKey = 'id';
  static timestamps = false;
  
  static fields = [
    'id', 'endpoint_id', 'application_id', 'event_id',
    'event_type', 'event_subtype', 'delivery_number',
    'delivery_status', 'delivery_attempt', 'max_attempts',
    'payload', 'payload_size_bytes', 'payload_hash',
    'request_url', 'request_method', 'request_headers',
    'request_body', 'request_sent_at',
    'response_status_code', 'response_headers', 'response_body',
    'response_received_at', 'response_time_ms',
    'is_successful', 'error_code', 'error_message', 'error_category',
    'retry_count', 'next_retry_at', 'retry_strategy',
    'last_retry_at', 'all_retries_exhausted',
    'idempotency_key', 'correlation_id',
    'signature', 'signature_verified',
    'ip_address', 'server_ip',
    'metadata', 'tags',
    'tenant_id', 'created_at',
  ];

  static casts = {
    delivery_attempt: 'integer', max_attempts: 'integer',
    payload_size_bytes: 'integer', response_status_code: 'integer',
    response_time_ms: 'integer', retry_count: 'integer',
    payload: 'json', request_headers: 'json', response_headers: 'json',
    metadata: 'json', tags: 'json',
    is_successful: 'boolean', signature_verified: 'boolean',
    all_retries_exhausted: 'boolean',
  };

  static relations = {
    endpoint: { type: 'belongsTo', model: 'WebhookEndpoint', foreignKey: 'endpoint_id', ownerKey: 'id' },
  };

  static deliveryStatuses = {
    PENDING: 'pending', SENDING: 'sending', DELIVERED: 'delivered',
    FAILED: 'failed', RETRYING: 'retrying', EXHAUSTED: 'exhausted',
    CANCELLED: 'cancelled',
  };

  /**
   * Log a webhook delivery attempt
   */
  static async log(endpointId, applicationId, eventType, payload, status, metadata = {}) {
    return this.create({
      endpoint_id: endpointId, application_id: applicationId,
      event_id: metadata.eventId, event_type: eventType,
      event_subtype: metadata.eventSubtype,
      delivery_number: `WHD-${Date.now().toString(36)}`,
      delivery_status: status, delivery_attempt: metadata.attempt || 1,
      max_attempts: metadata.maxAttempts || 6,
      payload: payload, payload_size_bytes: JSON.stringify(payload).length,
      request_url: metadata.requestUrl, request_method: 'POST',
      request_sent_at: metadata.requestSentAt || new Date().toISOString(),
      response_status_code: metadata.statusCode,
      response_body: metadata.responseBody?.substring(0, 5000),
      response_received_at: new Date().toISOString(),
      response_time_ms: metadata.durationMs,
      is_successful: status === this.deliveryStatuses.DELIVERED,
      error_code: metadata.errorCode,
      error_message: metadata.error?.substring(0, 1000),
      error_category: metadata.errorCategory,
      retry_count: metadata.retryCount || 0,
      next_retry_at: metadata.nextRetryAt,
      all_retries_exhausted: metadata.allRetriesExhausted || false,
      idempotency_key: metadata.idempotencyKey,
      correlation_id: metadata.correlationId,
      signature_verified: metadata.signatureVerified !== false,
      metadata: metadata.metadata || {}, tenant_id: metadata.tenantId,
    });
  }

  /**
   * Find deliveries by endpoint
   */
  static async findByEndpoint(endpointId, options = {}) {
    return this.paginate({ where: { endpoint_id: endpointId }, orderBy: { created_at: 'DESC' }, ...options });
  }

  /**
   * Get delivery statistics
   */
  static async getStats(endpointId = null, startDate = null) {
    const text = `
      SELECT COUNT(*) as total, 
        COUNT(CASE WHEN is_successful = true THEN 1 END) as successful,
        COUNT(CASE WHEN is_successful = false THEN 1 END) as failed,
        AVG(response_time_ms) as avg_response_time_ms,
        ROUND(100.0 * COUNT(CASE WHEN is_successful = true THEN 1 END) / NULLIF(COUNT(*), 0), 2) as success_rate
      FROM ${this.tableName} WHERE 1=1
        ${endpointId ? 'AND endpoint_id = $1' : ''}
        ${startDate ? `AND created_at >= $${endpointId ? 2 : 1}` : ''}
    `;
    const values = []; if (endpointId) values.push(endpointId); if (startDate) values.push(startDate);
    const result = await connectionPool.query(text, values.length > 0 ? values : undefined);
    return result.rows[0];
  }
}

module.exports = WebhookDelivery;