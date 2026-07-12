const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Admin Audit Log Model - Immutable Audit Trail
 * 
 * Append-only log of all administrative actions for compliance.
 * Records are NEVER updated or deleted - only inserted.
 * Used for SOC 2, PCI-DSS, and regulatory compliance audits.
 * 
 * TABLE: admin_audit_logs
 * 
 * COMPLIANCE STANDARDS:
 * - SOC 2: System and Organization Controls
 * - PCI-DSS: Payment Card Industry Data Security Standard
 * - ISO 27001: Information Security Management
 * - GDPR: General Data Protection Regulation
 * 
 * RETENTION: Records retained for 7 years minimum
 */

class AdminAuditLog extends BaseModel {
  static tableName = 'admin_audit_logs';
  static primaryKey = 'id';
  static timestamps = false; // Only created_at, no updates allowed
  static optimisticLocking = false;
  
  static fields = [
    'id',
    // Actor
    'admin_id', 'admin_name', 'admin_role', 'admin_email',
    // Action
    'action', 'action_category', 'action_description',
    // Resource
    'resource_type', 'resource_id', 'resource_name',
    // Changes
    'changes', 'previous_state', 'new_state',
    // Context
    'ip_address', 'user_agent', 'session_id',
    'request_method', 'request_path', 'request_id',
    // Geolocation
    'country', 'city', 'lat', 'lon',
    // Result
    'status', 'error_code', 'error_message',
    'duration_ms',
    // Additional
    'notes', 'tags', 'correlation_id',
    'tenant_id', 'created_at',
  ];

  static casts = {
    changes: 'json',
    previous_state: 'json',
    new_state: 'json',
    tags: 'json',
    duration_ms: 'integer',
    lat: 'float',
    lon: 'float',
  };

  // Audit action categories
  static categories = {
    USER_MANAGEMENT: 'user_management',
    MERCHANT_MANAGEMENT: 'merchant_management',
    SYSTEM_CONFIG: 'system_config',
    SECURITY: 'security',
    FINANCIAL: 'financial',
    CONTENT: 'content',
    API_MANAGEMENT: 'api_management',
    REPORTING: 'reporting',
    OTHER: 'other',
  };

  // Audit result statuses
  static statuses = {
    SUCCESS: 'success',
    FAILURE: 'failure',
    DENIED: 'denied',
    ERROR: 'error',
  };

  /**
   * Log an administrative action
   * @param {Object} params - Audit log parameters
   * @returns {Promise<Object>} Created audit log entry
   */
  static async log(params = {}) {
    const entry = {
      admin_id: params.adminId || 'system',
      admin_name: params.adminName || 'System',
      admin_role: params.adminRole || 'system',
      admin_email: params.adminEmail || null,
      action: params.action,
      action_category: params.category || this.categories.OTHER,
      action_description: params.description || null,
      resource_type: params.resourceType || null,
      resource_id: params.resourceId ? String(params.resourceId) : null,
      resource_name: params.resourceName || null,
      changes: params.changes || null,
      previous_state: params.previousState || null,
      new_state: params.newState || null,
      ip_address: params.ipAddress || null,
      user_agent: params.userAgent?.substring(0, 500) || null,
      session_id: params.sessionId || null,
      request_method: params.requestMethod || null,
      request_path: params.requestPath || null,
      request_id: params.requestId || null,
      country: params.country || null,
      city: params.city || null,
      lat: params.lat || null,
      lon: params.lon || null,
      status: params.status || this.statuses.SUCCESS,
      error_code: params.errorCode || null,
      error_message: params.errorMessage?.substring(0, 500) || null,
      duration_ms: params.durationMs || null,
      notes: params.notes || null,
      tags: params.tags || [],
      correlation_id: params.correlationId || null,
      tenant_id: params.tenantId || null,
    };

    const record = await this.create(entry);
    
    // Log to security monitoring
    if (params.status === this.statuses.FAILURE || params.status === this.statuses.DENIED) {
      logger.warn('Admin action failed', {
        adminId: params.adminId,
        action: params.action,
        status: params.status,
      });
    }

    return record;
  }

  /**
   * Find audit logs by admin user
   * @param {string} adminId - Admin user ID
   * @param {Object} options - Query options
   */
  static async findByAdmin(adminId, options = {}) {
    return this.paginate({
      where: { admin_id: adminId },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Find audit logs for a specific resource
   * @param {string} resourceType - Resource type
   * @param {string} resourceId - Resource ID
   */
  static async findByResource(resourceType, resourceId) {
    return this.findAll({
      where: {
        resource_type: resourceType,
        resource_id: String(resourceId),
      },
      orderBy: { created_at: 'DESC' },
    });
  }

  /**
   * Find audit logs by action
   * @param {string} action - Action name
   * @param {Object} options - Query options
   */
  static async findByAction(action, options = {}) {
    return this.paginate({
      where: { action },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Find audit logs by date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {Object} options - Query options
   */
  static async findByDateRange(startDate, endDate, options = {}) {
    return this.paginate({
      whereBetween: {
        created_at: [startDate.toISOString(), endDate.toISOString()],
      },
      ...options,
    });
  }

  /**
   * Get audit summary statistics
   * @param {Object} options - Query options
   */
  static async getSummary(options = {}) {
    const text = `
      SELECT
        action_category,
        COUNT(*) as total_actions,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'failure' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'denied' THEN 1 END) as denied,
        COUNT(DISTINCT admin_id) as unique_admins,
        AVG(duration_ms) as avg_duration_ms
      FROM ${this.tableName}
      ${options.startDate ? 'WHERE created_at >= $1' : ''}
      ${options.startDate && options.endDate ? 'AND created_at <= $2' : options.endDate ? 'WHERE created_at <= $1' : ''}
      GROUP BY action_category
      ORDER BY total_actions DESC
    `;

    const values = [];
    if (options.startDate) values.push(options.startDate.toISOString());
    if (options.endDate) values.push(options.endDate.toISOString());

    const result = await connectionPool.query(text, values);
    return result.rows;
  }

  /**
   * Purge audit logs older than retention period (7 years)
   * WARNING: This should only be run by compliance officers
   */
  static async purgeOldLogs(retentionYears = 7) {
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionYears);

    const text = `
      DELETE FROM ${this.tableName}
      WHERE created_at < $1
    `;
    
    const result = await connectionPool.query(text, [cutoffDate.toISOString()]);
    
    logger.warn('Audit logs purged', {
      count: result.rowCount,
      olderThan: cutoffDate.toISOString(),
    });

    return result.rowCount;
  }

  /**
   * Export audit logs for compliance reporting
   * @param {Object} filters - Export filters
   */
  static async exportForCompliance(filters = {}) {
    return this.findAll({
      where: filters,
      orderBy: { created_at: 'DESC' },
      limit: 100000, // Max export limit
    });
  }
}

module.exports = AdminAuditLog;