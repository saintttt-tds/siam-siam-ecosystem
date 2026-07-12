const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Deposit Method Model - Deposit Method Configuration
 * 
 * Configures available deposit methods per country/currency.
 * Defines limits, fees, processing times, and availability.
 * 
 * TABLE: deposit_methods
 */

class DepositMethod extends BaseModel {
  static tableName = 'deposit_methods';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'method_code', 'method_name',
    'method_type', 'method_category',
    // Configuration
    'supported_countries', 'supported_currencies',
    'minimum_amount', 'maximum_amount',
    'daily_limit', 'monthly_limit',
    // Fees
    'fee_type', 'fee_value', 'fee_minimum',
    'fee_maximum', 'fee_currency',
    // Processing
    'processing_time_minutes', 'processing_time_max_minutes',
    'settlement_time_hours', 'cutoff_time',
    'processing_days', 'is_weekend_processing',
    // Instructions
    'bank_name', 'bank_account_name',
    'bank_account_number', 'bank_branch_code',
    'bank_swift_code', 'bank_iban',
    'merchant_number', 'payment_instructions',
    // Status
    'is_active', 'is_available', 'requires_verification',
    'verification_type', 'auto_verify',
    // Compliance
    'requires_kyc', 'minimum_kyc_level',
    'aml_required', 'source_of_funds_required',
    // Display
    'display_name', 'description',
    'icon_url', 'sort_order',
    // Metadata
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    supported_countries: 'json',
    supported_currencies: 'json',
    payment_instructions: 'json',
    processing_days: 'json',
    metadata: 'json',
    tags: 'json',
    minimum_amount: 'float',
    maximum_amount: 'float',
    daily_limit: 'float',
    monthly_limit: 'float',
    fee_value: 'float',
    fee_minimum: 'float',
    fee_maximum: 'float',
    processing_time_minutes: 'integer',
    processing_time_max_minutes: 'integer',
    settlement_time_hours: 'integer',
    is_active: 'boolean',
    is_available: 'boolean',
    is_weekend_processing: 'boolean',
    requires_verification: 'boolean',
    auto_verify: 'boolean',
    requires_kyc: 'boolean',
    aml_required: 'boolean',
    source_of_funds_required: 'boolean',
    minimum_kyc_level: 'integer',
    sort_order: 'integer',
  };

  static methodTypes = {
    BANK_TRANSFER: 'bank_transfer',
    MOBILE_MONEY: 'mobile_money',
    CASH_DEPOSIT: 'cash_deposit',
    CRYPTO: 'crypto',
    CARD: 'card',
    WALLET_TRANSFER: 'wallet_transfer',
    PAYMENT_GATEWAY: 'payment_gateway',
  };

  static feeTypes = {
    FLAT: 'flat',
    PERCENTAGE: 'percentage',
    FREE: 'free',
    TIERED: 'tiered',
  };

  /**
   * Find available deposit methods for a country and currency
   */
  static async findAvailable(countryCode, currency = null, kycLevel = 0) {
    const methods = await this.findAll({
      where: {
        is_active: true,
        is_available: true,
      },
      orderBy: { sort_order: 'ASC' },
    });

    return methods.filter(method => {
      // Check country support
      if (!method.supported_countries.includes(countryCode)) return false;
      
      // Check currency support
      if (currency && !method.supported_currencies.includes(currency)) return false;
      
      // Check KYC level requirement
      if (method.requires_kyc && method.minimum_kyc_level > kycLevel) return false;
      
      return true;
    });
  }

  /**
   * Find method by code
   */
  static async findByCode(code) {
    return this.findOne({
      where: { method_code: code, is_active: true },
    });
  }

  /**
   * Calculate deposit fee
   */
  static calculateFee(methodCode, amount) {
    const method = this.findByCode(methodCode);
    if (!method) return 0;

    switch (method.fee_type) {
      case this.feeTypes.FLAT:
        return method.fee_value || 0;
      case this.feeTypes.PERCENTAGE:
        let fee = (amount * (method.fee_value || 0)) / 100;
        if (method.fee_minimum && fee < method.fee_minimum) fee = method.fee_minimum;
        if (method.fee_maximum && fee > method.fee_maximum) fee = method.fee_maximum;
        return fee;
      case this.feeTypes.FREE:
      default:
        return 0;
    }
  }

  /**
   * Check if deposit amount is within limits
   */
  static isWithinLimits(methodCode, amount, dailyTotal = 0, monthlyTotal = 0) {
    const method = this.findByCode(methodCode);
    if (!method) return { valid: false, error: 'Method not found' };

    if (amount < method.minimum_amount) {
      return { valid: false, error: `Minimum deposit is ${method.minimum_amount}` };
    }
    if (amount > method.maximum_amount) {
      return { valid: false, error: `Maximum deposit is ${method.maximum_amount}` };
    }
    if (dailyTotal + amount > method.daily_limit) {
      return { valid: false, error: 'Daily deposit limit would be exceeded' };
    }
    if (monthlyTotal + amount > method.monthly_limit) {
      return { valid: false, error: 'Monthly deposit limit would be exceeded' };
    }

    return { valid: true };
  }
}

module.exports = DepositMethod;