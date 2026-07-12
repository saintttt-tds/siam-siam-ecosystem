const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * FX Collateral Model - Collateral for FX Trades
 * 
 * Manages collateral held against FX trading positions for corporate clients.
 * Collateral can be cash deposits, bank guarantees, securities, 
 * letters of credit, or other approved assets.
 * 
 * TABLE: fx_collateral
 * 
 * COLLATERAL LIFECYCLE:
 * 1. Corporate client deposits collateral
 * 2. Collateral is valued and haircut applied
 * 3. Trading limits are set based on collateral value
 * 4. Collateral is monitored (mark-to-market)
 * 5. Margin calls issued if value drops below threshold
 * 6. Collateral released when positions are closed
 * 
 * COLLATERAL TYPES:
 * - cash: Cash deposit in specified currency
 * - securities: Marketable securities (subject to haircut)
 * - bank_guarantee: Bank-issued guarantee
 * - letter_of_credit: Standby letter of credit
 * - real_estate: Real estate (rarely accepted)
 * - other: Other approved assets
 */

class FxCollateral extends BaseModel {
  static tableName = 'fx_collateral';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'corporate_id',
    // Trade association (can cover multiple trades)
    'trade_ids', 'collateral_pool_id',
    // Collateral details
    'collateral_type', 'collateral_subtype',
    'currency', 'amount', 'original_amount',
    'haircut_percent', 'haircut_amount',
    'valuation_amount', 'valuation_currency',
    'exchange_rate', 'base_currency', 'base_valuation_amount',
    // Status tracking
    'status', 'sub_status', 'status_history',
    'held_since', 'released_at', 'release_reason',
    'released_by', 'release_approved_by',
    // Margin calls
    'margin_call_issued', 'margin_call_amount',
    'margin_call_currency', 'margin_call_due_date',
    'margin_call_notification_sent', 'margin_call_notification_date',
    'margin_call_met', 'margin_call_met_at',
    'margin_call_met_amount', 'margin_call_breached',
    'margin_call_breach_notified',
    // Valuation
    'valuation_date', 'last_valuation_at',
    'valuation_method', 'valuation_source',
    'mark_to_market', 'last_mtm_at', 'mtm_frequency',
    'next_mtm_at', 'mtm_change_percent',
    // Custody
    'custodian', 'custodian_account', 'custodian_ref',
    'custodian_confirmation_received', 'custodian_confirmation_date',
    // Rehypothecation
    'is_rehypothecated', 'rehypothecation_limit',
    'rehypothecation_amount', 'rehypothecation_counterparty',
    // Insurance
    'is_insured', 'insurance_provider', 'insurance_policy_number',
    'insurance_amount', 'insurance_expiry',
    // Documentation
    'collateral_agreement_url', 'valuation_report_url',
    'custody_statement_url',
    // Audit
    'audit_trail', 'last_audited_at', 'audited_by',
    // Approval
    'approved_by', 'approved_at', 'approval_notes',
    'review_date', 'last_reviewed_at', 'reviewed_by',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    trade_ids: 'json',
    status_history: 'json',
    audit_trail: 'json',
    metadata: 'json',
    tags: 'json',
    amount: 'float',
    original_amount: 'float',
    haircut_percent: 'float',
    haircut_amount: 'float',
    valuation_amount: 'float',
    exchange_rate: 'float',
    base_valuation_amount: 'float',
    margin_call_amount: 'float',
    margin_call_met_amount: 'float',
    mark_to_market: 'float',
    mtm_change_percent: 'float',
    rehypothecation_limit: 'float',
    rehypothecation_amount: 'float',
    insurance_amount: 'float',
    margin_call_issued: 'boolean',
    margin_call_notification_sent: 'boolean',
    margin_call_met: 'boolean',
    margin_call_breached: 'boolean',
    margin_call_breach_notified: 'boolean',
    custodian_confirmation_received: 'boolean',
    is_rehypothecated: 'boolean',
    is_insured: 'boolean',
  };

  static relations = {
    corporateEntity: {
      type: 'belongsTo',
      model: 'CorporateEntity',
      foreignKey: 'corporate_id',
      ownerKey: 'id',
    },
  };

  // Collateral type constants
  static collateralTypes = {
    CASH: 'cash',
    SECURITIES: 'securities',
    BANK_GUARANTEE: 'bank_guarantee',
    LETTER_OF_CREDIT: 'letter_of_credit',
    REAL_ESTATE: 'real_estate',
    OTHER: 'other',
  };

  // Collateral status constants
  static statuses = {
    PENDING: 'pending',
    HELD: 'held',
    VALUING: 'valuing',
    MARGIN_CALLED: 'margin_called',
    PARTIALLY_RELEASED: 'partially_released',
    RELEASED: 'released',
    FORFEITED: 'forfeited',
    RETURNED: 'returned',
    DISPUTED: 'disputed',
    EXPIRED: 'expired',
  };

  // Standard haircut percentages by collateral type
  static standardHaircuts = {
    cash: 0,           // Cash - no haircut
    securities: 20,     // Securities - 20% haircut
    bank_guarantee: 10, // Bank guarantee - 10% haircut
    letter_of_credit: 15,
    real_estate: 40,    // Real estate - 40% haircut
    other: 30,
  };

  // Margin call thresholds
  static marginThresholds = {
    warning: 80,   // Warning at 80% utilization
    call: 90,      // Margin call at 90% utilization
    breach: 100,   // Breach at 100% utilization
  };

  static hooks = {
    beforeCreate: [
      async (data) => {
        // Auto-calculate haircut if not provided
        if (!data.haircut_percent && data.collateral_type) {
          data.haircut_percent = FxCollateral.standardHaircuts[data.collateral_type] || 30;
        }
        
        // Calculate haircut amount and valuation
        if (data.amount && data.haircut_percent) {
          data.haircut_amount = Math.round(data.amount * data.haircut_percent) / 100;
          data.valuation_amount = data.amount - data.haircut_amount;
        }

        // Set base currency valuation
        if (data.valuation_amount && data.exchange_rate && data.base_currency) {
          data.base_valuation_amount = Math.round(data.valuation_amount * data.exchange_rate * 100) / 100;
        }

        // Initialize status history
        data.status_history = [{
          status: data.status || FxCollateral.statuses.PENDING,
          timestamp: new Date().toISOString(),
          note: 'Collateral record created',
        }];

        // Set next MTM date
        if (!data.next_mtm_at) {
          data.next_mtm_at = new Date(Date.now() + 24 * 3600000).toISOString(); // Next day
        }
      },
    ],
    beforeUpdate: [
      async (data, instance) => {
        // Track status changes
        if (data.status && data.status !== instance.status) {
          const history = instance.status_history || [];
          history.push({
            status: data.status,
            previousStatus: instance.status,
            timestamp: new Date().toISOString(),
            note: data.status_change_note || `Status changed from ${instance.status} to ${data.status}`,
          });
          data.status_history = history;
        }
      },
    ],
  };

  /**
   * Deposit collateral for a corporate client
   * @param {string} corporateId - Corporate entity ID
   * @param {Object} depositDetails - Collateral deposit details
   * @returns {Promise<Object>} Created collateral record
   */
  static async depositCollateral(corporateId, depositDetails) {
    const {
      collateralType,
      currency,
      amount,
      custodian,
      custodianAccount,
      exchangeRate = 1,
      baseCurrency = 'USD',
      tradeIds = [],
      metadata = {},
    } = depositDetails;

    // Validate corporate exists
    const corporate = await require('./corporate-entity').findById(corporateId);
    if (!corporate) {
      throw new Error('Corporate entity not found');
    }

    // Validate minimum deposit amount
    if (amount < 1000) {
      throw new Error('Minimum collateral deposit is 1,000');
    }

    const haircutPercent = depositDetails.haircutPercent || FxCollateral.standardHaircuts[collateralType] || 30;
    const haircutAmount = Math.round(amount * haircutPercent) / 100;
    const valuationAmount = amount - haircutAmount;
    const baseValuationAmount = Math.round(valuationAmount * exchangeRate * 100) / 100;

    const collateral = await this.create({
      corporate_id: corporateId,
      trade_ids: tradeIds,
      collateral_type: collateralType,
      currency: currency.toUpperCase(),
      amount,
      original_amount: amount,
      haircut_percent: haircutPercent,
      haircut_amount: haircutAmount,
      valuation_amount: valuationAmount,
      valuation_currency: currency.toUpperCase(),
      exchange_rate: exchangeRate,
      base_currency: baseCurrency,
      base_valuation_amount: baseValuationAmount,
      status: this.statuses.PENDING,
      held_since: new Date().toISOString(),
      custodian,
      custodian_account: custodianAccount,
      valuation_date: new Date().toISOString(),
      last_valuation_at: new Date().toISOString(),
      valuation_method: 'deposit_value',
      valuation_source: 'client_deposit',
      last_mtm_at: new Date().toISOString(),
      mark_to_market: valuationAmount,
      next_mtm_at: new Date(Date.now() + 24 * 3600000).toISOString(),
      metadata,
      tenant_id: depositDetails.tenantId || null,
    });

    // Confirm collateral after 1 second (simulating custodian confirmation)
    // PRODUCTION: This would be a webhook from the custodian
    setTimeout(async () => {
      await this.confirmCollateral(collateral.id, 'system');
    }, 1000);

    logger.info('Collateral deposited', {
      collateralId: collateral.id,
      corporateId,
      type: collateralType,
      amount,
      currency,
      valuationAmount,
    });

    return collateral;
  }

  /**
   * Confirm collateral with custodian
   */
  static async confirmCollateral(collateralId, confirmedBy) {
    return this.update({ id: collateralId }, {
      status: this.statuses.HELD,
      custodian_confirmation_received: true,
      custodian_confirmation_date: new Date().toISOString(),
      updated_by: confirmedBy,
    });
  }

  /**
   * Get total available collateral for a corporate client
   * @param {string} corporateId - Corporate entity ID
   * @param {string} baseCurrency - Base currency for conversion
   * @returns {Promise<Object>} Collateral summary
   */
  static async getTotalCollateral(corporateId, baseCurrency = 'USD') {
    const text = `
      SELECT
        currency,
        collateral_type,
        COUNT(*) as position_count,
        SUM(amount) as total_amount,
        SUM(valuation_amount) as total_valuation,
        SUM(base_valuation_amount) as total_base_valuation,
        SUM(CASE WHEN status = 'held' THEN base_valuation_amount ELSE 0 END) as available_collateral,
        SUM(CASE WHEN status = 'margin_called' THEN base_valuation_amount ELSE 0 END) as margin_called_collateral
      FROM ${this.tableName}
      WHERE corporate_id = $1
        AND status IN ('held', 'margin_called')
      GROUP BY currency, collateral_type
      ORDER BY total_base_valuation DESC
    `;

    const result = await connectionPool.query(text, [corporateId]);
    
    const summary = {
      corporateId,
      baseCurrency,
      positions: result.rows,
      totalCollateral: result.rows.reduce((sum, r) => sum + parseFloat(r.total_base_valuation), 0),
      availableCollateral: result.rows.reduce((sum, r) => sum + parseFloat(r.available_collateral), 0),
      marginCalledCollateral: result.rows.reduce((sum, r) => sum + parseFloat(r.margin_called_collateral), 0),
      calculatedAt: new Date().toISOString(),
    };

    return summary;
  }

  /**
   * Check if corporate has sufficient collateral for a trade
   * @param {string} corporateId - Corporate entity ID
   * @param {number} requiredAmount - Required collateral amount
   * @param {string} currency - Currency of required amount
   * @returns {Promise<Object>} Sufficiency check result
   */
  static async checkCollateralSufficiency(corporateId, requiredAmount, currency = 'USD') {
    const totalCollateral = await this.getTotalCollateral(corporateId, currency);
    
    const sufficient = totalCollateral.availableCollateral >= requiredAmount;
    const utilizationPercent = totalCollateral.availableCollateral > 0
      ? Math.round((requiredAmount / totalCollateral.availableCollateral) * 100)
      : 100;

    return {
      sufficient,
      requiredAmount,
      availableCollateral: totalCollateral.availableCollateral,
      shortfall: sufficient ? 0 : requiredAmount - totalCollateral.availableCollateral,
      utilizationPercent,
      marginWarning: utilizationPercent >= this.marginThresholds.warning,
      marginCallNeeded: utilizationPercent >= this.marginThresholds.call,
      breachRisk: utilizationPercent >= this.marginThresholds.breach,
    };
  }

  /**
   * Issue a margin call on collateral
   * @param {string} collateralId - Collateral record ID
   * @param {number} marginAmount - Additional margin required
   * @param {Date} dueDate - Margin call due date
   * @param {string} reason - Reason for margin call
   * @returns {Promise<Object>} Updated collateral record
   */
  static async issueMarginCall(collateralId, marginAmount, dueDate, reason) {
    const collateral = await this.findById(collateralId);
    if (!collateral) {
      throw new Error('Collateral record not found');
    }

    if (collateral.status !== this.statuses.HELD) {
      throw new Error(`Cannot issue margin call on collateral with status: ${collateral.status}`);
    }

    const updates = {
      status: this.statuses.MARGIN_CALLED,
      margin_call_issued: true,
      margin_call_amount: marginAmount,
      margin_call_currency: collateral.currency,
      margin_call_due_date: dueDate instanceof Date ? dueDate.toISOString() : dueDate,
      margin_call_notification_sent: true,
      margin_call_notification_date: new Date().toISOString(),
      status_change_note: reason,
    };

    // Add to audit trail
    const auditTrail = collateral.audit_trail || [];
    auditTrail.push({
      action: 'margin_call_issued',
      amount: marginAmount,
      dueDate: updates.margin_call_due_date,
      reason,
      timestamp: new Date().toISOString(),
    });
    updates.audit_trail = auditTrail;

    const updated = await this.update({ id: collateralId }, updates);

    logger.warn('Margin call issued', {
      collateralId,
      corporateId: collateral.corporate_id,
      marginAmount,
      dueDate: updates.margin_call_due_date,
      reason,
    });

    return updated;
  }

  /**
   * Meet a margin call (deposit additional collateral)
   * @param {string} collateralId - Collateral record ID
   * @param {number} amountMet - Amount of margin call met
   * @returns {Promise<Object>} Updated collateral record
   */
  static async meetMarginCall(collateralId, amountMet) {
    const collateral = await this.findById(collateralId);
    if (!collateral) {
      throw new Error('Collateral record not found');
    }

    if (collateral.status !== this.statuses.MARGIN_CALLED) {
      throw new Error('No active margin call on this collateral');
    }

    const fullyMet = amountMet >= (collateral.margin_call_amount || 0);
    
    const updates = {
      margin_call_met: fullyMet,
      margin_call_met_at: new Date().toISOString(),
      margin_call_met_amount: amountMet,
      margin_call_breached: false,
    };

    if (fullyMet) {
      updates.status = this.statuses.HELD;
      updates.margin_call_issued = false;
      updates.valuation_amount = (collateral.valuation_amount || 0) + amountMet;
    }

    // Add to audit trail
    const auditTrail = collateral.audit_trail || [];
    auditTrail.push({
      action: 'margin_call_met',
      amount: amountMet,
      fullyMet,
      timestamp: new Date().toISOString(),
    });
    updates.audit_trail = auditTrail;

    const updated = await this.update({ id: collateralId }, updates);

    logger.info('Margin call met', {
      collateralId,
      amountMet,
      fullyMet,
    });

    return updated;
  }

  /**
   * Release collateral back to corporate client
   * @param {string} collateralId - Collateral record ID
   * @param {string} reason - Release reason
   * @param {string} releasedBy - User releasing the collateral
   * @param {string} approvedBy - User approving the release
   * @returns {Promise<Object>} Updated collateral record
   */
  static async releaseCollateral(collateralId, reason, releasedBy, approvedBy = null) {
    const collateral = await this.findById(collateralId);
    if (!collateral) {
      throw new Error('Collateral record not found');
    }

    if (![this.statuses.HELD, this.statuses.MARGIN_CALLED].includes(collateral.status)) {
      throw new Error(`Cannot release collateral with status: ${collateral.status}`);
    }

    const updates = {
      status: this.statuses.RELEASED,
      released_at: new Date().toISOString(),
      release_reason: reason,
      released_by: releasedBy,
      release_approved_by: approvedBy || releasedBy,
    };

    // Add to audit trail
    const auditTrail = collateral.audit_trail || [];
    auditTrail.push({
      action: 'released',
      reason,
      releasedBy,
      approvedBy: approvedBy || releasedBy,
      timestamp: new Date().toISOString(),
    });
    updates.audit_trail = auditTrail;

    const updated = await this.update({ id: collateralId }, updates);

    logger.info('Collateral released', {
      collateralId,
      corporateId: collateral.corporate_id,
      reason,
      releasedBy,
    });

    return updated;
  }

  /**
   * Mark collateral to market (update valuation)
   * @param {string} collateralId - Collateral record ID
   * @param {number} currentValue - Current market value
   * @param {string} source - Valuation source
   * @returns {Promise<Object>} Updated collateral record
   */
  static async markToMarket(collateralId, currentValue, source = 'market_data') {
    const collateral = await this.findById(collateralId);
    if (!collateral) {
      throw new Error('Collateral record not found');
    }

    const previousMtm = collateral.mark_to_market || collateral.valuation_amount;
    const mtmChangePercent = previousMtm > 0
      ? Math.round(((currentValue - previousMtm) / previousMtm) * 10000) / 100
      : 0;

    const updates = {
      mark_to_market: Math.round(currentValue * 100) / 100,
      valuation_amount: Math.round(currentValue * 100) / 100,
      last_mtm_at: new Date().toISOString(),
      valuation_date: new Date().toISOString(),
      valuation_source: source,
      mtm_change_percent: mtmChangePercent,
      next_mtm_at: new Date(Date.now() + 24 * 3600000).toISOString(),
    };

    // Check if MTM drop triggers margin call
    if (mtmChangePercent < -10 && collateral.status === this.statuses.HELD) {
      const dropAmount = Math.abs(currentValue - previousMtm);
      updates.status = this.statuses.MARGIN_CALLED;
      updates.margin_call_issued = true;
      updates.margin_call_amount = dropAmount;
      updates.margin_call_due_date = new Date(Date.now() + 48 * 3600000).toISOString();
      
      logger.warn('MTM drop triggered margin call', {
        collateralId,
        previousMtm,
        currentValue,
        dropPercent: mtmChangePercent,
        marginCallAmount: dropAmount,
      });
    }

    return this.update({ id: collateralId }, updates);
  }

  /**
   * Get collateral utilization summary for risk management
   * @param {string} corporateId - Corporate entity ID
   * @returns {Promise<Object>} Utilization summary
   */
  static async getUtilizationSummary(corporateId) {
    const collateral = await this.getTotalCollateral(corporateId);
    
    // Get total exposure from active trades
    const tradeText = `
      SELECT
        SUM(net_buy_amount) as total_exposure,
        COUNT(*) as open_trades
      FROM fx_trades
      WHERE corporate_id = $1
        AND status = 'executed'
    `;
    const tradeResult = await connectionPool.query(tradeText, [corporateId]);
    const tradeExposure = parseFloat(tradeResult.rows[0]?.total_exposure || 0);

    const availableCollateral = collateral.availableCollateral;
    const utilizationPercent = availableCollateral > 0
      ? Math.round((tradeExposure / availableCollateral) * 100)
      : tradeExposure > 0 ? 100 : 0;

    return {
      corporateId,
      availableCollateral,
      totalExposure: tradeExposure,
      utilizationPercent,
      openTrades: parseInt(tradeResult.rows[0]?.open_trades || 0),
      marginWarning: utilizationPercent >= FxCollateral.marginThresholds.warning,
      marginCallNeeded: utilizationPercent >= FxCollateral.marginThresholds.call,
      breachRisk: utilizationPercent >= FxCollateral.marginThresholds.breach,
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get collateral aging report
   * @param {string} corporateId - Corporate entity ID (optional, for specific client)
   * @returns {Promise<Array>} Aging report
   */
  static async getAgingReport(corporateId = null) {
    const text = `
      SELECT
        corporate_id,
        collateral_type,
        status,
        COUNT(*) as position_count,
        SUM(valuation_amount) as total_value,
        MIN(held_since) as oldest_position,
        MAX(held_since) as newest_position,
        AVG(EXTRACT(DAY FROM NOW() - held_since)) as avg_age_days,
        SUM(CASE WHEN margin_call_issued = true THEN margin_call_amount ELSE 0 END) as total_margin_called
      FROM ${this.tableName}
      WHERE status IN ('held', 'margin_called')
        ${corporateId ? 'AND corporate_id = $1' : ''}
      GROUP BY corporate_id, collateral_type, status
      ORDER BY total_value DESC
    `;

    const values = corporateId ? [corporateId] : [];
    const result = await connectionPool.query(text, values);
    return result.rows;
  }

  /**
   * Process expired collateral (bank guarantees, LCs, etc.)
   */
  static async processExpired() {
    const text = `
      UPDATE ${this.tableName}
      SET status = $1,
          status_history = status_history || jsonb_build_array(jsonb_build_object(
            'status', $1,
            'previousStatus', status,
            'timestamp', NOW()::text,
            'note', 'Collateral expired automatically'
          ))
      WHERE status IN ('held', 'margin_called')
        AND insurance_expiry IS NOT NULL
        AND insurance_expiry < NOW()
    `;

    const result = await connectionPool.query(text, [this.statuses.EXPIRED]);
    
    if (result.rowCount > 0) {
      logger.warn('Expired collateral positions updated', {
        count: result.rowCount,
      });
    }

    return result.rowCount;
  }

  /**
   * Get collateral by trade ID
   */
  static async findByTradeId(tradeId) {
    const text = `
      SELECT * FROM ${this.tableName}
      WHERE trade_ids @> $1::jsonb
        AND status IN ('held', 'margin_called')
    `;
    const result = await connectionPool.query(text, [JSON.stringify([tradeId])]);
    return result.rows;
  }

  /**
   * Associate collateral with a trade
   */
  static async associateWithTrade(collateralId, tradeId) {
    const collateral = await this.findById(collateralId);
    if (!collateral) throw new Error('Collateral not found');

    const tradeIds = [...(collateral.trade_ids || [])];
    if (!tradeIds.includes(tradeId)) {
      tradeIds.push(tradeId);
      return this.update({ id: collateralId }, { trade_ids: tradeIds });
    }
    return collateral;
  }
}

module.exports = FxCollateral;