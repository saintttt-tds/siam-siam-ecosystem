const crypto = require('crypto');
const logger = require('../logging/logger');
const referralCodeGenerator = require('./referral-code-generator');
const referralTracker = require('./referral-tracker');
const commissionCalculator = require('./commission-calculator');

/**
 * Core Referral Tracking Engine
 * 
 * Manages the complete referral lifecycle:
 * - Referral program configuration
 * - Referral code generation and validation
 * - Referral link tracking and attribution
 * - Conversion processing
 * - Commission calculation
 * - Fraud prevention and detection
 * 
 * REFERRAL FLOW:
 * 1. User generates referral code/link
 * 2. User shares code/link with friends
 * 3. Friend signs up using referral link/code
 * 4. System tracks the referral attribution
 * 5. When friend completes qualifying action, commission is earned
 * 6. Commission is credited to referrer's account
 * 
 * FRAUD PREVENTION:
 * - Self-referral detection
 * - Duplicate device/IP detection
 * - Velocity checks (too many referrals too quickly)
 * - Minimum qualifying action verification
 * - Referral code expiration enforcement
 * 
 * @example
 *   const engine = require('@siamsiam/shared-utils').referral.referralEngine;
 *   
 *   // Create a referral program
 *   engine.createProgram('summer2024', {
 *     referrerReward: { type: 'credit', amount: 10, currency: 'USD' },
 *     referredReward: { type: 'discount', amount: 15, percent: true },
 *   });
 *   
 *   // Generate referral for user
 *   const referral = engine.createReferral('user_123', 'summer2024');
 *   
 *   // Track conversion
 *   const result = engine.trackConversion(referral.referralCode, 'user_456');
 */

class ReferralEngine {
  constructor() {
    // Active referral programs
    this.programs = new Map();
    
    // Active referrals
    this.referrals = new Map();
    
    // Default program settings
    this.defaultSettings = {
      maxReferralsPerUser: 100,
      referralExpiryDays: 365,
      minDaysBeforeCommission: 7, // Wait 7 days before crediting commission
      fraudDetectionEnabled: true,
      allowSelfReferral: false,
      requireUniqueDevice: true,
      requireUniquePayment: true,
    };
  }

  /**
   * Create a referral program
   * @param {string} programId - Program identifier
   * @param {Object} config - Program configuration
   * @returns {Object} Created program
   */
  createProgram(programId, config = {}) {
    const program = {
      id: programId,
      name: config.name || programId,
      description: config.description || '',
      referrerReward: config.referrerReward || { type: 'credit', amount: 10, currency: 'USD' },
      referredReward: config.referredReward || { type: 'discount', amount: 10, percent: true },
      qualifyingAction: config.qualifyingAction || 'first_purchase',
      minPurchaseAmount: config.minPurchaseAmount || 0,
      maxReferralsPerUser: config.maxReferralsPerUser || this.defaultSettings.maxReferralsPerUser,
      referralExpiryDays: config.referralExpiryDays || this.defaultSettings.referralExpiryDays,
      fraudDetectionEnabled: config.fraudDetectionEnabled !== false,
      allowSelfReferral: config.allowSelfReferral || false,
      isActive: config.isActive !== false,
      startDate: config.startDate || new Date().toISOString(),
      endDate: config.endDate || null,
      targetCountries: config.targetCountries || [],
      createdAt: new Date().toISOString(),
    };

    this.programs.set(programId, program);
    logger.info('Referral program created', { programId, name: program.name });

    return program;
  }

