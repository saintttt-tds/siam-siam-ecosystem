const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Refund Request Model - Customer Refund Request
 * 
 * Central entity for customer refund requests. Tracks the complete
 * lifecycle from submission through approval, processing, and completion.
 * 
 * TABLE: refund_requests
 */

class RefundRequest extends BaseModel {
  static tableName = 'refund_requests';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id', 'order_id', 'order_item_id',
    'transaction_id', 'merchant_id',
    'refund_number', 'refund_type', 'refund_status',
    'sub_status', 'status_history',
    'reason_code', 'reason_detail', 'reason_category',
    'requested_amount', 'requested_currency',
    'approved_amount', 'approved_currency',
    'net_refund_amount', 'refund_method',
    'restocking_fee_percent', 'restocking_fee_amount',
    'shipping_refunded', 'shipping_refund_amount',
    'is_partial', 'partial_quantity', 'partial_reason',
    'evidence_urls', 'evidence_description',
    'customer_notes', 'internal_notes', 'merchant_notes',
    'return_required', 'return_status', 'return_tracking',
    'return_label_url', 'return_deadline',
    'return_received_at', 'return_condition',
    'approved_by', 'approved_at', 'approval_notes',
    'denied_by', 'denied_at', 'denial_reason',
    'processed_by', 'processed_at', 'processing_ref',
    'refund_transaction_id', 'refund_completed_at',
    'cancelled_at', 'cancellation_reason',
    'customer_notified_at', 'merchant_notified_at',
    'sla_deadline', 'sla_breached', 'sla_breach_reason',
    'escalation_level', 'escalated_at',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    requested_amount: 'float', approved_amount: 'float',
    net_refund_amount: 'float', restocking_fee_percent: 'float',
    restocking_fee_amount: 'float', shipping_refund_amount: 'float',
    partial_quantity: 'integer', escalation_level: 'integer',
    evidence_urls: 'json', status_history: 'json',
    metadata: 'json', tags: 'json',
    shipping_refunded: 'boolean', is_partial: 'boolean',
    return_required: 'boolean', sla_breached: 'boolean',
  };

  static relations = {
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
    order: { type: 'belongsTo', model: 'Order', foreignKey: 'order_id', ownerKey: 'id' },
    orderItem: { type: 'belongsTo', model: 'OrderItem', foreignKey: 'order_item_id', ownerKey: 'id' },
    approvals: { type: 'hasMany', model: 'RefundApproval', foreignKey: 'refund_request_id', localKey: 'id' },
  };

  static statuses = {
    PENDING: 'pending', UNDER_REVIEW: 'under_review',
    APPROVED: 'approved', DENIED: 'denied',
    PROCESSING: 'processing', COMPLETED: 'completed',
    FAILED: 'failed', CANCELLED: 'cancelled',
    ESCALATED: 'escalated', AWAITING_RETURN: 'awaiting_return',
  };

  static generateRefundNumber() { return `RFN-${Date.now().toString(36).toUpperCase()}`; }

  /**
   * Submit a refund request
   */
  static async submit(userId, orderId, orderItemId, requestData) {
    return this.create({
      user_id: userId, order_id: orderId, order_item_id: orderItemId,
      merchant_id: requestData.merchantId, transaction_id: requestData.transactionId,
      refund_number: this.generateRefundNumber(),
      refund_type: requestData.refundType || 'full', refund_status: this.statuses.PENDING,
      status_history: [{ status: this.statuses.PENDING, timestamp: new Date().toISOString() }],
      reason_code: requestData.reasonCode, reason_detail: requestData.reasonDetail?.substring(0, 1000),
      reason_category: requestData.reasonCategory,
      requested_amount: requestData.requestedAmount, requested_currency: requestData.currency || 'USD',
      is_partial: requestData.isPartial || false,
      partial_quantity: requestData.partialQuantity,
      evidence_urls: requestData.evidenceUrls || [],
      evidence_description: requestData.evidenceDescription?.substring(0, 1000),
      customer_notes: requestData.customerNotes?.substring(0, 1000),
      sla_deadline: new Date(Date.now() + 3 * 86400000).toISOString(), // 3 business days
      metadata: requestData.metadata || {}, tenant_id: requestData.tenantId,
    });
  }

  /**
   * Find refunds by user
   */
  static async findByUser(userId) {
    return this.paginate({ where: { user_id: userId }, orderBy: { created_at: 'DESC' } });
  }

  /**
   * Find pending refunds
   */
  static async findPending(merchantId = null) {
    const criteria = { status: [this.statuses.PENDING, this.statuses.UNDER_REVIEW, this.statuses.ESCALATED] };
    if (merchantId) criteria.merchant_id = merchantId;
    return this.findAll({ where: criteria, orderBy: { created_at: 'ASC' } });
  }

  /**
   * Update refund status
   */
  static async updateStatus(refundId, status, metadata = {}) {
    const request = await this.findById(refundId);
    const history = request.status_history || [];
    history.push({ from: request.status, to: status, timestamp: new Date().toISOString(), ...metadata });
    return this.update({ id: refundId }, { status, sub_status: metadata.subStatus, status_history: history });
  }

  /**
   * Check SLA breach
   */
  static async checkSLABreach() {
    const result = await connectionPool.query(
      `UPDATE ${this.tableName} SET sla_breached = true, sla_breach_reason = 'Response time exceeded SLA deadline' WHERE status IN ('pending', 'under_review') AND sla_deadline < NOW() AND sla_breached = false`
    );
    return result.rowCount;
  }
}

module.exports = RefundRequest;