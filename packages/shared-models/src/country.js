const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Country Model - Country Configuration
 * 
 * Stores country-specific settings, supported services,
 * regulatory requirements, and operational parameters.
 * Used to determine feature availability and compliance rules.
 * 
 * TABLE: countries
 */

class Country extends BaseModel {
  static tableName = 'countries';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'code', 'iso3_code', 'numeric_code',
    'name', 'official_name', 'capital',
    'region', 'sub_region', 'continent',
    // Communication
    'phone_code', 'phone_format', 'phone_length',
    'postal_code_format', 'address_format',
    // Currency and time
    'currency_code', 'currency_name', 'currency_symbol',
    'timezone', 'timezone_offset', 'daylight_saving',
    // Languages
    'languages', 'primary_language',
    // Services configuration
    'services_enabled', 'payment_methods',
    'delivery_enabled', 'delivery_providers',
    // Regulatory
    'regulatory_body', 'regulatory_requirements',
    'kyc_required', 'kyc_levels', 'max_transaction_limit',
    'max_wallet_balance', 'reporting_threshold',
    // Tax
    'tax_rate', 'tax_name', 'tax_id_format',
    'requires_tax_invoice',
    // Status
    'is_active', 'is_supported', 'launch_date',
    // Metadata
    'metadata', 'flags',
    'created_at', 'updated_at',
  ];

  static casts = {
    languages: 'json',
    services_enabled: 'json',
    payment_methods: 'json',
    delivery_providers: 'json',
    regulatory_requirements: 'json',
    metadata: 'json',
    flags: 'json',
    is_active: 'boolean',
    is_supported: 'boolean',
    kyc_required: 'boolean',
    requires_tax_invoice: 'boolean',
    daylight_saving: 'boolean',
    delivery_enabled: 'boolean',
    max_transaction_limit: 'float',
    max_wallet_balance: 'float',
    reporting_threshold: 'float',
    tax_rate: 'float',
  };

  /**
   * Find country by ISO code
   */
  static async findByCode(code) {
    return this.findOne({
      where: { code: code.toUpperCase(), is_active: true },
    });
  }

  /**
   * Get all active/supported countries
   */
  static async getActive() {
    return this.findAll({
      where: { is_active: true, is_supported: true },
      orderBy: { name: 'ASC' },
    });
  }

  /**
   * Get countries where a specific service is enabled
   */
  static async getByService(serviceName) {
    const text = `
      SELECT * FROM ${this.tableName}
      WHERE is_active = true
        AND services_enabled ? $1
      ORDER BY name ASC
    `;
    const result = await connectionPool.query(text, [serviceName]);
    return result.rows;
  }

  /**
   * Get countries that support a specific payment method
   */
  static async getByPaymentMethod(paymentMethod) {
    const text = `
      SELECT * FROM ${this.tableName}
      WHERE is_active = true
        AND payment_methods ? $1
      ORDER BY name ASC
    `;
    const result = await connectionPool.query(text, [paymentMethod]);
    return result.rows;
  }

  /**
   * Get regulatory limits for a country
   */
  static async getRegulatoryLimits(countryCode) {
    const country = await this.findByCode(countryCode);
    if (!country) return null;

    return {
      maxTransactionLimit: country.max_transaction_limit,
      maxWalletBalance: country.max_wallet_balance,
      reportingThreshold: country.reporting_threshold,
      kycRequired: country.kyc_required,
      kycLevels: country.kyc_levels,
    };
  }

  /**
   * Check if service is available in country
   */
  static async isServiceAvailable(countryCode, serviceName) {
    const country = await this.findByCode(countryCode);
    if (!country || !country.services_enabled) return false;
    return country.services_enabled.includes(serviceName);
  }
}

module.exports = Country;