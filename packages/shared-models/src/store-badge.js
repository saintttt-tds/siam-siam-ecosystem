const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Store Badge Model - Credibility Badges
 * 
 * Defines badges/credentials awarded to stores based on
 * performance, verification status, and achievements.
 * Badges build trust with customers and improve conversion.
 * 
 * TABLE: store_badges
 */

class StoreBadge extends BaseModel {
  static tableName = 'store_badges';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'merchant_id', 'store_id',
    'badge_type', 'badge_name', 'badge_slug',
    'badge_description', 'badge_icon_url',
    'badge_color', 'badge_category',
    'awarded_at', 'awarded_by', 'award_reason',
    'expires_at', 'is_active', 'is_permanent',
    'qualification_criteria', 'qualification_value',
    'qualification_achieved', 'revoked_at',
    'revocation_reason', 'revoked_by',
    'display_order', 'display_on_store',
    'display_on_product', 'tooltip_text',
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    is_active: 'boolean', is_permanent: 'boolean',
    display_on_store: 'boolean', display_on_product: 'boolean',
    qualification_value: 'float', qualification_achieved: 'float',
    display_order: 'integer', qualification_criteria: 'json',
    metadata: 'json', tags: 'json',
  };

  static badgeTypes = {
    VERIFIED_STORE: 'verified_store', TRUSTED_SELLER: 'trusted_seller',
    TOP_RATED: 'top_rated', FAST_SHIPPER: 'fast_shipper',
    EXCELLENT_SERVICE: 'excellent_service', QUALITY_PRODUCTS: 'quality_products',
    BEST_VALUE: 'best_value', ECO_FRIENDLY: 'eco_friendly',
    LOCAL_BUSINESS: 'local_business', PREMIUM_PARTNER: 'premium_partner',
    YEARS_ON_PLATFORM: 'years_on_platform', HIGH_VOLUME: 'high_volume',
    CUSTOMER_FAVORITE: 'customer_favorite', NEW_ARRIVAL: 'new_arrival',
  };

  static badgeCategories = {
    VERIFICATION: 'verification', PERFORMANCE: 'performance',
    SERVICE: 'service', QUALITY: 'quality', ACHIEVEMENT: 'achievement',
    SPECIAL: 'special',
  };

  static relations = {
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
  };

  // Predefined badges with criteria
  static predefinedBadges = [
    { type: 'verified_store', name: 'Verified Store', category: 'verification', description: 'This store has been verified by SiamSiam', isPermanent: true, criteria: { verification_status: 'verified' } },
    { type: 'trusted_seller', name: 'Trusted Seller', category: 'verification', description: 'Consistently reliable and trustworthy', criteria: { trust_score: 80 } },
    { type: 'top_rated', name: 'Top Rated', category: 'performance', description: 'Rated 4.5 stars and above', criteria: { average_rating: 4.5, min_reviews: 50 } },
    { type: 'fast_shipper', name: 'Fast Shipper', category: 'service', description: 'Ships orders within 24 hours', criteria: { avg_fulfillment_hours: 24 } },
    { type: 'excellent_service', name: 'Excellent Service', category: 'service', description: 'Outstanding customer service', criteria: { response_time_hours: 2, resolution_rate: 95 } },
    { type: 'quality_products', name: 'Quality Products', category: 'quality', description: 'Low return rate and high quality', criteria: { return_rate: 5 } },
    { type: 'customer_favorite', name: 'Customer Favorite', category: 'achievement', description: 'Most reordered from store', criteria: { repeat_purchase_rate: 30 } },
    { type: 'premium_partner', name: 'Premium Partner', category: 'special', description: 'Official premium partner', isPermanent: false, criteria: { partner_status: 'premium' } },
  ];

  /**
   * Award a badge to a store
   */
  static async award(merchantId, badgeType, awardedBy, options = {}) {
    const badgeDef = this.predefinedBadges.find(b => b.type === badgeType);
    if (!badgeDef) throw new Error('Invalid badge type');

    const existing = await this.findOne({ where: { merchant_id: merchantId, badge_type: badgeType, is_active: true } });
    if (existing) return existing;

    return this.create({
      merchant_id: merchantId, store_id: options.storeId,
      badge_type: badgeType, badge_name: badgeDef.name,
      badge_slug: badgeType, badge_description: badgeDef.description,
      badge_category: badgeDef.category,
      awarded_at: new Date().toISOString(), awarded_by: awardedBy,
      award_reason: options.reason, is_active: true,
      is_permanent: badgeDef.isPermanent !== false,
      expires_at: badgeDef.isPermanent ? null : new Date(Date.now() + 365 * 86400000).toISOString(),
      qualification_criteria: badgeDef.criteria,
      qualification_value: options.qualificationValue,
      qualification_achieved: options.qualificationAchieved,
      display_order: options.displayOrder || 0,
      display_on_store: true, display_on_product: badgeDef.category !== 'special',
      tooltip_text: options.tooltipText || badgeDef.description,
      metadata: options.metadata || {}, tenant_id: options.tenantId,
    });
  }

  /**
   * Find badges by merchant
   */
  static async findByMerchant(merchantId) {
    return this.findAll({
      where: { merchant_id: merchantId, is_active: true },
      orderBy: { display_order: 'ASC' },
    });
  }

  /**
   * Revoke a badge
   */
  static async revoke(badgeId, reason, revokedBy) {
    return this.update({ id: badgeId }, {
      is_active: false, revoked_at: new Date().toISOString(),
      revocation_reason: reason, revoked_by: revokedBy,
    });
  }
}

module.exports = StoreBadge;