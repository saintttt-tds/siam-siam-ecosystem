const BaseModel = require('./base-model');
const SoftDeleteMixin = require('./soft-delete-mixin');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Merchant Model - Registered Merchant/Seller
 * 
 * Represents a seller/merchant on the marketplace platform.
 * Manages store profile, verification status, commissions, and settlements.
 * 
 * TABLE: merchants
 * 
 * VERIFICATION LEVELS:
 * - unverified: New registration, limited features
 * - basic: Email/phone verified
 * - verified: Business documents verified
 * - premium: Full verification, priority support
 */

class Merchant extends BaseModel {
  static tableName = 'merchants';
  static primaryKey = 'id';
  static softDelete = true;
  
  static fields = [
    'id', 'user_id',
    // Store identity
    'store_name', 'store_slug', 'store_description',
    'store_tagline', 'store_logo_url', 'store_banner_url',
    'store_brand_color', 'store_secondary_color',
    // Business info
    'business_type', 'business_registration_number',
    'tax_number', 'vat_number', 'business_license_number',
    'business_category', 'business_subcategory',
    'year_established', 'employee_count',
    // Contact
    'contact_email', 'contact_phone', 'support_email',
    'support_phone', 'website', 'social_links',
    // Address
    'business_address', 'city', 'state', 'country', 'postal_code',
    'return_address', 'warehouse_address',
    // Verification
    'verification_status', 'verification_level',
    'verified_at', 'verified_by', 'verification_notes',
    'documents_verified', 'identity_verified',
    'address_verified', 'bank_account_verified',
    // Status
    'is_active', 'is_suspended', 'suspension_reason',
    'suspended_at', 'suspended_until', 'is_featured',
    // Commission & Settlement
    'commission_rate', 'commission_type',
    'settlement_method', 'settlement_schedule',
    'settlement_account_details', 'minimum_settlement_amount',
    'next_settlement_date', 'last_settlement_at',
    // Performance
    'average_rating', 'total_reviews', 'total_ratings',
    'total_products', 'total_orders', 'total_revenue',
    'order_fulfillment_rate', 'on_time_delivery_rate',
    'return_rate', 'cancellation_rate', 'response_time_hours',
    // Shipping
    'shipping_policy', 'return_policy', 'refund_policy',
    'processing_time_days', 'ships_internationally',
    'free_shipping_threshold',
    // Operating hours
    'operating_hours', 'timezone', 'is_24_7',
    // SEO & Marketing
    'seo_title', 'seo_description', 'seo_keywords',
    'marketing_consent', 'featured_until',
    // Trust & Safety
    'trust_score', 'verified_since', 'seller_since',
    'seller_badges',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
    'deleted_at', 'deleted_by',
  ];

  static casts = {
    social_links: 'json',
    operating_hours: 'json',
    settlement_account_details: 'json',
    seller_badges: 'json',
    metadata: 'json',
    tags: 'json',
    is_active: 'boolean',
    is_suspended: 'boolean',
    is_featured: 'boolean',
    documents_verified: 'boolean',
    identity_verified: 'boolean',
    address_verified: 'boolean',
    bank_account_verified: 'boolean',
    ships_internationally: 'boolean',
    is_24_7: 'boolean',
    marketing_consent: 'boolean',
    commission_rate: 'float',
    average_rating: 'float',
    trust_score: 'float',
    order_fulfillment_rate: 'float',
    on_time_delivery_rate: 'float',
    return_rate: 'float',
    cancellation_rate: 'float',
    response_time_hours: 'float',
    free_shipping_threshold: 'float',
    minimum_settlement_amount: 'float',
    total_products: 'integer',
    total_orders: 'integer',
    total_revenue: 'float',
    total_reviews: 'integer',
    total_ratings: 'integer',
    employee_count: 'integer',
    year_established: 'integer',
    processing_time_days: 'integer',
  };

