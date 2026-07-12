const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Exchange Rate Model - FX Rates Storage
 * 
 * Stores foreign exchange rates for currency conversion.
 * Supports multiple rate sources, bid/ask spreads, and historical tracking.
 * 
 * TABLE: exchange_rates
 * 
 * RATE TYPES:
 * - spot: Current market rate
 * - forward: Forward contract rate
 * - retail: Customer-facing rate (includes margin)
 * - wholesale: Interbank rate
 * - central_bank: Official central bank rate
 */

class ExchangeRate extends BaseModel {
  static tableName = 'exchange_rates';
  static primaryKey = 'id';
  
  static fields = [
    'id',
    // Currency pair
    'base_currency', 'target_currency', 'currency_pair',
    // Rates
    'rate', 'bid_rate', 'ask_rate', 'mid_rate',
    'spread', 'margin', 'retail_rate',
    // Rate type
    'rate_type', 'source', 'source_ref',
    // Validity
    'valid_from', 'valid_until', 'is_active',
    // Historical
    'previous_rate', 'change_amount', 'change_percent',
    'day_high', 'day_low', 'day_open',
    'week_high', 'week_low', 'month_high', 'month_low',
    'year_high', 'year_low',
    // Volume
    'daily_volume', 'volume_currency',
    // Metadata
    'metadata', 'fetched_at', 'processed_at',
    'tenant_id', 'version',
    'created_at', 'updated_at',
  ];

  static casts = {
    rate: 'float',
    bid_rate: 'float',
    ask_rate: 'float',
    mid_rate: 'float',
    spread: 'float',
    margin: 'float',
    retail_rate: 'float',
    previous_rate: 'float',
    change_amount: 'float',
    change_percent: 'float',
    day_high: 'float',
    day_low: 'float',
    day_open: 'float',
    week_high: 'float',
    week_low: 'float',
    month_high: 'float',
    month_low: 'float',
    year_high: 'float',
    year_low: 'float',
    daily_volume: 'float',
    is_active: 'boolean',
    metadata: 'json',
  };

  static rateTypes = {
    SPOT: 'spot',
    FORWARD: 'forward',
    RETAIL: 'retail',
    WHOLESALE: 'wholesale',
    CENTRAL_BANK: 'central_bank',
  };

  /**
   * Get current rate for a currency pair
   */
  static async getRate(baseCurrency, targetCurrency, rateType = 'retail') {
    const rate = await this.findOne({
      where: {
        base_currency: baseCurrency.toUpperCase(),
        target_currency: targetCurrency.toUpperCase(),
        rate_type: rateType,
        is_active: true,
      },
      orderBy: { created_at: 'DESC' },
    });

    return rate?.rate || rate?.retail_rate || null;
  }

  /**
   * Get all active rates for a base currency
   */
  static async getRates(baseCurrency) {
    return this.findAll({
      where: {
        base_currency: baseCurrency.toUpperCase(),
        is_active: true,
        rate_type: this.rateTypes.RETAIL,
      },
      orderBy: { target_currency: 'ASC' },
    });
  }

  /**
   * Convert amount between currencies
   */
  static async convert(amount, fromCurrency, toCurrency) {
    const rate = await this.getRate(fromCurrency, toCurrency);
    if (!rate) return null;

    return {
      fromAmount: amount,
      fromCurrency: fromCurrency.toUpperCase(),
      toAmount: Math.round(amount * rate * 100) / 100,
      toCurrency: toCurrency.toUpperCase(),
      rate,
      convertedAt: new Date().toISOString(),
    };
  }

  /**
   * Update exchange rate (deactivates old, inserts new)
   */
  static async updateRate(baseCurrency, targetCurrency, newRate, source, options = {}) {
    const currencyPair = `${baseCurrency.toUpperCase()}/${targetCurrency.toUpperCase()}`;

    // Get previous rate
    const previousRate = await this.findOne({
      where: {
        base_currency: baseCurrency.toUpperCase(),
        target_currency: targetCurrency.toUpperCase(),
        is_active: true,
      },
      orderBy: { created_at: 'DESC' },
    });

    // Deactivate old rate
    if (previousRate) {
      await this.update({ id: previousRate.id }, {
        is_active: false,
        valid_until: new Date().toISOString(),
      });
    }

    // Calculate change
    const prevRateValue = previousRate?.rate || newRate;
    const changeAmount = newRate - prevRateValue;
    const changePercent = prevRateValue > 0 ? (changeAmount / prevRateValue) * 100 : 0;

    // Insert new rate
    const margin = options.margin || 0.02; // 2% default margin
    const spread = options.spread || 0.001;

    return this.create({
      base_currency: baseCurrency.toUpperCase(),
      target_currency: targetCurrency.toUpperCase(),
      currency_pair: currencyPair,
      rate: newRate,
      bid_rate: newRate - spread / 2,
      ask_rate: newRate + spread / 2,
      mid_rate: newRate,
      spread,
      margin,
      retail_rate: newRate * (1 + margin),
      rate_type: options.rateType || this.rateTypes.RETAIL,
      source,
      source_ref: options.sourceRef || null,
      valid_from: new Date().toISOString(),
      is_active: true,
      previous_rate: prevRateValue,
      change_amount: Math.round(changeAmount * 10000) / 10000,
      change_percent: Math.round(changePercent * 100) / 100,
      day_high: options.dayHigh || newRate,
      day_low: options.dayLow || newRate,
      day_open: options.dayOpen || newRate,
      metadata: options.metadata || {},
    });
  }

  /**
   * Get rate history for a currency pair
   */
  static async getHistory(baseCurrency, targetCurrency, days = 30) {
    return this.findAll({
      where: {
        base_currency: baseCurrency.toUpperCase(),
        target_currency: targetCurrency.toUpperCase(),
      },
      orderBy: { created_at: 'DESC' },
      limit: days * 24, // Assuming hourly updates
    });
  }

  /**
   * Get supported currency pairs
   */
  static async getSupportedPairs() {
    const text = `
      SELECT DISTINCT ON (base_currency, target_currency)
        base_currency, target_currency,
        rate, retail_rate, source, valid_from
      FROM ${this.tableName}
      WHERE is_active = true
      ORDER BY base_currency, target_currency, created_at DESC
    `;
    const result = await connectionPool.query(text);
    return result.rows;
  }
}

module.exports = ExchangeRate;