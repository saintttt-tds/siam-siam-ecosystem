const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Proxy Order Model - Marketplace Proxy Purchase Order
 * 
 * Enables a user to purchase items on behalf of someone else
 * in a different city/location. The proxy purchaser buys the item
 * and the recipient collects it or has it delivered locally.
 * 
 * TABLE: proxy_orders
 * 
 * USE CASES:
 * - Buy item only available in another city
 * - Purchase for family/friends in different location
 * - Send items where direct delivery not available
 * - Cross-city commerce facilitation
 */

class ProxyOrder extends BaseModel {
  static tableName = 'proxy_orders';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'order_id', 'original_order_id',
    'purchaser_id', 'purchaser_name', 'purchaser_phone',
    'purchaser_email', 'purchaser_location', 'purchaser_city',
    'purchaser_address_id',
    'recipient_id', 'recipient_name', 'recipient_phone',
    'recipient_email', 'recipient_location', 'recipient_city',
    'recipient_address_id', 'recipient_relationship',
    'proxy_type', 'proxy_status', 'sub_status',
    'purchase_amount', 'purchase_currency',
    'proxy_fee', 'proxy_fee_currency', 'delivery_fee',
    'total_amount', 'amount_paid', 'amount_refunded',
    'purchase_date', 'estimated_delivery_date',
    'actual_delivery_date', 'delivery_window_start',
    'delivery_window_end', 'delivery_method',
    'collection_code', 'collection_code_hash',
    'collection_qr_url', 'collection_otp',
    'collection_otp_hash', 'collection_otp_expires_at',
    'pickup_location_id', 'pickup_location_name',
    'pickup_address', 'pickup_instructions',
    'is_collected', 'collected_at', 'collected_by',
    'collected_by_phone', 'collected_by_relationship',
    'collection_signature_url', 'collection_photo_url',
    'collection_verified_by', 'collection_verification_method',
    'collection_notes', 'max_collection_attempts',
    'collection_attempts', 'last_collection_attempt_at',
    'is_delivered', 'delivered_at', 'delivery_confirmation',
    'delivery_photo_url', 'delivery_signature_url',
    'status_history', 'cancelled_at', 'cancellation_reason',
    'cancelled_by', 'refunded_at', 'refund_amount',
    'notes', 'recipient_notes', 'purchaser_notes',
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    purchase_amount: 'float', proxy_fee: 'float',
    delivery_fee: 'float', total_amount: 'float',
    amount_paid: 'float', amount_refunded: 'float',
    refund_amount: 'float', max_collection_attempts: 'integer',
    collection_attempts: 'integer',
    is_collected: 'boolean', is_delivered: 'boolean',
    status_history: 'json', metadata: 'json', tags: 'json',
  };

  static relations = {
    order: { type: 'belongsTo', model: 'Order', foreignKey: 'order_id', ownerKey: 'id' },
    purchaser: { type: 'belongsTo', model: 'User', foreignKey: 'purchaser_id', ownerKey: 'id' },
    recipient: { type: 'belongsTo', model: 'User', foreignKey: 'recipient_id', ownerKey: 'id' },
  };

  static proxyTypes = {
    BUY_FOR_OTHER: 'buy_for_other', BUY_FROM_OTHER_CITY: 'buy_from_other_city',
    SEND_TO_OTHER_CITY: 'send_to_other_city', GROUP_BUY: 'group_buy',
  };

  static proxyStatuses = {
    PENDING: 'pending', PURCHASER_ASSIGNED: 'purchaser_assigned',
    PURCHASED: 'purchased', IN_TRANSIT: 'in_transit',
    READY_FOR_PICKUP: 'ready_for_pickup', COLLECTED: 'collected',
    DELIVERED: 'delivered', COMPLETED: 'completed',
    CANCELLED: 'cancelled', REFUNDED: 'refunded', FAILED: 'failed',
  };

  static generateCollectionCode() { return crypto.randomBytes(4).toString('hex').toUpperCase(); }
  static generateOTP() { return crypto.randomInt(100000, 999999).toString(); }

  /**
   * Create a proxy order
   */
  static async createProxyOrder(purchaserId, recipientId, orderId, details) {
    const collectionCode = this.generateCollectionCode();
    const codeHash = crypto.createHash('sha256').update(collectionCode).digest('hex');
    const otp = this.generateOTP();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    return this.create({
      order_id: orderId, purchaser_id: purchaserId,
      recipient_id: recipientId,
      purchaser_name: details.purchaserName, purchaser_phone: details.purchaserPhone,
      purchaser_location: details.purchaserLocation, purchaser_city: details.purchaserCity,
      purchaser_address_id: details.purchaserAddressId,
      recipient_name: details.recipientName, recipient_phone: details.recipientPhone,
      recipient_location: details.recipientLocation, recipient_city: details.recipientCity,
      recipient_address_id: details.recipientAddressId,
      recipient_relationship: details.recipientRelationship,
      proxy_type: details.proxyType || this.proxyTypes.BUY_FROM_OTHER_CITY,
      proxy_status: this.proxyStatuses.PENDING,
      purchase_amount: details.purchaseAmount, purchase_currency: details.purchaseCurrency || 'USD',
      proxy_fee: details.proxyFee || 0, delivery_fee: details.deliveryFee || 0,
      total_amount: (details.purchaseAmount || 0) + (details.proxyFee || 0) + (details.deliveryFee || 0),
      estimated_delivery_date: details.estimatedDeliveryDate,
      delivery_method: details.deliveryMethod,
      collection_code: codeHash, collection_otp: otpHash,
      collection_otp_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      pickup_location_id: details.pickupLocationId,
      pickup_location_name: details.pickupLocationName,
      pickup_instructions: details.pickupInstructions?.substring(0, 500),
      max_collection_attempts: details.maxCollectionAttempts || 3,
      status_history: [{ status: this.proxyStatuses.PENDING, timestamp: new Date().toISOString() }],
      metadata: details.metadata || {}, tenant_id: details.tenantId,
    });
  }

  /**
   * Record collection by recipient
   */
  static async recordCollection(proxyOrderId, collectorInfo, verifiedBy) {
    return this.update({ id: proxyOrderId }, {
      proxy_status: this.proxyStatuses.COLLECTED, is_collected: true,
      collected_at: new Date().toISOString(), collected_by: collectorInfo.name,
      collected_by_phone: collectorInfo.phone,
      collected_by_relationship: collectorInfo.relationship,
      collection_signature_url: collectorInfo.signatureUrl,
      collection_photo_url: collectorInfo.photoUrl,
      collection_verified_by: verifiedBy,
      collection_verification_method: collectorInfo.verificationMethod || 'code',
      collection_notes: collectorInfo.notes,
      status_history: connectionPool.raw(`status_history || '[{"status": "${this.proxyStatuses.COLLECTED}", "timestamp": "${new Date().toISOString()}"}]'::jsonb`),
    });
  }

  /**
   * Find proxy orders by purchaser
   */
  static async findByPurchaser(purchaserId) {
    return this.findAll({ where: { purchaser_id: purchaserId }, orderBy: { created_at: 'DESC' } });
  }

  /**
   * Find proxy orders by recipient
   */
  static async findByRecipient(recipientId) {
    return this.findAll({ where: { recipient_id: recipientId }, orderBy: { created_at: 'DESC' } });
  }

  /**
   * Cancel proxy order
   */
  static async cancel(proxyOrderId, reason, cancelledBy) {
    return this.update({ id: proxyOrderId }, {
      proxy_status: this.proxyStatuses.CANCELLED, cancelled_at: new Date().toISOString(),
      cancellation_reason: reason, cancelled_by: cancelledBy,
    });
  }

  /**
   * Verify collection OTP
   */
  static async verifyCollectionOTP(proxyOrderId, otp) {
    const order = await this.findById(proxyOrderId);
    if (!order) throw new Error('Proxy order not found');
    if (new Date(order.collection_otp_expires_at) < new Date()) throw new Error('Collection OTP has expired');
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(otpHash), Buffer.from(order.collection_otp));
  }
}

module.exports = ProxyOrder;