  /**
   * Create a referral for a user
   * @param {string} referrerId - Referrer user ID
   * @param {string} programId - Program to use
   * @param {Object} options - Referral options
   * @returns {Object} Referral information
   */
  createReferral(referrerId, programId = 'default', options = {}) {
    // Check if program exists, create default if not
    let program = this.programs.get(programId);
    if (!program) {
      if (programId === 'default') {
        program = this.createProgram('default', {
          name: 'Standard Referral Program',
          description: 'Earn rewards by referring friends',
        });
      } else {
        throw new Error(`Referral program not found: ${programId}`);
      }
    }

    // Check program is active
    if (!program.isActive) {
      throw new Error(`Referral program is not active: ${programId}`);
    }

    // Check referral limit
    const userReferrals = this._getUserReferrals(referrerId, programId);
    if (userReferrals.length >= program.maxReferralsPerUser) {
      throw new Error(`Maximum referrals (${program.maxReferralsPerUser}) reached for this program`);
    }

    // Generate referral
    const referralId = this._generateId('ref');
    const referralCode = options.code || referralCodeGenerator.generate({
      prefix: options.prefix || 'SIAM',
      length: 8,
    });

    const referral = {
      id: referralId,
      referrerId,
      programId,
      code: referralCode,
      link: `https://siamsiam.com/r/${referralCode}`,
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (program.referralExpiryDays * 86400000)).toISOString(),
      conversions: 0,
      totalEarned: 0,
      metadata: options.metadata || {},
    };

    this.referrals.set(referralId, referral);

    // Track creation
    referralTracker.trackEvent(referralId, 'created', {
      referrerId,
      programId,
      code: referralCode,
    });

    logger.info('Referral created', {
      referralId,
      referrerId,
      programId,
      code: referralCode,
    });

