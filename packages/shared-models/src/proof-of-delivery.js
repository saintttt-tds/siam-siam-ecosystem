const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Proof of Delivery Model - POD with Signature/Photo/Scan
 * 
 * Comprehensive proof of delivery record capturing multiple verification
 * methods including signatures, photos, barcode scans, QR verification,
 * ID document capture, and recipient confirmation.
 * 
 * TABLE: proof_of_delivery
 * 
 * VERIFICATION METHODS:
 * - signature: Digital signature captured on device
 * - photo: Photo of delivered package at location
 * - barcode_scan: Package barcode scanned at delivery
 * - qr_scan: QR code verification by recipient
 * - pin_code: Numeric PIN provided by recipient
 * - id_document: Recipient's ID document captured
 * - biometric: Fingerprint or face verification
 * - witness: Witnessed by third party
 */

class ProofOfDelivery extends BaseModel {
  static tableName = 'proof_of_delivery';
  static primaryKey = 'id';
  static timestamps = false;
  
  static fields = [
    'id', 'delivery_id', 'order_id', 'driver_id',
    // POD identification
    'pod_number', 'pod_type', 'pod_status',
    // Delivery confirmation
    'delivery_confirmed', 'delivery_date', 'delivery_time',
    'delivery_location_lat', 'delivery_location_lon',
    'delivery_location_accuracy_meters', 'delivery_address_verified',
    'distance_from_expected_meters',
    // Recipient verification
    'recipient_name', 'recipient_relationship',
    'recipient_phone', 'recipient_phone_verified',
    'recipient_email', 'recipient_id_type',
    'recipient_id_number_encrypted', 'recipient_id_photo_url',
    'recipient_id_verified', 'recipient_id_verification_method',
    // Signature capture
    'signature_type', 'signature_data', 'signature_url',
    'signature_format', 'signature_size_bytes',
    'signature_captured_at', 'signature_device_id',
    'signature_verified', 'signature_verification_score',
    // Photo capture
    'delivery_photo_url', 'delivery_photo_thumbnail_url',
    'delivery_photo_captured_at', 'delivery_photo_device_id',
    'delivery_photo_verified', 'delivery_photo_gps_lat',
    'delivery_photo_gps_lon',
    // Package photos
    'package_photo_url', 'package_photo_thumbnail_url',
    'package_condition', 'package_damaged',
    'package_damage_description', 'package_damage_photo_url',
    'package_opened', 'package_opened_description',
    // Barcode/QR scanning
    'barcode_scanned', 'barcode_value', 'barcode_type',
    'barcode_scan_url', 'barcode_scan_time',
    'qr_code_scanned', 'qr_code_value', 'qr_scan_url',
    'qr_scan_time', 'qr_verification_match',
    // PIN/Code verification
    'pin_verified', 'pin_code_hash', 'pin_entered_at',
    'pin_attempts', 'pin_verified_at',
    // OTP verification
    'otp_verified', 'otp_code_hash', 'otp_sent_to',
    'otp_sent_at', 'otp_verified_at', 'otp_attempts',
    // ID verification
    'id_document_photo_url', 'id_document_type',
    'id_document_number_encrypted', 'id_document_verified',
    'id_document_verification_score',
    // Biometric
    'biometric_type', 'biometric_verified',
    'biometric_verification_score', 'biometric_captured_at',
    // Witness
    'witness_name', 'witness_phone', 'witness_relationship',
    'witness_signature_url', 'witness_id_type',
    'witness_id_number_encrypted',
    // Package details
    'package_count', 'package_weight_kg',
    'package_dimensions_verified', 'items_verified',
    'items_missing', 'items_damaged', 'items_extra',
    'items_condition_notes',
    // Recipient notes
    'recipient_notes', 'recipient_feedback',
    'recipient_rating', 'recipient_complaint',
    'recipient_refused', 'refusal_reason',
    // Driver notes
    'driver_notes', 'driver_issues_reported',
    'traffic_conditions', 'weather_conditions',
    'delivery_attempt_number', 'is_reattempt',
    'previous_attempt_id',
    // Contactless delivery
    'is_contactless', 'drop_off_location',
    'drop_off_photo_url', 'drop_off_description',
    'left_at_door', 'left_with_neighbor', 'neighbor_name',
    'neighbor_address', 'left_in_mailroom',
    'left_at_reception', 'receptionist_name',
    // Device and app info
    'device_id', 'device_model', 'device_os',
    'app_version', 'app_build_number',
    'captured_offline', 'offline_sync_at',
    // Integrity
    'checksum', 'checksum_algorithm',
    'is_tampered', 'tamper_detection_notes',
    'blockchain_tx_hash', 'blockchain_verified',
    // Status and verification
    'verification_status', 'verification_score',
    'verified_by', 'verified_at', 'verification_notes',
    'requires_review', 'review_reason', 'reviewed_by',
    'reviewed_at', 'review_notes',
    // Compliance
    'gdpr_consent', 'data_retention_date',
    'anonymized_at',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'created_at',
  ];

