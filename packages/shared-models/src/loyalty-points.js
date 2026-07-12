const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Loyalty Points Model - Loyalty/Rewards Points Balance
 * 
 * Manages loyalty points for users across all platforms.
 * Points can be earned through purchases, referrals, promotions
 * and redeemed for discounts, products, or cashback.
 * 
 * TABLE: loyalty_points
 * 
 * POINT LIFECYCLE:
 * 1. Earned: Points credited to user account
 * 2. Pending: Points awaiting confirmation (return period)
 * 3. Available: Points ready for redemption
 * 4. Redeemed: Points used for rewards
 * 5. Expired: Points past expiry date
 * 6. Forfeited: Points lost due to policy violation
 */

class LoyaltyPoints extends BaseModel {
  static tableName = 'loyalty_points';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id', 'program_id',
    // Balances
    'total_earned', 'total_redeemed', 'total_expired',
    'current_balance', 'pending_balance',
    // Tier/Level
    'loyalty_tier', 'tier_achieved_at', 'tier_expires_at',
    'points_to_next_tier', 'tier_progress_percent',
    // Activity summary
    'total_transactions', 'total_spend',
    'last_earned_at', 'last_redeemed_at',
    // Membership
    'member_since', 'is_active', 'is_vip',
    // Referral bonus
    'referral_points_earned', 'birthday_points_earned',
    // Expiry
    'points_expiring_soon', 'points_expiring_date',
    // Preferences
    'auto_redeem', 'preferred_reward_type',
    'notification_preferences',
    // Metadata
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at',
  ];

  static casts = {
    total_earned: 'integer',
    total_redeemed: 'integer',
    total_expired: 'integer',
    current_balance: 'integer',
    pending_balance: 'integer',
    points_to_next_tier: 'integer',
    tier_progress_percent: 'float',
    total_transactions: 'integer',
    total_spend: 'float',
    referral_points_earned: 'integer',
    birthday_points_earned: 'integer',
    points_expiring_soon: 'integer',
    is_active: 'boolean',
    is_vip: 'boolean',
    auto_redeem: 'boolean',
    notification_preferences: 'json',
    metadata: 'json',
    tags: 'json',
  };

  static relations = {
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
  };

  // Loyalty tiers
  static tiers = {
    BRONZE: { name: 'bronze', minPoints: 0, multiplier: 1.0, benefits: ['basic_support'] },
    SILVER: { name: 'silver', minPoints: 1000, multiplier: 1.2, benefits: ['priority_support', 'birthday_bonus'] },
    GOLD: { name: 'gold', minPoints: 5000, multiplier: 1.5, benefits: ['priority_support', 'birthday_bonus', 'free_delivery'] },
    PLATINUM: { name: 'platinum', minPoints: 25000, multiplier: 2.0, benefits: ['priority_support', 'birthday_bonus', 'free_delivery', 'exclusive_deals', 'dedicated_agent'] },
    DIAMOND: { name: 'diamond', minPoints: 100000, multiplier: 3.0, benefits: ['priority_support', 'birthday_bonus', 'free_delivery', 'exclusive_deals', 'dedicated_agent', 'early_access', 'vip_events'] },
  };

  // Earning rates per action type
  static earningRates = {
    purchase: 1,        // 1 point per $1 spent (base rate, multiplied by tier)
    referral_signup: 500,
    referral_purchase: 200,
    birthday_bonus: 1000,
    review_product: 50,
    review_store: 100,
    first_purchase_bonus: 500,
    streak_bonus: 100,  // Per consecutive purchase
    social_share: 25,
    app_install: 200,
    profile_complete: 100,
    kyc_complete: 300,
  };

  // Redemption rates (points to value)
  static redemptionRates = {
    wallet_credit: { points: 1000, value: 1.00, currency: 'USD' },
    discount_voucher: { points: 500, value: 5.00, currency: 'USD', minOrder: 20 },
    free_delivery: { points: 200, value: 0, currency: 'USD' },
    product_reward: { points: 5000, value: 50.00, currency: 'USD' },
    charity_donation: { points: 100, value: 1.00, currency: 'USD' },
  };

  /**
   * Get or create loyalty account for user
   */
  static async getOrCreate(userId, programId = 'default') {
    let account = await this.findOne({
      where: { user_id: userId, program_id: programId },
    });

    if (!account) {
      account = await this.create({
        user_id: userId,
        program_id: programId,
        total_earned: 0,
        total_redeemed: 0,
        total_expired: 0,
        current_balance: 0,
        pending_balance: 0,
        loyalty_tier: this.tiers.BRONZE.name,
        member_since: new Date().toISOString(),
        is_active: true,
      });
    }

    return account;
  }

  /**
   * Earn points for a user
   */
  static async earnPoints(userId, actionType, baseAmount = null, metadata = {}) {
    const account = await this.getOrCreate(userId);
    const rate = this.earningRates[actionType] || 1;
    
    let pointsEarned = rate;
    
    // For purchases, calculate based on amount
    if (actionType === 'purchase' && baseAmount) {
      const tier = this.tiers[account.loyalty_tier.toUpperCase()] || this.tiers.BRONZE;
      pointsEarned = Math.floor(baseAmount * rate * tier.multiplier);
    }

    // Apply bonus points from metadata
    if (metadata.bonusMultiplier) {
      pointsEarned = Math.floor(pointsEarned * metadata.bonusMultiplier);
    }

    const newBalance = account.current_balance + pointsEarned;
    const newTotal = account.total_earned + pointsEarned;

    // Check tier progression
    let newTier = account.loyalty_tier;
    const tierEntries = Object.entries(this.tiers).sort((a, b) => b[1].minPoints - a[1].minPoints);
    for (const [tierName, tierConfig] of tierEntries) {
      if (newTotal >= tierConfig.minPoints) {
        newTier = tierName.toLowerCase();
        break;
      }
    }

    const updates = {
      current_balance: newBalance,
      total_earned: newTotal,
      last_earned_at: new Date().toISOString(),
      loyalty_tier: newTier,
    };

    if (newTier !== account.loyalty_tier) {
      updates.tier_achieved_at = new Date().toISOString();
      updates.tier_expires_at = new Date(Date.now() + 365 * 86400000).toISOString();
    }

    await this.update({ id: account.id }, updates);

    logger.info('Loyalty points earned', {
      userId,
      actionType,
      pointsEarned,
      newBalance,
      tier: newTier,
    });

    return {
      userId,
      pointsEarned,
      newBalance,
      totalEarned: newTotal,
      tier: newTier,
      tierUpgraded: newTier !== account.loyalty_tier,
    };
  }

  /**
   * Redeem points for a reward
   */
  static async redeemPoints(userId, rewardType, pointsToRedeem = null) {
    const account = await this.getOrCreate(userId);
    const reward = this.redemptionRates[rewardType];

    if (!reward) {
      throw new Error(`Invalid reward type: ${rewardType}`);
    }

    const requiredPoints = pointsToRedeem || reward.points;

    if (account.current_balance < requiredPoints) {
      throw new Error(`Insufficient points. Required: ${requiredPoints}, Available: ${account.current_balance}`);
    }

    const newBalance = account.current_balance - requiredPoints;
    const newRedeemed = account.total_redeemed + requiredPoints;

    await this.update({ id: account.id }, {
      current_balance: newBalance,
      total_redeemed: newRedeemed,
      last_redeemed_at: new Date().toISOString(),
    });

    logger.info('Loyalty points redeemed', {
      userId,
      rewardType,
      pointsRedeemed: requiredPoints,
      newBalance,
    });

    return {
      userId,
      rewardType,
      pointsRedeemed: requiredPoints,
      newBalance,
      rewardValue: reward.value,
      rewardCurrency: reward.currency,
    };
  }

  /**
   * Get user's loyalty status
   */
  static async getStatus(userId) {
    const account = await this.getOrCreate(userId);
    const tier = this.tiers[account.loyalty_tier.toUpperCase()] || this.tiers.BRONZE;
    const nextTierEntry = Object.entries(this.tiers)
      .find(([, t]) => t.minPoints > account.total_earned);
    
    const nextTier = nextTierEntry ? nextTierEntry[1] : null;
    const pointsToNextTier = nextTier ? nextTier.minPoints - account.total_earned : 0;

    return {
      ...account,
      tierDetails: tier,
      nextTier: nextTier?.name || null,
      pointsToNextTier,
      tierProgressPercent: nextTier 
        ? Math.round((1 - pointsToNextTier / (nextTier.minPoints - (this.tiers[account.loyalty_tier.toUpperCase()]?.minPoints || 0))) * 100)
        : 100,
      availableRewards: Object.entries(this.redemptionRates).map(([type, reward]) => ({
        type,
        pointsRequired: reward.points,
        value: reward.value,
        currency: reward.currency,
        canRedeem: account.current_balance >= reward.points,
      })),
    };
  }

  /**
   * Process points expiry
   */
  static async processExpiry() {
    const text = `
      UPDATE ${this.tableName}
      SET current_balance = current_balance - points_expiring_soon,
          total_expired = total_expired + points_expiring_soon,
          points_expiring_soon = 0,
          points_expiring_date = NULL,
          updated_at = NOW()
      WHERE points_expiring_soon > 0
        AND points_expiring_date <= NOW()
    `;
    const result = await connectionPool.query(text);
    
    if (result.rowCount > 0) {
      logger.info('Processed loyalty points expiry', { affectedRows: result.rowCount });
    }
    
    return result.rowCount;
  }

  /**
   * Get loyalty program statistics
   */
  static async getProgramStats() {
    const text = `
      SELECT
        COUNT(*) as total_members,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_members,
        SUM(current_balance) as total_points_outstanding,
        SUM(total_earned) as total_points_ever_earned,
        SUM(total_redeemed) as total_points_redeemed,
        loyalty_tier,
        COUNT(*) as members_in_tier
      FROM ${this.tableName}
      GROUP BY loyalty_tier
      ORDER BY MIN(total_earned) DESC
    `;
    const result = await connectionPool.query(text);
    return result.rows;
  }
}

module.exports = LoyaltyPoints;