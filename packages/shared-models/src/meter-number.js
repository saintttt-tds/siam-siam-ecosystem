const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Meter Number Model - Utility Meter Number Record
 * 
 * Stores user's saved utility meter numbers for quick bill payments.
 * Supports electricity, water, gas, internet, and other metered services.
 * Validates meter numbers against biller-specific formats.
 * 
 * TABLE: meter_numbers
 * 
 * METER TYPES:
 * - electricity: Prepaid/postpaid electricity meters (ZESA, etc.)
 * - water: Municipal water meters
 * - gas: Natural gas meters
 * - internet: Internet service account numbers (treated as meter)
 * - dstv: DSTV smartcard/decoder numbers
 * - other: Other metered utility services
 */

class MeterNumber extends BaseModel {
  static tableName = 'meter_numbers';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id',
    // Biller reference
    'biller_id', 'biller_name', 'biller_category',
    'biller_code', 'biller_short_code',
    // Meter identification
    'meter_number', 'meter_name', 'meter_type',
    'meter_subtype', 'meter_brand',
    // Customer details
    'customer_name', 'customer_reference',
    'customer_account_number', 'customer_address',
    'customer_phone', 'customer_email',
    // Location
    'meter_location', 'meter_address', 'city',
    'state', 'country', 'postal_code',
    'property_type', 'property_name',
    // Verification
    'is_verified', 'verified_at', 'verification_method',
    'verification_source', 'verification_reference',
    'last_verified_at', 'verification_notes',
    'verified_by', 'verification_attempts',
    // Status
    'is_default', 'is_active', 'is_favorite',
    'is_archived', 'nickname',
    // Usage tracking
    'last_used_at', 'use_count', 'total_payments',
    'total_amount_paid', 'last_payment_amount',
    'last_payment_at', 'last_payment_currency',
    'last_payment_reference', 'last_token',
    'last_token_amount', 'last_token_units',
    'last_token_expiry',
    // Consumption tracking
    'average_monthly_consumption', 'consumption_unit',
    'last_reading', 'last_reading_date',
    'previous_reading', 'reading_difference',
    'estimated_monthly_bill', 'bill_currency',
    // Recurring
    'has_recurring_payment', 'recurring_payment_id',
    'recurring_amount', 'recurring_day_of_month',
    'auto_pay_enabled', 'auto_pay_method',
    'low_balance_alert', 'low_balance_threshold',
    // Notifications
    'bill_reminder_enabled', 'bill_reminder_days_before',
    'payment_confirmation_enabled', 'token_notification_enabled',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    is_verified: 'boolean', is_default: 'boolean',
    is_active: 'boolean', is_favorite: 'boolean',
    is_archived: 'boolean', has_recurring_payment: 'boolean',
    auto_pay_enabled: 'boolean', low_balance_alert: 'boolean',
    bill_reminder_enabled: 'boolean', payment_confirmation_enabled: 'boolean',
    token_notification_enabled: 'boolean',
    use_count: 'integer', total_payments: 'integer',
    verification_attempts: 'integer', recurring_day_of_month: 'integer',
    bill_reminder_days_before: 'integer',
    total_amount_paid: 'float', last_payment_amount: 'float',
    last_token_amount: 'float', last_token_units: 'float',
    average_monthly_consumption: 'float', last_reading: 'float',
    previous_reading: 'float', reading_difference: 'float',
    estimated_monthly_bill: 'float', recurring_amount: 'float',
    low_balance_threshold: 'float',
    metadata: 'json', tags: 'json',
  };

  static relations = {
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
    biller: { type: 'belongsTo', model: 'Biller', foreignKey: 'biller_id', ownerKey: 'id' },
  };

  static meterTypes = {
    ELECTRICITY: 'electricity', WATER: 'water', GAS: 'gas',
    INTERNET: 'internet', DSTV: 'dstv', OTHER: 'other',
  };

  /**
   * Find meters by user
   */
  static async findByUser(userId, options = {}) {
    return this.findAll({
      where: { user_id: userId, is_active: true, is_archived: false },
      orderBy: { is_default: 'DESC', is_favorite: 'DESC', last_used_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Find meter by meter number and biller
   */
  static async findByMeter(meterNumber, billerId = null) {
    const criteria = { meter_number: meterNumber, is_active: true };
    if (billerId) criteria.biller_id = billerId;
    return this.findOne({ where: criteria });
  }

  /**
   * Save a new meter number
   */
  static async saveMeter(userId, meterDetails) {
    // Check for duplicates
    const existing = await this.findByMeter(meterDetails.meterNumber, meterDetails.billerId);
    if (existing && existing.user_id === userId) {
      throw new Error('This meter number is already saved');
    }

    // Check if this is the user's first meter (make it default)
    const meterCount = await this.count({ where: { user_id: userId, is_active: true } });

    return this.create({
      user_id: userId,
      biller_id: meterDetails.billerId,
      biller_name: meterDetails.billerName,
      biller_category: meterDetails.billerCategory,
      biller_code: meterDetails.billerCode,
      meter_number: meterDetails.meterNumber,
      meter_name: meterDetails.meterName || `My ${meterDetails.billerCategory || 'Meter'}`,
      meter_type: meterDetails.meterType || this.meterTypes.ELECTRICITY,
      meter_subtype: meterDetails.meterSubtype,
      customer_name: meterDetails.customerName,
      customer_reference: meterDetails.customerReference,
      customer_account_number: meterDetails.customerAccountNumber,
      customer_address: meterDetails.customerAddress,
      meter_location: meterDetails.meterLocation,
      meter_address: meterDetails.meterAddress,
      city: meterDetails.city,
      country: meterDetails.country,
      is_default: meterCount === 0 || meterDetails.isDefault || false,
      is_active: true,
      is_favorite: meterDetails.isFavorite || false,
      nickname: meterDetails.nickname,
      tenant_id: meterDetails.tenantId || null,
    });
  }

  /**
   * Set a meter as default
   */
  static async setDefault(userId, meterId) {
    await connectionPool.query(
      `UPDATE ${this.tableName} SET is_default = false, updated_at = NOW() WHERE user_id = $1`,
      [userId]
    );
    return this.update({ id: meterId }, { is_default: true, updated_at: new Date().toISOString() });
  }

  /**
   * Record meter usage after a payment
   */
  static async recordUsage(meterId, paymentDetails = {}) {
    const updates = {
      last_used_at: new Date().toISOString(),
      use_count: connectionPool.raw('use_count + 1'),
      total_payments: connectionPool.raw('total_payments + 1'),
    };

    if (paymentDetails.amount) {
      updates.last_payment_amount = paymentDetails.amount;
      updates.last_payment_at = new Date().toISOString();
      updates.last_payment_currency = paymentDetails.currency;
      updates.last_payment_reference = paymentDetails.reference;
      updates.total_amount_paid = connectionPool.raw(`total_amount_paid + ${paymentDetails.amount}`);
    }

    if (paymentDetails.token) {
      updates.last_token = paymentDetails.token;
      updates.last_token_amount = paymentDetails.tokenAmount;
      updates.last_token_units = paymentDetails.tokenUnits;
      updates.last_token_expiry = paymentDetails.tokenExpiry;
    }

    return this.update({ id: meterId }, updates);
  }

  /**
   * Update meter reading
   */
  static async updateReading(meterId, reading) {
    const meter = await this.findById(meterId);
    const previousReading = meter?.last_reading || 0;
    const difference = reading - previousReading;

    return this.update({ id: meterId }, {
      last_reading: reading,
      previous_reading: previousReading,
      reading_difference: difference,
      last_reading_date: new Date().toISOString(),
    });
  }

  /**
   * Verify a meter number against biller
   */
  static async verify(meterId, verificationMethod = 'api', verifiedBy = 'system') {
    return this.update({ id: meterId }, {
      is_verified: true,
      verified_at: new Date().toISOString(),
      last_verified_at: new Date().toISOString(),
      verification_method: verificationMethod,
      verified_by: verifiedBy,
      verification_attempts: connectionPool.raw('verification_attempts + 1'),
    });
  }

  /**
   * Get popular meter numbers (for biller analytics)
   */
  static async getPopularByBiller(billerId, limit = 20) {
    const text = `
      SELECT biller_id, biller_name, biller_category,
        COUNT(*) as meter_count, COUNT(DISTINCT user_id) as unique_users
      FROM ${this.tableName}
      WHERE is_active = true AND biller_id = $1
      GROUP BY biller_id, biller_name, biller_category
      LIMIT $2
    `;
    const result = await connectionPool.query(text, [billerId, limit]);
    return result.rows;
  }

  /**
   * Archive unused meters
   */
  static async archiveUnused(userId, daysUnused = 180) {
    const result = await connectionPool.query(
      `UPDATE ${this.tableName} SET is_archived = true WHERE user_id = $1 AND is_active = true AND last_used_at < NOW() - INTERVAL '${daysUnused} days'`,
      [userId]
    );
    return result.rowCount;
  }
}

module.exports = MeterNumber;