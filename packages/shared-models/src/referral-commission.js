const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Referral Commission Model - Commission Earned from Referral
 * 
 * Records individual commission earnings from referrals.
 * Supports multi-level commissions, tiered rates, bonuses,
 * and payout tracking with comprehensive financial audit trail.
 * 
 * TABLE: referral_commissions
 */

class ReferralCommission extends BaseModel {
  static tableName = 'referral_commissions';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'referral_id', 'referrer_id', 'referred_user_id',
    'commission_number', 'parent_commission_id',
    // Commission details
    'commission_type', 'commission_subtype',
    'amount', 'currency', 'exchange_rate',
    'base_amount', 'base_currency', 'converted_amount',
    'rate', 'rate_type', 'rate_source',
    // Level information
    'level', 'network_depth', 'network_path',
    'upline_commission_ids', 'downline_commission_ids',
    // Qualifying action
    'qualifying_action', 'qualifying_amount',
    'qualifying_currency', 'qualifying_date',
    'qualifying_order_id', 'qualifying_transaction_id',
    'qualifying_product_id', 'qualifying_product_name',
    // Status tracking
    'status', 'sub_status', 'status_history',
    'calculated_at', 'approved_at', 'approved_by',
    'approved_by_name', 'approval_notes',
    'rejected_at', 'rejection_reason', 'rejected_by',
    'paid_at', 'reversed_at', 'reversal_reason',
    'reversed_by', 'expires_at', 'expired_at',
    // Payout
    'payout_id', 'payout_reference', 'payout_method',
    'payout_currency', 'payout_amount', 'payout_fee',
    'payout_net_amount', 'payout_status',
    'payout_initiated_at', 'payout_completed_at',
    'payout_error', 'payout_retry_count',
    // Wallet
    'wallet_transaction_id', 'wallet_credited_at',
    // Bonus
    'is_bonus', 'bonus_type', 'bonus_description',
    'milestone_achieved', 'milestone_name',
    // Tax
    'tax_amount', 'tax_rate', 'tax_type',
    'tax_withheld', 'tax_currency', 'tax_document_url',
    // Accounting
    'accounting_period', 'accounting_status',
    'general_ledger_ref', 'cost_center', 'revenue_code',
    // Compliance
    'compliance_checked', 'compliance_status',
    'aml_checked', 'kyc_verified',
    'regulatory_reporting_ref',
    // Notifications
    'notification_sent', 'notification_date',
    'notification_channel', 'notification_status',
    // Fraud
    'fraud_checked', 'fraud_score', 'fraud_status',
    'is_suspicious', 'suspicious_reason',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    amount: 'float', exchange_rate: 'float',
    base_amount: 'float', converted_amount: 'float',
    rate: 'float', qualifying_amount: 'float',
    payout_amount: 'float', payout_fee: 'float',
    payout_net_amount: 'float', tax_amount: 'float',
    tax_rate: 'float', fraud_score: 'float',
    level: 'integer', network_depth: 'integer',
    payout_retry_count: 'integer',
    status_history: 'json', network_path: 'json',
    upline_commission_ids: 'json', downline_commission_ids: 'json',
    metadata: 'json', tags: 'json',
    tax_withheld: 'boolean', is_bonus: 'boolean',
    compliance_checked: 'boolean', aml_checked: 'boolean',
    kyc_verified: 'boolean', fraud_checked: 'boolean',
    is_suspicious: 'boolean', notification_sent: 'boolean',
  };

  static relations = {
    referral: { type: 'belongsTo', model: 'Referral', foreignKey: 'referral_id', ownerKey: 'id' },
    referrer: { type: 'belongsTo', model: 'User', foreignKey: 'referrer_id', ownerKey: 'id' },
    referredUser: { type: 'belongsTo', model: 'User', foreignKey: 'referred_user_id', ownerKey: 'id' },
  };

  static commissionTypes = {
    DIRECT_REFERRAL: 'direct_referral', INDIRECT_REFERRAL: 'indirect_referral',
    SIGNUP_BONUS: 'signup_bonus', MILESTONE_BONUS: 'milestone_bonus',
    PERFORMANCE_BONUS: 'performance_bonus', SEASONAL_BONUS: 'seasonal_bonus',
    REACTIVATION: 'reactivation', RETENTION: 'retention',
  };

  static statuses = {
    PENDING: 'pending', CALCULATED: 'calculated', APPROVED: 'approved',
    PAID: 'paid', REJECTED: 'rejected', REVERSED: 'reversed',
    EXPIRED: 'expired', ON_HOLD: 'on_hold',
  };

  static generateCommissionNumber() {
    return `COM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
  }

  /**
   * Calculate and create a commission record
   */
  static async createCommission(referralId, referrerId, referredUserId, commissionData) {
    const commissionNumber = this.generateCommissionNumber();
    const amount = commissionData.amount || 0;
    const rate = commissionData.rate || 10;

    return this.create({
      referral_id: referralId, referrer_id: referrerId,
      referred_user_id: referredUserId,
      commission_number: commissionNumber,
      commission_type: commissionData.type || this.commissionTypes.DIRECT_REFERRAL,
      commission_subtype: commissionData.subtype,
      amount: Math.round(amount * 100) / 100,
      currency: commissionData.currency || 'USD',
      rate, rate_type: commissionData.rateType || 'percentage',
      rate_source: commissionData.rateSource || 'program_default',
      level: commissionData.level || 1,
      network_depth: commissionData.networkDepth || 0,
      network_path: commissionData.networkPath || [],
      qualifying_action: commissionData.qualifyingAction || 'purchase',
      qualifying_amount: commissionData.qualifyingAmount || 0,
      qualifying_currency: commissionData.qualifyingCurrency || 'USD',
      qualifying_date: commissionData.qualifyingDate || new Date().toISOString(),
      qualifying_order_id: commissionData.qualifyingOrderId,
      qualifying_transaction_id: commissionData.qualifyingTransactionId,
      status: this.statuses.CALCULATED, calculated_at: new Date().toISOString(),
      is_bonus: commissionData.isBonus || false,
      bonus_type: commissionData.bonusType,
      bonus_description: commissionData.bonusDescription,
      milestone_achieved: commissionData.milestoneAchieved || false,
      milestone_name: commissionData.milestoneName,
      metadata: commissionData.metadata || {},
      tenant_id: commissionData.tenantId,
    });
  }

  /**
   * Approve a commission
   */
  static async approve(commissionId, approvedBy, options = {}) {
    return this.update({ id: commissionId }, {
      status: this.statuses.APPROVED, approved_at: new Date().toISOString(),
      approved_by: approvedBy, approved_by_name: options.approvedByName,
      approval_notes: options.notes,
    });
  }

  /**
   * Mark commission as paid
   */
  static async markAsPaid(commissionId, payoutId, payoutRef, options = {}) {
    return this.update({ id: commissionId }, {
      status: this.statuses.PAID, paid_at: new Date().toISOString(),
      payout_id: payoutId, payout_reference: payoutRef,
      payout_method: options.payoutMethod, payout_currency: options.payoutCurrency,
      payout_amount: options.payoutAmount, payout_fee: options.payoutFee || 0,
      payout_net_amount: options.payoutNetAmount || options.payoutAmount,
      payout_status: 'completed', payout_completed_at: new Date().toISOString(),
      wallet_transaction_id: options.walletTransactionId,
      wallet_credited_at: options.walletTransactionId ? new Date().toISOString() : null,
    });
  }

  /**
   * Reverse a commission
   */
  static async reverse(commissionId, reason, reversedBy) {
    return this.update({ id: commissionId }, {
      status: this.statuses.REVERSED, reversed_at: new Date().toISOString(),
      reversal_reason: reason, reversed_by: reversedBy,
    });
  }

  /**
   * Find commissions by referrer
   */
  static async findByReferrer(referrerId, options = {}) {
    return this.paginate({
      where: { referrer_id: referrerId },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Get total earnings for a referrer
   */
  static async getTotalEarnings(referrerId, status = null) {
    const criteria = { referrer_id: referrerId };
    if (status) criteria.status = status;

    const text = `
      SELECT
        COALESCE(SUM(amount), 0) as total_earned,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status IN ('calculated', 'approved') THEN amount ELSE 0 END), 0) as total_pending,
        COUNT(*) as total_commissions,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
        AVG(amount) as avg_commission
      FROM ${this.tableName}
      WHERE referrer_id = $1
    `;
    const result = await connectionPool.query(text, [referrerId]);
    return result.rows[0];
  }

  /**
   * Get commission summary by level
   */
  static async getSummaryByLevel(referrerId) {
    const text = `
      SELECT
        level, commission_type,
        COUNT(*) as commission_count,
        SUM(amount) as total_amount,
        AVG(amount) as avg_amount,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid_amount
      FROM ${this.tableName}
      WHERE referrer_id = $1
      GROUP BY level, commission_type
      ORDER BY level ASC, total_amount DESC
    `;
    const result = await connectionPool.query(text, [referrerId]);
    return result.rows;
  }
}

module.exports = ReferralCommission;