  static casts = {
    signature_data: 'json', items_missing: 'json',
    items_damaged: 'json', items_extra: 'json',
    items_condition_notes: 'json', metadata: 'json', tags: 'json',
    delivery_location_lat: 'float', delivery_location_lon: 'float',
    delivery_location_accuracy_meters: 'float',
    distance_from_expected_meters: 'float',
    signature_size_bytes: 'integer', pin_attempts: 'integer',
    otp_attempts: 'integer', package_count: 'integer',
    package_weight_kg: 'float', delivery_attempt_number: 'integer',
    recipient_rating: 'integer', signature_verification_score: 'float',
    biometric_verification_score: 'float',
    id_document_verification_score: 'float',
    verification_score: 'float',
    delivery_confirmed: 'boolean', delivery_address_verified: 'boolean',
    recipient_phone_verified: 'boolean', recipient_id_verified: 'boolean',
    signature_verified: 'boolean', delivery_photo_verified: 'boolean',
    package_damaged: 'boolean', package_opened: 'boolean',
    package_dimensions_verified: 'boolean', items_verified: 'boolean',
    barcode_scanned: 'boolean', qr_code_scanned: 'boolean',
    qr_verification_match: 'boolean', pin_verified: 'boolean',
    otp_verified: 'boolean', id_document_verified: 'boolean',
    biometric_verified: 'boolean', recipient_refused: 'boolean',
    is_contactless: 'boolean', left_at_door: 'boolean',
    left_with_neighbor: 'boolean', left_in_mailroom: 'boolean',
    left_at_reception: 'boolean', captured_offline: 'boolean',
    is_tampered: 'boolean', blockchain_verified: 'boolean',
    requires_review: 'boolean', is_reattempt: 'boolean',
    gdpr_consent: 'boolean',
  };

  static relations = {
    delivery: { type: 'belongsTo', model: 'Delivery', foreignKey: 'delivery_id', ownerKey: 'id' },
    order: { type: 'belongsTo', model: 'Order', foreignKey: 'order_id', ownerKey: 'id' },
    driver: { type: 'belongsTo', model: 'Driver', foreignKey: 'driver_id', ownerKey: 'id' },
  };

  static podTypes = {
    STANDARD: 'standard', SIGNATURE: 'signature', PHOTO: 'photo',
    SCAN: 'scan', PIN: 'pin', ID_CHECK: 'id_check',
    CONTACTLESS: 'contactless', WITNESS: 'witness',
    MULTI_FACTOR: 'multi_factor',
  };

  static verificationStatuses = {
    PENDING: 'pending', PARTIALLY_VERIFIED: 'partially_verified',
    VERIFIED: 'verified', FAILED: 'failed', DISPUTED: 'disputed',
    UNDER_REVIEW: 'under_review',
  };

