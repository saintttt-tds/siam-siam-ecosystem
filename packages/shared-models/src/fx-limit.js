const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * FX Limit Model - Corporate FX Trading Limits
 * 
 * Manages trading limits per corporate client, per currency pair.
 * Enforces daily, monthly, annual limits, single trade maximums,
 * open position limits, and notional outstanding limits.
 * 
 * TABLE: fx_limits
 * 
 * LIMIT TYPES:
 * - per_trade: Maximum single trade amount
 * - daily: Maximum daily trading volume
 * - monthly: Maximum monthly trading volume
 * - annual: Maximum annual trading volume
 * - open_positions: Maximum number of concurrent open positions
 * - notional_outstanding: Maximum total notional value of open positions
 * - settlement: Maximum single settlement amount
 * - counterparty: Maximum exposure to single counterparty
 * 
 * LIMIT BREACH ACTIONS:
 * - warn: Log warning, allow trade with approval
 * - block: Block trade entirely
 * - notify: Notify risk manager
 * - escalate: Escalate to senior management
 */

class FxLimit extends BaseModel {
  static tableName = 'fx_limits';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'corporate_id',
    // Currency pair scope
    'currency_pair', 'limit_scope',
    // Per-trade limits
    'max_single_trade_buy', 'max_single_trade_sell',
    'min_single_trade', 'max_notional_per_trade',
    // Time-based limits
    'daily_limit', 'daily_used', 'daily_reset_at',
    'daily_warning_threshold', 'daily_breach_action',
    'monthly_limit', 'monthly_used', 'monthly_reset_at',
    'monthly_warning_threshold', 'monthly_breach_action',
    'annual_limit', 'annual_used', 'annual_reset_at',
    'annual_warning_threshold', 'annual_breach_action',
    // Position limits
    'max_open_positions', 'current_open_positions',
    'max_notional_outstanding', 'current_notional_outstanding',
    'max_position_tenor_days',
    // Counterparty limits
    'max_counterparty_exposure', 'current_counterparty_exposure',
    'approved_counterparties', 'max_settlement_amount',
    // Product limits
    'allowed_products', 'blocked_products',
    'max_option_notional', 'max_forward_tenor_days',
    'max_swap_tenor_days',
    // Margin limits
    'margin_requirement_percent', 'minimum_collateral_amount',
    'collateral_coverage_ratio',
    // Status & approval
    'is_active', 'limit_type', 'limit_status',
    'requested_by', 'approved_by', 'approved_at',
    'approval_notes', 'rejection_reason',
    // Review cycle
    'review_date', 'last_reviewed_at', 'reviewed_by',
    'review_frequency_days', 'auto_renew',
    // Breach tracking
    'breach_count', 'last_breach_at', 'last_breach_amount',
    'last_breach_currency_pair', 'breach_notification_sent',
    'breach_escalated', 'breach_resolved_at',
    // Utilization monitoring
    'utilization_warning_threshold', 'utilization_critical_threshold',
    'block_on_breach', 'override_allowed', 'override_approval_required',
    'override_count', 'last_override_at', 'last_override_by',
    // Time restrictions
    'trading_hours_only', 'allowed_trading_days',
    'restricted_trading_hours', 'cutoff_time',
    // Value date restrictions
    'max_value_date_days', 'allowed_value_dates',
    // Documentation
    'limit_documentation_url', 'credit_approval_ref',
    'risk_assessment_ref',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    max_single_trade_buy: 'float',
    max_single_trade_sell: 'float',
    min_single_trade: 'float',
    max_notional_per_trade: 'float',
    daily_limit: 'float',
    daily_used: 'float',
    daily_warning_threshold: 'float',
    monthly_limit: 'float',
    monthly_used: 'float',
    monthly_warning_threshold: 'float',
    annual_limit: 'float',
    annual_used: 'float',
    annual_warning_threshold: 'float',
    max_open_positions: 'integer',
    current_open_positions: 'integer',
    max_notional_outstanding: 'float',
    current_notional_outstanding: 'float',
    max_position_tenor_days: 'integer',
    max_counterparty_exposure: 'float',
    current_counterparty_exposure: 'float',
    max_settlement_amount: 'float',
    max_option_notional: 'float',
    max_forward_tenor_days: 'integer',
    max_swap_tenor_days: 'integer',
    margin_requirement_percent: 'float',
    minimum_collateral_amount: 'float',
    collateral_coverage_ratio: 'float',
    breach_count: 'integer',
    last_breach_amount: 'float',
    override_count: 'integer',
    review_frequency_days: 'integer',
    max_value_date_days: 'integer',
    approved_counterparties: 'json',
    allowed_products: 'json',
    blocked_products: 'json',
    allowed_trading_days: 'json',
    restricted_trading_hours: 'json',
    allowed_value_dates: 'json',
    metadata: 'json',
    tags: 'json',
    is_active: 'boolean',
    trading_hours_only: 'boolean',
    override_allowed: 'boolean',
    override_approval_required: 'boolean',
    block_on_breach: 'boolean',
    breach_notification_sent: 'boolean',
    breach_escalated: 'boolean',
    auto_renew: 'boolean',
  };

  static relations = {
    corporateEntity: {
      type: 'belongsTo',
      model: 'CorporateEntity',
      foreignKey: 'corporate_id',
      ownerKey: 'id',
    },
  };

  static limitScopes = {
    ALL_CURRENCIES: 'all_currencies',
    CURRENCY_PAIR: 'currency_pair',
    CURRENCY_GROUP: 'currency_group',
  };

  static limitTypes = {
    STANDARD: 'standard',
    ENHANCED: 'enhanced',
    RESTRICTED: 'restricted',
    CUSTOM: 'custom',
  };

  static limitStatuses = {
    PENDING: 'pending',
    APPROVED: 'approved',
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
    REVOKED: 'revoked',
    EXPIRED: 'expired',
  };

  static breachActions = {
    WARN: 'warn',
    BLOCK: 'block',
    NOTIFY: 'notify',
    ESCALATE: 'escalate',
    REQUIRE_APPROVAL: 'require_approval',
  };

  /**
   * Get limits for a corporate client and currency pair
   */
  static async getLimits(corporateId, currencyPair = null) {
    const criteria = { corporate_id: corporateId, is_active: true };
    if (currencyPair) {
      criteria.currency_pair = currencyPair;
      // Also check for all_currencies scope
      const specific = await this.findOne({ where: criteria });
      if (specific) return specific;
      // Fallback to all_currencies
      criteria.currency_pair = null;
      criteria.limit_scope = this.limitScopes.ALL_CURRENCIES;
    }
    return this.findOne({ where: criteria });
  }

  /**
   * Set up default limits for a corporate client
   */
  static async setupDefaults(corporateId, options = {}) {
    const corporate = await require('./corporate-entity').findById(corporateId);
    if (!corporate) throw new Error('Corporate entity not found');

    const defaultLimits = {
      corporate_id: corporateId,
      currency_pair: null,
      limit_scope: this.limitScopes.ALL_CURRENCIES,
      max_single_trade_buy: options.maxSingleTrade || 50000,
      max_single_trade_sell: options.maxSingleTrade || 50000,
      min_single_trade: options.minSingleTrade || 100,
      daily_limit: options.dailyLimit || 200000,
      monthly_limit: options.monthlyLimit || 2000000,
      annual_limit: options.annualLimit || 20000000,
      daily_warning_threshold: 80,
      monthly_warning_threshold: 80,
      annual_warning_threshold: 80,
      daily_breach_action: this.breachActions.REQUIRE_APPROVAL,
      monthly_breach_action: this.breachActions.BLOCK,
      annual_breach_action: this.breachActions.BLOCK,
      max_open_positions: options.maxOpenPositions || 10,
      max_notional_outstanding: options.maxNotional || 5000000,
      max_position_tenor_days: options.maxTenorDays || 365,
      margin_requirement_percent: options.marginRequirement || 10,
      minimum_collateral_amount: options.minCollateral || 10000,
      collateral_coverage_ratio: options.collateralRatio || 1.0,
      is_active: true,
      limit_type: this.limitTypes.STANDARD,
      limit_status: this.limitStatuses.ACTIVE,
      block_on_breach: true,
      override_allowed: true,
      override_approval_required: true,
      trading_hours_only: true,
      daily_reset_at: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
      monthly_reset_at: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
      annual_reset_at: new Date(new Date().getFullYear() + 1, 0, 1).toISOString(),
      review_date: new Date(Date.now() + 90 * 86400000).toISOString(),
      review_frequency_days: 90,
      auto_renew: true,
      metadata: options.metadata || {},
      tenant_id: options.tenantId || null,
    };

    return this.create(defaultLimits);
  }

  /**
   * Comprehensive limit check before executing a trade
   */
  static async checkLimits(corporateId, currencyPair, buyAmount, sellAmount, options = {}) {
    const limits = await this.getLimits(corporateId, currencyPair);
    
    if (!limits) {
      return {
        allowed: false,
        reason: 'No trading limits configured for this corporate client',
        code: 'NO_LIMITS_CONFIGURED',
      };
    }

    if (!limits.is_active) {
      return {
        allowed: false,
        reason: 'Trading limits are currently inactive',
        code: 'LIMITS_INACTIVE',
      };
    }

    const checks = [];
    let blocked = false;

    // Check 1: Single trade maximum
    if (buyAmount > limits.max_single_trade_buy) {
      checks.push({
        check: 'max_single_trade_buy',
        passed: false,
        limit: limits.max_single_trade_buy,
        current: buyAmount,
        message: `Buy amount ${buyAmount} exceeds maximum single trade limit of ${limits.max_single_trade_buy}`,
        action: limits.daily_breach_action,
      });
      if (limits.block_on_breach) blocked = true;
    }

    if (sellAmount > limits.max_single_trade_sell) {
      checks.push({
        check: 'max_single_trade_sell',
        passed: false,
        limit: limits.max_single_trade_sell,
        current: sellAmount,
        message: `Sell amount ${sellAmount} exceeds maximum single trade limit of ${limits.max_single_trade_sell}`,
        action: limits.daily_breach_action,
      });
      if (limits.block_on_breach) blocked = true;
    }

    // Check 2: Minimum trade size
    if (buyAmount < limits.min_single_trade && buyAmount > 0) {
      checks.push({
        check: 'min_single_trade',
        passed: false,
        limit: limits.min_single_trade,
        current: buyAmount,
        message: `Trade amount ${buyAmount} is below minimum of ${limits.min_single_trade}`,
        action: this.breachActions.BLOCK,
      });
      blocked = true;
    }

    // Check 3: Daily limit
    const newDailyUsed = limits.daily_used + buyAmount;
    if (newDailyUsed > limits.daily_limit && limits.daily_limit > 0) {
      checks.push({
        check: 'daily_limit',
        passed: false,
        limit: limits.daily_limit,
        current: limits.daily_used,
        proposed: newDailyUsed,
        remaining: Math.max(0, limits.daily_limit - limits.daily_used),
        utilizationPercent: Math.round((newDailyUsed / limits.daily_limit) * 100),
        message: `Daily trading limit would be exceeded (${Math.round((newDailyUsed / limits.daily_limit) * 100)}%)`,
        action: limits.daily_breach_action,
      });
      if (limits.daily_breach_action === this.breachActions.BLOCK) blocked = true;
    } else if (limits.daily_limit > 0) {
      const utilization = Math.round((newDailyUsed / limits.daily_limit) * 100);
      if (utilization >= limits.daily_warning_threshold) {
        checks.push({
          check: 'daily_warning',
          passed: true,
          warning: true,
          utilizationPercent: utilization,
          message: `Daily limit utilization at ${utilization}% (warning threshold: ${limits.daily_warning_threshold}%)`,
        });
      }
    }

    // Check 4: Monthly limit
    const newMonthlyUsed = limits.monthly_used + buyAmount;
    if (newMonthlyUsed > limits.monthly_limit && limits.monthly_limit > 0) {
      checks.push({
        check: 'monthly_limit',
        passed: false,
        limit: limits.monthly_limit,
        current: limits.monthly_used,
        proposed: newMonthlyUsed,
        message: 'Monthly trading limit would be exceeded',
        action: limits.monthly_breach_action,
      });
      if (limits.monthly_breach_action === this.breachActions.BLOCK) blocked = true;
    }

    // Check 5: Annual limit
    const newAnnualUsed = limits.annual_used + buyAmount;
    if (newAnnualUsed > limits.annual_limit && limits.annual_limit > 0) {
      checks.push({
        check: 'annual_limit',
        passed: false,
        limit: limits.annual_limit,
        current: limits.annual_used,
        proposed: newAnnualUsed,
        message: 'Annual trading limit would be exceeded',
        action: limits.annual_breach_action,
      });
      if (limits.annual_breach_action === this.breachActions.BLOCK) blocked = true;
    }

    // Check 6: Open positions
    if (limits.current_open_positions >= limits.max_open_positions && limits.max_open_positions > 0) {
      checks.push({
        check: 'open_positions',
        passed: false,
        limit: limits.max_open_positions,
        current: limits.current_open_positions,
        message: `Maximum open positions (${limits.max_open_positions}) reached`,
        action: this.breachActions.BLOCK,
      });
      blocked = true;
    }

    // Check 7: Notional outstanding
    const newNotional = limits.current_notional_outstanding + buyAmount;
    if (newNotional > limits.max_notional_outstanding && limits.max_notional_outstanding > 0) {
      checks.push({
        check: 'notional_outstanding',
        passed: false,
        limit: limits.max_notional_outstanding,
        current: limits.current_notional_outstanding,
        proposed: newNotional,
        message: 'Maximum notional outstanding would be exceeded',
        action: this.breachActions.BLOCK,
      });
      if (limits.block_on_breach) blocked = true;
    }

    // Check 8: Margin/collateral
    if (limits.margin_requirement_percent > 0) {
      const requiredMargin = buyAmount * (limits.margin_requirement_percent / 100);
      checks.push({
        check: 'margin_requirement',
        passed: true,
        requiredMargin,
        marginPercent: limits.margin_requirement_percent,
        message: `Margin requirement: ${limits.margin_requirement_percent}% = ${requiredMargin}`,
      });
    }

    // Check 9: Trading hours
    if (limits.trading_hours_only && limits.restricted_trading_hours) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTime = currentHour * 60 + currentMinute;

      const isWithinHours = limits.restricted_trading_hours.some(slot => {
        const [startH, startM] = (slot.start || '00:00').split(':').map(Number);
        const [endH, endM] = (slot.end || '00:00').split(':').map(Number);
        const startTime = startH * 60 + startM;
        const endTime = endH * 60 + endM;
        return currentTime >= startTime && currentTime <= endTime;
      });

      if (!isWithinHours) {
        checks.push({
          check: 'trading_hours',
          passed: false,
          message: 'Outside of allowed trading hours',
          action: this.breachActions.BLOCK,
        });
        blocked = true;
      }
    }

    // Summarize
    const allPassed = checks.filter(c => !c.passed).length === 0;

    return {
      allowed: allPassed && !blocked,
      blocked,
      requiresApproval: checks.some(c => !c.passed && c.action === this.breachActions.REQUIRE_APPROVAL),
      requiresOverride: blocked && limits.override_allowed,
      checks,
      limits: {
        dailyLimit: limits.daily_limit,
        dailyUsed: limits.daily_used,
        dailyRemaining: Math.max(0, limits.daily_limit - limits.daily_used),
        monthlyLimit: limits.monthly_limit,
        monthlyUsed: limits.monthly_used,
        annualLimit: limits.annual_limit,
        annualUsed: limits.annual_used,
        openPositions: limits.current_open_positions,
        maxOpenPositions: limits.max_open_positions,
      },
    };
  }

  /**
   * Record trade usage against limits
   */
  static async recordUsage(corporateId, currencyPair, amount, isNewPosition = false) {
    await connectionPool.query(
      `UPDATE ${this.tableName}
       SET daily_used = daily_used + $3,
           monthly_used = monthly_used + $3,
           annual_used = annual_used + $3,
           current_notional_outstanding = current_notional_outstanding + $3
           ${isNewPosition ? ', current_open_positions = current_open_positions + 1' : ''}
       WHERE corporate_id = $1
         AND (currency_pair = $2 OR (currency_pair IS NULL AND limit_scope = 'all_currencies'))
         AND is_active = true`,
      [corporateId, currencyPair, amount]
    );
  }

  /**
   * Record trade settlement (reduce notional outstanding)
   */
  static async recordSettlement(corporateId, currencyPair, amount) {
    await connectionPool.query(
      `UPDATE ${this.tableName}
       SET current_notional_outstanding = GREATEST(0, current_notional_outstanding - $3),
           current_open_positions = GREATEST(0, current_open_positions - 1)
       WHERE corporate_id = $1
         AND (currency_pair = $2 OR (currency_pair IS NULL AND limit_scope = 'all_currencies'))
         AND is_active = true`,
      [corporateId, currencyPair, amount]
    );
  }

  /**
   * Record a limit breach
   */
  static async recordBreach(corporateId, currencyPair, amount, breachType) {
    await connectionPool.query(
      `UPDATE ${this.tableName}
       SET breach_count = breach_count + 1,
           last_breach_at = NOW(),
           last_breach_amount = $3,
           last_breach_currency_pair = $4,
           breach_notification_sent = true
       WHERE corporate_id = $1
         AND (currency_pair = $2 OR (currency_pair IS NULL AND limit_scope = 'all_currencies'))
         AND is_active = true`,
      [corporateId, amount, currencyPair]
    );

    logger.warn('FX limit breach recorded', {
      corporateId,
      currencyPair,
      amount,
      breachType,
    });
  }

  /**
   * Reset daily limits (called by cron job at midnight)
   */
  static async resetDailyLimits() {
    const result = await connectionPool.query(
      `UPDATE ${this.tableName}
       SET daily_used = 0,
           daily_reset_at = NOW() + INTERVAL '1 day'
       WHERE daily_reset_at < NOW()
         AND is_active = true`
    );
    
    if (result.rowCount > 0) {
      logger.info('Daily FX limits reset', { count: result.rowCount });
    }
    
    return result.rowCount;
  }

  /**
   * Reset monthly limits (called by cron job on 1st of month)
   */
  static async resetMonthlyLimits() {
    const result = await connectionPool.query(
      `UPDATE ${this.tableName}
       SET monthly_used = 0,
           monthly_reset_at = NOW() + INTERVAL '1 month'
       WHERE monthly_reset_at < NOW()
         AND is_active = true`
    );
    
    if (result.rowCount > 0) {
      logger.info('Monthly FX limits reset', { count: result.rowCount });
    }
    
    return result.rowCount;
  }

  /**
   * Get utilization report for all corporate clients
   */
  static async getUtilizationReport() {
    const text = `
      SELECT
        l.corporate_id,
        ce.company_name,
        l.currency_pair,
        l.limit_scope,
        l.daily_limit,
        l.daily_used,
        CASE WHEN l.daily_limit > 0 
          THEN ROUND((l.daily_used / l.daily_limit) * 100, 2) 
          ELSE 0 
        END as daily_utilization_percent,
        l.monthly_limit,
        l.monthly_used,
        CASE WHEN l.monthly_limit > 0 
          THEN ROUND((l.monthly_used / l.monthly_limit) * 100, 2) 
          ELSE 0 
        END as monthly_utilization_percent,
        l.current_open_positions,
        l.max_open_positions,
        l.breach_count,
        l.last_breach_at
      FROM ${this.tableName} l
      LEFT JOIN corporate_entities ce ON l.corporate_id = ce.id
      WHERE l.is_active = true
      ORDER BY daily_utilization_percent DESC
    `;

    const result = await connectionPool.query(text);
    return result.rows;
  }

  /**
   * Approve a limit configuration
   */
  static async approve(limitId, approvedBy, notes = null) {
    return this.update({ id: limitId }, {
      limit_status: this.limitStatuses.APPROVED,
      is_active: true,
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      approval_notes: notes,
    });
  }

  /**
   * Suspend trading limits
   */
  static async suspend(limitId, reason) {
    return this.update({ id: limitId }, {
      is_active: false,
      limit_status: this.limitStatuses.SUSPENDED,
      notes: reason,
    });
  }
}

module.exports = FxLimit;