  static relations = {
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
    branches: { type: 'hasMany', model: 'Branch', foreignKey: 'merchant_id', localKey: 'id' },
    products: { type: 'hasMany', model: 'Product', foreignKey: 'merchant_id', localKey: 'id' },
    orders: { type: 'hasMany', model: 'Order', foreignKey: 'merchant_id', localKey: 'id' },
    domains: { type: 'hasMany', model: 'CustomDomain', foreignKey: 'merchant_id', localKey: 'id' },
    verification: { type: 'hasOne', model: 'StoreVerification', foreignKey: 'merchant_id', localKey: 'id' },
  };

  static verificationStatuses = {
    UNVERIFIED: 'unverified',
    PENDING: 'pending',
    IN_REVIEW: 'in_review',
    VERIFIED: 'verified',
    PREMIUM: 'premium',
    REJECTED: 'rejected',
    SUSPENDED: 'suspended',
  };

  /**
   * Find merchant by user ID
   */
  static async findByUser(userId) {
    return this.findOne({ where: { user_id: userId } });
  }

  /**
   * Find merchant by store slug
   */
  static async findBySlug(slug) {
    return this.findOne({
      where: { store_slug: slug, is_active: true },
    });
  }

  /**
   * Search merchants
   */
  static async search(query, options = {}) {
    const text = `
      SELECT * FROM ${this.tableName}
      WHERE is_active = true
        AND verification_status IN ('verified', 'premium')
        AND (
          store_name ILIKE $1
          OR store_description ILIKE $1
          OR business_category ILIKE $1
        )
      ORDER BY ${options.orderBy || 'average_rating DESC'}
      LIMIT $2 OFFSET $3
    `;
    const result = await connectionPool.query(text, [
      `%${query}%`,
      options.limit || 20,
      options.offset || 0,
    ]);
    return result.rows;
  }

  /**
   * Get featured merchants
   */
  static async getFeatured(limit = 10) {
    return this.findAll({
      where: {
        is_featured: true,
        is_active: true,
        verification_status: [this.verificationStatuses.VERIFIED, this.verificationStatuses.PREMIUM],
      },
      orderBy: { average_rating: 'DESC' },
      limit,
    });
  }

  /**
   * Verify a merchant
   */
  static async verify(merchantId, verifiedBy, level = 'verified') {
    return this.update({ id: merchantId }, {
      verification_status: this.verificationStatuses.VERIFIED,
      verification_level: level,
      verified_at: new Date().toISOString(),
      verified_by: verifiedBy,
      verified_since: new Date().toISOString(),
    });
  }

  /**
   * Suspend a merchant
   */
  static async suspend(merchantId, reason, suspendedBy, durationDays = null) {
    const updates = {
      is_suspended: true,
      suspension_reason: reason,
      suspended_at: new Date().toISOString(),
    };

    if (durationDays) {
      updates.suspended_until = new Date(Date.now() + durationDays * 86400000).toISOString();
    }

    return this.update({ id: merchantId }, updates);
  }

  /**
   * Update merchant rating
   */
  static async updateRating(merchantId, newRating) {
    const merchant = await this.findById(merchantId);
    if (!merchant) return;

    const newTotalRatings = merchant.total_ratings + 1;
    const newAverageRating = ((merchant.average_rating * merchant.total_ratings) + newRating) / newTotalRatings;

    return this.update({ id: merchantId }, {
      average_rating: Math.round(newAverageRating * 100) / 100,
      total_ratings: newTotalRatings,
    });
  }

  /**
   * Get merchant performance summary
   */
  static async getPerformanceSummary(merchantId) {
    const text = `
      SELECT
        COUNT(*) as total_orders_30d,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as completed_30d,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_30d,
        COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_30d,
        AVG(CASE WHEN status = 'delivered' THEN 
          EXTRACT(EPOCH FROM (delivered_at - created_at)) / 3600 
        END) as avg_fulfillment_hours,
        SUM(CASE WHEN status = 'delivered' THEN total ELSE 0 END) as revenue_30d
      FROM orders
      WHERE merchant_id = $1
        AND created_at > NOW() - INTERVAL '30 days'
    `;
    const result = await connectionPool.query(text, [merchantId]);
    return result.rows[0];
  }
}

Object.assign(Merchant, SoftDeleteMixin);
module.exports = Merchant;