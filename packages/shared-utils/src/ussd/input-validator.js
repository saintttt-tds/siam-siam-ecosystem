const phoneValidator = require('../validators/phone-validator');
const currencyValidator = require('../validators/currency-validator');

/**
 * USSD Input Validation and Sanitization
 * 
 * Validates user input in USSD sessions with:
 * - Type-specific validation (number, phone, amount, PIN, etc.)
 * - Length limits
 * - Format validation
 * - Sanitization
 * - Error message generation
 * 
 * @example
 *   const validator = require('@siamsiam/shared-utils').ussd.inputValidator;
 *   const result = validator.validate('100', 'amount', { currency: 'USD', min: 1, max: 1000 });
 */

class USSDInputValidator {
  /**
   * Validate USSD input based on type
   * @param {string} input - User input
   * @param {string} type - Input type (number, phone, amount, pin, text, selection)
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  validate(input, type = 'text', options = {}) {
    if (input === undefined || input === null || input === '') {
      return { valid: false, error: 'Input is required' };
    }

    const cleaned = String(input).trim();

    switch (type) {
      case 'number':
        return this._validateNumber(cleaned, options);
      case 'phone':
        return this._validatePhone(cleaned, options);
      case 'amount':
        return this._validateAmount(cleaned, options);
      case 'pin':
        return this._validatePIN(cleaned, options);
      case 'selection':
        return this._validateSelection(cleaned, options);
      case 'account':
        return this._validateAccount(cleaned, options);
      case 'reference':
        return this._validateReference(cleaned, options);
      case 'meter':
        return this._validateMeterNumber(cleaned, options);
      case 'text':
      default:
        return this._validateText(cleaned, options);
    }
  }

  /**
   * Validate back/home navigation commands
   */
  isNavigationCommand(input) {
    const cleaned = String(input).trim().toLowerCase();
    return cleaned === '0' || cleaned === '00' || 
           cleaned === 'back' || cleaned === 'home';
  }

  // ==================== PRIVATE VALIDATORS ====================

  _validateNumber(input, options) {
    const num = parseInt(input, 10);
    
    if (isNaN(num)) {
      return { valid: false, error: 'Please enter a valid number' };
    }

    if (options.min !== undefined && num < options.min) {
      return { valid: false, error: `Minimum is ${options.min}` };
    }

    if (options.max !== undefined && num > options.max) {
      return { valid: false, error: `Maximum is ${options.max}` };
    }

    return { valid: true, value: num, formatted: String(num) };
  }

  _validatePhone(input, options) {
    const countryCode = options.countryCode || 'ZW';
    const result = phoneValidator.validate(input, countryCode);
    
    if (!result.valid) {
      return { valid: false, error: result.error || 'Invalid phone number' };
    }

    return { valid: true, value: result.e164, formatted: result.local, network: result.network };
  }

  _validateAmount(input, options) {
    const currency = options.currency || 'USD';
    const cleaned = input.replace(/[^\d.]/g, '');
    const amount = parseFloat(cleaned);

    if (isNaN(amount) || amount <= 0) {
      return { valid: false, error: 'Please enter a valid amount' };
    }

    const result = currencyValidator.validate(amount, currency);
    if (!result.valid) {
      return { valid: false, error: result.error };
    }

    if (options.min !== undefined && result.amount < options.min) {
      return { valid: false, error: `Minimum amount is ${currencyValidator.format(options.min, currency)}` };
    }

    if (options.max !== undefined && result.amount > options.max) {
      return { valid: false, error: `Maximum amount is ${currencyValidator.format(options.max, currency)}` };
    }

    return {
      valid: true,
      value: result.amount,
      formatted: currencyValidator.format(result.amount, currency),
      currency,
    };
  }

  _validatePIN(input, options) {
    const pin = input.replace(/\D/g, '');
    const minLength = options.minLength || 4;
    const maxLength = options.maxLength || 6;

    if (pin.length < minLength || pin.length > maxLength) {
      return { valid: false, error: `PIN must be ${minLength}-${maxLength} digits` };
    }

    if (options.noSequential && this._isSequential(pin)) {
      return { valid: false, error: 'PIN cannot be sequential numbers' };
    }

    if (options.noRepeating && this._isRepeating(pin)) {
      return { valid: false, error: 'PIN cannot be repeating numbers' };
    }

    return { valid: true, value: pin };
  }

  _validateSelection(input, options) {
    const validOptions = options.options || [];
    
    if (!validOptions.includes(input) && !validOptions.includes(parseInt(input))) {
      return {
        valid: false,
        error: 'Invalid selection. Please choose from the options above.',
        validOptions,
      };
    }

    return { valid: true, value: input };
  }

  _validateAccount(input, options) {
    const account = input.replace(/[\s\-]/g, '');
    const minLength = options.minLength || 6;
    const maxLength = options.maxLength || 20;

    if (account.length < minLength || account.length > maxLength) {
      return { valid: false, error: `Account number must be ${minLength}-${maxLength} characters` };
    }

    if (!/^[a-zA-Z0-9]+$/.test(account)) {
      return { valid: false, error: 'Account number contains invalid characters' };
    }

    return { valid: true, value: account };
  }

  _validateReference(input, options) {
    const reference = input.trim();
    const maxLength = options.maxLength || 50;

    if (reference.length > maxLength) {
      return { valid: false, error: `Reference too long (max ${maxLength} characters)` };
    }

    return { valid: true, value: reference };
  }

  _validateMeterNumber(input, options) {
    const meter = input.replace(/[\s\-]/g, '');
    const minLength = options.minLength || 8;
    const maxLength = options.maxLength || 15;

    if (meter.length < minLength || meter.length > maxLength) {
      return { valid: false, error: `Meter number must be ${minLength}-${maxLength} digits` };
    }

    if (!/^\d+$/.test(meter)) {
      return { valid: false, error: 'Meter number must contain only digits' };
    }

    return { valid: true, value: meter };
  }

  _validateText(input, options) {
    const text = input.trim();
    const maxLength = options.maxLength || 100;

    if (text.length > maxLength) {
      return { valid: false, error: `Text too long (max ${maxLength} characters)` };
    }

    return { valid: true, value: text };
  }

  _isSequential(str) {
    for (let i = 1; i < str.length; i++) {
      if (parseInt(str[i]) !== parseInt(str[i-1]) + 1) return false;
    }
    return true;
  }

  _isRepeating(str) {
    return new Set(str.split('')).size === 1;
  }
}

// Export singleton instance
module.exports = new USSDInputValidator();