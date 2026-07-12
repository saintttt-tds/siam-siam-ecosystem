const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Order Item Model - Individual Item Within Order
 * 
 * Represents a single line item within a customer order.
 * Tracks product details, pricing, quantity, fulfillment status,
 * and return/refund eligibility at the item level.
 * 
 * TABLE: order_items
 * 
 * ITEM LIFECYCLE:
 * 1. Created as part of order
 * 2. Reserved from inventory
 * 3. Picked and packed
 * 4. Shipped with order
 * 5. Delivered to customer
 * 6. Eligible for return/refund within window
 * 7. Refunded if returned or cancelled
 */

class OrderItem extends BaseModel {
  static tableName = 'order_items';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'order_id', 'product_id', 'variant_id',
    'merchant_id', 'seller_id',
    // Product details (snapshot at time of order)
    'product_name', 'product_sku', 'product_barcode',
    'variant_name', 'variant_sku', 'category',
    'sub_category', 'brand', 'product_image_url',
    'product_url', 'product_type',
    // Pricing
    'unit_price', 'original_price', 'compare_at_price',
    'quantity', 'subtotal', 'total_price',
    'tax_rate', 'tax_amount', 'tax_name',
    'discount_amount', 'discount_percent',
    'discount_code', 'discount_description',
    'loyalty_discount', 'coupon_discount',
    'net_price', 'currency',
    // Weight and dimensions
    'weight_kg', 'width_cm', 'height_cm', 'depth_cm',
    'volumetric_weight_kg', 'requires_special_handling',
    // Inventory
    'warehouse_id', 'inventory_location',
    'inventory_reserved_at', 'inventory_released_at',
    'serial_number', 'batch_number', 'expiry_date',
    // Fulfillment
    'fulfillment_status', 'fulfillment_center_id',
    'pick_status', 'pack_status', 'ship_status',
    'picked_at', 'packed_at', 'shipped_at',
    'picked_by', 'packed_by',
    'fulfillment_notes',
    // Delivery
    'delivery_id', 'tracking_number',
    'delivered_at', 'delivery_status',
    // Digital product
    'is_digital', 'download_url', 'download_code',
    'download_expiry', 'download_count', 'max_downloads',
    'license_key', 'activation_code',
    // Subscriptions
    'is_subscription', 'subscription_id',
    'subscription_interval', 'subscription_period',
    'next_billing_date', 'subscription_status',
    // Return/Refund
    'return_status', 'refund_status', 'refund_quantity',
    'refund_amount', 'refund_reason',
    'return_window_days', 'return_eligible_until',
    'is_returnable', 'return_policy_applied',
    'refund_request_id', 'return_tracking_number',
    'returned_at', 'refunded_at',
    // Review
    'review_id', 'is_reviewed', 'review_reminder_sent',
    'review_reminder_sent_at',
    // Customization
    'customizations', 'engraving_text',
    'gift_wrap', 'gift_message',
    'personalization_data',
    // Commission
    'commission_rate', 'commission_amount',
    'affiliate_commission', 'referral_commission',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at',
  ];

  static casts = {
    unit_price: 'float', original_price: 'float',
    compare_at_price: 'float', quantity: 'integer',
    subtotal: 'float', total_price: 'float',
    tax_rate: 'float', tax_amount: 'float',
    discount_amount: 'float', discount_percent: 'float',
    loyalty_discount: 'float', coupon_discount: 'float',
    net_price: 'float', weight_kg: 'float',
    width_cm: 'float', height_cm: 'float', depth_cm: 'float',
    volumetric_weight_kg: 'float',
    refund_quantity: 'integer', refund_amount: 'float',
    return_window_days: 'integer', download_count: 'integer',
    max_downloads: 'integer', commission_rate: 'float',
    commission_amount: 'float', affiliate_commission: 'float',
    referral_commission: 'float',
    customizations: 'json', personalization_data: 'json',
    metadata: 'json', tags: 'json',
    is_digital: 'boolean', is_subscription: 'boolean',
    is_returnable: 'boolean', is_reviewed: 'boolean',
    review_reminder_sent: 'boolean', gift_wrap: 'boolean',
    requires_special_handling: 'boolean',
  };

  static relations = {
    order: { type: 'belongsTo', model: 'Order', foreignKey: 'order_id', ownerKey: 'id' },
    product: { type: 'belongsTo', model: 'Product', foreignKey: 'product_id', ownerKey: 'id' },
  };

  static fulfillmentStatuses = {
    PENDING: 'pending', RESERVED: 'reserved', PICKING: 'picking',
    PICKED: 'picked', PACKING: 'packing', PACKED: 'packed',
    SHIPPED: 'shipped', DELIVERED: 'delivered', CANCELLED: 'cancelled',
    RETURNED: 'returned', REFUNDED: 'refunded',
  };

  static returnStatuses = {
    NOT_RETURNED: 'not_returned', RETURN_REQUESTED: 'return_requested',
    RETURN_AUTHORIZED: 'return_authorized', RETURN_IN_TRANSIT: 'return_in_transit',
    RETURN_RECEIVED: 'return_received', RETURNED: 'returned',
    RETURN_DENIED: 'return_denied',
  };

  static refundStatuses = {
    NOT_REFUNDED: 'not_refunded', REFUND_PENDING: 'refund_pending',
    REFUND_APPROVED: 'refund_approved', REFUND_PROCESSING: 'refund_processing',
    REFUNDED: 'refunded', PARTIALLY_REFUNDED: 'partially_refunded',
    REFUND_DENIED: 'refund_denied', REFUND_FAILED: 'refund_failed',
  };

  /**
   * Find items by order
   */
  static async findByOrder(orderId) {
    return this.findAll({
      where: { order_id: orderId },
      orderBy: { created_at: 'ASC' },
    });
  }

  /**
   * Find items by product (for sales analytics)
   */
  static async findByProduct(productId, options = {}) {
    return this.paginate({
      where: { product_id: productId },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Update fulfillment status
   */
  static async updateFulfillmentStatus(itemId, status, metadata = {}) {
    const updates = { fulfillment_status: status };

    switch (status) {
      case this.fulfillmentStatuses.PICKED:
        updates.picked_at = new Date().toISOString();
        updates.picked_by = metadata.pickedBy;
        break;
      case this.fulfillmentStatuses.PACKED:
        updates.packed_at = new Date().toISOString();
        updates.packed_by = metadata.packedBy;
        break;
      case this.fulfillmentStatuses.SHIPPED:
        updates.shipped_at = new Date().toISOString();
        updates.tracking_number = metadata.trackingNumber;
        break;
      case this.fulfillmentStatuses.DELIVERED:
        updates.delivered_at = new Date().toISOString();
        break;
    }

    return this.update({ id: itemId }, updates);
  }

  /**
   * Update refund status
   */
  static async updateRefundStatus(itemId, status, refundQuantity = 0, refundAmount = 0) {
    const updates = {
      refund_status: status,
      refund_quantity: refundQuantity,
      refund_amount: refundAmount,
    };

    if (status === this.refundStatuses.REFUNDED || status === this.refundStatuses.PARTIALLY_REFUNDED) {
      updates.refunded_at = new Date().toISOString();
    }

    return this.update({ id: itemId }, updates);
  }

  /**
   * Mark item as returned
   */
  static async markReturned(itemId, returnTrackingNumber = null) {
    return this.update({ id: itemId }, {
      return_status: this.returnStatuses.RETURNED,
      returned_at: new Date().toISOString(),
      return_tracking_number: returnTrackingNumber,
    });
  }

  /**
   * Record review reminder sent
   */
  static async markReviewReminderSent(itemId) {
    return this.update({ id: itemId }, {
      review_reminder_sent: true,
      review_reminder_sent_at: new Date().toISOString(),
    });
  }

  /**
   * Get top selling products
   */
  static async getTopSelling(limit = 10, startDate = null, endDate = null) {
    const text = `
      SELECT
        product_id, product_name, product_sku, category,
        SUM(quantity) as total_quantity_sold,
        SUM(total_price) as total_revenue,
        COUNT(DISTINCT order_id) as order_count,
        AVG(unit_price) as avg_selling_price
      FROM ${this.tableName}
      WHERE fulfillment_status NOT IN ('cancelled', 'returned', 'refunded')
        ${startDate ? 'AND created_at >= $1' : ''}
        ${endDate ? `AND created_at <= $${startDate ? 2 : 1}` : ''}
      GROUP BY product_id, product_name, product_sku, category
      ORDER BY total_quantity_sold DESC
      LIMIT $${(startDate ? 2 : 1) + (endDate ? 1 : 0) + 1}
    `;

    const values = [];
    if (startDate) values.push(startDate);
    if (endDate) values.push(endDate);
    values.push(limit);

    const result = await connectionPool.query(text, values);
    return result.rows;
  }

  /**
   * Calculate commission for an item
   */
  static calculateCommission(item, commissionRate) {
    const baseAmount = item.net_price || item.total_price;
    return Math.round(baseAmount * (commissionRate / 100) * 100) / 100;
  }
}

module.exports = OrderItem;