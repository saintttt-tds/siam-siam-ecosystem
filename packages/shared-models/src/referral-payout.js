const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Referral Payout Model - Commission Payout Record
 * 
 * Records payouts of referral commissions to referrers.
 * Batches multiple commissions into a single payout transaction
 * to optimize processing and reduce fees.
 * 
 * TABLE: referral_payouts
 */

class ReferralPayout extends BaseModel {
  static tableName = 'referral_payouts';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'referrer_id', 'payout_number',
    'payout_type', 'payout_method', 'payout_status',
    'currency', 'gross_amount', 'fee_amount',
    'net_amount', 'exchange_rate', 'payout_currency',
    'payout_amount',
    'commission_count', 'commission_ids',
    'payout_reference', 'external_reference',
    'payment_processor', 'payment_processor_ref',
    'payment_initiated_at', 'payment_completed_at',
    'payment_failed_at', 'payment_error',
    'payment_retry_count', 'max_retries',
    'bank_name', 'bank_account_last4',
    'mobile_wallet_provider', 'mobile_wallet_number_last4',
    'wallet_transaction_id',
    'minimum_payout_amount', 'payout_schedule',
    'auto_payout_enabled', 'auto_payout_threshold',
    'approved_by', 'approved_at', 'approval_notes',
    'status_history', 'notes',
    'tax_withheld', 'tax_amount', 'tax_document_url',
    'receipt_url', 'notification_sent',
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    gross_amount: 'float', fee_amount: 'float',
    net_amount: 'float', exchange_rate: 'float',
    payout_amount: 'float', tax_amount: 'float',
    minimum_payout_amount: 'float', auto_payout_threshold: 'float',
    commission_count: 'integer', payment_retry_count: 'integer',
    max_retries: 'integer',
    commission_ids: 'json', status_history: 'json',
    metadata: 'json', tags: 'json',
    auto_payout_enabled: 'boolean', tax_withheld: 'boolean',
    notification_sent: 'boolean',
  };

  static relations = {
    referrer: { type: 'belongsTo', model: 'User', foreignKey: 'referrer_id', ownerKey: 'id' },
  };

  static payoutMethods = {
    WALLET: 'wallet', BANK_TRANSFER: 'bank_transfer',
    MOBILE_MONEY: 'mobile_money', PAYPAL: 'paypal',
    CRYPTO: 'crypto',
  };

  static payoutStatuses = {
    PENDING: 'pending', PROCESSING: 'processing',
    COMPLETED: 'completed', FAILED: 'failed',
    CANCELLED: 'cancelled',
  };

  static generatePayoutNumber() {
    return `PAY-${Date.now().toString(36).toUpperCase()}`;
  }

  /**
   * Create a payout for multiple commissions
   */
  static async createPayout(referrerId, commissionIds, payoutDetails) {
    const payoutNumber = this.generatePayoutNumber();
    const grossAmount = payoutDetails.grossAmount || 0;
    const feeAmount = payoutDetails.feeAmount || 0;
    const netAmount = grossAmount - feeAmount;

    return this.create({
      referrer_id: referrerId, payout_number: payoutNumber,
      payout_type: payoutDetails.payoutType || 'standard',
      payout_method: payoutDetails.payoutMethod || this.payoutMethods.WALLET,
      payout_status: this.payoutStatuses.PENDING,
      currency: payoutDetails.currency || 'USD',
      gross_amount: Math.round(grossAmount * 100) / 100,
      fee_amount: Math.round(feeAmount * 100) / 100,
      net_amount: Math.round(netAmount * 100) / 100,
      commission_count: commissionIds.length,
      commission_ids: commissionIds,
      minimum_payout_amount: payoutDetails.minimumPayoutAmount || 10,
      auto_payout_enabled: payoutDetails.autoPayoutEnabled || false,
      auto_payout_threshold: payoutDetails.autoPayoutThreshold || 50,
      status_history: [{ status: this.payoutStatuses.PENDING, timestamp: new Date().toISOString() }],
      metadata: payoutDetails.metadata || {}, tenant_id: payoutDetails.tenantId,
    });
  }

  /**
   * Process a payout
   */
  static async processPayout(payoutId, paymentRef, options = {}) {
    return this.update({ id: payoutId }, {
      payout_status: this.payoutStatuses.COMPLETED,
      payout_reference: paymentRef, external_reference: options.externalRef,
      payment_processor: options.processor, payment_processor_ref: options.processorRef,
      payment_completed_at: new Date().toISOString(),
      bank_name: options.bankName, bank_account_last4: options.bankAccountLast4,
      mobile_wallet_provider: options.walletProvider,
      mobile_wallet_number_last4: options.walletNumberLast4,
      wallet_transaction_id: options.walletTransactionId,
      status_history: connectionPool.raw(`status_history || '[{"status": "completed", "timestamp": "${new Date().toISOString()}"}]'::jsonb`),
    });
  }

  /**
   * Find payouts by referrer
   */
  static async findByReferrer(referrerId) {
    return this.findAll({ where: { referrer_id: referrerId }, orderBy: { created_at: 'DESC' } });
  }

  /**
   * Get pending payouts above minimum threshold
   */
  static async getPendingPayouts() {
    return this.findAll({
      where: { payout_status: this.payoutStatuses.PENDING },
      orderBy: { created_at: 'ASC' },
    });
  }
}

module.exports = ReferralPayout;