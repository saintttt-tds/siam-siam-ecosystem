const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Recovery Token Model - Data Recovery Authorization Token
 * 
 * Secure tokens generated to authorize data recovery operations
 * from archives. Tokens are time-limited, single-use, and require
 * appropriate authorization for generation.
 * 
 * TABLE: recovery_tokens
 */

class RecoveryToken extends BaseModel {
  static tableName = 'recovery_tokens';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'archived_record_id', 'token_hash',
    'token_prefix', 'token_type',
    'requested_by', 'requested_by_name', 'requested_by_email',
    'request_reason', 'request_notes',
    'approved_by', 'approved_by_name', 'approved_at',
    'approval_notes', 'is_used', 'used_at',
    'used_by', 'used_by_name', 'used_from_ip',
    'expires_at', 'max_uses', 'use_count',
    'recovery_data_type', 'recovery_scope',
    'recovery_tables', 'recovery_filters',
    'estimated_record_count', 'estimated_size_bytes',
    'actual_record_count', 'actual_size_bytes',
    'recovery_status', 'recovery_started_at',
    'recovery_completed_at', 'recovery_duration_ms',
    'recovery_error', 'recovery_result_url',
    'is_expired', 'expired_at', 'revoked_at',
    'revoked_by', 'revocation_reason',
    'notifications_sent', 'notification_recipients',
    'audit_logged', 'compliance_approved',
    'metadata', 'tags', 'tenant_id',
    'created_at', 'updated_at',
  ];

  static casts = {
    is_used: 'boolean', is_expired: 'boolean',
    max_uses: 'integer', use_count: 'integer',
    estimated_record_count: 'integer', actual_record_count: 'integer',
    estimated_size_bytes: 'integer', actual_size_bytes: 'integer',
    recovery_duration_ms: 'integer',
    audit_logged: 'boolean', compliance_approved: 'boolean',
    notifications_sent: 'boolean',
    recovery_tables: 'json', recovery_filters: 'json',
    notification_recipients: 'json', metadata: 'json', tags: 'json',
  };

  static tokenTypes = {
    DATA_RECOVERY: 'data_recovery', GDPR_EXPORT: 'gdpr_export',
    LEGAL_DISCOVERY: 'legal_discovery', AUDIT_REQUEST: 'audit_request',
    CUSTOMER_REQUEST: 'customer_request',
  };

  /**
   * Generate a recovery token
   */
  static async generate(archivedRecordId, requestedBy, options = {}) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await this.create({
      archived_record_id: archivedRecordId, token_hash: tokenHash,
      token_prefix: token.substring(0, 8), token_type: options.tokenType || this.tokenTypes.DATA_RECOVERY,
      requested_by: requestedBy, requested_by_name: options.requestedByName,
      requested_by_email: options.requestedByEmail,
      request_reason: options.reason?.substring(0, 1000),
      request_notes: options.notes?.substring(0, 1000),
      expires_at: options.expiresAt || new Date(Date.now() + (options.expiryHours || 48) * 3600000).toISOString(),
      max_uses: options.maxUses || 1, recovery_scope: options.scope || 'specific',
      recovery_tables: options.tables, recovery_filters: options.filters,
      estimated_record_count: options.estimatedRecordCount,
      recovery_status: 'pending', compliance_approved: options.complianceApproved || false,
      metadata: options.metadata || {}, tenant_id: options.tenantId,
    });

    return token;
  }

  /**
   * Validate a recovery token
   */
  static async validate(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const recoveryToken = await this.findOne({
      where: { token_hash: tokenHash, is_used: false, is_expired: false },
    });
    if (!recoveryToken) return null;
    if (new Date(recoveryToken.expires_at) < new Date()) {
      await this.update({ id: recoveryToken.id }, { is_expired: true, expired_at: new Date().toISOString() });
      return null;
    }
    return recoveryToken;
  }

  /**
   * Use a recovery token
   */
  static async use(token, usedBy, options = {}) {
    const validated = await this.validate(token);
    if (!validated) throw new Error('Invalid or expired recovery token');

    const newUseCount = validated.use_count + 1;
    const isFullyUsed = newUseCount >= validated.max_uses;

    return this.update({ id: validated.id }, {
      is_used: isFullyUsed, used_at: new Date().toISOString(),
      used_by: usedBy, used_by_name: options.usedByName,
      used_from_ip: options.ip, use_count: newUseCount,
      recovery_status: isFullyUsed ? 'completed' : 'in_progress',
      recovery_started_at: new Date().toISOString(),
      actual_record_count: options.actualRecordCount,
      actual_size_bytes: options.actualSizeBytes,
    });
  }

  /**
   * Complete recovery
   */
  static async completeRecovery(tokenId, resultUrl, stats = {}) {
    return this.update({ id: tokenId }, {
      recovery_status: 'completed', recovery_completed_at: new Date().toISOString(),
      recovery_duration_ms: stats.durationMs, recovery_result_url: resultUrl,
      actual_record_count: stats.recordCount, actual_size_bytes: stats.sizeBytes,
    });
  }

  /**
   * Revoke a token
   */
  static async revoke(tokenId, revokedBy, reason) {
    return this.update({ id: tokenId }, {
      is_expired: true, expired_at: new Date().toISOString(),
      revoked_at: new Date().toISOString(), revoked_by: revokedBy,
      revocation_reason: reason,
    });
  }
}

module.exports = RecoveryToken;