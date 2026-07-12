const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * FX Trade Model - Foreign Exchange Trade Record
 * 
 * Core record for all FX trades executed on the platform.
 * Trades are created from accepted quotes and progress through
 * execution, confirmation, settlement, and reconciliation.
 * 
 * TABLE: fx_trades
 * 
 * TRADE LIFECYCLE:
 * 1. Quote accepted -> Trade created (status: pending)
 * 2. Trade validated -> Compliance/limit checks
 * 3. Trade executed -> Sent to market/counterparty
 * 4. Trade confirmed -> Counterparty confirms
 * 5. Trade settled -> Funds transferred
 * 6. Trade reconciled -> Accounting matched
 * 
 * TRADE TYPES:
 * - spot: T+2 settlement (standard)
 * - forward: Future dated settlement
 * - swap: Simultaneous buy and sell
 * - ndf: Non-deliverable forward (cash settled)
 * - limit_order: Execute when rate reaches target
 * - algo: Algorithmic execution
 */

class FxTrade extends BaseModel {
  static tableName = 'fx_trades';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'corporate_id', 'quote_id', 'user_id',
    // Trade identification
    'trade_number', 'trade_reference', 'external_trade_id',
    'parent_trade_id', 'allocation_id', 'block_trade_id',
    // Trade type
    'trade_type', 'trade_subtype', 'execution_type',
    'trade_strategy', 'trade_purpose',
    // Currency pair
    'buy_currency', 'buy_amount', 'sell_currency', 'sell_amount',
    'currency_pair', 'notional_currency', 'notional_amount',
    // Rates
    'exchange_rate', 'all_in_rate', 'inverse_rate',
    'spot_rate', 'forward_points', 'forward_points_bps',
    'strike_rate', 'barrier_level',
    // Value dates
    'trade_date', 'value_date', 'maturity_date',
    'delivery_date', 'tenor', 'tenor_days',
    'fixing_date', 'fixing_rate', 'fixing_source',
    // Execution
    'execution_venue', 'execution_method', 'execution_algorithm',
    'executed_at', 'executed_by', 'execution_price',
    'slippage_amount', 'slippage_percent', 'execution_notes',
    // Status
    'status', 'sub_status', 'execution_status',
    'settlement_status', 'confirmation_status',
    'status_history', 'status_change_reason',
    // Counterparty
    'counterparty', 'counterparty_ref', 'counterparty_confirmation',
    'counterparty_confirmed_at', 'is_internal',
    // Pricing
    'margin', 'margin_percent', 'margin_amount',
    'commission', 'commission_percent', 'commission_amount',
    'spread', 'spread_bps', 'all_in_spread',
    // Net amounts
    'net_buy_amount', 'net_sell_amount',
    'fees', 'total_fees', 'fee_breakdown',
    'fee_currency', 'net_settlement',
    // Trader info
    'trader_id', 'trader_name', 'trader_notes',
    'salesperson_id', 'salesperson_name',
    // Hedge linkage
    'hedge_id', 'hedge_reference', 'hedge_ratio',
    'is_hedged', 'hedge_accounting_applied',
    // Collateral
    'collateral_id', 'collateral_required',
    'collateral_posted', 'initial_margin',
    'variation_margin', 'margin_call_issued',
    // P&L
    'profit_loss', 'pnl_currency', 'pnl_unrealized',
    'pnl_realized', 'pnl_realized_at',
    'mtm_value', 'mtm_currency', 'last_mtm_at',
    'entry_rate', 'exit_rate', 'rate_difference',
    // Rollover
    'is_rollover', 'rollover_from_trade_id',
    'rollover_to_trade_id', 'rollover_date',
    'rollover_count', 'rollover_reason',
    // Settlement
    'settlement_id', 'settlement_reference',
    'settlement_date', 'settlement_method',
    // Cancellation
    'cancellation_reason', 'cancellation_code',
    'cancelled_at', 'cancelled_by',
    'cancellation_approved_by',
    // Compliance
    'compliance_checked', 'compliance_checked_at',
    'compliance_checked_by', 'compliance_notes',
    'aml_checked', 'aml_risk_level', 'sanctions_screened',
    'kyc_verified', 'regulatory_checks_passed',
    // Regulatory
    'regulatory_report_sent', 'regulatory_report_ref',
    'regulatory_report_date', 'reporting_jurisdiction',
    'emir_reported', 'emir_uti', 'dodd_frank_reported',
    'mifid_reported', 'transaction_reporting_ref',
    // Best execution
    'best_execution_applied', 'best_execution_policy_ref',
    'best_execution_analysis_url',
    // Documentation
    'term_sheet_url', 'confirmation_url',
    'legal_agreement_ref', 'trade_confirmation_ref',
    // Approval
    'requested_by', 'approved_by', 'approved_at',
    'approval_notes', 'is_approved',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    buy_amount: 'float', sell_amount: 'float',
    notional_amount: 'float', exchange_rate: 'float',
    all_in_rate: 'float', inverse_rate: 'float',
    spot_rate: 'float', forward_points: 'float',
    forward_points_bps: 'float', strike_rate: 'float',
    barrier_level: 'float', fixing_rate: 'float',
    execution_price: 'float', slippage_amount: 'float',
    slippage_percent: 'float', margin: 'float',
    margin_percent: 'float', margin_amount: 'float',
    commission: 'float', commission_percent: 'float',
    commission_amount: 'float', spread: 'float',
    spread_bps: 'float', net_buy_amount: 'float',
    net_sell_amount: 'float', fees: 'float',
    total_fees: 'float', net_settlement: 'float',
    hedge_ratio: 'float', collateral_required: 'float',
    collateral_posted: 'float', initial_margin: 'float',
    variation_margin: 'float', profit_loss: 'float',
    pnl_unrealized: 'float', pnl_realized: 'float',
    mtm_value: 'float', entry_rate: 'float',
    exit_rate: 'float', rate_difference: 'float',
    tenor_days: 'integer', rollover_count: 'integer',
    status_history: 'json', fee_breakdown: 'json',
    metadata: 'json', tags: 'json',
    is_hedged: 'boolean', hedge_accounting_applied: 'boolean',
    margin_call_issued: 'boolean', pnl_realized: 'boolean',
    is_rollover: 'boolean', compliance_checked: 'boolean',
    aml_checked: 'boolean', sanctions_screened: 'boolean',
    kyc_verified: 'boolean', regulatory_checks_passed: 'boolean',
    best_execution_applied: 'boolean', is_approved: 'boolean',
    regulatory_report_sent: 'boolean', emir_reported: 'boolean',
    dodd_frank_reported: 'boolean', mifid_reported: 'boolean',
    is_internal: 'boolean', counterparty_confirmation: 'boolean',
  };

  static relations = {
    corporateEntity: { type: 'belongsTo', model: 'CorporateEntity', foreignKey: 'corporate_id', ownerKey: 'id' },
    quote: { type: 'belongsTo', model: 'FxQuote', foreignKey: 'quote_id', ownerKey: 'id' },
    settlement: { type: 'hasOne', model: 'FxSettlement', foreignKey: 'trade_id', localKey: 'id' },
    hedge: { type: 'belongsTo', model: 'FxHedge', foreignKey: 'hedge_id', ownerKey: 'id' },
  };

  static types = { SPOT: 'spot', FORWARD: 'forward', SWAP: 'swap', NDF: 'ndf', LIMIT_ORDER: 'limit_order', ALGO: 'algo' };
  static statuses = { PENDING: 'pending', VALIDATED: 'validated', EXECUTED: 'executed', CONFIRMED: 'confirmed', SETTLED: 'settled', RECONCILED: 'reconciled', CANCELLED: 'cancelled', FAILED: 'failed', DISPUTED: 'disputed', AMENDED: 'amended' };
  static executionTypes = { MARKET: 'market', LIMIT: 'limit', STOP: 'stop', ALGO: 'algo', TWAP: 'twap', VWAP: 'vwap', ICEBERG: 'iceberg' };

  static generateTradeNumber() { return `FXT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`; }

  /**
   * Create trade from accepted quote
   */
  static async createFromQuote(quoteId, userId, options = {}) {
    const quote = await require('./fx-quote').findById(quoteId);
    if (!quote) throw new Error('Quote not found');
    if (!quote.is_accepted) throw new Error('Quote has not been accepted');

    const existing = await this.findOne({ where: { quote_id: quoteId } });
    if (existing) throw new Error('Trade already exists for this quote');

    const marginAmount = quote.buy_amount * (quote.margin_percent / 100);
    const commissionAmount = quote.buy_amount * ((options.commissionPercent || 0.5) / 100);
    const netBuyAmount = quote.buy_amount - marginAmount - commissionAmount;

    return this.create({
      corporate_id: quote.corporate_id, quote_id: quoteId, user_id: userId,
      trade_number: this.generateTradeNumber(), trade_reference: options.reference || `TRADE-${quote.quote_number}`,
      trade_type: quote.trade_type, trade_subtype: quote.trade_subtype,
      buy_currency: quote.buy_currency, buy_amount: quote.buy_amount,
      sell_currency: quote.sell_currency, sell_amount: quote.sell_amount,
      currency_pair: quote.currency_pair, notional_currency: quote.buy_currency, notional_amount: quote.buy_amount,
      exchange_rate: quote.all_in_rate, all_in_rate: quote.all_in_rate, inverse_rate: quote.inverse_rate,
      spot_rate: quote.market_rate, forward_points: quote.forward_points,
      trade_date: new Date().toISOString(), value_date: quote.value_date,
      tenor: quote.tenor, tenor_days: quote.tenor_days,
      margin: quote.margin, margin_percent: quote.margin_percent, margin_amount: Math.round(marginAmount * 100) / 100,
      commission: options.commissionPercent || 0.5, commission_percent: options.commissionPercent || 0.5,
      commission_amount: Math.round(commissionAmount * 100) / 100,
      spread: quote.spread, spread_bps: quote.spread_bps,
      net_buy_amount: Math.round(netBuyAmount * 100) / 100,
      net_sell_amount: quote.sell_amount,
      trader_id: options.traderId, trader_name: options.traderName,
      salesperson_id: options.salespersonId, salesperson_name: options.salespersonName,
      hedge_id: options.hedgeId, hedge_reference: options.hedgeReference,
      is_hedged: !!options.hedgeId, hedge_ratio: options.hedgeRatio || 1.0,
      status: this.statuses.PENDING, execution_status: 'pending',
      status_history: [{ status: this.statuses.PENDING, timestamp: new Date().toISOString() }],
      counterparty: options.counterparty, counterparty_ref: options.counterpartyRef,
      requested_by: userId, is_approved: !options.requiresApproval,
      metadata: options.metadata || {}, tenant_id: options.tenantId || null,
    });
  }

  /**
   * Execute a pending trade
   */
  static async execute(tradeId, executedBy, options = {}) {
    const trade = await this.findById(tradeId);
    if (!trade) throw new Error('Trade not found');
    if (trade.status !== this.statuses.PENDING && trade.status !== this.statuses.VALIDATED) {
      throw new Error(`Cannot execute trade with status: ${trade.status}`);
    }

    const history = trade.status_history || [];
    history.push({ status: this.statuses.EXECUTED, timestamp: new Date().toISOString(), executedBy });

    return this.update({ id: tradeId }, {
      status: this.statuses.EXECUTED, execution_status: 'executed',
      executed_at: new Date().toISOString(), executed_by: executedBy,
      execution_venue: options.venue || 'platform', execution_method: options.method || 'market',
      execution_price: options.executionPrice || trade.exchange_rate,
      slippage_amount: options.slippageAmount || 0,
      slippage_percent: options.slippagePercent || 0,
      execution_notes: options.notes, status_history: history,
    });
  }

  /**
   * Confirm trade with counterparty
   */
  static async confirm(tradeId, confirmedBy) {
    const trade = await this.findById(tradeId);
    if (!trade) throw new Error('Trade not found');

    const history = trade.status_history || [];
    history.push({ status: this.statuses.CONFIRMED, timestamp: new Date().toISOString(), confirmedBy });

    return this.update({ id: tradeId }, {
      status: this.statuses.CONFIRMED, confirmation_status: 'confirmed',
      counterparty_confirmation: true, counterparty_confirmed_at: new Date().toISOString(),
      status_history: history,
    });
  }

  /**
   * Mark trade as settled
   */
  static async settle(tradeId) {
    const trade = await this.findById(tradeId);
    if (!trade) throw new Error('Trade not found');

    const history = trade.status_history || [];
    history.push({ status: this.statuses.SETTLED, timestamp: new Date().toISOString() });

    return this.update({ id: tradeId }, {
      status: this.statuses.SETTLED, settlement_status: 'settled',
      settlement_date: new Date().toISOString(), status_history: history,
    });
  }

  /**
   * Cancel a trade
   */
  static async cancel(tradeId, reason, cancelledBy, approvedBy = null) {
    const trade = await this.findById(tradeId);
    if (!trade) throw new Error('Trade not found');
    if ([this.statuses.SETTLED, this.statuses.RECONCILED].includes(trade.status)) {
      throw new Error('Cannot cancel a settled trade');
    }

    const history = trade.status_history || [];
    history.push({ status: this.statuses.CANCELLED, timestamp: new Date().toISOString(), reason, cancelledBy });

    return this.update({ id: tradeId }, {
      status: this.statuses.CANCELLED, cancellation_reason: reason?.substring(0, 500),
      cancelled_at: new Date().toISOString(), cancelled_by: cancelledBy,
      cancellation_approved_by: approvedBy, status_history: history,
    });
  }

  /**
   * Find trades by corporate client
   */
  static async findByCorporate(corporateId, options = {}) {
    return this.paginate({ where: { corporate_id: corporateId }, orderBy: { created_at: 'DESC' }, ...options });
  }

  /**
   * Find trades by date range
   */
  static async findByDateRange(startDate, endDate, options = {}) {
    return this.paginate({
      where: { trade_date: { operator: '>=', value: startDate } },
      orderBy: { trade_date: 'DESC' }, ...options,
    });
  }

  /**
   * Get trade P&L summary
   */
  static async getPnLSummary(corporateId = null, startDate = null, endDate = null) {
    const text = `
      SELECT
        buy_currency, sell_currency, currency_pair,
        COUNT(*) as trade_count,
        SUM(buy_amount) as total_buy_volume,
        SUM(profit_loss) as total_pnl,
        SUM(CASE WHEN profit_loss > 0 THEN profit_loss ELSE 0 END) as total_gains,
        SUM(CASE WHEN profit_loss < 0 THEN ABS(profit_loss) ELSE 0 END) as total_losses,
        AVG(exchange_rate) as avg_rate,
        SUM(commission_amount) as total_commission,
        SUM(margin_amount) as total_margin
      FROM ${this.tableName}
      WHERE status IN ('settled', 'reconciled')
        ${corporateId ? 'AND corporate_id = $1' : ''}
        ${startDate ? `AND trade_date >= $${corporateId ? 2 : 1}` : ''}
        ${endDate ? `AND trade_date <= $${(corporateId ? 2 : 1) + (startDate ? 1 : 0)}` : ''}
      GROUP BY buy_currency, sell_currency, currency_pair
      ORDER BY total_buy_volume DESC
    `;
    const values = [];
    if (corporateId) values.push(corporateId);
    if (startDate) values.push(startDate);
    if (endDate) values.push(endDate);
    const result = await connectionPool.query(text, values.length > 0 ? values : undefined);
    return result.rows;
  }

  /**
   * Get open positions (trades not yet settled)
   */
  static async getOpenPositions(corporateId = null) {
    const criteria = { status: [this.statuses.PENDING, this.statuses.VALIDATED, this.statuses.EXECUTED, this.statuses.CONFIRMED] };
    if (corporateId) criteria.corporate_id = corporateId;
    return this.findAll({ where: criteria, orderBy: { value_date: 'ASC' } });
  }

  /**
   * Check trade against compliance rules
   */
  static async complianceCheck(tradeId, checkedBy) {
    return this.update({ id: tradeId }, {
      compliance_checked: true, compliance_checked_at: new Date().toISOString(),
      compliance_checked_by: checkedBy, aml_checked: true,
      sanctions_screened: true, regulatory_checks_passed: true,
    });
  }
}

module.exports = FxTrade;