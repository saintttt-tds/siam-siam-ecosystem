const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Biller Model - Registered Service Provider
 * 
 * Represents a biller/service provider that users can pay through the platform.
 * Each biller belongs to a category and has specific integration requirements.
 * 
 * TABLE: billers
 * 
 * INTEGRATION TYPES:
 * - api: Direct API integration with biller
 * - scraper: Screen scraping (legacy systems)
 * - file_upload: Batch file processing
 * - manual: Manual processing by operations team
 * 
 * FIELDS CONFIGURATION:
 * Each biller defines what fields are required for payment:
 * - meter_number: For electricity/water
 * - customer_reference: For DSTV/internet
 * - student_number: For school fees
 * - policy_number: For insurance
 * - account_number: For general bills
 */

class Biller extends BaseModel {
  static tableName = 'billers';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'category_id',
    // Basic info
    'name', 'short_code', 'slug', 'description',
    'logo_url', 'website', 'support_phone', 'support_email',
    // Integration
    'integration_type', 'api_endpoint', 'api_version',
    'api_key_encrypted', 'api_secret_encrypted',
    'webhook_url', 'callback_url',
    // Configuration
    'supported_currencies', 'supported_countries',
    'minimum_amount', 'maximum_amount', 'amount_step',
    'convenience_fee_type', 'convenience_fee_value',
    'fields_required', 'field_validations',
    // Processing
    'processing_time_seconds', 'timeout_seconds',
    'retry_enabled', 'max_retries',
    // Status
    'is_active', 'is_verified', 'is_in_maintenance',
    'maintenance_message', 'last_health_check_at',
    'health_status', 'response_time_ms',
    // Commission
    'commission_type', 'commission_value',
    'settlement_method', 'settlement_schedule',
    // Metadata
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    supported_currencies: 'json',
    supported_countries: 'json',
    fields_required: 'json',
    field_validations: 'json',
    metadata: 'json',
    tags: 'json',
    is_active: 'boolean',
    is_verified: 'boolean',
    is_in_maintenance: 'boolean',
    retry_enabled: 'boolean',
    minimum_amount: 'float',
    maximum_amount: 'float',
    amount_step: 'float',
    convenience_fee_value: 'float',
    commission_value: 'float',
    processing_time_seconds: 'integer',
    timeout_seconds: 'integer',
    max_retries: 'integer',
    response_time_ms: 'integer',
  };

  static relations = {
    category: {
      type: 'belongsTo',
      model: 'BillerCategory',
      foreignKey: 'category_id',
      ownerKey: 'id',
    },
    payments: {
      type: 'hasMany',
      model: 'BillPayment',
      foreignKey: 'biller_id',
      localKey: 'id',
    },
  };

  // Integration types
  static integrationTypes = {
    API: 'api',
    SCRAPER: 'scraper',
    FILE_UPLOAD: 'file_upload',
    MANUAL: 'manual',
  };

  // Commission types
  static commissionTypes = {
    FLAT: 'flat',
    PERCENTAGE: 'percentage',
    TIERED: 'tiered',
  };

  // Convenience fee types
  static feeTypes = {
    FLAT: 'flat',
    PERCENTAGE: 'percentage',
    NONE: 'none',
  };

  /**
   * Find active billers by category
   * @param {string} categoryId - Category ID
   */
  static async findByCategory(categoryId) {
    return this.findAll({
      where: {
        category_id: categoryId,
        is_active: true,
        is_verified: true,
      },
      orderBy: { name: 'ASC' },
    });
  }

  /**
   * Search billers by name or short code
   * @param {string} query - Search query
   */
  static async search(query) {
    const text = `
      SELECT * FROM ${this.tableName}
      WHERE is_active = true
        AND is_verified = true
        AND (
          name ILIKE $1
          OR short_code ILIKE $1
          OR slug ILIKE $1
          OR description ILIKE $1
        )
      ORDER BY name ASC
      LIMIT 20
    `;
    
    const result = await connectionPool.query(text, [`%${query}%`]);
    return result.rows;
  }

  /**
   * Get popular billers by payment volume
   * @param {number} limit - Max results
   */
  static async getPopular(limit = 10) {
    const text = `
      SELECT 
        b.*,
        COUNT(bp.id) as payment_count,
        COALESCE(SUM(bp.total_amount), 0) as total_revenue
      FROM ${this.tableName} b
      LEFT JOIN bill_payments bp ON b.id = bp.biller_id
        AND bp.status = 'completed'
        AND bp.created_at > NOW() - INTERVAL '30 days'
      WHERE b.is_active = true AND b.is_verified = true
      GROUP BY b.id
      ORDER BY payment_count DESC, b.name ASC
      LIMIT $1
    `;
    
    const result = await connectionPool.query(text, [limit]);
    return result.rows;
  }

  /**
   * Calculate convenience fee for a payment amount
   * @param {string} billerId - Biller ID
   * @param {number} amount - Payment amount
   * @returns {Promise<number>} Convenience fee
   */
  static async calculateFee(billerId, amount) {
    const biller = await this.findById(billerId);
    if (!biller) return 0;

    switch (biller.convenience_fee_type) {
      case this.feeTypes.FLAT:
        return biller.convenience_fee_value || 0;
      case this.feeTypes.PERCENTAGE:
        return (amount * (biller.convenience_fee_value || 0)) / 100;
      case this.feeTypes.NONE:
      default:
        return 0;
    }
  }

  /**
   * Validate required fields for a biller
   * @param {string} billerId - Biller ID
   * @param {Object} data - Payment data to validate
   * @returns {Object} Validation result
   */
  static async validateFields(billerId, data) {
    const biller = await this.findById(billerId);
    if (!biller) {
      return { valid: false, errors: ['Biller not found'] };
    }

    const errors = [];
    const requiredFields = biller.fields_required || [];

    for (const field of requiredFields) {
      if (!data[field] && data[field] !== 0) {
        const fieldLabels = {
          meter_number: 'Meter number',
          customer_reference: 'Customer reference',
          account_number: 'Account number',
          student_number: 'Student number',
          policy_number: 'Policy number',
          phone_number: 'Phone number',
        };
        errors.push(`${fieldLabels[field] || field} is required`);
      }
    }

    // Validate specific fields using biller's validation rules
    if (biller.field_validations) {
      for (const [field, rules] of Object.entries(biller.field_validations)) {
        if (data[field] && rules.pattern) {
          const regex = new RegExp(rules.pattern);
          if (!regex.test(data[field])) {
            errors.push(rules.message || `Invalid ${field} format`);
          }
        }
        if (data[field] && rules.minLength && data[field].length < rules.minLength) {
          errors.push(`${field} must be at least ${rules.minLength} characters`);
        }
        if (data[field] && rules.maxLength && data[field].length > rules.maxLength) {
          errors.push(`${field} must be at most ${rules.maxLength} characters`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Update health check status
   * @param {string} billerId - Biller ID
   * @param {string} status - Health status
   * @param {number} responseTimeMs - Response time
   */
  static async updateHealth(billerId, status, responseTimeMs = null) {
    return this.update({ id: billerId }, {
      last_health_check_at: new Date().toISOString(),
      health_status: status,
      response_time_ms: responseTimeMs,
      is_in_maintenance: status === 'maintenance',
    });
  }
}

module.exports = Biller;