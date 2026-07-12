const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Delivery Signature Model - Digital Signature Capture
 * 
 * Records digital signatures captured at delivery for proof of delivery.
 * Supports multiple signature types and verification methods.
 * 
 * TABLE: delivery_signatures
 * 
 * SIGNATURE TYPES:
 * - hand_drawn: Finger/stylus drawn signature on mobile device
 * - photo_id: Photo of recipient's ID document
 * - typed_name: Recipient typed their full name
 * - pin_code: Numeric PIN verification
 * - biometric: Fingerprint or face scan
 * - witnessed: Witnessed by third party
 */

class DeliverySignature extends BaseModel {
  static tableName = 'delivery_signatures';
  static primaryKey = 'id';
  static timestamps = false; // Only created_at
  
  static fields = [
    'id', 'delivery_id', 'order_id',
    'driver_id', 'user_id',
    // Signature data
    'signature_type', 'signature_method',
    'signature_data', 'signature_url',
    'signature_format', 'signature_size_bytes',
    // Signatory information
    'signatory_name', 'signatory_relationship',
    'signatory_phone', 'signatory_email',
    'signatory_id_type', 'signatory_id_number_encrypted',
    'signatory_id_photo_url',
    // Verification
    'is_verified', 'verification_method',
    'verified_at', 'verified_by',
    'verification_confidence', 'verification_notes',
    // Device information
    'device_id', 'device_type', 'device_model',
    'app_version', 'os_version',
    // Location at signing
    'latitude', 'longitude', 'accuracy_meters',
    'location_address', 'location_matched',
    'location_distance_from_delivery_meters',
    // Timestamp
    'signed_at', 'signed_at_device_time',
    'signature_duration_seconds',
    // Integrity
    'checksum', 'checksum_algorithm',
    'is_tampered', 'tamper_detection_notes',
    // Witness (if applicable)
    'witness_name', 'witness_phone',
    'witness_signature_url', 'witness_relationship',
    // Delivery confirmation
    'items_received_correct', 'items_damaged',
    'items_missing', 'delivery_notes',
    'customer_feedback', 'customer_rating',
    // Package condition
    'package_condition', 'package_photo_url',
    'package_opened_before_signing',
    // Metadata
    'metadata', 'tags',
    'tenant_id', 'created_at',
  ];

  static casts = {
    signature_data: 'json',
    metadata: 'json',
    tags: 'json',
    is_verified: 'boolean',
    location_matched: 'boolean',
    is_tampered: 'boolean',
    items_received_correct: 'boolean',
    items_damaged: 'boolean',
    items_missing: 'json',
    package_opened_before_signing: 'boolean',
    signature_size_bytes: 'integer',
    signature_duration_seconds: 'integer',
    latitude: 'float',
    longitude: 'float',
    accuracy_meters: 'float',
    location_distance_from_delivery_meters: 'float',
    verification_confidence: 'float',
    customer_rating: 'integer',
  };

  static relations = {
    delivery: { type: 'belongsTo', model: 'Delivery', foreignKey: 'delivery_id', ownerKey: 'id' },
    order: { type: 'belongsTo', model: 'Order', foreignKey: 'order_id', ownerKey: 'id' },
  };

  // Signature type constants
  static signatureTypes = {
    HAND_DRAWN: 'hand_drawn',
    PHOTO_ID: 'photo_id',
    TYPED_NAME: 'typed_name',
    PIN_CODE: 'pin_code',
    BIOMETRIC: 'biometric',
    WITNESSED: 'witnessed',
  };

  // Signatory relationship types
  static relationships = {
    CUSTOMER: 'customer',
    FAMILY_MEMBER: 'family_member',
    FRIEND: 'friend',
    COLLEAGUE: 'colleague',
    NEIGHBOR: 'neighbor',
    SECURITY_GUARD: 'security_guard',
    RECEPTIONIST: 'receptionist',
    HOUSE_HELP: 'house_help',
    OTHER: 'other',
  };

  /**
   * Capture a delivery signature
   * @param {Object} params - Signature capture parameters
   * @returns {Promise<Object>} Created signature record
   */
  static async capture(params = {}) {
    // Generate checksum for signature integrity
    const signatureData = params.signatureData || {};
    const checksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(signatureData))
      .digest('hex');

    // Calculate distance from delivery location if coordinates available
    let locationDistance = null;
    let locationMatched = false;
    if (params.latitude && params.longitude && params.deliveryLat && params.deliveryLon) {
      locationDistance = this._calculateDistance(
        params.latitude, params.longitude,
        params.deliveryLat, params.deliveryLon
      );
      locationMatched = locationDistance <= 100; // Within 100 meters
    }

