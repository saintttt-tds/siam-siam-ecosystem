const currencyValidator = require('../validators/currency-validator');
const logger = require('../logging/logger');

/**
 * Commission Calculator
 * 
 * Calculates referral commissions based on:
 * - Fixed amount commissions
 * - Percentage-based commissions
 * - Tiered commission structures
 * - Multi-level commission trees
 * - Minimum thresholds
 * - Currency conversion
 * 
 * COMMISSION TYPES:
 * - fixed: Flat amount (e.g., $10 per referral)
 * - percent: Percentage of purchase (e.g., 5% of order)
 * - tiered: Different rates based on volume
 * - hybrid: Fixed + percentage combination
 * 
 * @example
 *   const calc = require('@siamsiam/shared-utils').referral.commissionCalculator;
 *   
 *   const result = calc.calculate(
 *     { type: 'percent', amount: 10, currency: 'USD' },
 *     { amount: 150, currency: 'USD' }
 *   );
 */

class CommissionCalculator {
  constructor() {
    // Default currency
    this.defaultCurrency = 'USD';
  }

  /**
   * Calculate commission for a referral
   * @param {Object} rewardConfig - Reward configuration
   * @param {string} rewardConfig.type - Reward type (fixed, percent, tiered)
   * @param {number} rewardConfig.amount - Reward amount
   * @param {string} rewardConfig.currency - Currency code
   * @param {Object} qualifyingAction - Action that triggered commission
   * @param {number} qualifyingAction.amount - Purchase/action amount
   * @param {string} qualifyingAction.currency - Currency of action
   * @returns {Object} Commission calculation
   */
  calculate(rewardConfig, qualifyingAction = {}) {
    if (!rewardConfig) {
      return { amount: 0, currency: this.defaultCurrency, formatted: '$0.00' };
    }

    const {
      type = 'fixed',
      amount = 0,
      currency = this.defaultCurrency,
      minAmount = 0,
      maxAmount = null,
      tiers = [],
    } = rewardConfig;

    let commissionAmount = 0;

    switch (type) {
      case 'fixed':
        commissionAmount = amount;
        break;

      case 'percent':
        const baseAmount = qualifyingAction.amount || 0;
        commissionAmount = (baseAmount * amount) / 100;
        break;

      case 'tiered':
        commissionAmount = this._calculateTiered(tiers, qualifyingAction);
        break;

      case 'hybrid':
        const fixedPart = rewardConfig.fixedAmount || 0;
        const percentPart = ((qualifyingAction.amount || 0) * (rewardConfig.percentAmount || 0)) / 100;
        commissionAmount = fixedPart + percentPart;
        break;

      default:
        commissionAmount = amount;
    }

    // Apply minimum
    if (minAmount > 0 && commissionAmount < minAmount) {
      commissionAmount = minAmount;
    }

    // Apply maximum
    if (maxAmount && commissionAmount > maxAmount) {
      commissionAmount = maxAmount;
    }

    // Round to 2 decimal places
    commissionAmount = Math.round(commissionAmount * 100) / 100;

    return {
      amount: commissionAmount,
      currency,
      formatted: currencyValidator.format(commissionAmount, currency),
      type,
      breakdown: {
        rewardType: type,
        rewardAmount: amount,
        baseAmount: qualifyingAction.amount || 0,
        commissionAmount,
      },
    };
  }

  /**
   * Calculate commissions for multiple tiers
   * @param {Object} tierConfig - Tier configuration
   * @param {number} totalReferrals - Total successful referrals
   * @returns {Object} Tier calculation
   */
  calculateTieredReward(tierConfig, totalReferrals) {
    const tiers = tierConfig.tiers || [];
    let applicableTier = null;

    // Find the highest applicable tier
    for (const tier of tiers.sort((a, b) => b.threshold - a.threshold)) {
      if (totalReferrals >= tier.threshold) {
        applicableTier = tier;
        break;
      }
    }

    if (!applicableTier) {
      return { amount: 0, tier: 'none' };
    }

    return {
      amount: applicableTier.amount,
      tier: applicableTier.name || `Tier ${tiers.indexOf(applicableTier) + 1}`,
      threshold: applicableTier.threshold,
      formatted: currencyValidator.format(applicableTier.amount, tierConfig.currency || 'USD'),
    };
  }

  /**
   * Calculate multi-level commission
   * @param {Object} levelConfig - Level configuration
   * @param {number} level - Current level (1 = direct, 2 = sub-referral, etc.)
   * @param {Object} qualifyingAction - Qualifying action
   * @returns {Object} Level commission
   */
  calculateLevelCommission(levelConfig, level, qualifyingAction) {
    const rates = levelConfig.rates || { 1: 10, 2: 5, 3: 2 };
    const rate = rates[level] || 0;

    if (rate === 0) return { amount: 0, level, rate: 0 };

    const baseAmount = qualifyingAction.amount || 0;
    const commissionAmount = (baseAmount * rate) / 100;

    return {
      amount: Math.round(commissionAmount * 100) / 100,
      level,
      rate,
      formatted: currencyValidator.format(commissionAmount, levelConfig.currency || 'USD'),
    };
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Calculate tiered commission based on qualifying action amount
   * @private
   */
  _calculateTiered(tiers, qualifyingAction) {
    if (!tiers || tiers.length === 0) return 0;

    const actionAmount = qualifyingAction.amount || 0;
    let applicableTier = null;

    // Sort tiers by threshold descending to find highest applicable
    const sortedTiers = [...tiers].sort((a, b) => b.threshold - a.threshold);
    
    for (const tier of sortedTiers) {
      if (actionAmount >= tier.threshold) {
        applicableTier = tier;
        break;
      }
    }

    if (!applicableTier) return 0;

    // Calculate based on tier type
    if (applicableTier.type === 'percent') {
      return (actionAmount * applicableTier.amount) / 100;
    }
    
    return applicableTier.amount;
  }
}

module.exports = new CommissionCalculator();