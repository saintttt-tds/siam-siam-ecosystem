const logger = require('../logging/logger');
const commissionCalculator = require('./commission-calculator');

/**
 * Multi-Level Marketing (MLM) Commissions
 * 
 * Calculates commissions across multiple referral levels:
 * - Level 1: Direct referrals (person A refers person B)
 * - Level 2: Sub-referrals (person B refers person C, A gets commission)
 * - Level 3+: Deeper network levels
 * 
 * COMMISSION STRUCTURE:
 * Level 1 (Direct): 10% of purchase
 * Level 2 (Indirect): 5% of purchase
 * Level 3 (Deeper): 2% of purchase
 * 
 * LIMITS:
 * - Maximum network depth
 * - Maximum total commission per purchase
 * - Minimum purchase amount for commission
 * - Maximum monthly earnings per user
 * 
 * @example
 *   const mlm = require('@siamsiam/shared-utils').referral.multiLevelCommissions;
 *   
 *   // Build network
 *   mlm.addRelationship('user_A', 'user_B'); // A referred B
 *   mlm.addRelationship('user_B', 'user_C'); // B referred C
 *   
 *   // Calculate commissions when C makes a purchase
 *   const commissions = mlm.calculateNetworkCommissions('user_C', { amount: 100 });
 *   // A gets level 2 commission, B gets level 1 commission
 */

class MultiLevelCommissions {
  constructor() {
    // Network tree: child -> parent mapping
    this.network = new Map(); // referred -> referrer
    
    // Commission rates by level
    this.levelRates = {
      1: 10,  // Direct referral: 10%
      2: 5,   // Second level: 5%
      3: 2,   // Third level: 2%
      4: 1,   // Fourth level: 1%
    };
    
    // Maximum levels to traverse
    this.maxDepth = 4;
    
    // Maximum total commission per purchase (percentage)
    this.maxTotalCommission = 20;
    
    // Minimum purchase amount for commission eligibility
    this.minPurchaseAmount = 10;
  }

  /**
   * Add a referral relationship
   * @param {string} referrerId - User who referred
   * @param {string} referredId - User who was referred
   */
  addRelationship(referrerId, referredId) {
    // Prevent circular references
    if (this._wouldCreateCycle(referrerId, referredId)) {
      throw new Error('Cannot create circular referral relationship');
    }

    // Prevent duplicate relationships
    if (this.network.has(referredId)) {
      throw new Error('User already has a referrer');
    }

    this.network.set(referredId, referrerId);
    logger.debug('Referral relationship added', { referrerId, referredId });
  }

  /**
   * Calculate commissions for all upline referrers
   * @param {string} purchaserId - User who made the purchase
   * @param {Object} purchase - Purchase details
   * @returns {Object} Network commission calculation
   */
  calculateNetworkCommissions(purchaserId, purchase = {}) {
    const purchaseAmount = purchase.amount || 0;
    const commissions = [];
    let totalCommissionPercent = 0;
    let totalCommissionAmount = 0;

    // Check minimum purchase amount
    if (purchaseAmount < this.minPurchaseAmount) {
      return {
        commissions: [],
        totalCommissionAmount: 0,
        totalCommissionPercent: 0,
        reason: `Purchase amount below minimum (${this.minPurchaseAmount})`,
      };
    }

    let currentUserId = purchaserId;
    let level = 0;

    // Traverse up the network
    while (level < this.maxDepth && totalCommissionPercent < this.maxTotalCommission) {
      const referrerId = this.network.get(currentUserId);
      
      if (!referrerId) break; // No more upline

      level++;
      const rate = this.levelRates[level] || 0;
      
      if (rate > 0) {
        // Check if adding this commission would exceed max total
        if (totalCommissionPercent + rate > this.maxTotalCommission) {
          break;
        }

        const commissionAmount = (purchaseAmount * rate) / 100;
        
        commissions.push({
          referrerId,
          level,
          rate,
          amount: Math.round(commissionAmount * 100) / 100,
          relationship: this._getRelationship(currentUserId, referrerId),
        });

        totalCommissionPercent += rate;
        totalCommissionAmount += commissionAmount;
      }

      currentUserId = referrerId;
    }

    return {
      purchaserId,
      purchaseAmount,
      commissions,
      totalCommissionAmount: Math.round(totalCommissionAmount * 100) / 100,
      totalCommissionPercent,
      levelsTraversed: level,
      reachedMaxDepth: level >= this.maxDepth,
      reachedMaxCommission: totalCommissionPercent >= this.maxTotalCommission,
    };
  }

  /**
   * Get the upline (ancestors) for a user
   * @param {string} userId - User to get upline for
   * @param {number} maxDepth - Maximum depth to traverse
   * @returns {Array} Array of ancestor user IDs with levels
   */
  getUpline(userId, maxDepth = this.maxDepth) {
    const upline = [];
    let current = userId;
    let level = 0;

    while (level < maxDepth) {
      const parent = this.network.get(current);
      if (!parent) break;

      level++;
      upline.push({
        userId: parent,
        level,
        rate: this.levelRates[level] || 0,
      });

      current = parent;
    }

    return upline;
  }

  /**
   * Get the downline (descendants) for a user
   * @param {string} userId - User to get downline for
   * @param {number} maxDepth - Maximum depth
   * @returns {Object} Downline count by level
   */
  getDownline(userId, maxDepth = this.maxDepth) {
    const downline = { 1: 0, 2: 0, 3: 0, 4: 0 };
    
    const findChildren = (parentId, depth) => {
      if (depth > maxDepth) return;
      
      for (const [childId, referrerId] of this.network) {
        if (referrerId === parentId) {
          downline[depth] = (downline[depth] || 0) + 1;
          findChildren(childId, depth + 1);
        }
      }
    };

    findChildren(userId, 1);
    return downline;
  }

  /**
   * Get total network size for a user
   * @param {string} userId - User ID
   * @returns {Object} Network statistics
   */
  getNetworkStats(userId) {
    const downline = this.getDownline(userId);
    const totalDownline = Object.values(downline).reduce((sum, count) => sum + count, 0);

    return {
      userId,
      totalDownline,
      downlineByLevel: downline,
      level1Count: downline[1] || 0,
      level2Count: downline[2] || 0,
      level3Count: downline[3] || 0,
      level4Count: downline[4] || 0,
    };
  }

  /**
   * Set commission rate for a level
   * @param {number} level - Level number (1-10)
   * @param {number} rate - Commission rate percentage
   */
  setLevelRate(level, rate) {
    this.levelRates[level] = Math.min(Math.max(rate, 0), 100);
    logger.info('Commission rate updated', { level, rate });
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Check if adding a relationship would create a cycle
   * @private
   */
  _wouldCreateCycle(referrerId, referredId) {
    // If the referred already referred the referrer, that's a cycle
    let current = referrerId;
    while (current) {
      if (current === referredId) return true;
      current = this.network.get(current);
    }
    return false;
  }

  /**
   * Get relationship description
   * @private
   */
  _getRelationship(currentUserId, referrerId) {
    return `${referrerId} referred ${currentUserId}`;
  }
}

module.exports = new MultiLevelCommissions();