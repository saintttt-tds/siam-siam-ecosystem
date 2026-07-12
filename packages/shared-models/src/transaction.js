const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Transaction Model - Financial Transaction Record
 * 
 * Core financial transaction entity for all payment operations
 * across the SiamSiam ecosystem. Records every monetary movement
 * including payments, refunds, deposits, withdrawals, transfers,
 * bill payments, airtime purchases, FX trades, and commissions.
 * 
 * TABLE: transactions
 * 
 * TRANSACTION LIFECYCLE:
 * 1. Created: Transaction initiated (status: pending)
 * 2. Processing: Payment being processed by gateway
 * 3. Authorized: Funds authorized but not yet captured
 * 4. Captured: Funds captured from customer
 * 5. Completed: Transaction fully processed
 * 6. Failed: Transaction failed at any stage
 * 7. Refunded: Full or partial refund issued
 * 8. Disputed: Customer filed chargeback/dispute
 * 
 * IDEMPOTENCY:
 * Each transaction has an idempotency_key to prevent duplicate
 * processing. Retrying a request with the same idempotency key
 * returns the original transaction instead of creating a new one.
 */

class Transaction extends BaseModel {
  static tableName = 'transactions';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id', 'merchant_id', 'corporate_id',
    // Transaction identification
    'transaction_number', 'reference', 'external_reference',
    'idempotency_key', 'parent_transaction_id',
    'transaction_type', 'transaction_subtype', 'transaction_category',
    // Financial details
    'amount', 'currency', 'exchange_rate',
    'base_currency', 'base_amount',
    'fee', 'fee_type', 'fee_currency', 'fee_amount',
    'commission', 'commission_currency', 'commission_amount',
    'tax', 'tax_type', 'tax_currency', 'tax_amount',
    'discount', 'discount_currency', 'discount_amount',
    'net_amount', 'gross_amount',
    'tip_amount', 'tip_currency',
    // Payment method
    'payment_method', 'payment_method_type',
    'payment_gateway', 'payment_processor',
    'payment_intent_id', 'payment_authorization',
    'payment_authorization_code', 'payment_last4',
    'payment_card_type', 'payment_card_brand',
    'payment_wallet_provider', 'payment_wallet_number_last4',
    'payment_bank_name', 'payment_bank_account_last4',
    // Processor details
    'processor', 'processor_reference', 'processor_status',
    'processor_response', 'processor_response_code',
    'processor_error', 'processor_error_code',
    'processor_authorization_code', 'processor_avs_result',
    'processor_cvv_result', 'processor_risk_score',
    // Status tracking
    'status', 'sub_status', 'status_history',
    'settlement_status', 'reconciliation_status',
    'dispute_status', 'refund_status',
    // Linked entities
    'source_type', 'source_id', 'destination_type',
    'destination_id', 'wallet_id', 'wallet_transaction_id',
    'order_id', 'invoice_id', 'bill_payment_id',
    'refund_id', 'dispute_id', 'settlement_id',
    'payout_id', 'deposit_id',
    // Timing
    'initiated_at', 'authorized_at', 'captured_at',
    'completed_at', 'failed_at', 'cancelled_at',
    'refunded_at', 'disputed_at', 'expires_at',
    'processing_duration_ms', 'total_duration_ms',
    // Failure handling
    'failure_reason', 'failure_code', 'failure_category',
    'failure_detail', 'is_retryable', 'retry_strategy',
    'retry_count', 'max_retries', 'last_retry_at',
    'next_retry_at', 'retry_interval_minutes',
    // Risk and compliance
    'fraud_checked', 'fraud_score', 'fraud_status',
    'fraud_check_provider', 'fraud_check_ref',
    'aml_checked', 'aml_status', 'aml_risk_level',
    'compliance_checked', 'compliance_status',
    'sanctions_screened', 'kyc_verified',
    'risk_score', 'risk_level', 'risk_factors',
    // Customer context
    'ip_address', 'device_id', 'device_fingerprint',
    'user_agent', 'accept_language',
    'location', 'country', 'city', 'region',
    'latitude', 'longitude',
    // Receipt and notifications
    'receipt_url', 'receipt_number', 'receipt_sent',
    'receipt_email', 'receipt_phone',
    'notification_sent', 'notification_channel',
    'notification_status', 'notification_attempts',
    // Accounting
    'reconciled', 'reconciled_at', 'reconciliation_ref',
    'reconciliation_method', 'reconciliation_notes',
    'accounting_period', 'accounting_status',
    'general_ledger_ref', 'cost_center', 'revenue_code',
    'accounting_exported', 'accounting_exported_at',
    // Statement
    'statement_description', 'statement_descriptor',
    'statement_descriptor_phone', 'statement_descriptor_suffix',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    amount: 'float', exchange_rate: 'float',
    base_amount: 'float', fee: 'float', fee_amount: 'float',
    commission: 'float', commission_amount: 'float',
    tax: 'float', tax_amount: 'float',
    discount: 'float', discount_amount: 'float',
    net_amount: 'float', gross_amount: 'float',
    tip_amount: 'float', fraud_score: 'float',
    processor_risk_score: 'float', risk_score: 'float',
    processing_duration_ms: 'integer', total_duration_ms: 'integer',
    retry_count: 'integer', max_retries: 'integer',
    retry_interval_minutes: 'integer', notification_attempts: 'integer',
    latitude: 'float', longitude: 'float',
    status_history: 'json', processor_response: 'json',
    risk_factors: 'json', metadata: 'json', tags: 'json',
    is_retryable: 'boolean', fraud_checked: 'boolean',
    aml_checked: 'boolean', compliance_checked: 'boolean',
    sanctions_screened: 'boolean', kyc_verified: 'boolean',
    receipt_sent: 'boolean', notification_sent: 'boolean',
    reconciled: 'boolean', accounting_exported: 'boolean',
  };

  static relations = {
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
    order: { type: 'belongsTo', model: 'Order', foreignKey: 'order_id', ownerKey: 'id' },
    wallet: { type: 'belongsTo', model: 'Wallet', foreignKey: 'wallet_id', ownerKey: 'id' },
    walletTransaction: { type: 'belongsTo', model: 'WalletTransaction', foreignKey: 'wallet_transaction_id', ownerKey: 'id' },
    refund: { type: 'belongsTo', model: 'RefundRequest', foreignKey: 'refund_id', ownerKey: 'id' },
    transactionLogs: { type: 'hasMany', model: 'TransactionLog', foreignKey: 'transaction_id', localKey: 'id' },
  };

  // Transaction type constants
  static types = {
    PAYMENT: 'payment',
    REFUND: 'refund',
    PARTIAL_REFUND: 'partial_refund',
    DEPOSIT: 'deposit',
    WITHDRAWAL: 'withdrawal',
    TRANSFER: 'transfer',
    INTERNAL_TRANSFER: 'internal_transfer',
    BILL_PAYMENT: 'bill_payment',
    AIRTIME_PURCHASE: 'airtime_purchase',
    DATA_PURCHASE: 'data_purchase',
    FX_TRADE: 'fx_trade',
    COMMISSION: 'commission',
    ADJUSTMENT: 'adjustment',
    CHARGEBACK: 'chargeback',
    SETTLEMENT: 'settlement',
    PAYOUT: 'payout',
    LOYALTY_REDEMPTION: 'loyalty_redemption',
    GIFT_CARD_PURCHASE: 'gift_card_purchase',
    GIFT_CARD_REDEMPTION: 'gift_card_redemption',
    SCHOOL_FEES: 'school_fees',
    PROXY_PURCHASE: 'proxy_purchase',
    SPLIT_PAYMENT: 'split_payment',
    RECURRING_PAYMENT: 'recurring_payment',
  };

  // Transaction status constants
  static statuses = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    AUTHORIZED: 'authorized',
    CAPTURED: 'captured',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    REFUNDED: 'refunded',
    PARTIALLY_REFUNDED: 'partially_refunded',
    DISPUTED: 'disputed',
    EXPIRED: 'expired',
    ON_HOLD: 'on_hold',
    UNDER_REVIEW: 'under_review',
  };

  // Payment method types
  static paymentMethodTypes = {
    CARD: 'card',
    MOBILE_MONEY: 'mobile_money',
    BANK_TRANSFER: 'bank_transfer',
    WALLET: 'wallet',
    CASH: 'cash',
    CRYPTO: 'crypto',
    USSD: 'ussd',
    QR_CODE: 'qr_code',
    PAYMENT_LINK: 'payment_link',
  };

  static generateTransactionNumber() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TXN-${timestamp}-${random}`;
  }

  /**
   * Create a new transaction with idempotency check
   */
  static async createTransaction(transactionData, options = {}) {
    // Check idempotency
    if (transactionData.idempotencyKey) {
      const existing = await this.findOne({
        where: { idempotency_key: transactionData.idempotencyKey },
      });
      if (existing) {
        logger.info('Idempotent transaction returned', {
          idempotencyKey: transactionData.idempotencyKey,
          existingTransactionId: existing.id,
        });
        return existing;
      }
    }

    const transactionNumber = this.generateTransactionNumber();
    const fee = transactionData.fee || 0;
    const tax = transactionData.tax || 0;
    const discount = transactionData.discount || 0;
    const grossAmount = transactionData.amount || 0;
    const netAmount = grossAmount - fee - tax + discount;

    return this.create({
      user_id: transactionData.userId,
      merchant_id: transactionData.merchantId,
      corporate_id: transactionData.corporateId,
      transaction_number: transactionNumber,
      reference: transactionData.reference || transactionNumber,
      external_reference: transactionData.externalReference,
      idempotency_key: transactionData.idempotencyKey,
      parent_transaction_id: transactionData.parentTransactionId,
      transaction_type: transactionData.transactionType || this.types.PAYMENT,
      transaction_subtype: transactionData.transactionSubtype,
      transaction_category: transactionData.transactionCategory,
      amount: grossAmount,
      currency: transactionData.currency || 'USD',
      exchange_rate: transactionData.exchangeRate || 1,
      base_currency: transactionData.baseCurrency || 'USD',
      base_amount: transactionData.baseAmount || grossAmount,
      fee: fee, fee_type: transactionData.feeType,
      fee_currency: transactionData.feeCurrency || transactionData.currency || 'USD',
      fee_amount: fee,
      commission: transactionData.commission || 0,
      commission_currency: transactionData.commissionCurrency,
      commission_amount: transactionData.commissionAmount || 0,
      tax: tax, tax_type: transactionData.taxType,
      tax_currency: transactionData.taxCurrency || transactionData.currency || 'USD',
      tax_amount: tax,
      discount: discount,
      discount_amount: discount,
      net_amount: Math.round(netAmount * 100) / 100,
      gross_amount: grossAmount,
      tip_amount: transactionData.tipAmount || 0,
      payment_method: transactionData.paymentMethod,
      payment_method_type: transactionData.paymentMethodType,
      payment_gateway: transactionData.paymentGateway,
      payment_processor: transactionData.paymentProcessor,
      payment_intent_id: transactionData.paymentIntentId,
      payment_authorization: transactionData.paymentAuthorization,
      payment_last4: transactionData.paymentLast4,
      payment_card_type: transactionData.paymentCardType,
      payment_card_brand: transactionData.paymentCardBrand,
      payment_wallet_provider: transactionData.paymentWalletProvider,
      payment_bank_name: transactionData.paymentBankName,
      payment_bank_account_last4: transactionData.paymentBankAccountLast4,
      processor: transactionData.processor,
      processor_reference: transactionData.processorReference,
      processor_status: 'pending',
      status: this.statuses.PENDING,
      status_history: [{ status: this.statuses.PENDING, timestamp: new Date().toISOString() }],
      source_type: transactionData.sourceType,
      source_id: transactionData.sourceId,
      destination_type: transactionData.destinationType,
      destination_id: transactionData.destinationId,
      wallet_id: transactionData.walletId,
      order_id: transactionData.orderId,
      invoice_id: transactionData.invoiceId,
      bill_payment_id: transactionData.billPaymentId,
      deposit_id: transactionData.depositId,
      initiated_at: new Date().toISOString(),
      expires_at: transactionData.expiresAt || new Date(Date.now() + 30 * 60000).toISOString(),
      is_retryable: transactionData.isRetryable !== false,
      retry_strategy: transactionData.retryStrategy || 'exponential_backoff',
      max_retries: transactionData.maxRetries || 3,
      retry_interval_minutes: transactionData.retryIntervalMinutes || 5,
      ip_address: transactionData.ipAddress,
      device_id: transactionData.deviceId,
      device_fingerprint: transactionData.deviceFingerprint,
      user_agent: transactionData.userAgent?.substring(0, 500),
      location: transactionData.location,
      country: transactionData.country,
      city: transactionData.city,
      latitude: transactionData.latitude,
      longitude: transactionData.longitude,
      statement_description: transactionData.statementDescription?.substring(0, 22),
      statement_descriptor: transactionData.statementDescriptor?.substring(0, 25),
      metadata: transactionData.metadata || {},
      tags: transactionData.tags || [],
      tenant_id: transactionData.tenantId,
    });
  }

  /**
   * Find transaction by reference
   */
  static async findByReference(reference) {
    return this.findOne({ where: { reference } });
  }

  /**
   * Find transaction by processor reference
   */
  static async findByProcessorRef(processorRef) {
    return this.findOne({ where: { processor_reference: processorRef } });
  }

  /**
   * Find transaction by idempotency key
   */
  static async findByIdempotencyKey(idempotencyKey) {
    return this.findOne({ where: { idempotency_key: idempotencyKey } });
  }

  /**
   * Find transactions by user with pagination
   */
  static async findByUser(userId, options = {}) {
    return this.paginate({
      where: { user_id: userId },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Find transactions by merchant
   */
  static async findByMerchant(merchantId, options = {}) {
    return this.paginate({
      where: { merchant_id: merchantId },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Find transactions by order
   */
  static async findByOrder(orderId) {
    return this.findAll({
      where: { order_id: orderId },
      orderBy: { created_at: 'ASC' },
    });
  }

  /**
   * Update transaction status with audit trail
   */
  static async updateStatus(transactionId, status, metadata = {}) {
    const transaction = await this.findById(transactionId);
    if (!transaction) throw new Error('Transaction not found');

    const history = transaction.status_history || [];
    history.push({
      from: transaction.status,
      to: status,
      timestamp: new Date().toISOString(),
      reason: metadata.reason,
      by: metadata.updatedBy || 'system',
      ...metadata,
    });

    const updates = { status, sub_status: metadata.subStatus, status_history: history };

    // Set status-specific timestamps
    switch (status) {
      case this.statuses.AUTHORIZED:
        updates.authorized_at = new Date().toISOString();
        updates.payment_authorization = metadata.authorizationCode;
        break;
      case this.statuses.CAPTURED:
        updates.captured_at = new Date().toISOString();
        break;
      case this.statuses.COMPLETED:
        updates.completed_at = new Date().toISOString();
        updates.total_duration_ms = new Date(updates.completed_at).getTime() - new Date(transaction.initiated_at).getTime();
        break;
      case this.statuses.FAILED:
        updates.failed_at = new Date().toISOString();
        updates.failure_reason = metadata.reason;
        updates.failure_code = metadata.code;
        updates.failure_category = metadata.category;
        updates.failure_detail = metadata.detail?.substring(0, 1000);
        break;
      case this.statuses.CANCELLED:
        updates.cancelled_at = new Date().toISOString();
        break;
      case this.statuses.REFUNDED:
      case this.statuses.PARTIALLY_REFUNDED:
        updates.refunded_at = new Date().toISOString();
        updates.refund_status = status;
        updates.refund_id = metadata.refundId;
        break;
      case this.statuses.DISPUTED:
        updates.disputed_at = new Date().toISOString();
        updates.dispute_status = 'open';
        updates.dispute_id = metadata.disputeId;
        break;
    }

    if (metadata.processorResponse) {
      updates.processor_response = metadata.processorResponse;
      updates.processor_status = metadata.processorStatus;
    }
    if (metadata.processorReference) {
      updates.processor_reference = metadata.processorReference;
    }

    await this.update({ id: transactionId }, updates);

    // Log to transaction audit log
    const TransactionLog = require('./transaction-log');
    await TransactionLog.log(transactionId, `status_${status}`, transaction.status, status, metadata);

    return this.findById(transactionId);
  }

  /**
   * Record processor response
   */
  static async recordProcessorResponse(transactionId, processorResponse, processorStatus) {
    return this.update({ id: transactionId }, {
      processor_response: processorResponse,
      processor_status: processorStatus,
      processing_duration_ms: Date.now() - new Date((await this.findById(transactionId))?.initiated_at).getTime(),
    });
  }

  /**
   * Get transaction summary for analytics
   */
  static async getSummary(startDate, endDate, options = {}) {
    const text = `
      SELECT
        transaction_type, status, currency,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount,
        SUM(fee_amount) as total_fees,
        SUM(commission_amount) as total_commission,
        SUM(tax_amount) as total_tax,
        SUM(net_amount) as total_net,
        COUNT(DISTINCT user_id) as unique_users,
        AVG(amount) as avg_transaction_amount,
        AVG(processing_duration_ms) as avg_processing_ms,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failure_count,
        ROUND(100.0 * COUNT(CASE WHEN status = 'failed' THEN 1 END) / NULLIF(COUNT(*), 0), 2) as failure_rate
      FROM ${this.tableName}
      WHERE initiated_at BETWEEN $1 AND $2
        ${options.userId ? 'AND user_id = $3' : ''}
        ${options.merchantId ? `AND merchant_id = $${options.userId ? 4 : 3}` : ''}
        ${options.transactionType ? `AND transaction_type = $${(options.userId ? 1 : 0) + (options.merchantId ? 1 : 0) + 3}` : ''}
      GROUP BY transaction_type, status, currency
      ORDER BY total_amount DESC
    `;

    const values = [startDate, endDate];
    if (options.userId) values.push(options.userId);
    if (options.merchantId) values.push(options.merchantId);
    if (options.transactionType) values.push(options.transactionType);

    const result = await connectionPool.query(text, values);
    return result.rows;
  }

  /**
   * Get transactions pending settlement
   */
  static async getPendingSettlement(merchantId = null) {
    const criteria = {
      status: this.statuses.COMPLETED,
      settlement_status: 'pending',
    };
    if (merchantId) criteria.merchant_id = merchantId;
    return this.findAll({ where: criteria, orderBy: { completed_at: 'ASC' } });
  }

  /**
   * Mark transactions as settled
   */
  static async markAsSettled(transactionIds, settlementId) {
    await connectionPool.query(
      `UPDATE ${this.tableName} SET settlement_status = 'settled', settlement_id = $2, updated_at = NOW() WHERE id = ANY($1)`,
      [transactionIds, settlementId]
    );
  }

  /**
   * Get daily transaction volume
   */
  static async getDailyVolume(date = new Date()) {
    const text = `
      SELECT
        DATE_TRUNC('hour', initiated_at) as hour,
        COUNT(*) as transaction_count,
        SUM(amount) as total_volume,
        SUM(fee_amount) as total_fees,
        AVG(processing_duration_ms) as avg_processing_ms
      FROM ${this.tableName}
      WHERE DATE(initiated_at) = $1
        AND status IN ('completed', 'captured')
      GROUP BY DATE_TRUNC('hour', initiated_at)
      ORDER BY hour ASC
    `;
    const result = await connectionPool.query(text, [date.toISOString().split('T')[0]]);
    return result.rows;
  }
}

module.exports = Transaction;