const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * USSD Transaction Model - USSD-Initiated Transaction
 * 
 * Records transactions initiated through the USSD gateway.
 * Captures the complete transaction context including the
 * menu path taken, session data, and all inputs provided.
 * 
 * TABLE: ussd_transactions
 */

class UssdTransaction extends BaseModel {
  static tableName = 'ussd_transactions';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'session_id', 'phone_number', 'user_id',
    'transaction_number', 'transaction_type', 'transaction_subtype',
    'transaction_category', 'transaction_status',
    'amount', 'currency', 'fee', 'fee_currency', 'fee_amount',
    'tax', 'tax_currency', 'tax_amount', 'net_amount',
    'payment_method', 'payment_source', 'payment_reference',
    'external_reference', 'processor', 'processor_reference',
    'processor_status', 'processor_response', 'processor_error',
    'menu_path', 'menu_start', 'menu_end',
    'navigation_steps', 'total_steps', 'total_duration_seconds',
    'input_data', 'validated_data', 'confirmation_data',
    'reference', 'description', 'statement_description',
    'source_account', 'source_account_type',
    'destination_account', 'destination_account_type',
    'destination_name', 'destination_reference',
    'biller_id', 'biller_name', 'biller_category',
    'meter_number', 'customer_reference', 'customer_name',
    'token', 'token_amount', 'token_units', 'token_expiry',
    'receipt_number', 'receipt_url', 'receipt_sent',
    'receipt_channel', 'receipt_recipient',
    'notification_sent', 'notification_channel',
    'notification_status',
    'network_provider', 'network_code', 'country',
    'session_language', 'user_language',
    'is_reversal', 'reversal_reason', 'reversed_transaction_id',
    'reversed_at', 'reversed_by',
    'retry_count', 'max_retries', 'last_retry_at',
    'error_code', 'error_message', 'failure_reason',
    'initiated_at', 'processing_at', 'completed_at',
    'failed_at', 'cancelled_at', 'expired_at',
    'ip_address', 'user_agent',
    'fraud_checked', 'fraud_score', 'fraud_status',
    'compliance_checked', 'aml_checked',
    'audit_trail', 'notes',
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    amount: 'float', fee: 'float', fee_amount: 'float',
    tax: 'float', tax_amount: 'float', net_amount: 'float',
    token_amount: 'float', token_units: 'float',
    fraud_score: 'float', total_steps: 'integer',
    total_duration_seconds: 'integer', retry_count: 'integer',
    max_retries: 'integer',
    menu_path: 'json', navigation_steps: 'json',
    input_data: 'json', validated_data: 'json',
    confirmation_data: 'json', processor_response: 'json',
    audit_trail: 'json', metadata: 'json', tags: 'json',
    receipt_sent: 'boolean', notification_sent: 'boolean',
    is_reversal: 'boolean', fraud_checked: 'boolean',
    compliance_checked: 'boolean', aml_checked: 'boolean',
  };

  static relations = {
    session: { type: 'belongsTo', model: 'UssdSession', foreignKey: 'session_id', ownerKey: 'session_id' },
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
  };

  static transactionTypes = {
    AIRTIME_PURCHASE: 'airtime_purchase', BILL_PAYMENT: 'bill_payment',
    MONEY_TRANSFER: 'money_transfer', WALLET_DEPOSIT: 'wallet_deposit',
    BALANCE_INQUIRY: 'balance_inquiry', SCHOOL_FEES: 'school_fees',
    FX_TRADE: 'fx_trade', BUNDLE_PURCHASE: 'bundle_purchase',
    DSTV_PAYMENT: 'dstv_payment', ELECTRICITY: 'electricity',
    WATER: 'water', GAS: 'gas', COUNCIL_RATES: 'council_rates',
    INSURANCE: 'insurance', DONATION: 'donation',
  };

  static transactionStatuses = {
    PENDING: 'pending', PROCESSING: 'processing',
    COMPLETED: 'completed', FAILED: 'failed',
    CANCELLED: 'cancelled', REVERSED: 'reversed',
    TIMEOUT: 'timeout', DECLINED: 'declined',
  };

  static generateTransactionNumber() {
    return `USS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
  }

  /**
   * Create a USSD transaction
   */
  static async createTransaction(sessionId, phoneNumber, transactionData) {
    return this.create({
      session_id: sessionId, phone_number: phoneNumber,
      user_id: transactionData.userId,
      transaction_number: this.generateTransactionNumber(),
      transaction_type: transactionData.transactionType,
      transaction_subtype: transactionData.transactionSubtype,
      transaction_category: transactionData.transactionCategory,
      transaction_status: this.transactionStatuses.PENDING,
      amount: transactionData.amount, currency: transactionData.currency || 'USD',
      fee: transactionData.fee || 0, fee_amount: transactionData.feeAmount || 0,
      net_amount: (transactionData.amount || 0) - (transactionData.fee || 0),
      payment_method: transactionData.paymentMethod || 'ussd',
      payment_source: transactionData.paymentSource,
      menu_path: transactionData.menuPath || [],
      navigation_steps: transactionData.navigationSteps || [],
      total_steps: transactionData.navigationSteps?.length || 0,
      input_data: transactionData.inputData || {},
      validated_data: transactionData.validatedData || {},
      reference: transactionData.reference,
      description: transactionData.description?.substring(0, 500),
      biller_id: transactionData.billerId, biller_name: transactionData.billerName,
      meter_number: transactionData.meterNumber,
      customer_reference: transactionData.customerReference,
      network_provider: transactionData.networkProvider,
      country: transactionData.country, session_language: transactionData.language,
      initiated_at: new Date().toISOString(),
      audit_trail: [{ action: 'created', timestamp: new Date().toISOString() }],
      metadata: transactionData.metadata || {}, tenant_id: transactionData.tenantId,
    });
  }

  /**
   * Find transactions by session
   */
  static async findBySession(sessionId) {
    return this.findAll({ where: { session_id: sessionId }, orderBy: { created_at: 'DESC' } });
  }

  /**
   * Find transactions by phone number
   */
  static async findByPhone(phoneNumber, options = {}) {
    return this.paginate({ where: { phone_number: phoneNumber }, orderBy: { created_at: 'DESC' }, ...options });
  }

  /**
   * Find transactions by user
   */
  static async findByUser(userId, options = {}) {
    return this.paginate({ where: { user_id: userId }, orderBy: { created_at: 'DESC' }, ...options });
  }

  /**
   * Update transaction status
   */
  static async updateStatus(transactionId, status, metadata = {}) {
    const transaction = await this.findById(transactionId);
    if (!transaction) throw new Error('Transaction not found');

    const auditTrail = [...(transaction.audit_trail || [])];
    auditTrail.push({ action: `status_${status}`, timestamp: new Date().toISOString(), ...metadata });

    const updates = { transaction_status: status, audit_trail: auditTrail };

    switch (status) {
      case this.transactionStatuses.PROCESSING:
        updates.processing_at = new Date().toISOString(); break;
      case this.transactionStatuses.COMPLETED:
        updates.completed_at = new Date().toISOString();
        updates.processor_reference = metadata.processorReference;
        updates.token = metadata.token; updates.token_amount = metadata.tokenAmount;
        updates.receipt_number = metadata.receiptNumber; break;
      case this.transactionStatuses.FAILED:
        updates.failed_at = new Date().toISOString();
        updates.error_code = metadata.errorCode;
        updates.error_message = metadata.errorMessage?.substring(0, 500);
        updates.failure_reason = metadata.failureReason; break;
      case this.transactionStatuses.REVERSED:
        updates.is_reversal = true; updates.reversed_at = new Date().toISOString();
        updates.reversal_reason = metadata.reason; break;
    }

    return this.update({ id: transactionId }, updates);
  }

  /**
   * Get USSD transaction statistics
   */
  static async getStats(startDate = null, endDate = null) {
    const text = `
      SELECT transaction_type, transaction_status, currency,
        COUNT(*) as count, SUM(amount) as total_amount,
        SUM(fee_amount) as total_fees, COUNT(DISTINCT phone_number) as unique_users
      FROM ${this.tableName}
      WHERE 1=1
        ${startDate ? 'AND created_at >= $1' : ''}
        ${endDate ? `AND created_at <= $${startDate ? 2 : 1}` : ''}
      GROUP BY transaction_type, transaction_status, currency
      ORDER BY total_amount DESC
    `;
    const values = []; if (startDate) values.push(startDate); if (endDate) values.push(endDate);
    const result = await connectionPool.query(text, values.length > 0 ? values : undefined);
    return result.rows;
  }
}

module.exports = UssdTransaction;