    const signature = await this.create({
      delivery_id: params.deliveryId,
      order_id: params.orderId,
      driver_id: params.driverId,
      user_id: params.userId,
      // Signature data
      signature_type: params.signatureType || this.signatureTypes.HAND_DRAWN,
      signature_method: params.signatureMethod || 'mobile_app',
      signature_data: signatureData,
      signature_url: params.signatureUrl || null,
      signature_format: params.signatureFormat || 'png',
      signature_size_bytes: params.signatureSizeBytes || 0,
      // Signatory information
      signatory_name: params.signatoryName,
      signatory_relationship: params.signatoryRelationship || this.relationships.CUSTOMER,
      signatory_phone: params.signatoryPhone || null,
      signatory_email: params.signatoryEmail || null,
      signatory_id_type: params.signatoryIdType || null,
      signatory_id_number_encrypted: params.signatoryIdNumber 
        ? require('@siamsiam/shared-utils').security.encryption.encrypt(params.signatoryIdNumber) 
        : null,
      signatory_id_photo_url: params.signatoryIdPhotoUrl || null,
      // Verification
      is_verified: params.isVerified !== false,
      verification_method: params.verificationMethod || 'driver_confirmation',
      verified_at: params.isVerified !== false ? new Date().toISOString() : null,
      verified_by: params.verifiedBy || 'driver',
      verification_confidence: params.verificationConfidence || 1.0,
      verification_notes: params.verificationNotes || null,
      // Device information
      device_id: params.deviceId || null,
      device_type: params.deviceType || null,
      device_model: params.deviceModel || null,
      app_version: params.appVersion || null,
      os_version: params.osVersion || null,
      // Location at signing
      latitude: params.latitude || null,
      longitude: params.longitude || null,
      accuracy_meters: params.accuracyMeters || null,
      location_address: params.locationAddress || null,
      location_matched: locationMatched,
      location_distance_from_delivery_meters: locationDistance,
      // Timestamp
      signed_at: params.signedAt || new Date().toISOString(),
      signed_at_device_time: params.signedAtDeviceTime || null,
      signature_duration_seconds: params.signatureDuration || 0,
      // Integrity
      checksum,
      checksum_algorithm: 'sha256',
      is_tampered: false,
      // Witness
      witness_name: params.witnessName || null,
      witness_phone: params.witnessPhone || null,
      witness_signature_url: params.witnessSignatureUrl || null,
      witness_relationship: params.witnessRelationship || null,
      // Delivery confirmation
      items_received_correct: params.itemsReceivedCorrect !== false,
      items_damaged: params.itemsDamaged || false,
      items_missing: params.itemsMissing || null,
      delivery_notes: params.deliveryNotes || null,
      customer_feedback: params.customerFeedback || null,
      customer_rating: params.customerRating || null,
      // Package condition
      package_condition: params.packageCondition || 'good',
      package_photo_url: params.packagePhotoUrl || null,
      package_opened_before_signing: params.packageOpenedBeforeSigning || false,
      // Metadata
      metadata: params.metadata || {},
      tags: params.tags || [],
      tenant_id: params.tenantId || null,
    });

    logger.info('Delivery signature captured', {
      signatureId: signature.id,
      deliveryId: params.deliveryId,
      signatureType: signature.signature_type,
      signatoryRelationship: signature.signatory_relationship,
    });

    return signature;
  }

  /**
   * Find signatures by delivery
   */
  static async findByDelivery(deliveryId) {
    return this.findAll({
      where: { delivery_id: deliveryId },
      orderBy: { signed_at: 'DESC' },
    });
  }

  /**
   * Find latest signature for a delivery
   */
  static async findLatestByDelivery(deliveryId) {
    return this.findOne({
      where: { delivery_id: deliveryId, is_verified: true },
      orderBy: { signed_at: 'DESC' },
    });
  }

  /**
   * Find signatures by driver
   */
  static async findByDriver(driverId, options = {}) {
    return this.paginate({
      where: { driver_id: driverId },
      orderBy: { signed_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Verify signature authenticity
   */
  static async verifySignature(signatureId, verifiedBy, options = {}) {
    // Recalculate checksum
    const signature = await this.findById(signatureId);
    if (!signature) throw new Error('Signature not found');

    const currentChecksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(signature.signature_data || {}))
      .digest('hex');

    const isTampered = currentChecksum !== signature.checksum;

    return this.update({ id: signatureId }, {
      is_verified: !isTampered,
      verified_at: new Date().toISOString(),
      verified_by: verifiedBy,
      verification_method: options.method || 'manual',
      verification_confidence: isTampered ? 0 : 1,
      verification_notes: isTampered ? 'Signature data may have been tampered with' : options.notes,
      is_tampered: isTampered,
      tamper_detection_notes: isTampered ? 'Checksum mismatch detected' : null,
    });
  }

  /**
   * Get signature statistics for a driver
   */
  static async getDriverStats(driverId, options = {}) {
    const text = `
      SELECT
        COUNT(*) as total_signatures,
        COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_signatures,
        COUNT(CASE WHEN items_received_correct = true THEN 1 END) as correct_deliveries,
        COUNT(CASE WHEN items_damaged = true THEN 1 END) as damaged_deliveries,
        COUNT(CASE WHEN package_opened_before_signing = false THEN 1 END) as unopened_packages,
        AVG(customer_rating) as avg_customer_rating,
        AVG(signature_duration_seconds) as avg_signature_duration_sec,
        AVG(location_distance_from_delivery_meters) as avg_location_distance_meters
      FROM ${this.tableName}
      WHERE driver_id = $1
        ${options.startDate ? 'AND created_at >= $2' : ''}
        ${options.endDate ? `AND created_at <= $${options.startDate ? 3 : 2}` : ''}
    `;

    const values = [driverId];
    if (options.startDate) values.push(options.startDate.toISOString());
    if (options.endDate) values.push(options.endDate.toISOString());

    const result = await connectionPool.query(text, values);
    return result.rows[0];
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   * @private
   */
  static _calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }
}

module.exports = DeliverySignature;