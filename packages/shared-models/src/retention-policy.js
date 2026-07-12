const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Retention Policy Model - Data Retention Policy Rules
 * 
 * Defines data retention policies for compliance with GDPR, PCI-DSS,
 * SOC 2, and other regulatory frameworks. Each policy specifies
 * how long data should be kept, when to archive, and when to purge.
 * 
 * TABLE: retention_policies
 */

class RetentionPolicy extends BaseModel {
  static tableName = 'retention_policies';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'policy_name', 'policy_slug', 'description',
    'policy_type', 'policy_category',
    'table_name', 'schema_name', 'column_filters',
    'retention_days', 'archive_days', 'purge_days',
    'retention_basis', 'retention_basis_column',
    'grace_period_days', 'minimum_retention_days',
    'maximum_retention_days',
    'archive_provider', 'archive_bucket', 'archive_format',
    'archive_encrypt', 'archive_compress',
    'archive_verify', 'archive_verify_method',
    'purge_method', 'purge_batch_size',
    'purge_requires_approval', 'purge_approval_level',
    'is_active', 'is_system', 'priority',
    'regulatory_framework', 'regulatory_ref',
    'legal_basis', 'legal_basis_description',
    'exceptions', 'exception_conditions',
    'last_executed_at', 'last_execution_status',
    'last_execution_record_count', 'last_execution_duration_ms',
    'next_execution_at', 'execution_frequency',
    'execution_schedule', 'execution_timezone',
    'notification_emails', 'notify_on_completion',
    'notify_on_failure', 'notify_on_threshold',
    'threshold_record_count',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    retention_days: 'integer', archive_days: 'integer',
    purge_days: 'integer', grace_period_days: 'integer',
    minimum_retention_days: 'integer', maximum_retention_days: 'integer',
    purge_batch_size: 'integer', purge_approval_level: 'integer',
    priority: 'integer', last_execution_record_count: 'integer',
    last_execution_duration_ms: 'integer', threshold_record_count: 'integer',
    archive_encrypt: 'boolean', archive_compress: 'boolean',
    archive_verify: 'boolean', purge_requires_approval: 'boolean',
    is_active: 'boolean', is_system: 'boolean',
    notify_on_completion: 'boolean', notify_on_failure: 'boolean',
    notify_on_threshold: 'boolean',
    column_filters: 'json', exceptions: 'json',
    exception_conditions: 'json', execution_schedule: 'json',
    notification_emails: 'json', metadata: 'json', tags: 'json',
  };

  static policyCategories = {
    GDPR: 'gdpr', PCI_DSS: 'pci_dss', SOC2: 'soc2',
    HIPAA: 'hipaa', CCPA: 'ccpa', FINANCIAL: 'financial',
    OPERATIONAL: 'operational', CUSTOM: 'custom',
  };

  static retentionBases = {
    CREATED_AT: 'created_at', UPDATED_AT: 'updated_at',
    COMPLETED_AT: 'completed_at', DELETED_AT: 'deleted_at',
    LAST_ACTIVITY_AT: 'last_activity_at', CUSTOM: 'custom',
  };

  /**
   * Get active policies
   */
  static async getActive(tableName = null) {
    const criteria = { is_active: true };
    if (tableName) criteria.table_name = tableName;
    return this.findAll({ where: criteria, orderBy: { priority: 'ASC' } });
  }

  /**
   * Find policy by table name
   */
  static async findByTable(tableName) {
    return this.findOne({ where: { table_name: tableName, is_active: true } });
  }

  /**
   * Update last execution status
   */
  static async updateExecutionStatus(policyId, status, recordCount, durationMs) {
    return this.update({ id: policyId }, {
      last_executed_at: new Date().toISOString(),
      last_execution_status: status,
      last_execution_record_count: recordCount,
      last_execution_duration_ms: durationMs,
      next_execution_at: this._calculateNextExecution(status),
    });
  }

  /**
   * Calculate next execution date based on frequency
   */
  static _calculateNextExecution(status) {
    const now = new Date();
    return new Date(now.setDate(now.getDate() + 1)).toISOString(); // Default: next day
  }

  /**
   * Check if records should be archived
   */
  static isArchiveDue(policy, recordDate) {
    if (!policy.archive_days) return false;
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - policy.archive_days);
    return new Date(recordDate) <= threshold;
  }

  /**
   * Check if records should be purged
   */
  static isPurgeDue(policy, recordDate) {
    if (!policy.purge_days) return false;
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - policy.purge_days);
    return new Date(recordDate) <= threshold;
  }
}

module.exports = RetentionPolicy;