const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Currency Model - Currency Definitions
 * 
 * Defines supported currencies with formatting rules,
 * decimal places, and display configuration.
 * 
 * TABLE: currencies
 */

class Currency extends BaseModel {
  static tableName = 'currencies';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'code', 'numeric_code',
    'name', 'symbol', 'symbol_native',
    'decimal_digits', 'rounding',
    'name_plural', 'format_template',
    // Display
    'symbol_position', 'thousands_separator',
    'decimal_separator', 'space_between',
    // Status
    'is_active', 'is_crypto', 'is_base_currency',
    'is_default', 'sort_order',
    // Metadata
    'metadata', 'created_at', 'updated_at',
  ];

  static casts = {
    is_active: 'boolean',
    is_crypto: 'boolean',
    is_base_currency: 'boolean',
    is_default: 'boolean',
    space_between: 'boolean',
    decimal_digits: 'integer',
    sort_order: 'integer',
    metadata: 'json',
  };

  /**
   * Find currency by code
   */
  static async findByCode(code) {
    return this.findOne({
      where: { code: code.toUpperCase(), is_active: true },
    });
  }

  /**
   * Get all active currencies
   */
  static async getActive() {
    return this.findAll({
      where: { is_active: true },
      orderBy: { sort_order: 'ASC', name: 'ASC' },
    });
  }

  /**
   * Get base currency (default)
   */
  static async getBase() {
    return this.findOne({
      where: { is_base_currency: true, is_active: true },
    });
  }

  /**
   * Format amount according to currency rules
   */
  static formatAmount(amount, currencyCode) {
    const currency = this.findByCode(currencyCode);
    if (!currency) return String(amount);

    const formatted = Number(amount).toFixed(currency.decimal_digits);
    const [whole, decimal] = formatted.split('.');

    const wholeWithSeparator = whole.replace(
      /\B(?=(\d{3})+(?!\d))/g,
      currency.thousands_separator || ','
    );

    const parts = [wholeWithSeparator];
    if (decimal && currency.decimal_digits > 0) {
      parts.push(decimal);
    }

    const numberStr = parts.join(currency.decimal_separator || '.');

    if (currency.symbol_position === 'before') {
      return currency.space_between
        ? `${currency.symbol} ${numberStr}`
        : `${currency.symbol}${numberStr}`;
    } else {
      return currency.space_between
        ? `${numberStr} ${currency.symbol}`
        : `${numberStr}${currency.symbol}`;
    }
  }
}

module.exports = Currency;