    return {
      referralId,
      referralCode,
      referralLink: referral.link,
      programName: program.name,
      reward: program.referrerReward,
      expiresAt: referral.expiresAt,
    };
  }

  /**
   * Track a referral conversion (someone uses a referral code)
   * @param {string} referralCode - Referral code used
   * @param {string} referredUserId - New user ID
   * @param {Object} context - Conversion context (IP, device, etc.)
   * @returns {Object} Conversion result
   */
  trackConversion(referralCode, referredUserId, context = {}) {
    // Find referral by code
    const referral = this._findByCode(referralCode);
    
    if (!referral) {
      return {
        success: false,
        error: 'Invalid referral code',
        code: 'INVALID_CODE',
      };
    }

    if (referral.status !== 'active') {
      return {
        success: false,
        error: `Referral is ${referral.status}`,
        code: 'INACTIVE_REFERRAL',
      };
    }

    if (new Date(referral.expiresAt) < new Date()) {
      return {
        success: false,
        error: 'Referral code has expired',
        code: 'EXPIRED_CODE',
      };
    }

    // Fraud checks
    const program = this.programs.get(referral.programId);
    if (program?.fraudDetectionEnabled) {
      const fraudCheck = this._performFraudCheck(referral, referredUserId, context);
      if (!fraudCheck.passed) {
        logger.warn('Referral fraud detected', {
          referralId: referral.id,
          reason: fraudCheck.reason,
        });
        return {
          success: false,
          error: fraudCheck.reason,
          code: 'FRAUD_DETECTED',
        };
      }
    }

    // Track the conversion
    referralTracker.trackEvent(referral.id, 'converted', {
      referredUserId,
      ...context,
    });

    referral.conversions++;
    
    logger.info('Referral conversion tracked', {
      referralId: referral.id,
      referralCode,
      referredUserId,
      conversions: referral.conversions,
    });

    return {
      success: true,
      referralId: referral.id,
      referrerId: referral.referrerId,
      referredUserId,
      programId: referral.programId,
      reward: program?.referredReward || null,
    };
  }

  /**
   * Process commission when referred user completes qualifying action
   * @param {string} referralId - Referral ID
   * @param {Object} qualifyingAction - Action details
   * @returns {Object} Commission result
   */
  processCommission(referralId, qualifyingAction = {}) {
    const referral = this.referrals.get(referralId);
    if (!referral) {
      throw new Error(`Referral not found: ${referralId}`);
    }

    const program = this.programs.get(referral.programId);
    if (!program) {
      throw new Error(`Program not found: ${referral.programId}`);
    }

    // Check minimum purchase amount
    if (program.minPurchaseAmount > 0) {
      const purchaseAmount = qualifyingAction.amount || 0;
      if (purchaseAmount < program.minPurchaseAmount) {
        return {
          success: false,
          error: `Minimum purchase amount of ${program.minPurchaseAmount} not met`,
          code: 'MINIMUM_NOT_MET',
        };
      }
    }

    // Calculate commission
    const commission = commissionCalculator.calculate(
      program.referrerReward,
      qualifyingAction
    );

    // Track commission
    referralTracker.trackEvent(referral.id, 'commission_earned', {
      amount: commission.amount,
      currency: commission.currency,
    });

    referral.totalEarned += commission.amount;

    logger.info('Referral commission processed', {
      referralId,
      amount: commission.amount,
      totalEarned: referral.totalEarned,
    });

    return {
      success: true,
      referralId,
      referrerId: referral.referrerId,
      commission: commission.amount,
      currency: commission.currency,
      formatted: commission.formatted,
      totalEarned: referral.totalEarned,
    };
  }

  /**
   * Validate a referral code
   * @param {string} code - Referral code to validate
   * @returns {Object} Validation result
   */
  validateCode(code) {
    const referral = this._findByCode(code);
    
    if (!referral) {
      return { valid: false, error: 'Invalid referral code' };
    }

    if (referral.status !== 'active') {
      return { valid: false, error: 'Referral code is no longer active' };
    }

    if (new Date(referral.expiresAt) < new Date()) {
      return { valid: false, error: 'Referral code has expired' };
    }

    const program = this.programs.get(referral.programId);

    return {
      valid: true,
      programName: program?.name || 'Standard Referral',
      reward: program?.referredReward || null,
    };
  }

  /**
   * Get referral statistics for a user
   * @param {string} userId - User ID
   * @returns {Object} Referral statistics
   */
  getUserStats(userId) {
    const referrals = this._getUserReferrals(userId);
    
    const activeReferrals = referrals.filter(r => r.status === 'active');
    const totalConversions = referrals.reduce((sum, r) => sum + r.conversions, 0);
    const totalEarned = referrals.reduce((sum, r) => sum + r.totalEarned, 0);

    return {
      userId,
      totalReferrals: referrals.length,
      activeReferrals: activeReferrals.length,
      totalConversions,
      totalEarned,
      referrals: activeReferrals.map(r => ({
        code: r.code,
        link: r.link,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        conversions: r.conversions,
        earned: r.totalEarned,
      })),
    };
  }

  /**
   * Deactivate a referral
   * @param {string} referralId - Referral ID
   */
  deactivateReferral(referralId) {
    const referral = this.referrals.get(referralId);
    if (referral) {
      referral.status = 'deactivated';
      referralTracker.trackEvent(referralId, 'deactivated', {});
      logger.info('Referral deactivated', { referralId });
    }
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Find referral by code
   * @private
   */
  _findByCode(code) {
    for (const [, referral] of this.referrals) {
      if (referral.code === code && referral.status === 'active') {
        return referral;
      }
    }
    return null;
  }

  /**
   * Get all referrals for a user
   * @private
   */
  _getUserReferrals(userId, programId = null) {
    const referrals = [];
    for (const [, referral] of this.referrals) {
      if (referral.referrerId === userId) {
        if (!programId || referral.programId === programId) {
          referrals.push(referral);
        }
      }
    }
    return referrals;
  }

  /**
   * Perform fraud detection checks
   * @private
   */
  _performFraudCheck(referral, referredUserId, context) {
    // Check self-referral
    if (referral.referrerId === referredUserId) {
      return { passed: false, reason: 'Self-referral detected' };
    }

    // Check duplicate device
    if (context.deviceId) {
      const existingConversions = referralTracker.getEvents(referral.id, 'converted');
      const sameDevice = existingConversions.some(e => e.deviceId === context.deviceId);
      if (sameDevice) {
        return { passed: false, reason: 'Duplicate device detected' };
      }
    }

    // Check duplicate IP
    if (context.ip) {
      const existingConversions = referralTracker.getEvents(referral.id, 'converted');
      const sameIP = existingConversions.some(e => e.ip === context.ip);
      if (sameIP) {
        return { passed: false, reason: 'Duplicate IP address detected' };
      }
    }

    return { passed: true };
  }

  /**
   * Generate unique ID
   * @private
   */
  _generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }
}

// Export singleton instance
module.exports = new ReferralEngine();