const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * COD Verification Model - COD Delivery Verification
 * 
 * Records verification of Cash on Delivery transactions.
 * Verifies that the customer received the correct order
 * and paid the correct amount.
 * 
 * TABLE: cod_verifications
 */

class CodVerification extends BaseModel {
  static tableName = 'cod_verifications';
  static primaryKey = 'id';
  static timestamps = false;
  
  static fields = [
    'id', 'cod_order_id', 'order_id',
    'delivery_id', 'driver_id', 'user_id',
    // Verification details
    'verification_code', 'verification_code_hash',
    'verification_method', 'verification_status',
    'verified_at', 'verified_by_customer',
    'verified_by_driver',
    // Package verification
    'package_condition', 'package_damaged',
    'package_damage_description', 'package_photo_url',
    'items_correct', 'items_missing', 'items_damaged',
    // Payment verification
    'amount_expected', 'amount_collected',
    'amount_difference', 'amount_correct',
    'payment_method_used', 'payment_reference',
    // Recipient verification
    'recipient_name', 'recipient_signature_url',
    'recipient_id_type', 'recipient_id_photo_url',
    'recipient_phone_verified',
    // Location verification
    'delivery_location_lat', 'delivery_location_lon',
    'location_accuracy_meters', 'location_matched',
    // Discrepancies
    'discrepancies_found', 'discrepancy_details',
    'resolution_required', 'resolution_notes',
    // Timestamps
    'delivery_attempted_at', 'verified_at_timestamp',
    // Metadata
    'metadata', 'tenant_id', 'created_at',
  ];

  static casts = {
    amount_expected: 'float',
    amount_collected: 'float',
    amount_difference: 'float',
    package_damaged: 'boolean',
    items_correct: 'boolean',
    amount_correct: 'boolean',
    verified_by_customer: 'boolean',
    verified_by_driver: 'boolean',
    recipient_phone_verified: 'boolean',
    location_matched: 'boolean',
    discrepancies_found: 'boolean',
    resolution_required: 'boolean',
    items_missing: 'json',
    items_damaged: 'json',
    discrepancy_details: 'json',
    metadata: 'json',
    location_accuracy_meters: 'float',
  };

  static verificationMethods = {
    OTP: 'otp',
    QR_CODE: 'qr_code',
    SIGNATURE: 'signature',
    ID_DOCUMENT: 'id_document',
    PHONE: 'phone',
    PIN: 'pin',
  };

  static verificationStatuses = {
    PENDING: 'pending',
    VERIFIED: 'verified',
    FAILED: 'failed',
    DISPUTED: 'disputed',
    EXPIRED: 'expired',
  };

  /**
   * Generate verification code for COD delivery
   */
  static generateVerificationCode() {
    const code = crypto.randomInt(100000, 999999).toString();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    return { code, codeHash };
  }

  /**
   * Record delivery verification
   */
  static async recordVerification(params = {}) {
    return this.create({
      cod_order_id: params.codOrderId,
      order_id: params.orderId,
      delivery_id: params.deliveryId,
      driver_id: params.driverId,
      user_id: params.userId,
      verification_code_hash: params.codeHash || null,
      verification_method: params.method || this.verificationMethods.OTP,
      verification_status: params.status || this.verificationStatuses.VERIFIED,
      verified_at: new Date().toISOString(),
      verified_by_customer: params.verifiedByCustomer || false,
      verified_by_driver: params.verifiedByDriver || true,
      package_condition: params.packageCondition || 'good',
      package_damaged: params.packageDamaged || false,
      package_damage_description: params.damageDescription || null,
      package_photo_url: params.packagePhotoUrl || null,
      items_correct: params.itemsCorrect !== false,
      items_missing: params.itemsMissing || null,
      items_damaged: params.itemsDamaged || null,
      amount_expected: params.amountExpected,
      amount_collected: params.amountCollected,
      amount_difference: params.amountDifference || 0,
      amount_correct: params.amountCorrect !== false,
      payment_method_used: params.paymentMethod || 'cash',
      payment_reference: params.paymentReference || null,
      recipient_name: params.recipientName || null,
      recipient_signature_url: params.signatureUrl || null,
      recipient_id_type: params.recipientIdType || null,
      recipient_id_photo_url: params.recipientIdPhotoUrl || null,
      recipient_phone_verified: params.phoneVerified || false,
      delivery_location_lat: params.lat || null,
      delivery_location_lon: params.lon || null,
      location_accuracy_meters: params.locationAccuracy || null,
      location_matched: params.locationMatched !== false,
      discrepancies_found: params.discrepanciesFound || false,
      discrepancy_details: params.discrepancyDetails || null,
      resolution_required: params.resolutionRequired || false,
      resolution_notes: params.resolutionNotes || null,
      delivery_attempted_at: params.deliveryAttemptedAt || new Date().toISOString(),
      metadata: params.metadata || {},
      tenant_id: params.tenantId || null,
    });
  }

  /**
   * Find verifications by COD order
   */
  static async findByCodOrder(codOrderId) {
    return this.findAll({
      where: { cod_order_id: codOrderId },
      orderBy: { created_at: 'DESC' },
    });
  }

  /**
   * Find verification by delivery
   */
  static async findByDelivery(deliveryId) {
    return this.findOne({
      where: { delivery_id: deliveryId },
      orderBy: { created_at: 'DESC' },
    });
  }

  /**
   * Get verification success rate
   */
  static async getSuccessRate(driverId = null, options = {}) {
    const text = `
      SELECT
        COUNT(*) as total_verifications,
        COUNT(CASE WHEN verification_status = 'verified' THEN 1 END) as successful,
        COUNT(CASE WHEN discrepancies_found = true THEN 1 END) as with_discrepancies,
        ROUND(
          100.0 * COUNT(CASE WHEN verification_status = 'verified' THEN 1 END) / NULLIF(COUNT(*), 0),
          2
        ) as success_rate
      FROM ${this.tableName}
      WHERE 1=1
        ${driverId ? 'AND driver_id = $1' : ''}
        ${options.startDate ? `AND created_at >= $${driverId ? 2 : 1}` : ''}
    `;

    const values = [];
    if (driverId) values.push(driverId);
    if (options.startDate) values.push(options.startDate.toISOString());

    const result = await require('@siamsiam/shared-utils').database.connectionPool.query(text, values);
    return result.rows[0];
  }
}

module.exports = CodVerification;