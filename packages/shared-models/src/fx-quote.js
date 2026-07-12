const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * FX Quote Model - FX Rate Quote
 * 
 * Time-sensitive FX rate quotes provided to corporate clients.
 * Quotes are generated in real-time and have very short validity periods
 * (typically 30 seconds to 5 minutes depending on currency pair and volatility).
 * Accepted quotes can be converted directly into trades.
 * 
 * TABLE: fx_quotes
 * 
 * QUOTE LIFECYCLE:
 * 1. Client requests quote for currency pair and amount
 * 2. System generates quote with current market rate + margin
 * 3. Quote is valid for a limited time window (valid_until)
 * 4. Client can accept, reject, or let quote expire
 * 5. Accepted quotes are converted to trades
 * 6. Rejected/expired quotes are archived
 * 
 * QUOTE COMPONENTS:
 * - Market rate: Raw interbank/wholesale rate from liquidity provider
 * - Spread: Bid-ask spread applied to market rate
 * - Margin: Platform margin added to the rate
 * - All-in rate: Final rate presented to client (market + spread + margin)
 */

class FxQuote extends BaseModel {
  static tableName = 'fx_quotes';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'corporate_id', 'user_id',
    // Quote identification
    'quote_number', 'quote_reference', 'request_id',
    // Currency pair
    'buy_currency', 'sell_currency', 'currency_pair',
    'buy_amount', 'sell_amount', 'amount_type',
    // Rates
    'market_rate', 'bid_rate', 'ask_rate', 'mid_rate',
    'spread', 'spread_bps', 'margin', 'margin_percent',
    'margin_amount', 'all_in_rate', 'inverse_rate',
    'forward_points', 'forward_points_bps',
    // Rate sources
    'rate_source', 'rate_feed_provider', 'rate_feed_ref',
    'rate_feed_timestamp', 'rate_calculation_logic',
    // Trade details
    'trade_type', 'trade_subtype', 'value_date',
    'tenor', 'tenor_days', 'delivery_date',
    // Quote validity
    'valid_from', 'valid_until', 'validity_seconds',
    'is_extended', 'extension_count', 'extended_until',
    // Client response
    'is_accepted', 'accepted_at', 'accepted_by',
    'is_rejected', 'rejected_at', 'rejection_reason',
    'rejection_category', 'is_expired', 'expired_at',
    // Conversion to trade
    'converted_to_trade', 'trade_id', 'trade_number',
    'converted_at',
    // Status
    'status', 'sub_status', 'status_history',
    // Quote metadata
    'quote_type', 'quote_purpose', 'quote_strategy',
    'is_indicative', 'is_firm', 'is_streaming',
    'streaming_session_id', 'streaming_sequence',
    // Market conditions
    'market_volatility', 'market_liquidity',
    'market_trend', 'market_session',
    // Counterparty
    'counterparty', 'counterparty_ref',
    // Pricing engine
    'pricing_engine', 'pricing_engine_version',
    'auto_priced', 'manual_override', 'override_reason',
    'overridden_by', 'original_rate',
    // Performance
    'quote_generation_time_ms', 'quote_delivery_time_ms',
    'quote_acceptance_time_ms', 'total_quote_lifetime_ms',
    // Client context
    'client_ip', 'session_id', 'channel',
    'device_type', 'user_agent',
    // Regulatory
    'regulatory_checks_passed', 'compliance_checked',
    'best_execution_applied', 'best_execution_ref',
    // Fees
    'transaction_fee', 'transaction_fee_currency',
    'settlement_fee', 'total_fees',
    // Notes
    'trader_notes', 'client_notes', 'internal_notes',
    // Metadata
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    buy_amount: 'float',
    sell_amount: 'float',
    market_rate: 'float',
    bid_rate: 'float',
    ask_rate: 'float',
    mid_rate: 'float',
    spread: 'float',
    spread_bps: 'float',
    margin: 'float',
    margin_percent: 'float',
    margin_amount: 'float',
    all_in_rate: 'float',
    inverse_rate: 'float',
    forward_points: 'float',
    forward_points_bps: 'float',
    market_volatility: 'float',
    market_liquidity: 'float',
    original_rate: 'float',
    transaction_fee: 'float',
    settlement_fee: 'float',
    total_fees: 'float',
    validity_seconds: 'integer',
    extension_count: 'integer',
    tenor_days: 'integer',
    streaming_sequence: 'integer',
    quote_generation_time_ms: 'integer',
    quote_delivery_time_ms: 'integer',
    quote_acceptance_time_ms: 'integer',
    total_quote_lifetime_ms: 'integer',
    status_history: 'json',
    metadata: 'json',
    tags: 'json',
    is_accepted: 'boolean',
    is_rejected: 'boolean',
    is_expired: 'boolean',
    converted_to_trade: 'boolean',
    is_indicative: 'boolean',
    is_firm: 'boolean',
    is_streaming: 'boolean',
    is_extended: 'boolean',
    auto_priced: 'boolean',
    manual_override: 'boolean',
    regulatory_checks_passed: 'boolean',
    compliance_checked: 'boolean',
    best_execution_applied: 'boolean',
  };

  static relations = {
    corporateEntity: {
      type: 'belongsTo',
      model: 'CorporateEntity',
      foreignKey: 'corporate_id',
      ownerKey: 'id',
    },
    trade: {
      type: 'belongsTo',
      model: 'FxTrade',
      foreignKey: 'trade_id',
      ownerKey: 'id',
    },
  };

  static statuses = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    EXPIRED: 'expired',
    CONVERTED: 'converted',
    CANCELLED: 'cancelled',
    ERROR: 'error',
  };

  static tradeTypes = {
    SPOT: 'spot',
    FORWARD: 'forward',
    SWAP: 'swap',
    NDF: 'ndf',
    OPTION: 'option',
    LIMIT_ORDER: 'limit_order',
  };

  static quoteTypes = {
    INDICATIVE: 'indicative',
    FIRM: 'firm',
    STREAMING: 'streaming',
    REQUEST_FOR_QUOTE: 'rfq',
  };

  static rejectionCategories = {
    RATE_UNACCEPTABLE: 'rate_unacceptable',
    AMOUNT_CHANGED: 'amount_changed',
    QUOTE_EXPIRED: 'quote_expired',
    CUSTOMER_CANCELLED: 'customer_cancelled',
    COMPLIANCE_FAILED: 'compliance_failed',
    LIMIT_BREACHED: 'limit_breached',
    OTHER: 'other',
  };

  // Default validity periods by currency pair volatility
  static defaultValidityPeriods = {
    major: 30,    // Major pairs (EUR/USD, GBP/USD): 30 seconds
    minor: 60,    // Minor pairs: 60 seconds
    exotic: 120,  // Exotic pairs: 120 seconds
    restricted: 300, // Restricted currencies: 5 minutes
  };

  static generateQuoteNumber() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `QT-${timestamp}-${random}`;
  }

  /**
   * Generate a new FX quote
   */
  static async generateQuote(corporateId, quoteRequest) {
    const corporate = await require('./corporate-entity').findById(corporateId);
    if (!corporate) throw new Error('Corporate entity not found');
    if (!corporate.fx_enabled) throw new Error('FX trading not enabled for this entity');

    const {
      buyCurrency, sellCurrency, buyAmount, sellAmount,
      tradeType = this.tradeTypes.SPOT,
      valueDate = null, quoteType = this.quoteTypes.FIRM,
    } = quoteRequest;

    // Get market rate from pricing engine (PRODUCTION: call external feed)
    const marketRate = await this._getMarketRate(buyCurrency, sellCurrency);
    
    // Calculate spread based on amount and market conditions
    const spreadBps = this._calculateSpread(buyAmount, buyCurrency, sellCurrency);
    const spread = marketRate * (spreadBps / 10000);
    
    // Calculate margin
    const marginPercent = corporate.fx_margin_requirement || 1.0;
    const marginAmount = marketRate * (marginPercent / 100);
    
    // All-in rate
    const allInRate = marketRate + spread + marginAmount;
    
    // Determine validity period
    const validitySeconds = this._determineValidity(buyCurrency, sellCurrency);
    const validFrom = new Date();
    const validUntil = new Date(validFrom.getTime() + validitySeconds * 1000);

    // Calculate sell amount if not provided
    const calculatedSellAmount = sellAmount || Math.round(buyAmount * allInRate * 100) / 100;

    const startTime = Date.now();

    const quote = await this.create({
      corporate_id: corporateId,
      user_id: quoteRequest.userId || null,
      quote_number: this.generateQuoteNumber(),
      quote_reference: quoteRequest.reference || null,
      request_id: quoteRequest.requestId || null,
      buy_currency: buyCurrency.toUpperCase(),
      sell_currency: sellCurrency.toUpperCase(),
      currency_pair: `${buyCurrency.toUpperCase()}/${sellCurrency.toUpperCase()}`,
      buy_amount: buyAmount,
      sell_amount: calculatedSellAmount,
      amount_type: sellAmount ? 'sell' : 'buy',
      market_rate: Math.round(marketRate * 100000) / 100000,
      bid_rate: Math.round((marketRate - spread / 2) * 100000) / 100000,
      ask_rate: Math.round((marketRate + spread / 2) * 100000) / 100000,
      mid_rate: Math.round(marketRate * 100000) / 100000,
      spread: Math.round(spread * 100000) / 100000,
      spread_bps: spreadBps,
      margin: Math.round(marginAmount * 100000) / 100000,
      margin_percent: marginPercent,
      margin_amount: Math.round(buyAmount * marginPercent / 100 * 100) / 100,
      all_in_rate: Math.round(allInRate * 100000) / 100000,
      inverse_rate: Math.round((1 / allInRate) * 100000) / 100000,
      forward_points: quoteRequest.forwardPoints || 0,
      rate_source: 'pricing_engine',
      rate_feed_provider: quoteRequest.feedProvider || 'reuters',
      rate_feed_ref: quoteRequest.feedRef || null,
      rate_feed_timestamp: new Date().toISOString(),
      trade_type: tradeType,
      value_date: valueDate || new Date(Date.now() + 2 * 86400000).toISOString(),
      tenor: quoteRequest.tenor || 'SPOT',
      tenor_days: quoteRequest.tenorDays || 2,
      valid_from: validFrom.toISOString(),
      valid_until: validUntil.toISOString(),
      validity_seconds: validitySeconds,
      status: this.statuses.PENDING,
      quote_type: quoteType,
      is_indicative: quoteType === this.quoteTypes.INDICATIVE,
      is_firm: quoteType === this.quoteTypes.FIRM,
      is_streaming: quoteType === this.quoteTypes.STREAMING,
      market_volatility: quoteRequest.marketVolatility || null,
      market_session: quoteRequest.marketSession || this._getMarketSession(),
      pricing_engine: 'siamsiam_fx_engine',
      pricing_engine_version: '1.0.0',
      auto_priced: !quoteRequest.manualOverride,
      quote_generation_time_ms: Date.now() - startTime,
      channel: quoteRequest.channel || 'api',
      client_ip: quoteRequest.clientIp || null,
      session_id: quoteRequest.sessionId || null,
      metadata: quoteRequest.metadata || {},
      tenant_id: quoteRequest.tenantId || null,
    });

    // Start expiration timer (PRODUCTION: use message queue)
    setTimeout(async () => {
      await this.expireQuote(quote.id);
    }, validitySeconds * 1000);

    logger.info('FX quote generated', {
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      corporateId,
      currencyPair: quote.currency_pair,
      buyAmount,
      allInRate,
      validitySeconds,
    });

    return quote;
  }

  /**
   * Get a valid quote by ID (checks expiration)
   */
  static async getValidQuote(quoteId) {
    const quote = await this.findById(quoteId);
    if (!quote) return null;
    
    // Check if expired
    if (new Date(quote.valid_until) < new Date()) {
      // Auto-expire if past validity
      if (quote.status === this.statuses.PENDING) {
        await this.expireQuote(quoteId);
      }
      return null;
    }
    
    // Check if still in pending state
    if (quote.status !== this.statuses.PENDING) return null;
    
    return quote;
  }

  /**
   * Accept a quote (convert to trade)
   */
  static async acceptQuote(quoteId, acceptedBy, options = {}) {
    const quote = await this.getValidQuote(quoteId);
    if (!quote) throw new Error('Quote is no longer valid or has expired');
    
    const acceptanceTime = Date.now();
    const acceptanceTimeMs = acceptanceTime - new Date(quote.created_at).getTime();

    const updates = {
      is_accepted: true,
      accepted_at: new Date().toISOString(),
      accepted_by: acceptedBy,
      status: this.statuses.ACCEPTED,
      quote_acceptance_time_ms: acceptanceTimeMs,
      total_quote_lifetime_ms: acceptanceTimeMs,
      status_history: [...(quote.status_history || []), {
        status: this.statuses.ACCEPTED,
        timestamp: new Date().toISOString(),
        acceptedBy,
      }],
    };

    const updated = await this.update({ id: quoteId }, updates);

    // PRODUCTION: Convert to trade automatically
    // const FxTrade = require('./fx-trade');
    // const trade = await FxTrade.createFromQuote(quote, acceptedBy, options);
    // await this.update({ id: quoteId }, {
    //   converted_to_trade: true,
    //   trade_id: trade.id,
    //   trade_number: trade.trade_number,
    //   converted_at: new Date().toISOString(),
    //   status: this.statuses.CONVERTED,
    // });

    logger.info('FX quote accepted', {
      quoteId,
      quoteNumber: quote.quote_number,
      corporateId: quote.corporate_id,
      currencyPair: quote.currency_pair,
      buyAmount: quote.buy_amount,
      allInRate: quote.all_in_rate,
      acceptanceTimeMs,
    });

    return updated;
  }

  /**
   * Reject a quote
   */
  static async rejectQuote(quoteId, reason, category = 'rate_unacceptable') {
    const quote = await this.findById(quoteId);
    if (!quote) throw new Error('Quote not found');
    
    if (quote.status !== this.statuses.PENDING) {
      throw new Error(`Cannot reject quote with status: ${quote.status}`);
    }

    return this.update({ id: quoteId }, {
      is_rejected: true,
      rejected_at: new Date().toISOString(),
      rejection_reason: reason?.substring(0, 500),
      rejection_category: category,
      status: this.statuses.REJECTED,
    });
  }

  /**
   * Expire a quote (called when validity period ends)
   */
  static async expireQuote(quoteId) {
    const quote = await this.findById(quoteId);
    if (!quote) return null;
    
    if (quote.status !== this.statuses.PENDING) return quote;

    return this.update({ id: quoteId }, {
      is_expired: true,
      expired_at: new Date().toISOString(),
      status: this.statuses.EXPIRED,
    });
  }

  /**
   * Extend quote validity
   */
  static async extendQuote(quoteId, additionalSeconds = 30) {
    const quote = await this.findById(quoteId);
    if (!quote) throw new Error('Quote not found');
    
    if (quote.status !== this.statuses.PENDING) {
      throw new Error(`Cannot extend quote with status: ${quote.status}`);
    }

    const maxExtensions = 3;
    if (quote.extension_count >= maxExtensions) {
      throw new Error(`Maximum extensions (${maxExtensions}) reached`);
    }

    return this.update({ id: quoteId }, {
      valid_until: new Date(Date.now() + additionalSeconds * 1000).toISOString(),
      validity_seconds: quote.validity_seconds + additionalSeconds,
      is_extended: true,
      extension_count: (quote.extension_count || 0) + 1,
      extended_until: new Date(Date.now() + additionalSeconds * 1000).toISOString(),
    });
  }

  /**
   * Find quotes by corporate client
   */
  static async findByCorporate(corporateId, options = {}) {
    return this.paginate({
      where: { corporate_id: corporateId },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Get quote statistics for analytics
   */
  static async getQuoteStats(corporateId = null, startDate = null, endDate = null) {
    const text = `
      SELECT
        COUNT(*) as total_quotes,
        COUNT(CASE WHEN is_accepted = true THEN 1 END) as accepted,
        COUNT(CASE WHEN is_rejected = true THEN 1 END) as rejected,
        COUNT(CASE WHEN is_expired = true THEN 1 END) as expired,
        COUNT(CASE WHEN converted_to_trade = true THEN 1 END) as converted,
        ROUND(100.0 * COUNT(CASE WHEN is_accepted = true THEN 1 END) / NULLIF(COUNT(*), 0), 2) as acceptance_rate,
        AVG(quote_generation_time_ms) as avg_generation_time_ms,
        AVG(quote_acceptance_time_ms) as avg_acceptance_time_ms,
        AVG(spread_bps) as avg_spread_bps,
        AVG(margin_percent) as avg_margin_percent,
        SUM(buy_amount) FILTER (WHERE is_accepted = true) as total_accepted_volume,
        COUNT(DISTINCT currency_pair) as unique_pairs,
        COUNT(DISTINCT corporate_id) as unique_clients
      FROM ${this.tableName}
      WHERE 1=1
        ${corporateId ? 'AND corporate_id = $1' : ''}
        ${startDate ? `AND created_at >= $${corporateId ? 2 : 1}` : ''}
        ${endDate ? `AND created_at <= $${(corporateId ? 2 : 1) + (startDate ? 1 : 0)}` : ''}
    `;

    const values = [];
    if (corporateId) values.push(corporateId);
    if (startDate) values.push(startDate);
    if (endDate) values.push(endDate);

    const result = await connectionPool.query(text, values.length > 0 ? values : undefined);
    return result.rows[0];
  }

  /**
   * Auto-expire all pending quotes past their validity
   */
  static async expireStaleQuotes() {
    const result = await connectionPool.query(
      `UPDATE ${this.tableName}
       SET is_expired = true,
           expired_at = NOW(),
           status = $1
       WHERE status = $2
         AND valid_until < NOW()`,
      [this.statuses.EXPIRED, this.statuses.PENDING]
    );
    
    if (result.rowCount > 0) {
      logger.info('Expired stale FX quotes', { count: result.rowCount });
    }
    
    return result.rowCount;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Get current market rate for a currency pair
   * PRODUCTION: Call external rate feed (Bloomberg, Reuters, etc.)
   */
  static async _getMarketRate(buyCurrency, sellCurrency) {
    // PRODUCTION: Fetch from rate feed
    const ExchangeRate = require('./exchange-rate');
    const rate = await ExchangeRate.getRate(buyCurrency, sellCurrency, 'wholesale');
    
    if (rate) return rate;
    
    // Fallback rates for development
    const fallbackRates = {
      'USD/ZWL': 6000, 'USD/ZAR': 18.50, 'USD/BWP': 13.50,
      'USD/EUR': 0.92, 'USD/GBP': 0.79, 'USD/KES': 155,
      'EUR/USD': 1.09, 'GBP/USD': 1.27, 'ZAR/USD': 0.054,
      'USD/NGN': 1550, 'USD/TZS': 2500, 'USD/ZMW': 26,
    };
    
    return fallbackRates[`${buyCurrency}/${sellCurrency}`] || 1.0;
  }

  /**
   * Calculate spread based on amount and currency pair
   */
  static _calculateSpread(amount, buyCurrency, sellCurrency) {
    // Tighter spreads for larger amounts, major pairs
    const baseSpread = 2; // 2 bps base
    
    // Volume discount
    if (amount > 1000000) return baseSpread * 0.5;
    if (amount > 500000) return baseSpread * 0.75;
    if (amount > 100000) return baseSpread;
    if (amount > 10000) return baseSpread * 1.5;
    
    return baseSpread * 2;
  }

  /**
   * Determine quote validity period based on currency pair
   */
  static _determineValidity(buyCurrency, sellCurrency) {
    const majorCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];
    const exoticCurrencies = ['ZWL', 'NGN', 'TZS', 'ZMW', 'KES'];
    const restrictedCurrencies = ['ZWL'];
    
    if (restrictedCurrencies.includes(buyCurrency) || restrictedCurrencies.includes(sellCurrency)) {
      return this.defaultValidityPeriods.restricted;
    }
    if (exoticCurrencies.includes(buyCurrency) || exoticCurrencies.includes(sellCurrency)) {
      return this.defaultValidityPeriods.exotic;
    }
    if (majorCurrencies.includes(buyCurrency) && majorCurrencies.includes(sellCurrency)) {
      return this.defaultValidityPeriods.major;
    }
    return this.defaultValidityPeriods.minor;
  }

  /**
   * Get current market session
   */
  static _getMarketSession() {
    const now = new Date();
    const hour = now.getUTCHours();
    
    if (hour >= 0 && hour < 8) return 'asia_pacific';
    if (hour >= 8 && hour < 16) return 'european';
    if (hour >= 16 && hour < 24) return 'american';
    return 'asia_pacific';
  }
}

module.exports = FxQuote;