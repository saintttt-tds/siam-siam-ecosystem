const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Bill Payment Model - Utility Bill Payment Record
 * 
 * Records payments for utility bills: electricity, water,
 * internet, DSTV, gas, council rates, and other services.
 * 
 * TABLE: bill_payments
 * 
 * BILLER TYPES:
 * - electricity: ZESA, prepaid meters
 * - water: Municipal water bills
 * - internet: ZOL, TelOne, Liquid Telecom
 * - dstv: DSTV subscriptions
 * - gas: Gas utilities
 * - council_rates: Municipal rates
 * - insurance: Insurance premiums
 * - other: Miscellaneous bills
 */

class BillPayment extends BaseModel {
  static tableName = 'bill_payments';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id',
    // Biller information
    'biller_id', 'biller_name', 'biller_category',
    'biller_code', 'biller_reference',
    // Customer account
    'meter_number', 'customer_reference', 'customer_name',
    'account_number', 'customer_address',
    // Payment details
    'amount', 'currency', 'convenience_fee', 'total_amount',
    'transaction_id', 'payment_method',
    // Bill period
    'billing_period', 'due_date', 'invoice_number',
    'consumption_amount', 'consumption_unit',
    // Token (prepaid electricity)
    'token', 'token_amount', 'token_units',
    'token_expiry', 'meter_balance_before', 'meter_balance_after',
    // Status
    'status', 'status_message', 'external_status',
    'retry_count', 'last_retry_at',
    // Recurring
    'is_recurring', 'recurring_id', 'next_payment_date',
    // Receipt
    'receipt_url', 'receipt_number',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    amount: 'float',
    convenience_fee: 'float',
    total_amount: 'float',
    token_amount: 'float',
    token_units: 'float',
    meter_balance_before: 'float',
    meter_balance_after: 'float',
    consumption_amount: 'float',
    is_recurring: 'boolean',
    retry_count: 'integer',
    metadata: 'json',
    tags: 'json',
  };

  // Biller categories
  static categories = {
    ELECTRICITY: 'electricity',
    WATER: 'water',
    INTERNET: 'internet',
    DSTV: 'dstv',
    GAS: 'gas',
    COUNCIL_RATES: 'council_rates',
    SCHOOL_FEES: 'school_fees',
    INSURANCE: 'insurance',
    OTHER: 'other',
  };

  // Payment statuses
  static statuses = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    REFUNDED: 'refunded',
    CANCELLED: 'cancelled',
  };

  static relations = {
    user: {
      type: 'belongsTo',
      model: 'User',
      foreignKey: 'user_id',
      ownerKey: 'id',
    },
    transaction: {
      type: 'belongsTo',
      model: 'Transaction',
      foreignKey: 'transaction_id',
      ownerKey: 'id',
    },
  };

  /**
   * Find payments by user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   */
  static async findByUser(userId, options = {}) {
    return this.paginate({
      where: { user_id: userId },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Find payments by meter number
   * @param {string} meterNumber - Meter number
   */
  static async findByMeter(meterNumber) {
    return this.findAll({
      where: { meter_number: meterNumber },
      orderBy: { created_at: 'DESC' },
    });
  }

  /**
   * Find payments by biller
   * @param {string} billerId - Biller ID
   * @param {Object} options - Query options
   */
  static async findByBiller(billerId, options = {}) {
    return this.paginate({
      where: { biller_id: billerId },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Get popular billers by payment count
   * @param {string} category - Biller category (optional)
   * @param {number} limit - Max results
   */
  static async getPopularBillers(category = null, limit = 10) {
    const text = `
      SELECT 
        biller_id, 
        biller_name, 
        biller_category,
        COUNT(*) as payment_count,
        SUM(total_amount) as total_revenue
      FROM ${this.tableName}
      WHERE status = 'completed'
        ${category ? 'AND biller_category = $2' : ''}
      GROUP BY biller_id, biller_name, biller_category
      ORDER BY payment_count DESC
      LIMIT $1
    `;

    const values = [limit];
    if (category) values.push(category);

    const result = await connectionPool.query(text, values);
    return result.rows;
  }

  /**
   * Get bill payment summary for a period
   * @param {string} period - 'daily', 'weekly', 'monthly'
   * @param {Object} options - Query options
   */
  static async getSummary(period = 'daily', options = {}) {
    const truncateMap = {
      daily: 'day',
      weekly: 'week',
      monthly: 'month',
    };

    const truncate = truncateMap[period] || 'day';

    const text = `
      SELECT
        DATE_TRUNC('${truncate}', created_at) as period,
        biller_category,
        COUNT(*) as payment_count,
        SUM(total_amount) as total_revenue,
        SUM(convenience_fee) as total_fees,
        COUNT(DISTINCT user_id) as unique_users
      FROM ${this.tableName}
      WHERE status = 'completed'
        ${options.userId ? 'AND user_id = $1' : ''}
      GROUP BY DATE_TRUNC('${truncate}', created_at), biller_category
      ORDER BY period DESC
    `;

    const values = options.userId ? [options.userId] : [];
    const result = await connectionPool.query(text, values);
    return result.rows;
  }

  /**
   * Record a bill payment
   * @param {Object} paymentData - Payment data
   */
  static async recordPayment(paymentData) {
    return this.create({
      user_id: paymentData.userId,
      biller_id: paymentData.billerId,
      biller_name: paymentData.billerName,
      biller_category: paymentData.billerCategory,
      biller_code: paymentData.billerCode || null,
      biller_reference: paymentData.billerReference || null,
      meter_number: paymentData.meterNumber || null,
      customer_reference: paymentData.customerReference || null,
      customer_name: paymentData.customerName || null,
      account_number: paymentData.accountNumber || null,
      amount: paymentData.amount,
      currency: paymentData.currency || 'USD',
      convenience_fee: paymentData.convenienceFee || 0,
      total_amount: paymentData.totalAmount || paymentData.amount,
      transaction_id: paymentData.transactionId || null,
      payment_method: paymentData.paymentMethod || null,
      billing_period: paymentData.billingPeriod || null,
      due_date: paymentData.dueDate || null,
      invoice_number: paymentData.invoiceNumber || null,
      consumption_amount: paymentData.consumptionAmount || null,
      consumption_unit: paymentData.consumptionUnit || null,
      token: paymentData.token || null,
      token_amount: paymentData.tokenAmount || null,
      token_units: paymentData.tokenUnits || null,
      token_expiry: paymentData.tokenExpiry || null,
      status: paymentData.status || this.statuses.PENDING,
      status_message: paymentData.statusMessage || null,
      is_recurring: paymentData.isRecurring || false,
      recurring_id: paymentData.recurringId || null,
      receipt_url: paymentData.receiptUrl || null,
      receipt_number: paymentData.receiptNumber || null,
      metadata: paymentData.metadata || {},
      tags: paymentData.tags || [],
      notes: paymentData.notes || null,
      tenant_id: paymentData.tenantId || null,
    });
  }

  /**
   * Update payment status with token (for prepaid electricity)
   * @param {string} paymentId - Payment ID
   * @param {string} status - New status
   * @param {Object} updates - Additional updates
   */
  static async updateWithToken(paymentId, status, updates = {}) {
    const data = {
      status,
      status_message: updates.message || null,
      token: updates.token || null,
      token_amount: updates.tokenAmount || null,
      token_units: updates.tokenUnits || null,
      token_expiry: updates.tokenExpiry || null,
      meter_balance_before: updates.balanceBefore || null,
      meter_balance_after: updates.balanceAfter || null,
      receipt_url: updates.receiptUrl || null,
      receipt_number: updates.receiptNumber || null,
    };

    return this.update({ id: paymentId }, data);
  }
}

module.exports = BillPayment;