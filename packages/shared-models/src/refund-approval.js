const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Refund Approval Model - Refund Approval Record
 * 
 * Records the approval workflow for refund requests.
 * Tracks multi-level approvals, rejection reasons,
 * and the complete decision history for each refund.
 * 
 * TABLE: refund_approvals
 * 
 * APPROVAL WORKFLOW:
 * 1. Customer submits refund request
 * 2. System auto-approves if within policy
 * 3. Manual review if exceeds thresholds
 * 4. Supervisor approval for high-value refunds
 * 5. Manager approval for exceptional cases
 * 6. Finance approval for bank transfers
 */

class RefundApproval extends BaseModel {
  static tableName = 'refund_approvals';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'refund_request_id', 'order_id', 'user_id',
    // Approval level
    'approval_level', 'approval_type', 'approval_status',
    'is_auto_approved', 'auto_approval_rule',
    'requires_manual_review', 'manual_review_reason',
    // Approver details
    'approver_id', 'approver_name', 'approver_role',
    'approver_email', 'approver_department',
    'approved_at', 'approved_from_ip',
    // Decision
    'decision', 'decision_reason', 'decision_category',
    'decision_notes', 'decision_duration_seconds',
    // Financial details
    'requested_amount', 'requested_currency',
    'approved_amount', 'approved_currency',
    'adjusted_amount', 'adjustment_reason',
    'restocking_fee_percent', 'restocking_fee_amount',
    'shipping_refunded', 'shipping_refund_amount',
    'tax_refunded', 'tax_refund_amount',
    'net_refund_amount', 'refund_method',
    'refund_method_reason', 'alternative_method_offered',
    // Conditions
    'conditions', 'conditions_notes',
    'return_required', 'return_window_days',
    'return_label_provided', 'return_label_url',
    'original_packaging_required', 'tags_required',
    'inspection_required', 'inspection_location',
    // Escalation
    'is_escalated', 'escalated_from', 'escalated_to',
    'escalation_reason', 'escalation_notes',
    'previous_approval_id',
    // Rejection
    'rejection_reason', 'rejection_category',
    'rejection_detail', 'rejection_appealable',
    'appeal_instructions', 'appeal_deadline',
    // Policy reference
    'policy_applied', 'policy_version',
    'policy_exception', 'policy_exception_reason',
    'policy_exception_approved_by',
    // Compliance
    'compliance_checked', 'compliance_notes',
    'fraud_checked', 'fraud_score', 'fraud_notes',
    // Notifications
    'customer_notified', 'customer_notification_date',
    'merchant_notified', 'merchant_notification_date',
    'notification_channel',
    // Audit
    'audit_trail', 'status_history',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    approval_level: 'integer', decision_duration_seconds: 'integer',
    return_window_days: 'integer',
    requested_amount: 'float', approved_amount: 'float',
    adjusted_amount: 'float', restocking_fee_percent: 'float',
    restocking_fee_amount: 'float', shipping_refund_amount: 'float',
    tax_refund_amount: 'float', net_refund_amount: 'float',
    fraud_score: 'float',
    is_auto_approved: 'boolean', requires_manual_review: 'boolean',
    return_required: 'boolean', return_label_provided: 'boolean',
    original_packaging_required: 'boolean', tags_required: 'boolean',
    inspection_required: 'boolean', is_escalated: 'boolean',
    shipping_refunded: 'boolean', tax_refunded: 'boolean',
    rejection_appealable: 'boolean', policy_exception: 'boolean',
    compliance_checked: 'boolean', fraud_checked: 'boolean',
    customer_notified: 'boolean', merchant_notified: 'boolean',
    alternative_method_offered: 'boolean',
    conditions: 'json', audit_trail: 'json', status_history: 'json',
    metadata: 'json', tags: 'json',
  };

  static relations = {
    refundRequest: { type: 'belongsTo', model: 'RefundRequest', foreignKey: 'refund_request_id', ownerKey: 'id' },
    order: { type: 'belongsTo', model: 'Order', foreignKey: 'order_id', ownerKey: 'id' },
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
  };

  static decisionTypes = {
    APPROVED: 'approved', APPROVED_WITH_CONDITIONS: 'approved_with_conditions',
    PARTIALLY_APPROVED: 'partially_approved', DENIED: 'denied',
    ESCALATED: 'escalated', PENDING_INFO: 'pending_info',
    CANCELLED: 'cancelled',
  };

  static approvalLevels = {
    SYSTEM_AUTO: 0, SUPPORT_AGENT: 1, SENIOR_AGENT: 2,
    SUPERVISOR: 3, MANAGER: 4, FINANCE: 5, EXECUTIVE: 6,
  };

  /**
   * Auto-approve a refund within policy
   */
  static async autoApprove(refundRequestId, policyResult, options = {}) {
    return this.create({
      refund_request_id: refundRequestId, order_id: options.orderId,
      user_id: options.userId, approval_level: this.approvalLevels.SYSTEM_AUTO,
      approval_type: 'auto', approval_status: 'completed',
      is_auto_approved: true, auto_approval_rule: policyResult.rule || 'within_policy',
      decision: this.decisionTypes.APPROVED,
      decision_reason: 'Automatically approved within refund policy',
      decision_duration_seconds: 0,
      requested_amount: options.requestedAmount, requested_currency: options.currency,
      approved_amount: options.requestedAmount, approved_currency: options.currency,
      net_refund_amount: options.requestedAmount - (options.restockingFee || 0),
      restocking_fee_percent: options.restockingFee || 0,
      restocking_fee_amount: (options.requestedAmount * (options.restockingFee || 0)) / 100,
      refund_method: options.refundMethod || 'original_payment',
      return_required: options.returnRequired || false,
      return_window_days: options.returnWindowDays || 14,
      policy_applied: policyResult.policyName, policy_version: policyResult.policyVersion,
      compliance_checked: true, fraud_checked: true, fraud_score: 0,
      conditions: options.conditions || {},
      metadata: options.metadata || {}, tenant_id: options.tenantId,
    });
  }

  /**
   * Manual approval by staff
   */
  static async approve(refundRequestId, approverId, decision, details = {}) {
    return this.create({
      refund_request_id: refundRequestId, order_id: details.orderId,
      user_id: details.userId, approval_level: details.approvalLevel || this.approvalLevels.SUPPORT_AGENT,
      approval_type: 'manual', approval_status: 'completed',
      approver_id: approverId, approver_name: details.approverName,
      approver_role: details.approverRole, approver_email: details.approverEmail,
      approved_at: new Date().toISOString(), decision,
      decision_reason: details.reason, decision_category: details.category,
      decision_notes: details.notes?.substring(0, 1000),
      decision_duration_seconds: details.durationSeconds || 0,
      requested_amount: details.requestedAmount, requested_currency: details.currency,
      approved_amount: details.approvedAmount || details.requestedAmount,
      adjusted_amount: details.adjustedAmount,
      adjustment_reason: details.adjustmentReason,
      restocking_fee_percent: details.restockingFeePercent || 0,
      restocking_fee_amount: details.restockingFeeAmount || 0,
      shipping_refunded: details.shippingRefunded || false,
      shipping_refund_amount: details.shippingRefundAmount || 0,
      tax_refunded: details.taxRefunded !== false,
      net_refund_amount: details.netRefundAmount,
      refund_method: details.refundMethod, return_required: details.returnRequired || false,
      return_window_days: details.returnWindowDays || 14,
      return_label_provided: details.returnLabelProvided || false,
      return_label_url: details.returnLabelUrl,
      original_packaging_required: details.originalPackagingRequired || false,
      conditions: details.conditions || {}, conditions_notes: details.conditionsNotes,
      policy_applied: details.policyApplied, policy_version: details.policyVersion,
      policy_exception: details.policyException || false,
      policy_exception_reason: details.policyExceptionReason,
      policy_exception_approved_by: details.policyExceptionApprovedBy,
      compliance_checked: true, fraud_checked: details.fraudChecked !== false,
      fraud_score: details.fraudScore || 0,
      metadata: details.metadata || {}, tenant_id: details.tenantId,
    });
  }

  /**
   * Deny a refund request
   */
  static async deny(refundRequestId, approverId, reason, details = {}) {
    return this.create({
      refund_request_id: refundRequestId, order_id: details.orderId,
      user_id: details.userId, approval_level: details.approvalLevel || this.approvalLevels.SUPPORT_AGENT,
      approval_type: 'manual', approval_status: 'completed',
      approver_id: approverId, approver_name: details.approverName,
      approved_at: new Date().toISOString(),
      decision: this.decisionTypes.DENIED, decision_reason: reason,
      decision_category: details.category || 'policy_violation',
      decision_notes: details.notes?.substring(0, 1000),
      requested_amount: details.requestedAmount, requested_currency: details.currency,
      rejection_reason: reason, rejection_category: details.rejectionCategory,
      rejection_detail: details.rejectionDetail?.substring(0, 1000),
      rejection_appealable: details.appealable !== false,
      appeal_instructions: details.appealInstructions,
      appeal_deadline: details.appealDeadline,
      policy_applied: details.policyApplied,
      compliance_checked: true, fraud_checked: details.fraudChecked !== false,
      metadata: details.metadata || {}, tenant_id: details.tenantId,
    });
  }

  /**
   * Escalate to higher approval level
   */
  static async escalate(approvalId, escalatedTo, reason, escalatedBy) {
    const current = await this.findById(approvalId);
    return this.create({
      refund_request_id: current.refund_request_id, order_id: current.order_id,
      user_id: current.user_id, approval_level: escalatedTo,
      approval_type: 'escalation', approval_status: 'pending',
      is_escalated: true, escalated_from: current.approval_level,
      escalated_to: escalatedTo, escalation_reason: reason,
      escalation_notes: `Escalated by ${escalatedBy} from level ${current.approval_level}`,
      previous_approval_id: approvalId,
      requested_amount: current.requested_amount, requested_currency: current.requested_currency,
      metadata: current.metadata || {}, tenant_id: current.tenant_id,
    });
  }

  /**
   * Find approval by refund request
   */
  static async findByRefundRequest(refundRequestId) {
    return this.findAll({
      where: { refund_request_id: refundRequestId },
      orderBy: { created_at: 'DESC' },
    });
  }
}

module.exports = RefundApproval;