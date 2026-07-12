const BaseModel = require('./base-model');
const { connectionPool } = require('@siamsiam/shared-utils').database;
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * API Request Log Model - API Call History
 * 
 * Immutable log of all API requests for analytics,
 * rate limiting, billing, and debugging.
 * 
 * TABLE: api_request_logs
 * 
 * RETENTION:
 * - Detailed logs: 30 days
 * - Aggregated stats: 1 year
 * - Billing records: 7 years
 * 
 * PERFORMANCE NOTE:
 * This table can grow very large. Use partitioning by date
 * and consider using time-series database for high-volume deployments.
 */

class ApiRequestLog extends BaseModel {
  static tableName = 'api_request_logs';
  static primaryKey = 'id';
  static timestamps = false; // Only created_at
  
  static fields = [
    'id',
    // Identifiers
    'api_key_id', 'application_id', 'developer_id',
    // Request details
    'request_method', 'endpoint', 'path', 'query_string',
    'request_headers', 'request_body_size',
    // Response details
    'status_code', 'response_time_ms', 'response_body_size',
    // Client details
    'ip_address', 'user_agent', 'origin', 'referer',
    // Geolocation
    'country', 'city', 'region',
    // Rate limiting
    'rate_limit_remaining', 'rate_limit_reset',
    // Error tracking
    'error_code', 'error_message', 'error_type',
    // Billing
    'billable', 'request_cost',
    // Correlation
    'correlation_id', 'idempotency_key',
    // Tenant
    'tenant_id', 'created_at',
  ];

  static casts = {
    request_headers: 'json',
    response_time_ms: 'integer',
    request_body_size: 'integer',
    response_body_size: 'integer',
    rate_limit_remaining: 'integer',
    rate_limit_reset: 'integer',
    billable: 'boolean',
    request_cost: 'float',
  };

  /**
   * Log an API request
   * @param {Object} params - Request log parameters
   */
  static async log(params = {}) {
    // Skip logging in development if configured
    if (process.env.NODE_ENV === 'development' && process.env.LOG_API_REQUESTS !== 'true') {
      return null;
    }

    // Async insert to not block response
    setImmediate(async () => {
      try {
        await this.create({
          api_key_id: params.apiKeyId || null,
          application_id: params.applicationId || null,
          developer_id: params.developerId || null,
          request_method: params.method,
          endpoint: params.endpoint,
          path: params.path,
          query_string: params.queryString || null,
          request_headers: params.headers || null,
          request_body_size: params.requestBodySize || 0,
          status_code: params.statusCode,
          response_time_ms: params.responseTimeMs,
          response_body_size: params.responseBodySize || 0,
          ip_address: params.ipAddress,
          user_agent: params.userAgent?.substring(0, 500),
          origin: params.origin || null,
          referer: params.referer || null,
          country: params.country || null,
          city: params.city || null,
          region: params.region || null,
          rate_limit_remaining: params.rateLimitRemaining || null,
          rate_limit_reset: params.rateLimitReset || null,
          error_code: params.errorCode || null,
          error_message: params.errorMessage?.substring(0, 500) || null,
          error_type: params.errorType || null,
          billable: params.billable !== false,
          request_cost: params.requestCost || 0,
          correlation_id: params.correlationId || null,
          idempotency_key: params.idempotencyKey || null,
          tenant_id: params.tenantId || null,
        });
      } catch (error) {
        logger.error('Failed to log API request', { error: error.message });
      }
    });

    return null; // Fire and forget
  }

  /**
   * Get usage statistics for an application
   * @param {string} applicationId - Application ID
   * @param {Object} options - Query options
   */
  static async getApplicationStats(applicationId, options = {}) {
    const { startDate, endDate } = options;
    
    const text = `
      SELECT
        COUNT(*) as total_requests,
        COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) as successful,
        COUNT(CASE WHEN status_code >= 400 AND status_code < 500 THEN 1 END) as client_errors,
        COUNT(CASE WHEN status_code >= 500 THEN 1 END) as server_errors,
        AVG(response_time_ms) as avg_response_time_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_ms) as p50_response_time,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99_response_time,
        SUM(request_body_size) as total_request_size,
        SUM(response_body_size) as total_response_size,
        SUM(request_cost) as total_cost
      FROM ${this.tableName}
      WHERE application_id = $1
        ${startDate ? 'AND created_at >= $2' : ''}
        ${endDate ? `AND created_at <= $${startDate ? 3 : 2}` : ''}
    `;

    const values = [applicationId];
    if (startDate) values.push(startDate.toISOString());
    if (endDate) values.push(endDate.toISOString());

    const result = await connectionPool.query(text, values);
    return result.rows[0];
  }

  /**
   * Get endpoint usage breakdown
   * @param {string} applicationId - Application ID
   */
  static async getEndpointBreakdown(applicationId) {
    const text = `
      SELECT
        endpoint,
        request_method,
        COUNT(*) as request_count,
        AVG(response_time_ms) as avg_response_time,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
      FROM ${this.tableName}
      WHERE application_id = $1
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY endpoint, request_method
      ORDER BY request_count DESC
      LIMIT 20
    `;

    const result = await connectionPool.query(text, [applicationId]);
    return result.rows;
  }

  /**
   * Get request volume over time
   * @param {string} applicationId - Application ID
   * @param {string} interval - 'hour', 'day', 'week', 'month'
   */
  static async getVolumeOverTime(applicationId, interval = 'day') {
    const truncateMap = {
      hour: 'hour',
      day: 'day',
      week: 'week',
      month: 'month',
    };

    const truncate = truncateMap[interval] || 'day';

    const text = `
      SELECT
        DATE_TRUNC('${truncate}', created_at) as period,
        COUNT(*) as request_count,
        AVG(response_time_ms) as avg_response_time,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
      FROM ${this.tableName}
      WHERE application_id = $1
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('${truncate}', created_at)
      ORDER BY period DESC
    `;

    const result = await connectionPool.query(text, [applicationId]);
    return result.rows;
  }

  /**
   * Purge old request logs
   * @param {number} retentionDays - Days to retain
   */
  static async purgeOldLogs(retentionDays = 30) {
    const text = `
      DELETE FROM ${this.tableName}
      WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
    `;
    
    const result = await connectionPool.query(text);
    
    if (result.rowCount > 0) {
      logger.info('Purged old API request logs', {
        count: result.rowCount,
        olderThan: `${retentionDays} days`,
      });
    }
    
    return result.rowCount;
  }
}

module.exports = ApiRequestLog;