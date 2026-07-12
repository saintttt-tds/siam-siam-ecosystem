const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Refund Timeline Model - Refund Processing Timeline
 * 
 * Tracks every step in the refund processing lifecycle with timestamps,
 * durations, and status changes. Provides complete audit trail for
 * customer communication and SLA monitoring.
 * 
 * TABLE: refund_timelines
 * 
 * TRACKED STEPS:
 * - request_submitted: Customer submits refund request
 * - request_acknowledged: System acknowledges receipt
 * - under_review: Request assigned for review
 * - evidence_requested: Additional evidence requested
 * - evidence_provided: Customer provides evidence
 * - approved: Refund approved
 * - denied: Refund denied
 * - processing: Refund being processed
 * - payment_initiated: Payment to customer initiated
 * - payment_completed: Funds sent to customer
 * - completed: Refund fully processed
 * - return_label_sent: Return shipping label provided
 * - return_shipped: Customer shipped return
 * - return_in_transit: Return package in transit
 * - return_received: Return package received
 * - return_inspected: Return package inspected
 */

class RefundTimeline extends BaseModel {
  static tableName = 'refund_timelines';
  static primaryKey = 'id';
  static timestamps = false;
  
  static fields = [
    'id', 'refund_request_id', 'order_id', 'user_id',
    // Timeline event
    'event_type', 'event_subtype', 'event_status',
    'event_description', 'event_sequence',
    // Timing
    'event_timestamp', 'duration_from_previous_seconds',
    'duration_from_start_seconds', 'total_elapsed_seconds',
    // Actor
    'actor_id', 'actor_name', 'actor_type', 'actor_role',
    'automated', 'automation_rule',
    // State changes
    'previous_status', 'new_status', 'previous_sub_status',
    'new_sub_status', 'status_change_reason',
    // Financial changes
    'previous_amount', 'new_amount', 'amount_difference',
    'previous_refund_method', 'new_refund_method',
    // Customer communication
    'customer_notified', 'notification_type',
    'notification_channel', 'notification_status',
    'notification_message', 'notification_sent_at',
    // Merchant notification
    'merchant_notified', 'merchant_notification_channel',
    'merchant_notification_sent_at',
    // SLA tracking
    'sla_target_seconds', 'sla_met', 'sla_breach',
    'sla_breach_reason', 'sla_recovery_action',
    // Processing details
    'processor', 'processor_reference', 'processor_status',
    'processor_response', 'processor_error',
    'payment_gateway', 'gateway_transaction_id',
    'gateway_status', 'gateway_response',
    // Return tracking
    'return_label_generated', 'return_label_url',
    'return_tracking_number', 'return_carrier',
    'return_shipped_at', 'return_delivered_at',
    'return_received_by', 'return_condition_notes',
    // Evidence
    'evidence_requested', 'evidence_type',
    'evidence_provided', 'evidence_urls',
    // Notes
    'internal_notes', 'customer_visible_notes',
    'system_notes',
    // Metadata
    'metadata', 'tags',
    'tenant_id', 'created_at',
  ];

  static casts = {
    event_sequence: 'integer',
    duration_from_previous_seconds: 'integer',
    duration_from_start_seconds: 'integer',
    total_elapsed_seconds: 'integer',
    sla_target_seconds: 'integer',
    previous_amount: 'float', new_amount: 'float',
    amount_difference: 'float',
    automated: 'boolean', customer_notified: 'boolean',
    merchant_notified: 'boolean', sla_met: 'boolean',
    sla_breach: 'boolean', return_label_generated: 'boolean',
    evidence_requested: 'boolean', evidence_provided: 'boolean',
    evidence_urls: 'json', processor_response: 'json',
    gateway_response: 'json', metadata: 'json', tags: 'json',
  };

  static relations = {
    refundRequest: { type: 'belongsTo', model: 'RefundRequest', foreignKey: 'refund_request_id', ownerKey: 'id' },
  };

