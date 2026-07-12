const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Trust Score Model - Store Trust Score
 * 
 * Calculates and stores trust scores for merchants/stores based on
 * multiple factors including verification status, order fulfillment,
 * customer ratings, return rates, and platform longevity.
 * 
 * TABLE: trust_scores
 * 
 * SCORE COMPONENTS:
 * - verification: Based on verification level and completeness
 * - fulfillment: Order fulfillment rate and speed
 * - quality: Product quality based on return/refund rates
 * - service: Customer service responsiveness
 * - ratings: Average customer rating and review count
 * - longevity: Time on platform and consistency
 * - compliance: Policy compliance and violations
 */

class TrustScore extends BaseModel {
  static tableName = 'trust_scores';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'merchant_id', 'store_id',
    'overall_score', 'score_level', 'score_label',
    'verification_score', 'verification_weight',
    'fulfillment_score', 'fulfillment_weight',
    'quality_score', 'quality_weight',
    'service_score', 'service_weight',
    'ratings_score', 'ratings_weight',
    'longevity_score', 'longevity_weight',
    'compliance_score', 'compliance_weight',
    'component_scores', 'component_weights',
    'factors', 'factor_breakdown',
    'trend', 'trend_direction', 'trend_percent',
    'previous_score', 'score_change',
    'percentile_rank', 'category_rank',
    'calculated_at', 'calculation_version',
    'next_calculation_at', 'calculation_frequency_hours',
    'minimum_threshold', 'warning_threshold',
    'is_eligible_for_badges', 'is_eligible_for_featured',
    'is_eligible_for_promotion', 'restrictions',
    'manual_override', 'override_score',
    'override_reason', 'overridden_by', 'overridden_at',
    'last_updated_by_system', 'last_data_refresh_at',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    overall_score: 'float', verification_score: 'float',
    fulfillment_score: 'float', quality_score: 'float',
    service_score: 'float', ratings_score: 'float',
    longevity_score: 'float', compliance_score: 'float',
    verification_weight: 'float', fulfillment_weight: 'float',
    quality_weight: 'float', service_weight: 'float',
    ratings_weight: 'float', longevity_weight: 'float',
    compliance_weight: 'float', trend_percent: 'float',
    previous_score: 'float', score_change: 'float',
    percentile_rank: 'float', minimum_threshold: 'float',
    warning_threshold: 'float', override_score: 'float',
    calculation_frequency_hours: 'integer', category_rank: 'integer',
    component_scores: 'json', component_weights: 'json',
    factors: 'json', factor_breakdown: 'json',
    restrictions: 'json', metadata: 'json', tags: 'json',
    is_eligible_for_badges: 'boolean', is_eligible_for_featured: 'boolean',
    is_eligible_for_promotion: 'boolean', manual_override: 'boolean',
    last_updated_by_system: 'boolean',
  };

  static relations = {
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
  };

  static scoreLevels = {
    EXCELLENT: { min: 90, label: 'Excellent', color: '#27AE60' },
    VERY_GOOD: { min: 80, label: 'Very Good', color: '#2ECC71' },
    GOOD: { min: 70, label: 'Good', color: '#3498DB' },
    AVERAGE: { min: 50, label: 'Average', color: '#F39C12' },
    BELOW_AVERAGE: { min: 30, label: 'Below Average', color: '#E67E22' },
    POOR: { min: 0, label: 'Poor', color: '#E74C3C' },
  };

  /**
   * Calculate trust score for a merchant
   */
  static async calculate(merchantId, options = {}) {
    const merchant = await require('./merchant').findById(merchantId);
    if (!merchant) throw new Error('Merchant not found');

    const previousScore = await this.findOne({
      where: { merchant_id: merchantId },
      orderBy: { calculated_at: 'DESC' },
    });

    // Calculate component scores
    const verificationScore = this._calculateVerificationScore(merchant);
    const fulfillmentScore = this._calculateFulfillmentScore(merchant);
    const qualityScore = this._calculateQualityScore(merchant);
    const serviceScore = this._calculateServiceScore(merchant);
    const ratingsScore = this._calculateRatingsScore(merchant);
    const longevityScore = this._calculateLongevityScore(merchant);
    const complianceScore = this._calculateComplianceScore(merchant);

    // Weighted average
    const weights = options.weights || {
      verification: 20, fulfillment: 20, quality: 15,
      service: 15, ratings: 15, longevity: 10, compliance: 5,
    };

    const overallScore = Math.round(
      (verificationScore * weights.verification +
       fulfillmentScore * weights.fulfillment +
       qualityScore * weights.quality +
       serviceScore * weights.service +
       ratingsScore * weights.ratings +
       longevityScore * weights.longevity +
       complianceScore * weights.compliance) / 100
    );

    // Determine score level
    const level = Object.entries(this.scoreLevels)
      .reverse()
      .find(([, config]) => overallScore >= config.min);

    const previousOverall = previousScore?.overall_score || overallScore;
    const trendPercent = previousOverall > 0
      ? Math.round(((overallScore - previousOverall) / previousOverall) * 100)
      : 0;

    return this.create({
      merchant_id: merchantId, store_id: options.storeId,
      overall_score: overallScore,
      score_level: level?.[0] || 'AVERAGE',
      score_label: level?.[1]?.label || 'Average',
      verification_score: verificationScore, verification_weight: weights.verification,
      fulfillment_score: fulfillmentScore, fulfillment_weight: weights.fulfillment,
      quality_score: qualityScore, quality_weight: weights.quality,
      service_score: serviceScore, service_weight: weights.service,
      ratings_score: ratingsScore, ratings_weight: weights.ratings,
      longevity_score: longevityScore, longevity_weight: weights.longevity,
      compliance_score: complianceScore, compliance_weight: weights.compliance,
      component_scores: {
        verification: verificationScore, fulfillment: fulfillmentScore,
        quality: qualityScore, service: serviceScore,
        ratings: ratingsScore, longevity: longevityScore, compliance: complianceScore,
      },
      component_weights: weights,
      previous_score: previousOverall,
      score_change: Math.round((overallScore - previousOverall) * 100) / 100,
      trend_direction: trendPercent > 0 ? 'up' : trendPercent < 0 ? 'down' : 'stable',
      trend_percent: trendPercent,
      calculated_at: new Date().toISOString(),
      calculation_version: '1.0.0',
      next_calculation_at: new Date(Date.now() + 24 * 3600000).toISOString(),
      calculation_frequency_hours: 24,
      is_eligible_for_badges: overallScore >= 80,
      is_eligible_for_featured: overallScore >= 85,
      is_eligible_for_promotion: overallScore >= 70,
      last_updated_by_system: true,
      metadata: options.metadata || {}, tenant_id: options.tenantId,
    });
  }

  /**
   * Get current trust score for a merchant
   */
  static async getCurrent(merchantId) {
    return this.findOne({
      where: { merchant_id: merchantId },
      orderBy: { calculated_at: 'DESC' },
    });
  }

  // Private calculation methods
  static _calculateVerificationScore(merchant) {
    const levelScores = { basic: 20, verified: 60, enhanced: 85, premium: 100 };
    return levelScores[merchant.verification_level] || 0;
  }

  static _calculateFulfillmentScore(merchant) {
    const rate = merchant.order_fulfillment_rate || 0;
    const onTime = merchant.on_time_delivery_rate || 0;
    return Math.round((rate * 0.6 + onTime * 0.4));
  }

  static _calculateQualityScore(merchant) {
    const returnRate = merchant.return_rate || 0;
    return Math.max(0, Math.round(100 - returnRate * 2));
  }

  static _calculateServiceScore(merchant) {
    const responseTime = merchant.response_time_hours || 48;
    if (responseTime <= 1) return 100;
    if (responseTime <= 4) return 85;
    if (responseTime <= 12) return 70;
    if (responseTime <= 24) return 50;
    return 30;
  }

  static _calculateRatingsScore(merchant) {
    const avg = merchant.average_rating || 0;
    const count = merchant.total_reviews || 0;
    const ratingScore = (avg / 5) * 80;
    const volumeBonus = Math.min(count / 10, 20);
    return Math.round(ratingScore + volumeBonus);
  }

  static _calculateLongevityScore(merchant) {
    const daysSince = merchant.seller_since
      ? Math.floor((Date.now() - new Date(merchant.seller_since).getTime()) / 86400000)
      : 0;
    if (daysSince >= 365) return 100;
    if (daysSince >= 180) return 80;
    if (daysSince >= 90) return 60;
    if (daysSince >= 30) return 40;
    return 20;
  }

  static _calculateComplianceScore(merchant) {
    let score = 100;
    if (merchant.is_suspended) score -= 50;
    if (merchant.verification_status === 'rejected') score -= 30;
    return Math.max(0, score);
  }
}

module.exports = TrustScore;