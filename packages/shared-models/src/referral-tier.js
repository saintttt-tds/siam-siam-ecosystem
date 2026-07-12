const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Referral Tier Model - Referral Program Tiers
 * 
 * Defines tiered commission structures for referral programs.
 * Higher tiers unlock better commission rates, bonuses, and benefits.
 * Tiers are achieved based on cumulative referrals or earnings.
 * 
 * TABLE: referral_tiers
 */

class ReferralTier extends BaseModel {
  static tableName = 'referral_tiers';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'program_id', 'tier_name', 'tier_slug',
    'tier_level', 'tier_description', 'tier_icon',
    'tier_color', 'tier_badge_url',
    'qualification_type', 'qualification_threshold',
    'qualification_period', 'qualification_period_value',
    'commission_rate', 'commission_rate_type',
    'level_1_rate', 'level_2_rate', 'level_3_rate',
    'level_4_rate', 'level_5_rate',
    'signup_bonus', 'conversion_bonus',
    'milestone_bonus', 'retention_bonus',
    'monthly_cap', 'annual_cap', 'minimum_payout',
    'payout_frequency', 'payout_methods',
    'benefits', 'requirements', 'downgrade_policy',
    'downgrade_grace_period_days', 'upgrade_notification',
    'is_active', 'is_default', 'sort_order',
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    tier_level: 'integer', qualification_threshold: 'integer',
    qualification_period_value: 'integer',
    commission_rate: 'float', level_1_rate: 'float',
    level_2_rate: 'float', level_3_rate: 'float',
    level_4_rate: 'float', level_5_rate: 'float',
    signup_bonus: 'float', conversion_bonus: 'float',
    milestone_bonus: 'float', retention_bonus: 'float',
    monthly_cap: 'float', annual_cap: 'float',
    minimum_payout: 'float', downgrade_grace_period_days: 'integer',
    benefits: 'json', requirements: 'json',
    payout_methods: 'json', metadata: 'json', tags: 'json',
    is_active: 'boolean', is_default: 'boolean',
    upgrade_notification: 'boolean', sort_order: 'integer',
  };

  static qualificationTypes = {
    TOTAL_REFERRALS: 'total_referrals', TOTAL_EARNINGS: 'total_earnings',
    MONTHLY_REFERRALS: 'monthly_referrals', LIFETIME_VALUE: 'lifetime_value',
    ACTIVITY_LEVEL: 'activity_level',
  };

  static qualificationPeriods = {
    ALL_TIME: 'all_time', MONTHLY: 'monthly', QUARTERLY: 'quarterly',
    ANNUALLY: 'annually', ROLLING_30: 'rolling_30', ROLLING_90: 'rolling_90',
  };

  /**
   * Get tier by level
   */
  static async getByLevel(programId, level) {
    return this.findOne({ where: { program_id: programId, tier_level: level, is_active: true } });
  }

  /**
   * Get all tiers for a program
   */
  static async getByProgram(programId) {
    return this.findAll({ where: { program_id: programId, is_active: true }, orderBy: { tier_level: 'ASC' } });
  }

  /**
   * Get default tier
   */
  static async getDefault(programId) {
    return this.findOne({ where: { program_id: programId, is_default: true, is_active: true } });
  }

  /**
   * Determine user's tier based on performance
   */
  static async determineTier(programId, totalReferrals, totalEarnings) {
    const tiers = await this.getByProgram(programId);
    let highestTier = tiers[0]; // Start with lowest tier

    for (const tier of tiers) {
      let qualified = false;
      switch (tier.qualification_type) {
        case this.qualificationTypes.TOTAL_REFERRALS:
          qualified = totalReferrals >= tier.qualification_threshold;
          break;
        case this.qualificationTypes.TOTAL_EARNINGS:
          qualified = totalEarnings >= tier.qualification_threshold;
          break;
        default:
          qualified = totalReferrals >= tier.qualification_threshold;
      }
      if (qualified) highestTier = tier;
    }

    return highestTier;
  }
}

module.exports = ReferralTier;