  static eventTypes = {
    REQUEST_SUBMITTED: 'request_submitted',
    REQUEST_ACKNOWLEDGED: 'request_acknowledged',
    UNDER_REVIEW: 'under_review',
    EVIDENCE_REQUESTED: 'evidence_requested',
    EVIDENCE_PROVIDED: 'evidence_provided',
    APPROVED: 'approved',
    DENIED: 'denied',
    PROCESSING: 'processing',
    PAYMENT_INITIATED: 'payment_initiated',
    PAYMENT_COMPLETED: 'payment_completed',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    ESCALATED: 'escalated',
    RETURN_LABEL_SENT: 'return_label_sent',
    RETURN_SHIPPED: 'return_shipped',
    RETURN_IN_TRANSIT: 'return_in_transit',
    RETURN_RECEIVED: 'return_received',
    RETURN_INSPECTED: 'return_inspected',
    CUSTOMER_NOTIFIED: 'customer_notified',
    MERCHANT_NOTIFIED: 'merchant_notified',
    NOTE_ADDED: 'note_added',
    STATUS_CHANGE: 'status_change',
    AMOUNT_ADJUSTED: 'amount_adjusted',
    METHOD_CHANGED: 'method_changed',
    SLA_WARNING: 'sla_warning',
    SLA_BREACHED: 'sla_breached',
  };

  /**
   * Record a timeline event
   */
  static async recordEvent(refundRequestId, eventType, eventData = {}) {
    // Get previous event for duration calculation
    const previousEvent = await this.findOne({
      where: { refund_request_id: refundRequestId },
      orderBy: { event_sequence: 'DESC' },
    });

    const eventSequence = (previousEvent?.event_sequence || 0) + 1;
    const now = new Date();
    const durationFromPrevious = previousEvent
      ? Math.floor((now.getTime() - new Date(previousEvent.event_timestamp).getTime()) / 1000)
      : 0;

    const firstEvent = eventSequence === 1 ? null : await this.findOne({
      where: { refund_request_id: refundRequestId, event_sequence: 1 },
    });

    const durationFromStart = firstEvent
      ? Math.floor((now.getTime() - new Date(firstEvent.event_timestamp).getTime()) / 1000)
      : 0;

    return this.create({
      refund_request_id: refundRequestId,
      order_id: eventData.orderId,
      user_id: eventData.userId,
      event_type: eventType,
      event_subtype: eventData.eventSubtype,
      event_status: eventData.eventStatus || 'completed',
      event_description: eventData.description?.substring(0, 1000),
      event_sequence: eventSequence,
      event_timestamp: now.toISOString(),
      duration_from_previous_seconds: durationFromPrevious,
      duration_from_start_seconds: durationFromStart,
      total_elapsed_seconds: durationFromStart,
      actor_id: eventData.actorId || 'system',
      actor_name: eventData.actorName,
      actor_type: eventData.actorType || 'system',
      actor_role: eventData.actorRole,
      automated: eventData.automated || false,
      automation_rule: eventData.automationRule,
      previous_status: eventData.previousStatus || previousEvent?.new_status,
      new_status: eventData.newStatus,
      previous_sub_status: eventData.previousSubStatus,
      new_sub_status: eventData.newSubStatus,
      status_change_reason: eventData.statusChangeReason?.substring(0, 500),
      previous_amount: eventData.previousAmount,
      new_amount: eventData.newAmount,
      amount_difference: eventData.amountDifference,
      previous_refund_method: eventData.previousRefundMethod,
      new_refund_method: eventData.newRefundMethod,
      customer_notified: eventData.customerNotified || false,
      notification_type: eventData.notificationType,
      notification_channel: eventData.notificationChannel,
      notification_status: eventData.notificationStatus,
      notification_message: eventData.notificationMessage?.substring(0, 1000),
      notification_sent_at: eventData.notificationSentAt,
      merchant_notified: eventData.merchantNotified || false,
      merchant_notification_channel: eventData.merchantNotificationChannel,
      merchant_notification_sent_at: eventData.merchantNotificationSentAt,
      sla_target_seconds: eventData.slaTargetSeconds,
      sla_met: eventData.slaMet,
      sla_breach: eventData.slaBreach || false,
      sla_breach_reason: eventData.slaBreachReason,
      sla_recovery_action: eventData.slaRecoveryAction,
      processor: eventData.processor,
      processor_reference: eventData.processorReference,
      processor_status: eventData.processorStatus,
      processor_response: eventData.processorResponse,
      processor_error: eventData.processorError?.substring(0, 500),
      payment_gateway: eventData.paymentGateway,
      gateway_transaction_id: eventData.gatewayTransactionId,
      gateway_status: eventData.gatewayStatus,
      gateway_response: eventData.gatewayResponse,
      return_label_generated: eventData.returnLabelGenerated || false,
      return_label_url: eventData.returnLabelUrl,
      return_tracking_number: eventData.returnTrackingNumber,
      return_carrier: eventData.returnCarrier,
      return_shipped_at: eventData.returnShippedAt,
      return_delivered_at: eventData.returnDeliveredAt,
      return_received_by: eventData.returnReceivedBy,
      return_condition_notes: eventData.returnConditionNotes?.substring(0, 500),
      evidence_requested: eventData.evidenceRequested || false,
      evidence_type: eventData.evidenceType,
      evidence_provided: eventData.evidenceProvided || false,
      evidence_urls: eventData.evidenceUrls,
      internal_notes: eventData.internalNotes?.substring(0, 1000),
      customer_visible_notes: eventData.customerVisibleNotes?.substring(0, 1000),
      system_notes: eventData.systemNotes?.substring(0, 500),
      metadata: eventData.metadata || {},
      tenant_id: eventData.tenantId,
    });
  }

