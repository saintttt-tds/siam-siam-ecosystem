const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Proxy Purchase Model - Buy-for-Someone-Else Order
 * 
 * Enables purchasing items and sending them to another person.
 * The purchaser pays and the recipient receives the item.
 * Supports authorization codes for secure collection.
 * 
 * TABLE: proxy_purchases
 */

class ProxyPurchase extends BaseModel {
  static tableName = 'proxy_purchases';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'order_id', 'purchaser_id', 'recipient_id',
    'purchaser_name', 'purchaser_phone', 'purchaser_email',
    'recipient_name', 'recipient_phone', 'recipient_email',
    'recipient_address_id', 'recipient_relationship',
    'purchase_type', 'status', 'sub_status',
    'purchase_amount', 'currency', 'delivery_fee',
    'total_amount', 'amount_paid', 'amount_refunded',
    'authorization_code', 'authorization_code_hash',
    'authorization_qr_url', 'collection_otp',
    'collection_otp_hash', 'collection_otp_expires_at',
    'pickup_location_id', 'pickup_location_name',
    'pickup_address', 'pickup_window_start',
    'pickup_window_end', 'pickup_instructions',
    'is_collected', 'collected_at', 'collected_by_name',
    'collected_by_phone', 'collected_by_relationship',
    'collected_by_signature_url', 'collected_by_photo_url',
    'collected_by_id_type', 'collected_by_id_number_encrypted',
    'collection_verified_by', 'collection_verified_at',
    'verification_method', 'collection_notes',
    'max_attempts', 'attempts', 'last_attempt_at',
    'delivery_method', 'delivery_status',
    'estimated_delivery_at', 'delivered_at',
    'delivery_photo_url', 'delivery_notes',
    'is_gift', 'gift_message', 'gift_wrap',
    'purchaser_message', 'recipient_message',
    'status_history', 'cancelled_at', 'cancellation_reason',
    'refunded_at', 'refund_amount', 'refund_reason',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    purchase_amount: 'float', delivery_fee: 'float',
    total_amount: 'float', amount_paid: 'float',
    amount_refunded: 'float', refund_amount: 'float',
    max_attempts: 'integer', attempts: 'integer',
    is_collected: 'boolean', is_gift: 'boolean',
    gift_wrap: 'boolean', status_history: 'json',
    metadata: 'json', tags: 'json',
  };

  static relations = {
    order: { type: 'belongsTo', model: 'Order', foreignKey: 'order_id', ownerKey: 'id' },
    purchaser: { type: 'belongsTo', model: 'User', foreignKey: 'purchaser_id', ownerKey: 'id' },
    recipient: { type: 'belongsTo', model: 'User', foreignKey: 'recipient_id', ownerKey: 'id' },
  };

  static statuses = {
    PENDING: 'pending', AUTHORIZED: 'authorized', PROCESSING: 'processing',
    READY_FOR_PICKUP: 'ready_for_pickup', COLLECTED: 'collected',
    DELIVERED: 'delivered', COMPLETED: 'completed',
    CANCELLED: 'cancelled', REFUNDED: 'refunded',
  };

  static generateAuthCode() { return crypto.randomBytes(4).toString('hex').toUpperCase(); }

  /**
   * Create a proxy purchase
   */
  static async create(purchaserId, orderId, recipientDetails, options = {}) {
    const authCode = this.generateAuthCode();
    const authCodeHash = crypto.createHash('sha256').update(authCode).digest('hex');
    const otp = ProxyOrder.generateOTP();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    const purchase = await this.create({
      order_id: orderId, purchaser_id: purchaserId,
      recipient_id: recipientDetails.recipientId,
      purchaser_name: options.purchaserName, purchaser_phone: options.purchaserPhone,
      purchaser_email: options.purchaserEmail?.toLowerCase(),
      recipient_name: recipientDetails.name, recipient_phone: recipientDetails.phone,
      recipient_email: recipientDetails.email?.toLowerCase(),
      recipient_address_id: recipientDetails.addressId,
      recipient_relationship: recipientDetails.relationship,
      purchase_type: options.purchaseType || 'standard',
      status: this.statuses.PENDING,
      purchase_amount: options.purchaseAmount, currency: options.currency || 'USD',
      delivery_fee: options.deliveryFee || 0,
      total_amount: (options.purchaseAmount || 0) + (options.deliveryFee || 0),
      authorization_code: authCodeHash, collection_otp: otpHash,
      collection_otp_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      pickup_location_id: options.pickupLocationId,
      pickup_location_name: options.pickupLocationName,
      pickup_instructions: options.pickupInstructions?.substring(0, 500),
      is_gift: options.isGift || false, gift_message: options.giftMessage,
      gift_wrap: options.giftWrap || false,
      purchaser_message: options.purchaserMessage?.substring(0, 500),
      status_history: [{ status: this.statuses.PENDING, timestamp: new Date().toISOString() }],
      max_attempts: options.maxAttempts || 3,
      metadata: options.metadata || {}, tenant_id: options.tenantId,
    });

    return { purchase, authCode, otp };
  }

  /**
   * Find by purchaser
   */
  static async findByPurchaser(purchaserId) {
    return this.findAll({ where: { purchaser_id: purchaserId }, orderBy: { created_at: 'DESC' } });
  }

  /**
   * Find by recipient
   */
  static async findByRecipient(recipientId) {
    return this.findAll({ where: { recipient_id: recipientId }, orderBy: { created_at: 'DESC' } });
  }

  /**
   * Record collection
   */
  static async recordCollection(purchaseId, collectorInfo) {
    return this.update({ id: purchaseId }, {
      status: this.statuses.COLLECTED, is_collected: true,
      collected_at: new Date().toISOString(), collected_by_name: collectorInfo.name,
      collected_by_phone: collectorInfo.phone, collected_by_relationship: collectorInfo.relationship,
      collected_by_signature_url: collectorInfo.signatureUrl,
      collected_by_photo_url: collectorInfo.photoUrl,
      collection_verified_by: collectorInfo.verifiedBy,
      verification_method: collectorInfo.verificationMethod || 'code',
      collection_notes: collectorInfo.notes,
    });
  }

  /**
   * Authorize collection
   */
  static async authorizeCollection(purchaseId, collectorName, collectorPhone) {
    const code = this.generateAuthCode();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    await this.update({ id: purchaseId }, { authorization_code: codeHash, metadata: { authorized_collector_name: collectorName, authorized_collector_phone: collectorPhone } });
    return code;
  }
}

module.exports = ProxyPurchase;