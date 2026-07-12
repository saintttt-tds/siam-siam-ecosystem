const BaseModel = require('./base-model');
const { encryption } = require('@siamsiam/shared-utils').security;
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Corporate Entity Model - Registered Business/Corporation
 * 
 * Represents a corporate client for B2B services including
 * FX trading, bulk payments, and corporate accounts.
 * 
 * TABLE: corporate_entities
 * 
 * VERIFICATION LEVELS:
 * - basic: Business registration verified
 * - verified: Directors and documents verified
 * - enhanced: Full KYC/KYB completed
 * - premium: Credit assessment completed, trading enabled
 */

class CorporateEntity extends BaseModel {
  static tableName = 'corporate_entities';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id',
    // Company information
    'company_name', 'trading_name', 'registration_number',
    'registration_date', 'registration_country',
    'business_type', 'industry', 'sub_industry',
    'company_email', 'company_phone', 'company_website',
    // Tax information
    'tax_number', 'vat_number', 'tax_country',
    'tax_clearance_expiry',
    // Address
    'registered_address', 'operating_address',
    'city', 'state', 'country', 'postal_code',
    // Size and revenue
    'employee_count', 'annual_revenue', 'revenue_currency',
    'years_in_business',
    // Verification
    'verification_level', 'verification_status',
    'verified_at', 'verified_by', 'verification_notes',
    // FX Trading
    'fx_enabled', 'fx_trading_limit', 'fx_daily_limit',
    'fx_monthly_limit', 'fx_currency_pairs',
    'fx_margin_requirement', 'fx_settlement_account',
    // Credit
    'credit_rating', 'credit_limit', 'credit_used',
    'credit_currency', 'payment_terms',
    // Banking
    'bank_name', 'bank_account_number_encrypted',
    'bank_swift', 'bank_iban', 'bank_country',
    // Relationship
    'relationship_manager_id', 'account_manager_id',
    'onboarding_date', 'contract_start_date',
    'contract_end_date',
    // Compliance
    'is_sanctioned', 'is_pep', 'aml_risk_level',
    'last_aml_check_at', 'aml_check_result',
    // Status
    'is_active', 'is_suspended', 'suspension_reason',
    // Documents
    'documents', 'required_documents',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    fx_currency_pairs: 'json',
    documents: 'json',
    required_documents: 'json',
    metadata: 'json',
    tags: 'json',
    is_active: 'boolean',
    is_suspended: 'boolean',
    is_sanctioned: 'boolean',
    is_pep: 'boolean',
    fx_enabled: 'boolean',
    fx_trading_limit: 'float',
    fx_daily_limit: 'float',
    fx_monthly_limit: 'float',
    credit_limit: 'float',
    credit_used: 'float',
    employee_count: 'integer',
    years_in_business: 'integer',
  };

  static relations = {
    directors: { type: 'hasMany', model: 'CorporateDirector', foreignKey: 'corporate_id', localKey: 'id' },
    documents_rel: { type: 'hasMany', model: 'CorporateDocument', foreignKey: 'corporate_id', localKey: 'id' },
    fxTrades: { type: 'hasMany', model: 'FxTrade', foreignKey: 'corporate_id', localKey: 'id' },
  };

  static verificationLevels = {
    BASIC: 'basic', VERIFIED: 'verified', ENHANCED: 'enhanced', PREMIUM: 'premium',
  };

  static verificationStatuses = {
    PENDING: 'pending', IN_REVIEW: 'in_review', APPROVED: 'approved',
    REJECTED: 'rejected', EXPIRED: 'expired', SUSPENDED: 'suspended',
  };

  static hooks = {
    beforeCreate: [
      async (data) => {
        if (data.bank_account_number_encrypted) {
          data.bank_account_number_encrypted = encryption.encrypt(data.bank_account_number_encrypted);
        }
      },
    ],
  };

  /**
   * Find corporate entity by user ID
   */
  static async findByUser(userId) {
    return this.findOne({ where: { user_id: userId } });
  }

  /**
   * Find corporate entity by registration number
   */
  static async findByRegistration(regNumber) {
    return this.findOne({ where: { registration_number: regNumber } });
  }

  /**
   * Enable FX trading for a corporate entity
   */
  static async enableFxTrading(corporateId, limits = {}, approvedBy = null) {
    return this.update({ id: corporateId }, {
      fx_enabled: true,
      fx_trading_limit: limits.tradingLimit || 100000,
      fx_daily_limit: limits.dailyLimit || 50000,
      fx_monthly_limit: limits.monthlyLimit || 500000,
      fx_currency_pairs: limits.currencyPairs || ['USD/ZWL', 'USD/ZAR'],
      fx_margin_requirement: limits.marginRequirement || 10,
    });
  }

  /**
   * Update credit usage
   */
  static async updateCreditUsage(corporateId, amount) {
    await connectionPool.query(
      `UPDATE ${this.tableName}
       SET credit_used = credit_used + $2, updated_at = NOW()
       WHERE id = $1`,
      [corporateId, amount]
    );
  }

  /**
   * Check if corporate has available credit
   */
  static async hasAvailableCredit(corporateId, amount) {
    const entity = await this.findById(corporateId);
    if (!entity) return false;
    return (entity.credit_limit - entity.credit_used) >= amount;
  }

  /**
   * Search corporate entities
   */
  static async search(query, options = {}) {
    const text = `
      SELECT * FROM ${this.tableName}
      WHERE is_active = true
        AND (
          company_name ILIKE $1
          OR trading_name ILIKE $1
          OR registration_number ILIKE $1
          OR tax_number ILIKE $1
        )
      ORDER BY company_name ASC
      LIMIT $2 OFFSET $3
    `;
    const result = await connectionPool.query(text, [`%${query}%`, options.limit || 20, options.offset || 0]);
    return result.rows;
  }
}

module.exports = CorporateEntity;