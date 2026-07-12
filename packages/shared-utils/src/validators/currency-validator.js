/**
 * Currency Code and Amount Validator
 * 
 * Validates currency codes (ISO 4217) and formats amounts
 * according to regional standards.
 * 
 * SUPPORTED CURRENCIES (African focus):
 * - ZWL: Zimbabwe Dollar
 * - ZAR: South African Rand
 * - USD: United States Dollar
 * - BWP: Botswana Pula
 * - ZMW: Zambian Kwacha
 * - KES: Kenyan Shilling
 * - NGN: Nigerian Naira
 * - TZS: Tanzanian Shilling
 * - EUR: Euro
 * - GBP: British Pound
 * 
 * @example
 *   const currency = require('@siamsiam/shared-utils').validators.currencyValidator;
 *   const result = currency.validate(100.50, 'USD');
 *   const formatted = currency.format(1000000, 'ZWL');
 */

class CurrencyValidator {
  constructor() {
    this.currencies = {
      USD: { name: 'US Dollar', symbol: '$', code: 'USD', decimals: 2, locale: 'en-US' },
      ZWL: { name: 'Zimbabwe Dollar', symbol: 'Z$', code: 'ZWL', decimals: 2, locale: 'en-ZW' },
      ZAR: { name: 'South African Rand', symbol: 'R', code: 'ZAR', decimals: 2, locale: 'en-ZA' },
      BWP: { name: 'Botswana Pula', symbol: 'P', code: 'BWP', decimals: 2, locale: 'en-BW' },
      ZMW: { name: 'Zambian Kwacha', symbol: 'ZK', code: 'ZMW', decimals: 2, locale: 'en-ZM' },
      KES: { name: 'Kenyan Shilling', symbol: 'KSh', code: 'KES', decimals: 2, locale: 'en-KE' },
      NGN: { name: 'Nigerian Naira', symbol: '₦', code: 'NGN', decimals: 2, locale: 'en-NG' },
      TZS: { name: 'Tanzanian Shilling', symbol: 'TSh', code: 'TZS', decimals: 2, locale: 'en-TZ' },
      EUR: { name: 'Euro', symbol: '€', code: 'EUR', decimals: 2, locale: 'de-DE' },
      GBP: { name: 'British Pound', symbol: '£', code: 'GBP', decimals: 2, locale: 'en-GB' },
    };

    this.exchangeRates = {
      // Base: USD (PRODUCTION: Fetch from API)
      ZWL: 6000,
      ZAR: 18.50,
      BWP: 13.50,
      ZMW: 26.00,
      KES: 155.00,
      NGN: 1550.00,
      TZS: 2500.00,
      EUR: 0.92,
      GBP: 0.79,
      USD: 1,
    };
  }

  /**
   * Validate currency code
   */
  isValidCode(code) {
    return !!this.currencies[code?.toUpperCase()];
  }

  /**
   * Validate monetary amount
   * @param {number|string} amount - Amount to validate
   * @param {string} currencyCode - Currency code
   * @returns {Object} Validation result
   */
  validate(amount, currencyCode = 'USD') {
    const code = currencyCode.toUpperCase();
    const currency = this.currencies[code];

    if (!currency) {
      return { valid: false, error: `Invalid currency code: ${code}` };
    }

    // Convert to number
    const numericAmount = typeof amount === 'string' 
      ? parseFloat(amount.replace(/[^\d.-]/g, ''))
      : amount;

    if (isNaN(numericAmount) || !isFinite(numericAmount)) {
      return { valid: false, error: 'Invalid amount' };
    }

    // Minimum amount (0.01 for most currencies)
    const minimum = Math.pow(10, -currency.decimals);
    if (numericAmount < minimum && numericAmount !== 0) {
      return { valid: false, error: `Amount too small, minimum is ${minimum}` };
    }

    // Maximum amount (prevent overflow)
    const maximum = 999999999.99;
    if (numericAmount > maximum) {
      return { valid: false, error: `Amount exceeds maximum of ${maximum}` };
    }

    return {
      valid: true,
      amount: this.round(numericAmount, currency),
      currency: code,
      currencyName: currency.name,
      symbol: currency.symbol,
    };
  }

  /**
   * Format amount for display
   * @param {number} amount - Amount to format
   * @param {string} currencyCode - Currency code
   * @param {Object} options - Formatting options
   */
  format(amount, currencyCode = 'USD', options = {}) {
    const { showSymbol = true, showCode = false } = options;
    const result = this.validate(amount, currencyCode);
    
    if (!result.valid) return String(amount);

    const currency = this.currencies[currencyCode];
    
    // Format with proper grouping
    const formatted = result.amount.toLocaleString(currency.locale, {
      minimumFractionDigits: currency.decimals,
      maximumFractionDigits: currency.decimals,
    });

    if (showSymbol) {
      return `${currency.symbol}${formatted}`;
    }
    if (showCode) {
      return `${formatted} ${currency.code}`;
    }
    return formatted;
  }

  /**
   * Round amount to currency's decimal places
   */
  round(amount, currencyCode) {
    const currency = typeof currencyCode === 'string' 
      ? this.currencies[currencyCode.toUpperCase()]
      : currencyCode;

    if (!currency) return amount;

    const factor = Math.pow(10, currency.decimals);
    return Math.round(amount * factor) / factor;
  }

  /**
   * Convert amount between currencies
   */
  convert(amount, fromCurrency, toCurrency) {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    if (!this.exchangeRates[from] || !this.exchangeRates[to]) {
      throw new Error('Invalid currency for conversion');
    }

    // Convert to USD first, then to target currency
    const usdAmount = amount / this.exchangeRates[from];
    const convertedAmount = usdAmount * this.exchangeRates[to];

    return {
      amount: convertedAmount,
      from,
      to,
      rate: this.exchangeRates[to] / this.exchangeRates[from],
      formatted: this.format(convertedAmount, to),
    };
  }

  /**
   * Parse amount string to number
   */
  parse(amountString, currencyCode = 'USD') {
    if (!amountString) return null;
    
    // Remove currency symbols and non-numeric characters
    const cleaned = amountString.replace(/[^\d.,\-]/g, '');
    
    // Handle different decimal separators
    let normalized;
    if (cleaned.includes(',') && cleaned.includes('.')) {
      // Determine which is thousands separator
      const lastComma = cleaned.lastIndexOf(',');
      const lastDot = cleaned.lastIndexOf('.');
      if (lastDot > lastComma) {
        normalized = cleaned.replace(/,/g, '');
      } else {
        normalized = cleaned.replace(/\./g, '').replace(',', '.');
      }
    } else if (cleaned.includes(',')) {
      // Could be thousands or decimal
      if (cleaned.length - cleaned.lastIndexOf(',') <= 3) {
        normalized = cleaned.replace(/,/g, '');
      } else {
        normalized = cleaned.replace(',', '.');
      }
    } else {
      normalized = cleaned;
    }

    return parseFloat(normalized);
  }

  /**
   * Get currency information
   */
  getInfo(currencyCode) {
    return this.currencies[currencyCode?.toUpperCase()] || null;
  }

  /**
   * List all supported currencies
   */
  listCurrencies() {
    return Object.entries(this.currencies).map(([code, info]) => ({
      code,
      name: info.name,
      symbol: info.symbol,
      decimals: info.decimals,
    }));
  }
}

module.exports = new CurrencyValidator();