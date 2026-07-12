const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Archived Record Model - Data Archival Metadata
 * 
 * Tracks records that have been archived from live tables
 * to long-term storage for compliance and performance.
 * 
 * TABLE: archived_records
 * 
 * ARCHIVAL PROCESS:
 * 1. Records identified by retention policy
 * 2. Data exported to archive format (JSON/CSV/Parquet)
 * 3. Archive stored in cloud storage (S3/GCS)
 * 4. Metadata recorded in this table
 * 5. Original records purged from live tables
 * 
 * RECOVERY:
 * Archived data can be recovered using recovery tokens
 * for compliance audits, legal requests, or customer data export.
 */

class ArchivedRecord extends BaseModel {
  static tableName = 'archived_records';
  static primaryKey = 'id';
  static timestamps = false; // Only created_at
  
  static fields = [
    'id',
    // Source identification
    'original_table', 'original_id', 'original_schema',
    // Archive location
    'archive_provider', 'archive_bucket', 'archive_key',
    'archive_url', 'archive_format', 'archive_size_bytes',
    // Content info
    'record_count', 'data_summary', 'compression_algorithm',
    // Integrity
    'checksum', 'checksum_algorithm', 'encryption_key_id',
    'is_encrypted', 'encryption_algorithm',
    // Retention
    'retention_policy_id', 'retention_until',
    'archival_reason', 'archival_batch_id',
    // Recovery
    'is_recoverable', 'recovery_count',
    'last_recovered_at', 'last_recovered_by',
    // Metadata
    'metadata', 'tags',
    'tenant_id', 'created_at', 'created_by',
  ];

  static casts = {
    data_summary: 'json',
    metadata: 'json',
    tags: 'json',
    record_count: 'integer',
    archive_size_bytes: 'integer',
    is_encrypted: 'boolean',
    is_recoverable: 'boolean',
    recovery_count: 'integer',
  };

  /**
   * Record an archival operation
   * @param {Object} params - Archival parameters
   */
  static async recordArchival(params = {}) {
    const checksum = params.checksum || this._generateChecksum(params.dataSummary);

    return this.create({
      original_table: params.originalTable,
      original_id: params.originalId || null,
      original_schema: params.originalSchema || 'public',
      archive_provider: params.provider || 'aws_s3',
      archive_bucket: params.bucket,
      archive_key: params.key,
      archive_url: params.url || null,
      archive_format: params.format || 'json',
      archive_size_bytes: params.sizeBytes || 0,
      record_count: params.recordCount || 0,
      data_summary: params.dataSummary || {},
      compression_algorithm: params.compression || 'gzip',
      checksum,
      checksum_algorithm: params.checksumAlgorithm || 'sha256',
      encryption_key_id: params.encryptionKeyId || null,
      is_encrypted: params.isEncrypted !== false,
      encryption_algorithm: params.encryptionAlgorithm || 'aes-256-gcm',
      retention_policy_id: params.retentionPolicyId || null,
      retention_until: params.retentionUntil || null,
      archival_reason: params.reason || 'scheduled',
      archival_batch_id: params.batchId || null,
      is_recoverable: true,
      metadata: params.metadata || {},
      tags: params.tags || [],
      tenant_id: params.tenantId || null,
      created_by: params.createdBy || 'system',
    });
  }

  /**
   * Find archived records by original table
   * @param {string} tableName - Original table name
   */
  static async findByOriginalTable(tableName) {
    return this.findAll({
      where: { original_table: tableName },
      orderBy: { created_at: 'DESC' },
    });
  }

  /**
   * Find archived records by original record
   * @param {string} tableName - Original table name
   * @param {string} recordId - Original record ID
   */
  static async findByOriginalRecord(tableName, recordId) {
    return this.findOne({
      where: {
        original_table: tableName,
        original_id: String(recordId),
      },
    });
  }

  /**
   * Get archives approaching expiration
   * @param {number} daysBeforeExpiry - Days before expiration to alert
   */
  static async getExpiringArchives(daysBeforeExpiry = 30) {
    const text = `
      SELECT *
      FROM ${this.tableName}
      WHERE retention_until IS NOT NULL
        AND retention_until > NOW()
        AND retention_until < NOW() + INTERVAL '${daysBeforeExpiry} days'
      ORDER BY retention_until ASC
    `;
    
    const result = await connectionPool.query(text);
    return result.rows;
  }

  /**
   * Get archives past retention (ready for purge)
   */
  static async getExpiredArchives() {
    return this.findAll({
      where: {
        retention_until: { operator: '<', value: new Date().toISOString() },
        is_recoverable: false,
      },
    });
  }

  /**
   * Mark archive as recovered
   * @param {string} archiveId - Archive ID
   * @param {string} recoveredBy - User who recovered
   */
  static async recordRecovery(archiveId, recoveredBy) {
    return this.update({ id: archiveId }, {
      recovery_count: connectionPool.raw('recovery_count + 1'),
      last_recovered_at: new Date().toISOString(),
      last_recovered_by: recoveredBy,
    });
  }

  /**
   * Mark archive as unrecoverable (past retention)
   * @param {string} archiveId - Archive ID
   */
  static async markUnrecoverable(archiveId) {
    return this.update({ id: archiveId }, {
      is_recoverable: false,
    });
  }

  /**
   * Get archival statistics
   */
  static async getArchivalStats() {
    const text = `
      SELECT
        original_table,
        COUNT(*) as archive_count,
        SUM(record_count) as total_records,
        SUM(archive_size_bytes) as total_size_bytes,
        MIN(created_at) as oldest_archive,
        MAX(created_at) as newest_archive
      FROM ${this.tableName}
      GROUP BY original_table
      ORDER BY total_size_bytes DESC
    `;
    
    const result = await connectionPool.query(text);
    return result.rows;
  }

  /**
   * Generate checksum for data integrity
   * @private
   */
  static _generateChecksum(data) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }
}

module.exports = ArchivedRecord;