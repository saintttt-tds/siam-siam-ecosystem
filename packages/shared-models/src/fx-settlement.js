const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * FX Settlement Model - FX Trade Settlement Record
 * 
 * Records the settlement of FX trades including payment instructions,
 * SWIFT/RTGS details, confirmation workflow, and reconciliation.
 * 
 * TABLE: fx_settlements
 * 
 * SETTLEMENT PROCESS:
 * 1. Trade executed -> settlement record created
 * 2. Payment instructions generated
 * 3. Funds transferred via correspondent banking
 * 4. Counterparty confirms receipt
 * 5. Settlement reconciled
 * 
 * SETTLEMENT METHODS:
 * - swift: SWIFT wire transfer (international)
 * - rtgs: Real-Time Gross Settlement (domestic)
 * - ach: Automated Clearing House
 * - internal: Internal transfer between platform accounts
 * - netting: Net settlement across multiple trades
 */

class FxSettlement extends BaseModel {
  static tableName = 'fx_settlements';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'trade_id', 'corporate_id',
    // Settlement identification
    'settlement_number', 'settlement_reference',
    'trade_reference', ' nostro_reference',
    // Settlement dates
    'trade_date', 'value_date', 'settlement_date',
    'requested_settlement_date', 'actual_settlement_date',
    'settlement_cutoff_time',
    // Settlement type
    'settlement_type', 'settlement_method',
    'settlement_priority', 'payment_system',
    // Buy side details
    'buy_currency', 'buy_amount', 'buy_account_name',
    'buy_account_number', 'buy_bank_name', 'buy_bank_swift',
    'buy_bank_routing', 'buy_bank_country', 'buy_bank_address',
    'buy_intermediary_bank', 'buy_intermediary_swift',
    'buy_correspondent_bank', 'buy_correspondent_swift',
    // Sell side details
    'sell_currency', 'sell_amount', 'sell_account_name',
    'sell_account_number', 'sell_bank_name', 'sell_bank_swift',
    'sell_bank_routing', 'sell_bank_country', 'sell_bank_address',
    'sell_intermediary_bank', 'sell_intermediary_swift',
    'sell_correspondent_bank', 'sell_correspondent_swift',
    // Exchange rate
    'exchange_rate', 'settlement_rate', 'rate_difference',
    // Payment details
    'payment_reference', 'payment_instruction_ref',
    'payment_message_type', 'payment_urgency',
    'charges_bearer', 'remittance_info',
    // Confirmation
    'confirmation_status', 'confirmation_method',
    'confirmation_sent_at', 'confirmation_received_at',
    'confirmation_match', 'confirmation_discrepancy',
    'confirmation_resolved_at',
    // Execution
    'payment_initiated_at', 'payment_initiated_by',
    'payment_authorized_at', 'payment_authorized_by',
    'payment_sent_at', 'payment_sent_ref',
    'payment_received_at', 'funds_received_at',
    'funds_available_at',
    // Status
    'status', 'sub_status', 'status_history',
    'is_failed', 'failure_reason', 'failure_code',
    'retry_count', 'max_retries', 'last_retry_at',
    // Reconciliation
    'is_reconciled', 'reconciled_at', 'reconciled_by',
    'reconciliation_method', 'reconciliation_ref',
    'discrepancy_amount', 'discrepancy_currency',
    'discrepancy_type', 'discrepancy_resolved',
    'discrepancy_resolution', 'reconciliation_notes',
    // Fees and charges
    'our_fees', 'counterparty_fees', 'intermediary_fees',
    'total_fees', 'fee_currency', 'net_settlement_amount',
    'fee_breakdown',
    // Regulatory
    'regulatory_report_sent', 'regulatory_report_ref',
    'central_bank_ref', 'balance_of_payments_code',
    'transaction_purpose_code',
    // Documents
    'swift_mt300_url', 'confirmation_letter_url',
    'settlement_advice_url', 'reconciliation_report_url',
    // Audit
    'audit_trail', 'last_audited_at', 'audited_by',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    buy_amount: 'float',
    sell_amount: 'float',
    exchange_rate: 'float',
    settlement_rate: 'float',
    rate_difference: 'float',
    our_fees: 'float',
    counterparty_fees: 'float',
    intermediary_fees: 'float',
    total_fees: 'float',
    net_settlement_amount: 'float',
    discrepancy_amount: 'float',
    retry_count: 'integer',
    max_retries: 'integer',
    status_history: 'json',
    fee_breakdown: 'json',
    audit_trail: 'json',
    metadata: 'json',
    tags: 'json',
    confirmation_match: 'boolean',
    confirmation_discrepancy: 'boolean',
    confirmation_resolved_at: 'datetime',
    is_failed: 'boolean',
    is_reconciled: 'boolean',
    discrepancy_resolved: 'boolean',
    regulatory_report_sent: 'boolean',
  };

  static relations = {
    trade: { type: 'belongsTo', model: 'FxTrade', foreignKey: 'trade_id', ownerKey: 'id' },
    corporateEntity: { type: 'belongsTo', model: 'CorporateEntity', foreignKey: 'corporate_id', ownerKey: 'id' },
  };

  static statuses = {
    PENDING: 'pending',
    INSTRUCTIONS_GENERATED: 'instructions_generated',
    PAYMENT_INITIATED: 'payment_initiated',
    PAYMENT_SENT: 'payment_sent',
    PAYMENT_RECEIVED: 'payment_received',
    COMPLETED: 'completed',
    FAILED: 'failed',
    DISPUTED: 'disputed',
    RECONCILED: 'reconciled',
    CANCELLED: 'cancelled',
  };

  static settlementMethods = {
    SWIFT: 'swift', RTGS: 'rtgs', ACH: 'ach',
    INTERNAL: 'internal', NETTING: 'netting',
  };

  static confirmationStatuses = {
    PENDING: 'pending', SENT: 'sent', MATCHED: 'matched',
    DISCREPANCY: 'discrepancy', RESOLVED: 'resolved',
  };

  static generateSettlementNumber() {
    return `FXS-${Date.now().toString(36).toUpperCase()}`;
  }

  /**
   * Create settlement record from trade
   */
  static async createFromTrade(tradeId, options = {}) {
    const trade = await require('./fx-trade').findById(tradeId);
    if (!trade) throw new Error('Trade not found');
    
    const corporate = await require('./corporate-entity').findById(trade.corporate_id);

    return this.create({
      trade_id: tradeId,
      corporate_id: trade.corporate_id,
      settlement_number: this.generateSettlementNumber(),
      settlement_reference: options.reference || `SET-${trade.trade_number}`,
      trade_reference: trade.trade_number,
      trade_date: trade.trade_date,
      value_date: trade.value_date,
      settlement_date: options.settlementDate || trade.value_date,
      settlement_type: options.settlementType || trade.trade_type,
      settlement_method: options.method || this.settlementMethods.SWIFT,
      settlement_priority: options.priority || 'normal',
      buy_currency: trade.buy_currency,
      buy_amount: trade.buy_amount,
      sell_currency: trade.sell_currency,
      sell_amount: trade.sell_amount,
      exchange_rate: trade.exchange_rate,
      settlement_rate: trade.all_in_rate || trade.exchange_rate,
      status: this.statuses.PENDING,
      status_history: [{ status: this.statuses.PENDING, timestamp: new Date().toISOString() }],
      metadata: options.metadata || {},
      tenant_id: options.tenantId || null,
    });
  }

  /**
   * Generate payment instructions
   */
  static async generateInstructions(settlementId, bankDetails) {
    const settlement = await this.findById(settlementId);
    if (!settlement) throw new Error('Settlement not found');

    return this.update({ id: settlementId }, {
      buy_account_name: bankDetails.buyAccountName,
      buy_account_number: bankDetails.buyAccountNumber,
      buy_bank_name: bankDetails.buyBankName,
      buy_bank_swift: bankDetails.buyBankSwift,
      buy_bank_routing: bankDetails.buyBankRouting,
      buy_bank_country: bankDetails.buyBankCountry,
      buy_intermediary_bank: bankDetails.buyIntermediaryBank,
      buy_intermediary_swift: bankDetails.buyIntermediarySwift,
      sell_account_name: bankDetails.sellAccountName,
      sell_account_number: bankDetails.sellAccountNumber,
      sell_bank_name: bankDetails.sellBankName,
      sell_bank_swift: bankDetails.sellBankSwift,
      sell_bank_routing: bankDetails.sellBankRouting,
      sell_bank_country: bankDetails.sellBankCountry,
      payment_reference: `FX/${settlement.settlement_number}`,
      payment_message_type: 'MT300',
      charges_bearer: bankDetails.chargesBearer || 'SHA',
      remittance_info: bankDetails.remittanceInfo || `FX Settlement for ${settlement.settlement_number}`,
      status: this.statuses.INSTRUCTIONS_GENERATED,
      payment_instruction_ref: `INST-${Date.now()}`,
    });
  }

  /**
   * Initiate payment
   */
  static async initiatePayment(settlementId, initiatedBy) {
    return this.update({ id: settlementId }, {
      status: this.statuses.PAYMENT_INITIATED,
      payment_initiated_at: new Date().toISOString(),
      payment_initiated_by: initiatedBy,
    });
  }

  /**
   * Confirm payment sent
   */
  static async confirmSent(settlementId, paymentRef) {
    return this.update({ id: settlementId }, {
      status: this.statuses.PAYMENT_SENT,
      payment_sent_at: new Date().toISOString(),
      payment_sent_ref: paymentRef,
    });
  }

  /**
   * Confirm funds received by counterparty
   */
  static async confirmReceived(settlementId) {
    return this.update({ id: settlementId }, {
      status: this.statuses.PAYMENT_RECEIVED,
      funds_received_at: new Date().toISOString(),
    });
  }

  /**
   * Complete settlement
   */
  static async complete(settlementId) {
    return this.update({ id: settlementId }, {
      status: this.statuses.COMPLETED,
      actual_settlement_date: new Date().toISOString(),
    });
  }

  /**
   * Reconcile settlement
   */
  static async reconcile(settlementId, reconciledBy, options = {}) {
    const settlement = await this.findById(settlementId);
    if (!settlement) throw new Error('Settlement not found');

    const discrepancy = options.discrepancyAmount || 0;
    const reconciled = discrepancy === 0;

    return this.update({ id: settlementId }, {
      is_reconciled: reconciled,
      reconciled_at: new Date().toISOString(),
      reconciled_by: reconciledBy,
      reconciliation_method: options.method || 'manual',
      reconciliation_ref: options.reference || null,
      discrepancy_amount: discrepancy,
      discrepancy_currency: options.discrepancyCurrency || settlement.buy_currency,
      discrepancy_type: options.discrepancyType || null,
      discrepancy_resolved: reconciled,
      discrepancy_resolution: options.resolution || null,
      reconciliation_notes: options.notes || null,
      status: reconciled ? this.statuses.RECONCILED : this.statuses.DISPUTED,
    });
  }

  /**
   * Find settlement by trade ID
   */
  static async findByTrade(tradeId) {
    return this.findOne({ where: { trade_id: tradeId } });
  }

  /**
   * Get pending settlements
   */
  static async findPending() {
    return this.findAll({
      where: {
        status: [
          this.statuses.PENDING,
          this.statuses.INSTRUCTIONS_GENERATED,
          this.statuses.PAYMENT_INITIATED,
          this.statuses.PAYMENT_SENT,
        ],
      },
      orderBy: { settlement_date: 'ASC' },
    });
  }

  /**
   * Get settlements by date range
   */
  static async findByDateRange(startDate, endDate, options = {}) {
    return this.paginate({
      where: {
        settlement_date: { operator: '>=', value: startDate },
      },
      orderBy: { settlement_date: 'DESC' },
      ...options,
    });
  }
}

module.exports = FxSettlement;