  /**
   * Get complete timeline for a refund request
   */
  static async getTimeline(refundRequestId) {
    return this.findAll({
      where: { refund_request_id: refundRequestId },
      orderBy: { event_sequence: 'ASC' },
    });
  }

  /**
   * Get current status from timeline
   */
  static async getCurrentStatus(refundRequestId) {
    const lastEvent = await this.findOne({
      where: { refund_request_id: refundRequestId },
      orderBy: { event_sequence: 'DESC' },
    });
    return lastEvent ? { status: lastEvent.new_status, subStatus: lastEvent.new_sub_status, lastEvent: lastEvent.event_type, lastEventAt: lastEvent.event_timestamp } : null;
  }

  /**
   * Get SLA performance metrics
   */
  static async getSLAMetrics(startDate = null, endDate = null) {
    const text = `
      SELECT
        COUNT(*) as total_events,
        COUNT(CASE WHEN sla_breach = true THEN 1 END) as sla_breaches,
        ROUND(100.0 * COUNT(CASE WHEN sla_breach = true THEN 1 END) / NULLIF(COUNT(CASE WHEN sla_target_seconds IS NOT NULL THEN 1 END), 0), 2) as breach_rate,
        AVG(duration_from_start_seconds) as avg_completion_seconds,
        AVG(CASE WHEN sla_met = true THEN duration_from_start_seconds END) as avg_sla_met_seconds
      FROM ${this.tableName}
      WHERE 1=1
        ${startDate ? 'AND event_timestamp >= $1' : ''}
        ${endDate ? `AND event_timestamp <= $${startDate ? 2 : 1}` : ''}
    `;
    const values = [];
    if (startDate) values.push(startDate);
    if (endDate) values.push(endDate);
    const result = await connectionPool.query(text, values.length > 0 ? values : undefined);
    return result.rows[0];
  }

  /**
   * Get average time between events by event type
   */
  static async getAverageDurationByEventType() {
    const text = `
      SELECT
        event_type,
        COUNT(*) as occurrence_count,
        AVG(duration_from_previous_seconds) as avg_duration_seconds,
        MIN(duration_from_previous_seconds) as min_duration_seconds,
        MAX(duration_from_previous_seconds) as max_duration_seconds,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_from_previous_seconds) as median_duration_seconds,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_from_previous_seconds) as p95_duration_seconds
      FROM ${this.tableName}
      WHERE duration_from_previous_seconds IS NOT NULL
      GROUP BY event_type
      ORDER BY avg_duration_seconds DESC
    `;
    const result = await connectionPool.query(text);
    return result.rows;
  }
}

module.exports = RefundTimeline;