  static podStatuses = {
    CAPTURED: 'captured', PROCESSING: 'processing',
    COMPLETED: 'completed', FAILED: 'failed', EXPIRED: 'expired',
  };

  static generatePODNumber() {
    return `POD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  }

  /**
   * Capture proof of delivery
   */
  static async capture(deliveryId, orderId, driverId, podData) {
    const podNumber = this.generatePODNumber();
    
    // Generate integrity checksum
    const signatureData = podData.signatureData || {};
    const checksum = crypto.createHash('sha256')
      .update(JSON.stringify({ deliveryId, orderId, timestamp: new Date().toISOString(), signatureData }))
      .digest('hex');

    return this.create({
      delivery_id: deliveryId, order_id: orderId, driver_id: driverId,
      pod_number: podNumber, pod_type: podData.podType || this.podTypes.STANDARD,
      pod_status: this.podStatuses.CAPTURED,
      delivery_confirmed: podData.deliveryConfirmed !== false,
      delivery_date: podData.deliveryDate || new Date().toISOString(),
      delivery_time: podData.deliveryTime || new Date().toISOString(),
      delivery_location_lat: podData.latitude, delivery_location_lon: podData.longitude,
      delivery_location_accuracy_meters: podData.accuracy,
      delivery_address_verified: podData.addressVerified || false,
      distance_from_expected_meters: podData.distanceFromExpected,
      // Recipient
      recipient_name: podData.recipientName,
      recipient_relationship: podData.recipientRelationship || 'customer',
      recipient_phone: podData.recipientPhone,
      recipient_phone_verified: podData.recipientPhoneVerified || false,
      recipient_id_type: podData.recipientIdType,
      recipient_id_number_encrypted: podData.recipientIdNumber 
        ? require('@siamsiam/shared-utils').security.encryption.encrypt(podData.recipientIdNumber) : null,
      recipient_id_photo_url: podData.recipientIdPhotoUrl,
      recipient_id_verified: podData.recipientIdVerified || false,
      // Signature
      signature_type: podData.signatureType || 'hand_drawn',
      signature_data: signatureData,
      signature_url: podData.signatureUrl,
      signature_captured_at: podData.signatureCapturedAt,
      signature_device_id: podData.signatureDeviceId,
      signature_verified: podData.signatureVerified !== false,
      signature_verification_score: podData.signatureVerificationScore || 1.0,
      // Photos
      delivery_photo_url: podData.deliveryPhotoUrl,
      delivery_photo_thumbnail_url: podData.deliveryPhotoThumbnailUrl,
      delivery_photo_captured_at: podData.deliveryPhotoCapturedAt,
      delivery_photo_gps_lat: podData.deliveryPhotoGpsLat,
      delivery_photo_gps_lon: podData.deliveryPhotoGpsLon,
      // Package
      package_photo_url: podData.packagePhotoUrl,
      package_condition: podData.packageCondition || 'good',
      package_damaged: podData.packageDamaged || false,
      package_damage_description: podData.packageDamageDescription,
      package_damage_photo_url: podData.packageDamagePhotoUrl,
      package_count: podData.packageCount || 1,
      items_verified: podData.itemsVerified !== false,
      items_missing: podData.itemsMissing,
      items_damaged: podData.itemsDamaged,
      // Barcode/QR
      barcode_scanned: podData.barcodeScanned || false,
      barcode_value: podData.barcodeValue,
      barcode_type: podData.barcodeType,
      qr_code_scanned: podData.qrCodeScanned || false,
      qr_code_value: podData.qrCodeValue,
      qr_verification_match: podData.qrVerificationMatch !== false,
      // PIN/OTP
      pin_verified: podData.pinVerified || false,
      otp_verified: podData.otpVerified || false,
      // Contactless
      is_contactless: podData.isContactless || false,
      drop_off_location: podData.dropOffLocation,
      drop_off_photo_url: podData.dropOffPhotoUrl,
      left_at_door: podData.leftAtDoor || false,
      left_with_neighbor: podData.leftWithNeighbor || false,
      neighbor_name: podData.neighborName,
      // Device info
      device_id: podData.deviceId, device_model: podData.deviceModel,
      app_version: podData.appVersion, captured_offline: podData.capturedOffline || false,
      // Integrity
      checksum, checksum_algorithm: 'sha256',
      // Recipient feedback
      recipient_notes: podData.recipientNotes?.substring(0, 500),
      recipient_feedback: podData.recipientFeedback?.substring(0, 500),
      recipient_rating: podData.recipientRating,
      // Driver notes
      driver_notes: podData.driverNotes?.substring(0, 500),
      delivery_attempt_number: podData.deliveryAttemptNumber || 1,
      // Status
      verification_status: this.verificationStatuses.PENDING,
      requires_review: podData.requiresReview || false,
      metadata: podData.metadata || {},
      tenant_id: podData.tenantId,
    });
  }

  /**
   * Find POD by delivery ID
   */
  static async findByDelivery(deliveryId) {
    return this.findOne({ where: { delivery_id: deliveryId }, orderBy: { created_at: 'DESC' } });
  }

  /**
   * Find POD by order ID
   */
  static async findByOrder(orderId) {
    return this.findOne({ where: { order_id: orderId }, orderBy: { created_at: 'DESC' } });
  }

  /**
   * Verify POD integrity (check for tampering)
   */
  static async verifyIntegrity(podId) {
    const pod = await this.findById(podId);
    if (!pod) return { valid: false, reason: 'POD not found' };

    const currentChecksum = crypto.createHash('sha256')
      .update(JSON.stringify({
        deliveryId: pod.delivery_id,
        orderId: pod.order_id,
        timestamp: pod.created_at,
        signatureData: pod.signature_data,
      }))
      .digest('hex');

    const isTampered = currentChecksum !== pod.checksum;

    if (isTampered) {
      await this.update({ id: podId }, {
        is_tampered: true,
        tamper_detection_notes: `Checksum mismatch detected at ${new Date().toISOString()}`,
      });
    }

    return { valid: !isTampered, isTampered, originalChecksum: pod.checksum, currentChecksum };
  }

  /**
   * Update verification status
   */
  static async verify(podId, verifiedBy, options = {}) {
    return this.update({ id: podId }, {
      verification_status: options.status || this.verificationStatuses.VERIFIED,
      verification_score: options.score || 1.0,
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
      verification_notes: options.notes,
      requires_review: false,
    });
  }

  /**
   * Flag POD for review
   */
  static async flagForReview(podId, reason) {
    return this.update({ id: podId }, {
      requires_review: true,
      review_reason: reason,
      verification_status: this.verificationStatuses.UNDER_REVIEW,
    });
  }

  /**
   * Get POD statistics for a driver
   */
  static async getDriverStats(driverId, options = {}) {
    const text = `
      SELECT
        COUNT(*) as total_pods,
        COUNT(CASE WHEN verification_status = 'verified' THEN 1 END) as verified,
        COUNT(CASE WHEN requires_review = true THEN 1 END) as flagged,
        COUNT(CASE WHEN items_verified = false THEN 1 END) as item_issues,
        COUNT(CASE WHEN package_damaged = true THEN 1 END) as damaged_packages,
        AVG(recipient_rating) as avg_rating
      FROM ${this.tableName}
      WHERE driver_id = $1
        ${options.startDate ? 'AND created_at >= $2' : ''}
        ${options.endDate ? `AND created_at <= $${options.startDate ? 3 : 2}` : ''}
    `;
    const values = [driverId];
    if (options.startDate) values.push(options.startDate);
    if (options.endDate) values.push(options.endDate);
    const result = await connectionPool.query(text, values);
    return result.rows[0];
  }
}

module.exports = ProofOfDelivery;