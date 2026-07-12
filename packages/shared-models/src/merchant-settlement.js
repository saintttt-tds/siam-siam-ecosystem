const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Merchant Settlement Model - Merchant Payout Settlement
 * 
 * Records settlements/payouts to merchants for their sales.
 * Tracks settlement calculation, processing, and reconciliation.
 * 
 * TABLE: merchant_settlements
 * 
 * SETTLEMENT CYCLE:
 * 1. Orders are marked as completed/delivered
 * 2. Settlement period closes (daily/weekly/monthly)
 * 3. Settlement amount calculated (sales - commission - fees - refunds)
 * 4. Settlement processed via chosen method
 * 5. Merchant receives funds
 */

class MerchantSettlement extends BaseModel {
  static tableName = 'merchant_settlements';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'merchant_id',
    // Settlement period
    'settlement_number', 'period_start', 'period_end',
    'settlement_date', 'settlement_type',
    // Financial summary
    'total_sales', 'total_orders', 'total_refunds',
    'total_returns', 'total_chargebacks',
    // Commission & Fees
    'commission_amount', 'commission_rate',
    'transaction_fees', 'processing_fees',
    'shipping_fees', 'adjustment_amount',
    'adjustment_reason',
    // Net settlement
    'gross_amount', 'deductions', 'net_amount',
    'currency', 'exchange_rate', 'settled_currency',
    'settled_amount',
    // Payment
    'payment_method', 'payment_reference',
    'payment_status', 'payment_initiated_at',
    'payment_completed_at', 'payment_failure_reason',
    'bank_name', 'bank_account_last4',
    // Reconciliation
    'is_reconciled', 'reconciled_at', 'reconciled_by',
    'discrepancy_amount', 'discrepancy_notes',
    // Status
    'status', 'status_history',
    'approved_by', 'approved_at',
    // Orders included
    'included_order_ids', 'order_count',
    // Documentation
    'settlement_report_url', 'invoice_url',
    // Metadata
    'metadata', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    total_sales: 'float',
    total_refunds: 'float',
    total_returns: 'float',
    total_chargebacks: 'float',
    commission_amount: 'float',
    commission_rate: 'float',
    transaction_fees: 'float',
    processing_fees: 'float',
    shipping_fees: 'float',
    adjustment_amount: 'float',
    gross_amount: 'float',
    deductions: 'float',
    net_amount: 'float',
    exchange_rate: 'float',
    settled_amount: 'float',
    discrepancy_amount: 'float',
    is_reconciled: 'boolean',
    status_history: 'json',
    included_order_ids: 'json',
    metadata: 'json',
    total_orders: 'integer',
    order_count: 'integer',
  };

  static relations = {
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
  };

  static settlementTypes = {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    BIWEEKLY: 'biweekly',
    MONTHLY: 'monthly',
    MANUAL: 'manual',
    INSTANT: 'instant',
  };

  static statuses = {
    PENDING: 'pending',
    CALCULATING: 'calculating',
    AWAITING_APPROVAL: 'awaiting_approval',
    APPROVED: 'approved',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    DISPUTED: 'disputed',
  };

  /**
   * Generate settlement number
   */
  static generateSettlementNumber() {
    return `STL-${Date.now().toString(36).toUpperCase()}`;
  }

  /**
   * Calculate settlement for a merchant for a period
   */
  static async calculateSettlement(merchantId, periodStart, periodEnd, options = {}) {
    // Get all completed orders in the period
    const orderText = `
      SELECT
        COUNT(*) as order_count,
        COALESCE(SUM(total), 0) as total_sales,
        COALESCE(SUM(CASE WHEN status = 'refunded' THEN total ELSE 0 END), 0) as total_refunds
      FROM orders
      WHERE merchant_id = $1
        AND status IN ('delivered', 'completed', 'refunded')
        AND delivered_at BETWEEN $2 AND $3
    `;
    const orderResult = await connectionPool.query(orderText, [merchantId, periodStart, periodEnd]);
    const orderSummary = orderResult.rows[0];

    if (orderSummary.order_count === 0) {
      return null; // No orders to settle
    }

    // Get merchant commission rate
    const merchant = await require('./merchant').findById(merchantId);
    const commissionRate = merchant?.commission_rate || 10;
    const commissionAmount = (orderSummary.total_sales * commissionRate) / 100;

    const grossAmount = orderSummary.total_sales - orderSummary.total_refunds;
    const deductions = commissionAmount + (options.transactionFees || 0) + (options.processingFees || 0);
    const netAmount = Math.max(0, grossAmount - deductions);

    return {
      merchantId,
      periodStart,
      periodEnd,
      totalSales: orderSummary.total_sales,
      totalOrders: orderSummary.order_count,
      totalRefunds: orderSummary.total_refunds,
      commissionRate,
      commissionAmount,
      grossAmount,
      deductions,
      netAmount,
    };
  }

  /**
   * Create a settlement record
   */
  static async createSettlement(merchantId, calculation, options = {}) {
    return this.create({
      merchant_id: merchantId,
      settlement_number: this.generateSettlementNumber(),
      period_start: calculation.periodStart,
      period_end: calculation.periodEnd,
      settlement_type: options.settlementType || this.settlementTypes.WEEKLY,
      total_sales: calculation.totalSales,
      total_orders: calculation.totalOrders,
      total_refunds: calculation.totalRefunds,
      commission_amount: calculation.commissionAmount,
      commission_rate: calculation.commissionRate,
      transaction_fees: options.transactionFees || 0,
      processing_fees: options.processingFees || 0,
      gross_amount: calculation.grossAmount,
      deductions: calculation.deductions,
      net_amount: calculation.netAmount,
      currency: options.currency || 'USD',
      payment_method: options.paymentMethod || 'bank_transfer',
      status: this.statuses.PENDING,
      status_history: [{
        status: this.statuses.PENDING,
        timestamp: new Date().toISOString(),
      }],
      metadata: options.metadata || {},
      tenant_id: options.tenantId || null,
    });
  }

  /**
   * Find settlements by merchant
   */
  static async findByMerchant(merchantId, options = {}) {
    return this.paginate({
      where: { merchant_id: merchantId },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Get pending settlements
   */
  static async findPending() {
    return this.findAll({
      where: {
        status: [this.statuses.PENDING, this.statuses.AWAITING_APPROVAL, this.statuses.APPROVED],
      },
      orderBy: { created_at: 'ASC' },
    });
  }

  /**
   * Approve a settlement
   */
  static async approve(settlementId, approvedBy) {
    const settlement = await this.findById(settlementId);
    const history = settlement.status_history || [];
    history.push({ status: this.statuses.APPROVED, timestamp: new Date().toISOString(), approvedBy });

    return this.update({ id: settlementId }, {
      status: this.statuses.APPROVED,
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      status_history: history,
    });
  }

  /**
   * Mark settlement as completed
   */
  static async complete(settlementId, paymentRef) {
    const settlement = await this.findById(settlementId);
    const history = settlement.status_history || [];
    history.push({ status: this.statuses.COMPLETED, timestamp: new Date().toISOString(), paymentRef });

    return this.update({ id: settlementId }, {
      status: this.statuses.COMPLETED,
      payment_reference: paymentRef,
      payment_completed_at: new Date().toISOString(),
      status_history: history,
    });
  }

  /**
   * Get settlement summary for a merchant
   */
  static async getSettlementSummary(merchantId) {
    const text = `
      SELECT
        COUNT(*) as total_settlements,
        SUM(net_amount) as total_settled,
        SUM(CASE WHEN status = 'completed' THEN net_amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN status IN ('pending', 'awaiting_approval', 'approved') THEN net_amount ELSE 0 END) as pending_amount,
        MAX(period_end) as last_period_end
      FROM ${this.tableName}
      WHERE merchant_id = $1
    `;
    const result = await connectionPool.query(text, [merchantId]);
    return result.rows[0];
  }
}

module.exports = MerchantSettlement;