const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * FX Hedge Model - FX Hedging Position
 * 
 * Tracks hedging positions for corporate FX risk management.
 * Supports forwards, options, swaps, futures, and NDFs.
 * Includes hedge accounting documentation and effectiveness testing.
 * 
 * TABLE: fx_hedges
 * 
 * HEDGE TYPES:
 * - forward: Forward contract locking in future exchange rate
 * - option: Currency option (call/put) providing downside protection
 * - swap: Currency swap exchanging principal and interest
 * - futures: Exchange-traded currency futures
 * - ndf: Non-deliverable forward for restricted currencies
 * - natural: Natural hedge (matching receivables and payables)
 * 
 * HEDGE ACCOUNTING (IFRS 9):
 * - Fair value hedge: Hedges changes in fair value
 * - Cash flow hedge: Hedges exposure to variability in cash flows
 * - Net investment hedge: Hedges foreign currency exposure of net investment
 * 
 * EFFECTIVENESS TESTING:
 * - Prospective: Before hedge designation
 * - Retrospective: Ongoing (quarterly/semi-annually)
 * - Dollar offset method: Compare changes in fair value
 * - Regression analysis: Statistical relationship testing
 */

class FxHedge extends BaseModel {
  static tableName = 'fx_hedges';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'corporate_id', 'hedge_number',
    // Hedge type and strategy
    'hedge_type', 'hedge_subtype', 'hedge_strategy',
    'hedge_direction', 'option_type',
    // Currency pair
    'buy_currency', 'sell_currency', 'currency_pair',
    'notional_amount', 'notional_currency',
    // Rates
    'strike_rate', 'current_market_rate', 'forward_points',
    'all_in_rate', 'spot_reference_rate', 'rate_source',
    // Option specifics
    'premium_amount', 'premium_currency', 'premium_paid',
    'premium_payment_date', 'premium_due_date',
    'barrier_level', 'knock_in_level', 'knock_out_level',
    // Dates
    'trade_date', 'maturity_date', 'settlement_date',
    'delivery_date', 'expiry_date', 'early_exercise_date',
    'rollover_date', 'rollover_count',
    // Counterparty
    'counterparty', 'counterparty_rating', 'counterparty_ref',
    'counterparty_confirmation_received', 'counterparty_confirmation_date',
    'is_intercompany', 'intercompany_entity',
    // Status and lifecycle
    'status', 'sub_status', 'status_history',
    'execution_status', 'settlement_status',
    // Valuation and P&L
    'pnl', 'pnl_currency', 'pnl_unrealized', 'pnl_realized',
    'pnl_at_maturity', 'mtm_value', 'mtm_currency',
    'last_mtm_at', 'mtm_method', 'mtm_source',
    'valuation_model', 'valuation_parameters',
    // Underlying exposure
    'underlying_exposure', 'exposure_type', 'exposure_description',
    'hedged_item', 'hedged_amount', 'hedge_ratio',
    'hedge_ratio_target', 'underhedge_amount', 'overhedge_amount',
    // Hedge accounting
    'hedge_accounting_applied', 'hedge_accounting_type',
    'hedge_designation_date', 'hedge_de_designation_date',
    'hedge_documentation_url', 'hedge_designation_memo',
    // Effectiveness testing
    'is_effective', 'effectiveness_test_method',
    'effectiveness_test_result', 'effectiveness_test_score',
    'effectiveness_test_date', 'next_effectiveness_test_date',
    'effectiveness_retrospective_result',
    'ineffectiveness_amount', 'ineffectiveness_reason',
    // Cost of hedging
    'cost_of_hedge', 'cost_currency', 'forward_points_cost',
    'carry_cost', 'admin_cost', 'total_cost',
    // Credit risk
    'cva', 'dva', 'credit_risk_adjustment',
    'xva_applied', 'xva_amount',
    // Collateral
    'collateral_required', 'collateral_posted', 'collateral_id',
    'initial_margin', 'variation_margin',
    // Cash flows
    'expected_cash_flows', 'actual_cash_flows',
    'net_cash_flow', 'cash_flow_currency',
    // Rollover/termination
    'termination_date', 'termination_reason', 'termination_fee',
    'termination_settlement', 'novation_date', 'novation_counterparty',
    // Regulatory
    'regulatory_report_sent', 'regulatory_report_ref',
    'reporting_jurisdiction', 'reporting_frequency',
    'emir_reported', 'dodd_frank_reported', 'mifid_reported',
    // Documentation
    'confirm_url', 'term_sheet_url', 'legal_agreement_url',
    'isda_master_agreement_ref', 'csa_ref',
    // Review and approval
    'prepared_by', 'reviewed_by', 'approved_by',
    'approved_at', 'approval_notes',
    'last_reviewed_at', 'next_review_date',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    status_history: 'json',
    valuation_parameters: 'json',
    expected_cash_flows: 'json',
    actual_cash_flows: 'json',
    metadata: 'json',
    tags: 'json',
    notional_amount: 'float',
    strike_rate: 'float',
    current_market_rate: 'float',
    forward_points: 'float',
    all_in_rate: 'float',
    spot_reference_rate: 'float',
    premium_amount: 'float',
    barrier_level: 'float',
    knock_in_level: 'float',
    knock_out_level: 'float',
    pnl: 'float',
    pnl_unrealized: 'float',
    pnl_realized: 'float',
    pnl_at_maturity: 'float',
    mtm_value: 'float',
    hedged_amount: 'float',
    hedge_ratio: 'float',
    hedge_ratio_target: 'float',
    underhedge_amount: 'float',
    overhedge_amount: 'float',
    effectiveness_test_score: 'float',
    ineffectiveness_amount: 'float',
    cost_of_hedge: 'float',
    forward_points_cost: 'float',
    carry_cost: 'float',
    admin_cost: 'float',
    total_cost: 'float',
    cva: 'float',
    dva: 'float',
    credit_risk_adjustment: 'float',
    xva_amount: 'float',
    collateral_required: 'float',
    collateral_posted: 'float',
    initial_margin: 'float',
    variation_margin: 'float',
    net_cash_flow: 'float',
    termination_fee: 'float',
    termination_settlement: 'float',
    rollover_count: 'integer',
    premium_paid: 'boolean',
    counterparty_confirmation_received: 'boolean',
    is_intercompany: 'boolean',
    hedge_accounting_applied: 'boolean',
    is_effective: 'boolean',
    collateral_required: 'boolean',
    xva_applied: 'boolean',
    regulatory_report_sent: 'boolean',
    emir_reported: 'boolean',
    dodd_frank_reported: 'boolean',
    mifid_reported: 'boolean',
  };

  static relations = {
    corporateEntity: {
      type: 'belongsTo',
      model: 'CorporateEntity',
      foreignKey: 'corporate_id',
      ownerKey: 'id',
    },
    collateral: {
      type: 'belongsTo',
      model: 'FxCollateral',
      foreignKey: 'collateral_id',
      ownerKey: 'id',
    },
  };

  static hedgeTypes = {
    FORWARD: 'forward',
    OPTION: 'option',
    SWAP: 'swap',
    FUTURES: 'futures',
    NDF: 'ndf',
    NATURAL: 'natural',
    STRUCTURED: 'structured',
  };

  static optionTypes = {
    CALL: 'call',
    PUT: 'put',
    COLLAR: 'collar',
    FORWARD_EXTRA: 'forward_extra',
    KNOCK_IN: 'knock_in',
    KNOCK_OUT: 'knock_out',
    DIGITAL: 'digital',
    BARRIER: 'barrier',
  };

  static hedgeDirections = {
    BUY: 'buy',
    SELL: 'sell',
  };

  static statuses = {
    DRAFT: 'draft',
    PENDING_APPROVAL: 'pending_approval',
    PENDING_EXECUTION: 'pending_execution',
    ACTIVE: 'active',
    MATURED: 'matured',
    TERMINATED: 'terminated',
    EXPIRED: 'expired',
    EXERCISED: 'exercised',
    ROLLED_OVER: 'rolled_over',
    NOVATED: 'novated',
    INEFFECTIVE: 'ineffective',
  };

  static hedgeAccountingTypes = {
    FAIR_VALUE_HEDGE: 'fair_value_hedge',
    CASH_FLOW_HEDGE: 'cash_flow_hedge',
    NET_INVESTMENT_HEDGE: 'net_investment_hedge',
    NONE: 'none',
  };

  static effectivenessMethods = {
    DOLLAR_OFFSET: 'dollar_offset',
    REGRESSION: 'regression',
    VARIABILITY_REDUCTION: 'variability_reduction',
    CRITICAL_TERMS_MATCH: 'critical_terms_match',
    HYPOTHETICAL_DERIVATIVE: 'hypothetical_derivative',
  };

  static generateHedgeNumber() {
    return `FXH-${Date.now().toString(36).toUpperCase()}`;
  }

  /**
   * Create a new hedge position
   */
  static async createHedge(corporateId, hedgeDetails) {
    const corporate = await require('./corporate-entity').findById(corporateId);
    if (!corporate) throw new Error('Corporate entity not found');
    if (!corporate.fx_enabled) throw new Error('FX trading not enabled for this corporate entity');

    const currencyPair = `${hedgeDetails.buyCurrency}/${hedgeDetails.sellCurrency}`;
    const premiumAmount = hedgeDetails.premiumAmount || 0;

    return this.create({
      corporate_id: corporateId,
      hedge_number: this.generateHedgeNumber(),
      hedge_type: hedgeDetails.hedgeType,
      hedge_subtype: hedgeDetails.hedgeSubtype || null,
      hedge_strategy: hedgeDetails.hedgeStrategy || null,
      hedge_direction: hedgeDetails.hedgeDirection || this.hedgeDirections.BUY,
      option_type: hedgeDetails.optionType || null,
      buy_currency: hedgeDetails.buyCurrency,
      sell_currency: hedgeDetails.sellCurrency,
      currency_pair: currencyPair,
      notional_amount: hedgeDetails.notionalAmount,
      notional_currency: hedgeDetails.notionalCurrency || hedgeDetails.buyCurrency,
      strike_rate: hedgeDetails.strikeRate,
      forward_points: hedgeDetails.forwardPoints || 0,
      all_in_rate: hedgeDetails.allInRate || hedgeDetails.strikeRate,
      spot_reference_rate: hedgeDetails.spotReferenceRate || null,
      rate_source: hedgeDetails.rateSource || 'manual',
      premium_amount: premiumAmount,
      premium_currency: hedgeDetails.premiumCurrency || hedgeDetails.buyCurrency,
      premium_paid: premiumAmount === 0,
      premium_payment_date: premiumAmount > 0 ? hedgeDetails.premiumPaymentDate : null,
      trade_date: new Date().toISOString(),
      maturity_date: hedgeDetails.maturityDate,
      settlement_date: hedgeDetails.settlementDate || hedgeDetails.maturityDate,
      expiry_date: hedgeDetails.expiryDate || null,
      counterparty: hedgeDetails.counterparty,
      counterparty_rating: hedgeDetails.counterpartyRating || null,
      counterparty_ref: hedgeDetails.counterpartyRef || null,
      is_intercompany: hedgeDetails.isIntercompany || false,
      intercompany_entity: hedgeDetails.intercompanyEntity || null,
      status: hedgeDetails.status || this.statuses.DRAFT,
      underlying_exposure: hedgeDetails.underlyingExposure || null,
      exposure_type: hedgeDetails.exposureType || null,
      hedged_item: hedgeDetails.hedgedItem || null,
      hedged_amount: hedgeDetails.hedgedAmount || hedgeDetails.notionalAmount,
      hedge_ratio: hedgeDetails.hedgeRatio || 1.0,
      hedge_accounting_applied: hedgeDetails.hedgeAccountingApplied || false,
      hedge_accounting_type: hedgeDetails.hedgeAccountingType || this.hedgeAccountingTypes.NONE,
      isda_master_agreement_ref: hedgeDetails.isdaRef || null,
      csa_ref: hedgeDetails.csaRef || null,
      prepared_by: hedgeDetails.preparedBy || null,
      metadata: hedgeDetails.metadata || {},
      tenant_id: hedgeDetails.tenantId || null,
    });
  }

  /**
   * Find hedges by corporate client
   */
  static async findByCorporate(corporateId, options = {}) {
    return this.paginate({
      where: { corporate_id: corporateId },
      orderBy: { maturity_date: 'ASC' },
      ...options,
    });
  }

  /**
   * Find active hedges (not matured/terminated)
   */
  static async findActive(corporateId = null) {
    const criteria = {
      status: [
        this.statuses.ACTIVE, this.statuses.PENDING_EXECUTION,
      ],
    };
    if (corporateId) criteria.corporate_id = corporateId;

    return this.findAll({
      where: criteria,
      orderBy: { maturity_date: 'ASC' },
    });
  }

  /**
   * Get total hedge exposure by currency pair
   */
  static async getExposure(corporateId) {
    const text = `
      SELECT
        buy_currency,
        sell_currency,
        currency_pair,
        hedge_type,
        COUNT(*) as position_count,
        SUM(notional_amount) as total_notional,
        AVG(strike_rate) as avg_strike_rate,
        SUM(pnl) as total_pnl,
        SUM(pnl_unrealized) as total_unrealized_pnl,
        SUM(pnl_realized) as total_realized_pnl,
        MIN(maturity_date) as nearest_maturity,
        MAX(maturity_date) as farthest_maturity
      FROM ${this.tableName}
      WHERE corporate_id = $1
        AND status IN ('active', 'pending_execution')
      GROUP BY buy_currency, sell_currency, currency_pair, hedge_type
      ORDER BY total_notional DESC
    `;

    const result = await connectionPool.query(text, [corporateId]);
    return result.rows;
  }

  /**
   * Mark hedge to market (update current valuation)
   */
  static async markToMarket(hedgeId, currentRate, mtmValue, pnl, options = {}) {
    const hedge = await this.findById(hedgeId);
    if (!hedge) throw new Error('Hedge not found');

    const pnlUnrealized = pnl - (hedge.pnl_realized || 0);

    return this.update({ id: hedgeId }, {
      current_market_rate: currentRate,
      mtm_value: Math.round(mtmValue * 100) / 100,
      mtm_currency: options.mtmCurrency || hedge.notional_currency,
      pnl: Math.round(pnl * 100) / 100,
      pnl_unrealized: Math.round(pnlUnrealized * 100) / 100,
      last_mtm_at: new Date().toISOString(),
      mtm_method: options.method || 'market_data',
      mtm_source: options.source || 'manual',
    });
  }

  /**
   * Test hedge effectiveness
   */
  static async testEffectiveness(hedgeId, method, result, score, options = {}) {
    const hedge = await this.findById(hedgeId);
    if (!hedge) throw new Error('Hedge not found');

    const isEffective = score >= 0.80 && score <= 1.25; // IFRS 9: 80%-125% threshold

    return this.update({ id: hedgeId }, {
      is_effective: isEffective,
      effectiveness_test_method: method,
      effectiveness_test_result: result,
      effectiveness_test_score: score,
      effectiveness_test_date: new Date().toISOString(),
      next_effectiveness_test_date: new Date(Date.now() + 90 * 86400000).toISOString(),
      ineffectiveness_amount: !isEffective ? options.ineffectivenessAmount || 0 : 0,
      ineffectiveness_reason: !isEffective ? options.ineffectivenessReason : null,
      status: !isEffective ? this.statuses.INEFFECTIVE : hedge.status,
    });
  }

  /**
   * Exercise an option hedge
   */
  static async exerciseOption(hedgeId, settlementAmount, options = {}) {
    const hedge = await this.findById(hedgeId);
    if (!hedge) throw new Error('Hedge not found');
    if (hedge.hedge_type !== this.hedgeTypes.OPTION) {
      throw new Error('Only option hedges can be exercised');
    }

    const pnl = settlementAmount - (hedge.premium_amount || 0);

    return this.update({ id: hedgeId }, {
      status: this.statuses.EXERCISED,
      exercised_at: new Date().toISOString(),
      settlement_date: new Date().toISOString(),
      pnl: Math.round(pnl * 100) / 100,
      pnl_realized: Math.round(pnl * 100) / 100,
      pnl_unrealized: 0,
      mtm_value: 0,
      execution_status: 'exercised',
      settlement_status: options.settled ? 'settled' : 'pending',
    });
  }

  /**
   * Terminate a hedge early
   */
  static async terminate(hedgeId, reason, terminationFee = 0, options = {}) {
    const hedge = await this.findById(hedgeId);
    if (!hedge) throw new Error('Hedge not found');

    return this.update({ id: hedgeId }, {
      status: this.statuses.TERMINATED,
      termination_date: new Date().toISOString(),
      termination_reason: reason,
      termination_fee: terminationFee,
      termination_settlement: options.settlementAmount || 0,
      settlement_status: options.settled ? 'settled' : 'pending',
    });
  }

  /**
   * Roll over a hedge (extend maturity)
   */
  static async rollover(hedgeId, newMaturityDate, newStrikeRate, options = {}) {
    const hedge = await this.findById(hedgeId);
    if (!hedge) throw new Error('Hedge not found');

    // Mark original as rolled over
    await this.update({ id: hedgeId }, {
      status: this.statuses.ROLLED_OVER,
      rollover_date: new Date().toISOString(),
      rollover_count: (hedge.rollover_count || 0) + 1,
    });

    // Create new hedge with extended maturity
    return this.createHedge(hedge.corporate_id, {
      hedgeType: hedge.hedge_type,
      hedgeSubtype: hedge.hedge_subtype,
      hedgeStrategy: hedge.hedge_strategy,
      hedgeDirection: hedge.hedge_direction,
      buyCurrency: hedge.buy_currency,
      sellCurrency: hedge.sell_currency,
      notionalAmount: hedge.notional_amount,
      notionalCurrency: hedge.notional_currency,
      strikeRate: newStrikeRate,
      forwardPoints: options.forwardPoints || 0,
      allInRate: newStrikeRate + (options.forwardPoints || 0),
      spotReferenceRate: options.spotRate || hedge.spot_reference_rate,
      maturityDate: newMaturityDate,
      settlementDate: options.settlementDate || newMaturityDate,
      counterparty: hedge.counterparty,
      counterpartyRef: hedge.counterparty_ref,
      status: this.statuses.ACTIVE,
      preparedBy: options.preparedBy || hedge.prepared_by,
      metadata: { ...(hedge.metadata || {}), rolledFrom: hedgeId },
    });
  }

  /**
   * Get hedge effectiveness summary for reporting
   */
  static async getEffectivenessSummary(corporateId) {
    const text = `
      SELECT
        COUNT(*) as total_hedges,
        COUNT(CASE WHEN is_effective = true THEN 1 END) as effective_hedges,
        COUNT(CASE WHEN is_effective = false THEN 1 END) as ineffective_hedges,
        COUNT(CASE WHEN hedge_accounting_applied = true THEN 1 END) as hedge_accounting_applied,
        SUM(CASE WHEN is_effective = false THEN ineffectiveness_amount ELSE 0 END) as total_ineffectiveness,
        AVG(effectiveness_test_score) as avg_effectiveness_score,
        MIN(next_effectiveness_test_date) as next_test_due
      FROM ${this.tableName}
      WHERE corporate_id = $1
        AND status IN ('active', 'pending_execution')
    `;

    const result = await connectionPool.query(text, [corporateId]);
    return result.rows[0];
  }

  /**
   * Calculate total cost of hedging for a period
   */
  static async getHedgingCost(corporateId, startDate, endDate) {
    const text = `
      SELECT
        SUM(premium_amount) as total_premiums,
        SUM(forward_points_cost) as total_forward_points_cost,
        SUM(carry_cost) as total_carry_cost,
        SUM(admin_cost) as total_admin_cost,
        SUM(total_cost) as total_cost,
        SUM(termination_fee) as total_termination_fees
      FROM ${this.tableName}
      WHERE corporate_id = $1
        AND trade_date BETWEEN $2 AND $3
    `;

    const result = await connectionPool.query(text, [corporateId, startDate, endDate]);
    return result.rows[0];
  }
}

module.exports = FxHedge;