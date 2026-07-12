const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Purge Log Model - Data Purge Execution Log
 * 
 * Immutable log of all data purge operations for compliance
 * and audit purposes. Records what data was purged, by whom,
 * when, and under what retention policy.
 * 
 * TABLE: purge_logs
 */

class PurgeLog extends BaseModel {
  static tableName = 'purge_logs';
  static primaryKey = 'id';
  static timestamps = false;
  
  static fields = [
    'id', 'table_name', 'schema_name',
    'record_count', 'size_bytes', 'size_before_bytes',
    'size_after_bytes', 'purge_type', 'purge_reason',
    'purge_method', 'retention_policy_id',
    'retention_policy_name', 'retention_days',
    'criteria_used', 'date_range_start', 'date_range_end',
    'executed_by', 'executed_by_name', 'executed_by_role',
    'approved_by', 'approved_by_name', 'approval_ref',
    'duration_ms', 'status', 'error_message',
    'error_stack', 'retry_count', 'max_retries',
    'batch_id', 'batch_sequence', 'batch_total',
    'is_verified', 'verified_at', 'verified_by',
    'verification_method', 'verification_notes',
    'rollback_possible', 'rollback_instructions',
    'backup_created', 'backup_location', 'backup_size_bytes',
    'backup_checksum', 'backup_expires_at',
    'affected_archived_record_ids', 'notifications_sent',
    'notification_recipients', 'compliance_notes',
    'metadata', 'tags', 'tenant_id', 'created_at',
  ];

  static casts = {
    record_count: 'integer', size_bytes: 'integer',
    size_before_bytes: 'integer', size_after_bytes: 'integer',
    retention_days: 'integer', duration_ms: 'integer',
    retry_count: 'integer', max_retries: 'integer',
    batch_sequence: 'integer', batch_total: 'integer',
    backup_size_bytes: 'integer', criteria_used: 'json',
    affected_archived_record_ids: 'json',
    notification_recipients: 'json', metadata: 'json', tags: 'json',
    is_verified: 'boolean', rollback_possible: 'boolean',
    backup_created: 'boolean', notifications_sent: 'boolean',
  };

  static purgeTypes = {
    SCHEDULED: 'scheduled', MANUAL: 'manual',
    COMPLIANCE: 'compliance', GDPR: 'gdpr',
    RETENTION_EXPIRED: 'retention_expired',
    STORAGE_OPTIMIZATION: 'storage_optimization',
    EMERGENCY: 'emergency',
  };

  static purgeMethods = {
    HARD_DELETE: 'hard_delete', SOFT_DELETE: 'soft_delete',
    TRUNCATE: 'truncate', PARTITION_DROP: 'partition_drop',
    ARCHIVE_FIRST: 'archive_first',
  };

  /**
   * Log a purge operation
   */
  static async log(tableName, recordCount, purgeType, executedBy, options = {}) {
    return this.create({
      table_name: tableName, schema_name: options.schemaName || 'public',
      record_count: recordCount, size_bytes: options.sizeBytes,
      size_before_bytes: options.sizeBeforeBytes,
      size_after_bytes: options.sizeAfterBytes,
      purge_type: purgeType, purge_reason: options.reason,
      purge_method: options.method || this.purgeMethods.HARD_DELETE,
      retention_policy_id: options.retentionPolicyId,
      retention_policy_name: options.retentionPolicyName,
      retention_days: options.retentionDays,
      criteria_used: options.criteria, date_range_start: options.dateRangeStart,
      date_range_end: options.dateRangeEnd,
      executed_by: executedBy, executed_by_name: options.executedByName,
      executed_by_role: options.executedByRole,
      approved_by: options.approvedBy, approved_by_name: options.approvedByName,
      approval_ref: options.approvalRef,
      duration_ms: options.durationMs, status: options.status || 'completed',
      error_message: options.error?.substring(0, 1000),
      batch_id: options.batchId, batch_sequence: options.batchSequence,
      batch_total: options.batchTotal,
      backup_created: options.backupCreated || false,
      backup_location: options.backupLocation,
      backup_size_bytes: options.backupSizeBytes,
      backup_checksum: options.backupChecksum,
      rollback_possible: options.rollbackPossible !== false,
      compliance_notes: options.complianceNotes?.substring(0, 1000),
      metadata: options.metadata || {}, tenant_id: options.tenantId,
    });
  }

  /**
   * Get purge history for a table
   */
  static async findByTable(tableName, options = {}) {
    return this.paginate({
      where: { table_name: tableName },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Get purge history by date range
   */
  static async findByDateRange(startDate, endDate) {
    return this.findAll({
      where: { created_at: { operator: '>=', value: startDate } },
      orderBy: { created_at: 'DESC' },
    });
  }

  /**
   * Get purge statistics
   */
  static async getStats(startDate = null, endDate = null) {
    const text = `
      SELECT
        COUNT(*) as total_purges,
        SUM(record_count) as total_records_purged,
        SUM(size_bytes) as total_bytes_purged,
        COUNT(DISTINCT table_name) as tables_affected,
        AVG(duration_ms) as avg_duration_ms,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_purges
      FROM ${this.tableName}
      WHERE 1=1
        ${startDate ? 'AND created_at >= $1' : ''}
        ${endDate ? `AND created_at <= $${startDate ? 2 : 1}` : ''}
    `;
    const values = [];
    if (startDate) values.push(startDate);
    if (endDate) values.push(endDate);
    const result = await connectionPool.query(text, values.length > 0 ? values : undefined);
    return result.rows[0];
  }

  /**
   * Verify a purge was completed correctly
   */
  static async verify(purgeId, verifiedBy, method = 'row_count_check') {
    return this.update({ id: purgeId }, {
      is_verified: true, verified_at: new Date().toISOString(),
      verified_by: verifiedBy, verification_method: method,
    });
  }
}

module.exports = PurgeLog;