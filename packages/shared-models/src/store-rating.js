const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Store Rating Model - Store Rating and Reviews
 * 
 * Customer ratings and reviews for stores/merchants.
 * Supports detailed ratings across multiple dimensions,
 * verified purchase badges, and helpfulness voting.
 * 
 * TABLE: store_ratings
 */

class StoreRating extends BaseModel {
  static tableName = 'store_ratings';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'merchant_id', 'store_id', 'user_id',
    'order_id', 'order_item_id', 'product_id',
    'rating', 'title', 'review_text', 'review_html',
    'pros', 'cons', 'dimensions_rating',
    'product_quality_rating', 'delivery_speed_rating',
    'customer_service_rating', 'value_for_money_rating',
    'communication_rating', 'accuracy_rating',
    'packaging_rating', 'shipping_cost_rating',
    'is_verified_purchase', 'is_anonymous',
    'is_recommended', 'is_featured',
    'status', 'moderation_status', 'moderation_notes',
    'moderated_by', 'moderated_at',
    'helpful_count', 'not_helpful_count',
    'report_count', 'is_edited', 'edited_at',
    'reply_text', 'reply_by', 'replied_at',
    'reply_helpful_count', 'images', 'videos',
    'purchase_date', 'purchase_amount', 'purchase_currency',
    'user_display_name', 'user_avatar_url',
    'user_review_count', 'sentiment', 'sentiment_score',
    'review_source', 'review_invitation_id',
    'reminder_sent', 'reminder_sent_at',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    rating: 'integer', product_quality_rating: 'integer',
    delivery_speed_rating: 'integer', customer_service_rating: 'integer',
    value_for_money_rating: 'integer', communication_rating: 'integer',
    accuracy_rating: 'integer', packaging_rating: 'integer',
    shipping_cost_rating: 'integer', helpful_count: 'integer',
    not_helpful_count: 'integer', report_count: 'integer',
    user_review_count: 'integer', sentiment_score: 'float',
    purchase_amount: 'float',
    is_verified_purchase: 'boolean', is_anonymous: 'boolean',
    is_recommended: 'boolean', is_featured: 'boolean',
    is_edited: 'boolean', reminder_sent: 'boolean',
    pros: 'json', cons: 'json', dimensions_rating: 'json',
    images: 'json', videos: 'json', metadata: 'json', tags: 'json',
  };

  static relations = {
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
    order: { type: 'belongsTo', model: 'Order', foreignKey: 'order_id', ownerKey: 'id' },
    product: { type: 'belongsTo', model: 'Product', foreignKey: 'product_id', ownerKey: 'id' },
  };

  static statuses = {
    PENDING: 'pending', PUBLISHED: 'published', HIDDEN: 'hidden',
    DELETED: 'deleted', FLAGGED: 'flagged', UNDER_REVIEW: 'under_review',
  };

  /**
   * Submit a store review
   */
  static async submitReview(merchantId, userId, orderId, reviewData) {
    const existing = await this.findOne({ where: { merchant_id: merchantId, user_id: userId, order_id: orderId } });
    if (existing) throw new Error('You have already reviewed this store for this order');

    return this.create({
      merchant_id: merchantId, store_id: reviewData.storeId,
      user_id: userId, order_id: orderId,
      order_item_id: reviewData.orderItemId, product_id: reviewData.productId,
      rating: reviewData.rating, title: reviewData.title?.substring(0, 200),
      review_text: reviewData.reviewText?.substring(0, 5000),
      pros: reviewData.pros || [], cons: reviewData.cons || [],
      product_quality_rating: reviewData.productQualityRating,
      delivery_speed_rating: reviewData.deliverySpeedRating,
      customer_service_rating: reviewData.customerServiceRating,
      value_for_money_rating: reviewData.valueForMoneyRating,
      communication_rating: reviewData.communicationRating,
      accuracy_rating: reviewData.accuracyRating,
      packaging_rating: reviewData.packagingRating,
      is_verified_purchase: !!orderId, is_anonymous: reviewData.isAnonymous || false,
      is_recommended: reviewData.isRecommended !== false,
      status: this.statuses.PUBLISHED, images: reviewData.images || [],
      purchase_date: reviewData.purchaseDate, sentiment: reviewData.sentiment,
      metadata: reviewData.metadata || {}, tenant_id: reviewData.tenantId,
    });
  }

  /**
   * Find reviews by merchant
   */
  static async findByMerchant(merchantId, options = {}) {
    return this.paginate({
      where: { merchant_id: merchantId, status: this.statuses.PUBLISHED },
      orderBy: { is_featured: 'DESC', helpful_count: 'DESC', created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Mark review as helpful
   */
  static async markHelpful(reviewId) {
    await connectionPool.query(`UPDATE ${this.tableName} SET helpful_count = helpful_count + 1 WHERE id = $1`, [reviewId]);
  }

  /**
   * Add merchant reply
   */
  static async addReply(reviewId, replyText, repliedBy) {
    return this.update({ id: reviewId }, { reply_text: replyText?.substring(0, 2000), reply_by: repliedBy, replied_at: new Date().toISOString() });
  }

  /**
   * Get rating summary for a merchant
   */
  static async getRatingSummary(merchantId) {
    const text = `
      SELECT
        COUNT(*) as total_reviews,
        AVG(rating) as average_rating,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star,
        AVG(product_quality_rating) as avg_quality,
        AVG(delivery_speed_rating) as avg_delivery,
        AVG(customer_service_rating) as avg_service,
        COUNT(CASE WHEN is_recommended = true THEN 1 END) as recommended_count,
        ROUND(100.0 * COUNT(CASE WHEN is_recommended = true THEN 1 END) / NULLIF(COUNT(*), 0), 1) as recommend_percent
      FROM ${this.tableName}
      WHERE merchant_id = $1 AND status = 'published'
    `;
    const result = await connectionPool.query(text, [merchantId]);
    return result.rows[0];
  }
}

module.exports = StoreRating;