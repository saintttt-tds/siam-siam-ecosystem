const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Pickup Authorization Model - Collection Authorization
 * 
 * Authorizes a designated person to collect an order on behalf
 * of the purchaser. Used for proxy purchases and marketplace pickups.
 * Generates secure authorization codes and tracks collection status.
 * 
 * TABLE: pickup_authorizations
 */

class PickupAuthorization extends BaseModel {
  static tableName = 'pickup_authorizations';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'order_id', 'order_item_id', 'proxy_purchase_id',
    'purchaser_id', 'authorized_collector_name',
    'authorized_collector_phone', 'authorized_collector_email',
    'authorized_collector_id_type', 'authorized_collector_id_number_encrypted',
    'authorization_code', 'authorization_code_hash',
    'qr_code_url', 'otp_code', 'otp_code_hash',
    'otp_expires_at', 'otp_verified', 'otp_verified_at',
    'collection_location', 'collection_address_id',
    'collection_window_start', 'collection_window_end',
    'status', 'is_collected', 'collected_at',
    'collected_by_name', 'collected_by_phone',
    'collected_by_id_type', 'collected_by_id_number_encrypted',
    'collected_by_signature_url', 'collected_by_photo_url',
    'verified_by_staff_id', 'verified_by_staff_name',
    'verification_method', 'verification_notes',
    'collection_notes', 'authorization_expires_at',
    'max_collection_attempts', 'collection_attempts',
    'last_attempt_at', 'cancelled_at', 'cancellation_reason',
    'metadata', 'tags', 'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    is_collected: 'boolean', otp_verified: 'boolean',
    max_collection_attempts: 'integer', collection_attempts: 'integer',
    metadata: 'json', tags: 'json',
  };

  static statuses = {
    PENDING: 'pending', AUTHORIZED: 'authorized',
    OTP_SENT: 'otp_sent', OTP_VERIFIED: 'otp_verified',
    COLLECTED: 'collected', EXPIRED: 'expired',
    CANCELLED: 'cancelled', FAILED: 'failed',
  };

  static relations = {
    order: { type: 'belongsTo', model: 'Order', foreignKey: 'order_id', ownerKey: 'id' },
    purchaser: { type: 'belongsTo', model: 'User', foreignKey: 'purchaser_id', ownerKey: 'id' },
  };

  static generateAuthCode() { return crypto.randomBytes(4).toString('hex').toUpperCase(); }
  static generateOTP() { return crypto.randomInt(100000, 999999).toString(); }

  /**
   * Create a pickup authorization
   */
  static async authorize(purchaserId, orderId, collectorDetails, options = {}) {
    const authCode = this.generateAuthCode();
    const authCodeHash = crypto.createHash('sha256').update(authCode).digest('hex');
    const otp = this.generateOTP();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    const authorization = await this.create({
      order_id: orderId, purchaser_id: purchaserId,
      proxy_purchase_id: options.proxyPurchaseId,
      authorized_collector_name: collectorDetails.name,
      authorized_collector_phone: collectorDetails.phone,
      authorized_collector_email: collectorDetails.email?.toLowerCase(),
      authorized_collector_id_type: collectorDetails.idType,
      authorized_collector_id_number_encrypted: collectorDetails.idNumber
        ? require('@siamsiam/shared-utils').security.encryption.encrypt(collectorDetails.idNumber) : null,
      authorization_code: authCodeHash,
      otp_code: otpHash, otp_expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
      collection_location: options.collectionLocation,
      collection_address_id: options.collectionAddressId,
      collection_window_start: options.collectionWindowStart,
      collection_window_end: options.collectionWindowEnd,
      status: this.statuses.AUTHORIZED,
      authorization_expires_at: options.expiresAt || new Date(Date.now() + 7 * 86400000).toISOString(),
      max_collection_attempts: options.maxAttempts || 3,
      metadata: options.metadata || {}, tenant_id: options.tenantId || null,
    });

    return { authorization, authCode, otp, message: 'Share authorization code and OTP with collector. These will not be shown again.' };
  }

  /**
   * Verify OTP for collection
   */
  static async verifyOTP(authorizationId, otp) {
    const auth = await this.findById(authorizationId);
    if (!auth) throw new Error('Authorization not found');
    if (auth.otp_verified) throw new Error('OTP already verified');
    if (new Date(auth.otp_expires_at) < new Date()) throw new Error('OTP has expired');

    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(otpHash), Buffer.from(auth.otp_code))) {
      await this.update({ id: authorizationId }, { collection_attempts: connectionPool.raw('collection_attempts + 1'), last_attempt_at: new Date().toISOString() });
      throw new Error('Invalid OTP');
    }

    return this.update({ id: authorizationId }, { otp_verified: true, otp_verified_at: new Date().toISOString(), status: this.statuses.OTP_VERIFIED });
  }

  /**
   * Record successful collection
   */
  static async recordCollection(authorizationId, collectorInfo, staffId) {
    return this.update({ id: authorizationId }, {
      status: this.statuses.COLLECTED, is_collected: true, collected_at: new Date().toISOString(),
      collected_by_name: collectorInfo.name, collected_by_phone: collectorInfo.phone,
      collected_by_id_type: collectorInfo.idType,
      collected_by_id_number_encrypted: collectorInfo.idNumber
        ? require('@siamsiam/shared-utils').security.encryption.encrypt(collectorInfo.idNumber) : null,
      collected_by_signature_url: collectorInfo.signatureUrl,
      collected_by_photo_url: collectorInfo.photoUrl,
      verified_by_staff_id: staffId, verification_method: collectorInfo.verificationMethod || 'id_check',
      verification_notes: collectorInfo.notes,
    });
  }

  /**
   * Find authorization by order
   */
  static async findByOrder(orderId) {
    return this.findOne({ where: { order_id: orderId, status: { operator: '!=', value: this.statuses.CANCELLED } }, orderBy: { created_at: 'DESC' } });
  }

  /**
   * Cancel authorization
   */
  static async cancel(authorizationId, reason) {
    return this.update({ id: authorizationId }, { status: this.statuses.CANCELLED, cancelled_at: new Date().toISOString(), cancellation_reason: reason });
  }

  /**
   * Expire old authorizations
   */
  static async expireOld() {
    const result = await connectionPool.query(
      `UPDATE ${this.tableName} SET status = $1 WHERE status IN ('pending', 'authorized', 'otp_sent') AND authorization_expires_at < NOW()`,
      [this.statuses.EXPIRED]
    );
    return result.rowCount;
  }
}

module.exports = PickupAuthorization;