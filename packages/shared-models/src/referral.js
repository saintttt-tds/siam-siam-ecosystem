const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Referral Model - Referral Record
 * 
 * Core referral tracking entity. Records the relationship between
 * referrer and referred user, tracks conversion status, commission
 * earnings, and referral program participation.
 * 
 * TABLE: referrals
 * 
 * REFERRAL LIFECYCLE:
 * 1. Referrer generates and shares referral code/link
 * 2. Referred user signs up using referral code
 * 3. Referred user completes qualifying action (purchase, etc.)
 * 4. Referral is marked as converted
 * 5. Commission is calculated and credited
 * 6. Commission is paid out to referrer
 */

class Referral extends BaseModel {
  static tableName = 'referrals';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'referrer_id', 'referred_user_id',
    'program_id', 'tier_id', 'campaign_id',
    // Referral codes
    'referral_code', 'referral_link', 'referral_source',
    'referral_medium', 'referral_campaign',
    'referral_content', 'referral_term',
    'utm_source', 'utm_medium', 'utm_campaign',
    // Referred user info
    'referred_email', 'referred_phone', 'referred_name',
    'referred_ip', 'referred_device', 'referred_country',
    'referred_city', 'referred_platform',
    // Status tracking
    'status', 'sub_status', 'status_history',
    'clicked_at', 'signed_up_at', 'converted_at',
    'qualified_at', 'commission_calculated_at',
    'commission_paid_at', 'expires_at', 'expired_at',
    'fraud_checked_at', 'fraud_status',
    // Conversion details
    'conversion_type', 'conversion_value',
    'conversion_currency', 'conversion_order_id',
    'conversion_transaction_id', 'qualifying_action',
    'qualifying_amount', 'qualifying_date',
    // Commission
    'commission_amount', 'commission_currency',
    'commission_rate', 'commission_type',
    'commission_status', 'commission_tier_level',
    'total_commission_earned', 'commission_payout_id',
    // Multi-level tracking
    'level', 'parent_referral_id', 'root_referrer_id',
    'network_depth', 'network_path',
    // Fraud prevention
    'fraud_score', 'fraud_checks_passed',
    'fraud_check_details', 'is_suspicious',
    'suspicious_reason', 'is_self_referral',
    'duplicate_check_passed', 'ip_match_checked',
    'device_match_checked',
    // Attribution
    'attribution_model', 'first_touch', 'last_touch',
    'attribution_percent', 'shared_attribution',
    // A/B Testing
    'experiment_id', 'variant', 'control_group',
    // Notifications
    'referrer_notified', 'referrer_notified_at',
    'referred_notified', 'referred_notified_at',
    'commission_notified', 'commission_notified_at',
    // Expiry and cleanup
    'cookie_expires_at', 'session_id',
    'landing_page', 'referrer_page',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    conversion_value: 'float', qualifying_amount: 'float',
    commission_amount: 'float', commission_rate: 'float',
    total_commission_earned: 'float', fraud_score: 'float',
    attribution_percent: 'float', level: 'integer',
    network_depth: 'integer', network_path: 'json',
    status_history: 'json', fraud_check_details: 'json',
    shared_attribution: 'json', metadata: 'json', tags: 'json',
    clicked_at: 'datetime', signed_up_at: 'datetime',
    converted_at: 'datetime', qualified_at: 'datetime',
    commission_calculated_at: 'datetime', commission_paid_at: 'datetime',
    fraud_checked_at: 'datetime', referrer_notified: 'boolean',
    referred_notified: 'boolean', commission_notified: 'boolean',
    fraud_checks_passed: 'boolean', is_suspicious: 'boolean',
    is_self_referral: 'boolean', duplicate_check_passed: 'boolean',
    ip_match_checked: 'boolean', device_match_checked: 'boolean',
    first_touch: 'boolean', last_touch: 'boolean',
  };

  static relations = {
    referrer: { type: 'belongsTo', model: 'User', foreignKey: 'referrer_id', ownerKey: 'id' },
    referredUser: { type: 'belongsTo', model: 'User', foreignKey: 'referred_user_id', ownerKey: 'id' },
    commissions: { type: 'hasMany', model: 'ReferralCommission', foreignKey: 'referral_id', localKey: 'id' },
    children: { type: 'hasMany', model: 'Referral', foreignKey: 'parent_referral_id', localKey: 'id' },
  };

  static statuses = {
    PENDING: 'pending', CLICKED: 'clicked', SIGNED_UP: 'signed_up',
    QUALIFIED: 'qualified', CONVERTED: 'converted',
    COMMISSION_CALCULATED: 'commission_calculated',
    COMMISSION_PAID: 'commission_paid', EXPIRED: 'expired',
    FRAUD_DETECTED: 'fraud_detected', CANCELLED: 'cancelled',
    REVERSED: 'reversed',
  };

  static commissionStatuses = {
    PENDING: 'pending', CALCULATED: 'calculated',
    APPROVED: 'approved', PAID: 'paid', REVERSED: 'reversed',
  };

  static attributionModels = {
    FIRST_TOUCH: 'first_touch', LAST_TOUCH: 'last_touch',
    LINEAR: 'linear', TIME_DECAY: 'time_decay',
    POSITION_BASED: 'position_based',
  };

  /**
   * Track a referral click
   */
  static async trackClick(referralCode, referrerId, clickData) {
    const referral = await this.findOne({
      where: { referral_code: referralCode, referrer_id: referrerId, status: this.statuses.PENDING },
    });

    if (referral) {
      // Update existing
      return this.update({ id: referral.id }, {
        status: this.statuses.CLICKED, clicked_at: new Date().toISOString(),
        referred_ip: clickData.ip, referred_device: clickData.device,
        referred_country: clickData.country, referred_city: clickData.city,
        session_id: clickData.sessionId, landing_page: clickData.landingPage,
        referrer_page: clickData.referrerPage, cookie_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        referral_medium: clickData.medium, referral_source: clickData.source,
        referral_campaign: clickData.campaign, utm_source: clickData.utmSource,
        utm_medium: clickData.utmMedium, utm_campaign: clickData.utmCampaign,
      });
    }

    // Create new referral record from click
    return this.create({
      referral_code: referralCode, referrer_id: referrerId,
      status: this.statuses.CLICKED, clicked_at: new Date().toISOString(),
      referred_ip: clickData.ip, referred_device: clickData.device,
      referred_country: clickData.country, referred_city: clickData.city,
      session_id: clickData.sessionId, landing_page: clickData.landingPage,
      referrer_page: clickData.referrerPage, cookie_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      referral_medium: clickData.medium, referral_source: clickData.source,
      referral_campaign: clickData.campaign, utm_source: clickData.utmSource,
      utm_medium: clickData.utmMedium, utm_campaign: clickData.utmCampaign,
      first_touch: true, attribution_model: this.attributionModels.FIRST_TOUCH,
      expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
      metadata: clickData.metadata || {}, tenant_id: clickData.tenantId,
    });
  }

  /**
   * Record referral sign-up
   */
  static async recordSignUp(referralCode, referredUserId, signUpData = {}) {
    const referral = await this.findOne({
      where: { referral_code: referralCode, status: [this.statuses.PENDING, this.statuses.CLICKED] },
      orderBy: { created_at: 'DESC' },
    });

    if (!referral) return null;

    // Fraud check: self-referral
    if (referral.referrer_id === referredUserId) {
      return this.update({ id: referral.id }, {
        status: this.statuses.FRAUD_DETECTED, is_suspicious: true,
        suspicious_reason: 'Self-referral detected', is_self_referral: true,
        fraud_score: 100, fraud_checked_at: new Date().toISOString(),
      });
    }

    return this.update({ id: referral.id }, {
      referred_user_id: referredUserId, status: this.statuses.SIGNED_UP,
      signed_up_at: new Date().toISOString(),
      referred_email: signUpData.email, referred_phone: signUpData.phone,
      referred_name: signUpData.name, referred_platform: signUpData.platform,
      referred_country: signUpData.country || referral.referred_country,
      fraud_score: 0, fraud_checks_passed: true,
    });
  }

  /**
   * Record referral conversion (qualifying action completed)
   */
  static async recordConversion(referralCode, conversionData) {
    const referral = await this.findOne({
      where: { referral_code: referralCode, status: this.statuses.SIGNED_UP },
    });
    if (!referral) return null;

    const qualifyingAmount = conversionData.orderAmount || conversionData.amount || 0;

    return this.update({ id: referral.id }, {
      status: this.statuses.CONVERTED, converted_at: new Date().toISOString(),
      qualified_at: new Date().toISOString(),
      conversion_type: conversionData.conversionType || 'purchase',
      conversion_value: qualifyingAmount, conversion_currency: conversionData.currency || 'USD',
      conversion_order_id: conversionData.orderId,
      conversion_transaction_id: conversionData.transactionId,
      qualifying_action: conversionData.action || 'first_purchase',
      qualifying_amount: qualifyingAmount, qualifying_date: new Date().toISOString(),
    });
  }

  /**
   * Calculate and record commission
   */
  static async calculateCommission(referralId, commissionRate, commissionAmount, options = {}) {
    return this.update({ id: referralId }, {
      status: this.statuses.COMMISSION_CALCULATED,
      commission_amount: Math.round(commissionAmount * 100) / 100,
      commission_currency: options.currency || 'USD',
      commission_rate: commissionRate, commission_type: options.type || 'percentage',
      commission_status: this.commissionStatuses.CALCULATED,
      commission_tier_level: options.tierLevel || 1,
      total_commission_earned: commissionAmount,
      commission_calculated_at: new Date().toISOString(),
    });
  }

  /**
   * Mark commission as paid
   */
  static async markCommissionPaid(referralId, payoutId) {
    return this.update({ id: referralId }, {
      status: this.statuses.COMMISSION_PAID,
      commission_status: this.commissionStatuses.PAID,
      commission_paid_at: new Date().toISOString(),
      commission_payout_id: payoutId,
    });
  }

  /**
   * Find referrals by referrer
   */
  static async findByReferrer(referrerId, options = {}) {
    return this.paginate({
      where: { referrer_id: referrerId },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Find referral by code
   */
  static async findByCode(referralCode) {
    return this.findOne({ where: { referral_code: referralCode }, orderBy: { created_at: 'DESC' } });
  }

  /**
   * Get referral stats for a user
   */
  static async getStats(userId) {
    const text = `
      SELECT
        COUNT(*) as total_referrals,
        COUNT(CASE WHEN status = 'converted' THEN 1 END) as successful_referrals,
        COUNT(CASE WHEN status = 'commission_paid' THEN 1 END) as paid_referrals,
        COUNT(CASE WHEN status = 'signed_up' THEN 1 END) as pending_referrals,
        COALESCE(SUM(commission_amount), 0) as total_earned,
        COALESCE(SUM(CASE WHEN commission_status = 'paid' THEN commission_amount ELSE 0 END), 0) as total_paid,
        AVG(CASE WHEN status IN ('converted', 'commission_calculated', 'commission_paid') THEN commission_amount ELSE NULL END) as avg_commission
      FROM ${this.tableName}
      WHERE referrer_id = $1 AND status NOT IN ('fraud_detected', 'cancelled', 'reversed')
    `;
    const result = await connectionPool.query(text, [userId]);
    return result.rows[0];
  }

  /**
   * Generate unique referral code for a user
   */
  static async generateReferralCode(userId) {
    const prefix = 'SIAM';
    let code;
    let attempts = 0;
    do {
      const random = crypto.randomBytes(4).toString('hex').toUpperCase();
      code = `${prefix}${random}`;
      const existing = await this.findOne({ where: { referral_code: code } });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) throw new Error('Failed to generate unique referral code');
    return code;
  }

  /**
   * Check for referral fraud
   */
  static async checkFraud(referralId) {
    const referral = await this.findById(referralId);
    if (!referral) return { passed: false, reason: 'Referral not found' };

    const checks = [];
    let fraudScore = 0;

    // Check self-referral
    if (referral.referrer_id === referral.referred_user_id) {
      checks.push({ check: 'self_referral', passed: false, reason: 'Self-referral detected' });
      fraudScore += 100;
    }

    // Check IP match
    if (referral.ip_match_checked && referral.referred_ip) {
      const otherReferrals = await this.findAll({
        where: { referred_ip: referral.referred_ip, referrer_id: { operator: '!=', value: referral.referrer_id } },
      });
      if (otherReferrals.length > 5) {
        checks.push({ check: 'ip_abuse', passed: false, reason: 'Too many referrals from same IP' });
        fraudScore += 30;
      }
    }

    return {
      passed: fraudScore < 50,
      fraudScore,
      checks,
      recommendation: fraudScore >= 100 ? 'block' : fraudScore >= 50 ? 'review' : 'allow',
    };
  }
}

module.exports = Referral;