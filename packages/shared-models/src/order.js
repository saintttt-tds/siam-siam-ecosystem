const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Order Model - Customer Order
 * 
 * Central order entity tracking the complete order lifecycle
 * from creation through payment, fulfillment, delivery, and returns.
 * Supports multiple order types, payment methods, and fulfillment modes.
 * 
 * TABLE: orders
 * 
 * ORDER LIFECYCLE:
 * 1. pending: Order created, awaiting payment
 * 2. confirmed: Payment confirmed, order accepted
 * 3. processing: Order being prepared/packed
 * 4. ready_to_ship: Packed and awaiting carrier pickup
 * 5. shipped: Handed to carrier, in transit
 * 6. out_for_delivery: On final delivery vehicle
 * 7. delivered: Successfully delivered to customer
 * 8. completed: Order finalized (return window closed)
 * 9. cancelled: Order cancelled
 * 10. refunded: Full or partial refund processed
 * 
 * ORDER TYPES:
 * - standard: Regular customer order
 * - preorder: Pre-order for upcoming products
 * - subscription: Recurring subscription order
 * - gift: Gift order with wrapping and message
 * - wholesale: B2B bulk order
 * - cod: Cash on delivery
 * - proxy: Buy for someone else
 */

class Order extends BaseModel {
  static tableName = 'orders';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id', 'merchant_id',
    // Order identification
    'order_number', 'reference', 'external_order_id',
    'parent_order_id', 'cart_id', 'session_id',
    // Order type
    'order_type', 'order_subtype', 'fulfillment_type',
    'is_gift', 'is_cod', 'is_proxy_purchase',
    'is_preorder', 'is_subscription', 'is_bulk',
    // Status
    'status', 'sub_status', 'fulfillment_status',
    'payment_status', 'return_status', 'refund_status',
    'status_history', 'status_change_reason',
    // Financial
    'subtotal', 'tax', 'tax_rate', 'tax_name',
    'tax_breakdown', 'shipping_cost', 'shipping_method',
    'shipping_carrier', 'handling_fee', 'packaging_fee',
    'discount', 'discount_code', 'discount_amount',
    'coupon_code', 'coupon_discount', 'loyalty_discount',
    'loyalty_points_used', 'loyalty_points_earned',
    'total', 'currency', 'exchange_rate',
    'base_currency', 'base_total', 'rounding_adjustment',
    // Payment
    'payment_method', 'payment_gateway', 'payment_processor',
    'payment_intent_id', 'payment_ref', 'payment_authorization',
    'payment_authorized_at', 'payment_captured_at',
    'payment_failed_reason', 'payment_retry_count',
    'is_paid', 'paid_at', 'amount_paid', 'amount_refunded',
    'pending_refund_amount',
    // Addresses
    'shipping_address_id', 'shipping_address_snapshot',
    'billing_address_id', 'billing_address_snapshot',
    // Shipping & Delivery
    'shipping_method_id', 'estimated_delivery_at',
    'actual_delivery_at', 'delivery_window_start',
    'delivery_window_end', 'delivery_instructions',
    'tracking_number', 'tracking_url', 'delivery_id',
    // Fulfillment
    'fulfillment_center_id', 'fulfillment_priority',
    'pickup_ready_at', 'packed_at', 'shipped_at',
    'out_for_delivery_at',
    // Customer
    'customer_name', 'customer_email', 'customer_phone',
    'customer_notes', 'gift_message', 'is_gift_wrapped',
    // Merchant
    'merchant_notes', 'internal_notes',
    'fulfillment_notes', 'cancellation_notes',
    // Timestamps
    'ordered_at', 'confirmed_at', 'processing_at',
    'cancelled_at', 'refunded_at', 'completed_at',
    // Cancellation
    'cancellation_reason', 'cancellation_code',
    'cancelled_by', 'cancellation_type',
    // Source
    'source', 'channel', 'campaign', 'affiliate_id',
    'utm_source', 'utm_medium', 'utm_campaign',
    'ip_address', 'user_agent', 'device_type',
    // Fraud
    'fraud_check_passed', 'fraud_score', 'fraud_notes',
    'risk_level', 'requires_review',
    // Tags and metadata
    'tags', 'metadata',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    subtotal: 'float', tax: 'float', tax_rate: 'float',
    shipping_cost: 'float', handling_fee: 'float',
    packaging_fee: 'float', discount: 'float',
    discount_amount: 'float', coupon_discount: 'float',
    loyalty_discount: 'float', loyalty_points_used: 'integer',
    loyalty_points_earned: 'integer', total: 'float',
    exchange_rate: 'float', base_total: 'float',
    rounding_adjustment: 'float', amount_paid: 'float',
    amount_refunded: 'float', pending_refund_amount: 'float',
    fraud_score: 'float', payment_retry_count: 'integer',
    tax_breakdown: 'json', status_history: 'json',
    shipping_address_snapshot: 'json', billing_address_snapshot: 'json',
    metadata: 'json', tags: 'json',
    is_gift: 'boolean', is_cod: 'boolean', is_proxy_purchase: 'boolean',
    is_preorder: 'boolean', is_subscription: 'boolean', is_bulk: 'boolean',
    is_paid: 'boolean', is_gift_wrapped: 'boolean',
    fraud_check_passed: 'boolean', requires_review: 'boolean',
  };

  static relations = {
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
    items: { type: 'hasMany', model: 'OrderItem', foreignKey: 'order_id', localKey: 'id' },
    delivery: { type: 'hasOne', model: 'Delivery', foreignKey: 'order_id', localKey: 'id' },
    shippingAddress: { type: 'belongsTo', model: 'Address', foreignKey: 'shipping_address_id', ownerKey: 'id' },
    billingAddress: { type: 'belongsTo', model: 'Address', foreignKey: 'billing_address_id', ownerKey: 'id' },
    giftOrder: { type: 'hasOne', model: 'GiftOrder', foreignKey: 'order_id', localKey: 'id' },
    codOrder: { type: 'hasOne', model: 'CodOrder', foreignKey: 'order_id', localKey: 'id' },
    refunds: { type: 'hasMany', model: 'RefundRequest', foreignKey: 'order_id', localKey: 'id' },
  };

  static statuses = {
    PENDING: 'pending', CONFIRMED: 'confirmed', PROCESSING: 'processing',
    READY_TO_SHIP: 'ready_to_ship', PARTIALLY_SHIPPED: 'partially_shipped',
    SHIPPED: 'shipped', IN_TRANSIT: 'in_transit', OUT_FOR_DELIVERY: 'out_for_delivery',
    DELIVERED: 'delivered', COMPLETED: 'completed',
    CANCELLED: 'cancelled', REFUNDED: 'refunded',
    PARTIALLY_REFUNDED: 'partially_refunded', FAILED: 'failed',
    ON_HOLD: 'on_hold', BACKORDERED: 'backordered',
  };

  static paymentStatuses = {
    PENDING: 'pending', AUTHORIZED: 'authorized', CAPTURED: 'captured',
    PAID: 'paid', PARTIALLY_PAID: 'partially_paid',
    PARTIALLY_REFUNDED: 'partially_refunded', REFUNDED: 'refunded',
    FAILED: 'failed', CANCELLED: 'cancelled', DISPUTED: 'disputed',
  };

  static orderTypes = {
    STANDARD: 'standard', PREORDER: 'preorder', SUBSCRIPTION: 'subscription',
    GIFT: 'gift', WHOLESALE: 'wholesale', COD: 'cod',
    PROXY: 'proxy', BUNDLE: 'bundle',
  };

  static generateOrderNumber() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ORD-${timestamp}-${random}`;
  }

  /**
   * Create a new order
   */
  static async createOrder(userId, merchantId, orderData, items = []) {
    const orderNumber = this.generateOrderNumber();
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const taxAmount = orderData.taxRate ? subtotal * (orderData.taxRate / 100) : 0;
    const shippingCost = orderData.shippingCost || 0;
    const discountAmount = orderData.discountAmount || 0;
    const total = Math.max(0, subtotal + taxAmount + shippingCost - discountAmount);

    const order = await this.create({
      user_id: userId, merchant_id: merchantId,
      order_number: orderNumber, reference: orderData.reference,
      order_type: orderData.orderType || this.orderTypes.STANDARD,
      is_gift: orderData.isGift || false, is_cod: orderData.isCod || false,
      status: this.statuses.PENDING, payment_status: this.paymentStatuses.PENDING,
      status_history: [{ status: this.statuses.PENDING, timestamp: new Date().toISOString() }],
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(taxAmount * 100) / 100,
      tax_rate: orderData.taxRate || 0, tax_name: orderData.taxName || 'VAT',
      shipping_cost: shippingCost, shipping_method: orderData.shippingMethod,
      discount: discountAmount, discount_code: orderData.discountCode,
      discount_amount: discountAmount, coupon_code: orderData.couponCode,
      total: Math.round(total * 100) / 100,
      currency: orderData.currency || 'USD',
      payment_method: orderData.paymentMethod,
      shipping_address_id: orderData.shippingAddressId,
      billing_address_id: orderData.billingAddressId,
      delivery_instructions: orderData.deliveryInstructions?.substring(0, 500),
      customer_notes: orderData.customerNotes?.substring(0, 1000),
      source: orderData.source || 'web', channel: orderData.channel || 'direct',
      campaign: orderData.campaign, affiliate_id: orderData.affiliateId,
      ip_address: orderData.ipAddress, user_agent: orderData.userAgent?.substring(0, 500),
      ordered_at: new Date().toISOString(),
      metadata: orderData.metadata || {}, tenant_id: orderData.tenantId || null,
    });

    // Create order items
    if (items.length > 0) {
      const OrderItem = require('./order-item');
      for (const item of items) {
        await OrderItem.create({ ...item, order_id: order.id });
      }
    }

    logger.info('Order created', { orderId: order.id, orderNumber, total, userId });

    return order;
  }

  /**
   * Find orders by user with pagination
   */
  static async findByUser(userId, options = {}) {
    return this.paginate({
      where: { user_id: userId },
      orderBy: { created_at: 'DESC' },
      with: options.with || ['items'],
      ...options,
    });
  }

  /**
   * Find orders by merchant with pagination
   */
  static async findByMerchant(merchantId, options = {}) {
    return this.paginate({
      where: { merchant_id: merchantId },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Find order by order number
   */
  static async findByOrderNumber(orderNumber) {
    return this.findOne({ where: { order_number: orderNumber } });
  }

  /**
   * Find order by payment reference
   */
  static async findByPaymentRef(paymentRef) {
    return this.findOne({ where: { payment_ref: paymentRef } });
  }

  /**
   * Update order status with audit trail
   */
  static async updateStatus(orderId, status, metadata = {}) {
    const order = await this.findById(orderId);
    if (!order) throw new Error('Order not found');

    const history = order.status_history || [];
    history.push({
      from: order.status,
      to: status,
      timestamp: new Date().toISOString(),
      reason: metadata.reason,
      by: metadata.updatedBy || 'system',
    });

    const updates = { status, status_history: history, status_change_reason: metadata.reason };

    // Set status-specific timestamps
    switch (status) {
      case this.statuses.CONFIRMED: updates.confirmed_at = new Date().toISOString(); break;
      case this.statuses.PROCESSING: updates.processing_at = new Date().toISOString(); break;
      case this.statuses.SHIPPED: updates.shipped_at = new Date().toISOString(); break;
      case this.statuses.DELIVERED: updates.actual_delivery_at = new Date().toISOString(); break;
      case this.statuses.COMPLETED: updates.completed_at = new Date().toISOString(); break;
      case this.statuses.CANCELLED:
        updates.cancelled_at = new Date().toISOString();
        updates.cancellation_reason = metadata.reason;
        updates.cancelled_by = metadata.updatedBy;
        break;
      case this.statuses.REFUNDED: updates.refunded_at = new Date().toISOString(); break;
    }

    return this.update({ id: orderId }, updates);
  }

  /**
   * Update payment status
   */
  static async updatePaymentStatus(orderId, paymentStatus, metadata = {}) {
    const updates = { payment_status: paymentStatus };

    switch (paymentStatus) {
      case this.paymentStatuses.AUTHORIZED:
        updates.payment_authorized_at = new Date().toISOString();
        break;
      case this.paymentStatuses.CAPTURED:
      case this.paymentStatuses.PAID:
        updates.payment_captured_at = new Date().toISOString();
        updates.is_paid = true;
        updates.paid_at = new Date().toISOString();
        updates.amount_paid = metadata.amount || updates.total;
        break;
      case this.paymentStatuses.FAILED:
        updates.payment_failed_reason = metadata.reason;
        updates.payment_retry_count = connectionPool.raw('payment_retry_count + 1');
        break;
    }

    if (metadata.paymentRef) updates.payment_ref = metadata.paymentRef;
    if (metadata.paymentIntentId) updates.payment_intent_id = metadata.paymentIntentId;

    return this.update({ id: orderId }, updates);
  }

  /**
   * Cancel an order
   */
  static async cancel(orderId, reason, cancelledBy, options = {}) {
    const order = await this.findById(orderId);
    if (!order) throw new Error('Order not found');

    const cancellableStatuses = [
      this.statuses.PENDING, this.statuses.CONFIRMED,
      this.statuses.PROCESSING, this.statuses.READY_TO_SHIP,
    ];

    if (!cancellableStatuses.includes(order.status)) {
      throw new Error(`Cannot cancel order with status: ${order.status}`);
    }

    return this.updateStatus(orderId, this.statuses.CANCELLED, {
      reason, updatedBy: cancelledBy, cancellationCode: options.code,
      cancellationType: options.type || 'customer_requested',
    });
  }

  /**
   * Get order summary statistics
   */
  static async getOrderSummary(startDate, endDate, merchantId = null) {
    const text = `
      SELECT
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded,
        COUNT(CASE WHEN status IN ('pending', 'confirmed', 'processing') THEN 1 END) as active,
        SUM(CASE WHEN status NOT IN ('cancelled', 'failed') THEN total ELSE 0 END) as revenue,
        AVG(CASE WHEN status NOT IN ('cancelled', 'failed') THEN total ELSE NULL END) as avg_order_value,
        SUM(CASE WHEN status NOT IN ('cancelled', 'failed') THEN shipping_cost ELSE 0 END) as total_shipping,
        SUM(discount_amount) as total_discounts
      FROM ${this.tableName}
      WHERE created_at BETWEEN $1 AND $2
        ${merchantId ? 'AND merchant_id = $3' : ''}
    `;
    const values = [startDate, endDate];
    if (merchantId) values.push(merchantId);
    const result = await connectionPool.query(text, values);
    return result.rows[0];
  }
}

module.exports = Order;