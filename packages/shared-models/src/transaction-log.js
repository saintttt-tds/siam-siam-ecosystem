const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Transaction Log Model - Immutable Transaction Audit Trail
 * 
 * Append-only log of all state changes, status transitions,
 * and significant events in a transaction's lifecycle.
 * Used for financial auditing, reconciliation, and compliance.
 * 
 * TABLE: transaction_logs
 * 
 * LOGGED EVENTS:
 * - status_change: Transaction status changed
 * - amount_adjustment: Transaction amount modified
 * - processor_callback: External processor webhook received
 * - manual_intervention: Admin manually modified transaction
 * - refund_initiated: Refund process started
 * - dispute_filed: Chargeback or dispute filed
 * - settlement: Transaction included in settlement batch
 * - reconciliation: Transaction reconciled
 * - note_added: Internal note added
 * - fraud_check: Fraud assessment completed
 * - compliance_check: Compliance review completed
 */

class TransactionLog extends BaseModel {
  static tableName = 'transaction_logs';
  static primaryKey = 'id';
  static timestamps = false;
  
  static fields = [
    'id', 'transaction_id', 'order_id', 'user_id',
    'event_type', 'event_subtype', 'event_category',
    'event_description', 'event_sequence',
    'previous_status', 'new_status',
    'previous_amount', 'new_amount', 'amount_difference',
    'previous_currency', 'new_currency',
    'changes', 'change_summary',
    'actor_id', 'actor_name', 'actor_type', 'actor_role',
    'actor_ip', 'actor_user_agent',
    'automated', 'automation_rule', 'automation_trigger',
    'processor_event', 'processor_reference',
    'processor_raw_data', 'processor_webhook_id',
    'approval_id', 'approval_required', 'approval_granted',
    'approval_granted_by', 'approval_denied_reason',
    'error_code', 'error_message', 'error_detail',
    'retry_attempt', 'retry_of_log_id',
    'notification_sent', 'notification_channel',
    'notification_recipient', 'notification_status',
    'compliance_relevant', 'audit_required',
    'source_system', 'source_event_id',
    'correlation_id', 'trace_id',
    'metadata', 'tags',
    'tenant_id', 'created_at',
  ];

  static casts = {
    event_sequence: 'integer', retry_attempt: 'integer',
    previous_amount: 'float', new_amount: 'float',
    amount_difference: 'float',
    changes: 'json', change_summary: 'json',
    processor_raw_data: 'json', metadata: 'json', tags: 'json',
    automated: 'boolean', approval_required: 'boolean',
    approval_granted: 'boolean', notification_sent: 'boolean',
    compliance_relevant: 'boolean', audit_required: 'boolean',
  };

  static relations = {
    transaction: { type: 'belongsTo', model: 'Transaction', foreignKey: 'transaction_id', ownerKey: 'id' },
  };

  static eventTypes = {
    STATUS_CHANGE: 'status_change',
    AMOUNT_ADJUSTMENT: 'amount_adjustment',
    PROCESSOR_CALLBACK: 'processor_callback',
    PROCESSOR_RESPONSE: 'processor_response',
    MANUAL_INTERVENTION: 'manual_intervention',
    REFUND_INITIATED: 'refund_initiated',
    REFUND_COMPLETED: 'refund_completed',
    REFUND_FAILED: 'refund_failed',
    DISPUTE_FILED: 'dispute_filed',
    DISPUTE_RESOLVED: 'dispute_resolved',
    SETTLEMENT: 'settlement',
    RECONCILIATION: 'reconciliation',
    NOTE_ADDED: 'note_added',
    FRAUD_CHECK: 'fraud_check',
    COMPLIANCE_CHECK: 'compliance_check',
    RETRY_ATTEMPT: 'retry_attempt',
    EXPIRY: 'expiry',
    IDEMPOTENCY_RETURN: 'idempotency_return',
  };

  /**
   * Log a transaction event
   */
  static async log(transactionId, eventType, previousStatus, newStatus, metadata = {}) {
    // Get sequence number
    const lastLog = await this.findOne({
      where: { transaction_id: transactionId },
      orderBy: { event_sequence: 'DESC' },
    });
    const sequence = (lastLog?.event_sequence || 0) + 1;

    return this.create({
      transaction_id: transactionId,
      order_id: metadata.orderId,
      user_id: metadata.userId,
      event_type: eventType,
      event_subtype: metadata.eventSubtype,
      event_category: metadata.eventCategory,
      event_description: metadata.description?.substring(0, 1000),
      event_sequence: sequence,
      previous_status: previousStatus,
      new_status: newStatus,
      previous_amount: metadata.previousAmount,
      new_amount: metadata.newAmount,
      amount_difference: metadata.amountDifference,
      previous_currency: metadata.previousCurrency,
      new_currency: metadata.newCurrency,
      changes: metadata.changes || {},
      change_summary: metadata.changeSummary,
      actor_id: metadata.actorId || 'system',
      actor_name: metadata.actorName,
      actor_type: metadata.actorType || 'system',
      actor_role: metadata.actorRole,
      actor_ip: metadata.actorIp,
      actor_user_agent: metadata.actorUserAgent?.substring(0, 500),
      automated: metadata.automated || false,
      automation_rule: metadata.automationRule,
      automation_trigger: metadata.automationTrigger,
      processor_event: metadata.processorEvent,
      processor_reference: metadata.processorReference,
      processor_raw_data: metadata.processorRawData,
      processor_webhook_id: metadata.processorWebhookId,
      approval_id: metadata.approvalId,
      approval_required: metadata.approvalRequired || false,
      approval_granted: metadata.approvalGranted,
      approval_granted_by: metadata.approvalGrantedBy,
      error_code: metadata.errorCode,
      error_message: metadata.errorMessage?.substring(0, 1000),
      retry_attempt: metadata.retryAttempt,
      retry_of_log_id: metadata.retryOfLogId,
      notification_sent: metadata.notificationSent || false,
      notification_channel: metadata.notificationChannel,
      notification_recipient: metadata.notificationRecipient,
      compliance_relevant: metadata.complianceRelevant || false,
      audit_required: metadata.auditRequired !== false,
      source_system: metadata.sourceSystem || process.env.SERVICE_NAME || 'unknown',
      source_event_id: metadata.sourceEventId,
      correlation_id: metadata.correlationId,
      trace_id: metadata.traceId,
      metadata: metadata.metadata || {},
      tags: metadata.tags || [],
      tenant_id: metadata.tenantId,
    });
  }

  /**
   * Get complete audit trail for a transaction
   */
  static async getAuditTrail(transactionId) {
    return this.findAll({
      where: { transaction_id: transactionId },
      orderBy: { event_sequence: 'ASC' },
    });
  }

  /**
   * Get recent events by type
   */
  static async getRecentByType(eventType, limit = 100) {
    return this.findAll({
      where: { event_type: eventType },
      orderBy: { created_at: 'DESC' },
      limit,
    });
  }

  /**
   * Get events requiring audit review
   */
  static async getAuditRequired(limit = 100) {
    return this.findAll({
      where: { audit_required: true, approval_granted: false },
      orderBy: { created_at: 'ASC' },
      limit,
    });
  }
}

module.exports = TransactionLog;