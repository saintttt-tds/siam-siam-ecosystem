const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Wallet Model - Digital Wallet Account
 * 
 * Digital wallet for storing and managing funds. Supports multiple
 * currencies per user, transaction tracking, and balance management
 * with holds for pending transactions.
 * 
 * TABLE: wallets
 */

class Wallet extends BaseModel {
  static tableName = 'wallets';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id', 'unified_account_id',
    'wallet_number', 'wallet_type', 'wallet_status',
    'currency', 'balance', 'available_balance',
    'held_balance', 'pending_balance', 'reserved_balance',
    'total_credited', 'total_debited', 'total_fees_paid',
    'last_transaction_at', 'last_transaction_type',
    'last_transaction_amount', 'last_transaction_reference',
    'is_active', 'is_primary', 'is_default',
    'daily_limit', 'daily_used', 'daily_reset_at',
    'monthly_limit', 'monthly_used', 'monthly_reset_at',
    'per_transaction_limit', 'minimum_balance',
    'maximum_balance', 'overdraft_allowed',
    'overdraft_limit', 'overdraft_used',
    'interest_rate', 'interest_earned',
    'interest_last_calculated_at',
    'cashback_rate', 'cashback_earned',
    'loyalty_points_rate', 'loyalty_points_earned',
    'wallet_tier', 'wallet_tier_updated_at',
    'kyc_level_required', 'kyc_verified',
    'restrictions', 'allowed_operations',
    'blocked_operations', 'frozen', 'frozen_reason',
    'frozen_at', 'frozen_by', 'unfrozen_at',
    'closed_at', 'closure_reason', 'closure_notes',
    'linked_bank_account_id', 'linked_card_id',
    'auto_top_up_enabled', 'auto_top_up_threshold',
    'auto_top_up_amount', 'auto_top_up_source',
    'notification_thresholds', 'low_balance_alert',
    'low_balance_threshold', 'low_balance_alert_sent',
    'statement_day', 'last_statement_at',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    balance: 'float', available_balance: 'float',
    held_balance: 'float', pending_balance: 'float',
    reserved_balance: 'float', total_credited: 'float',
    total_debited: 'float', total_fees_paid: 'float',
    last_transaction_amount: 'float', daily_limit: 'float',
    daily_used: 'float', monthly_limit: 'float',
    monthly_used: 'float', per_transaction_limit: 'float',
    minimum_balance: 'float', maximum_balance: 'float',
    overdraft_limit: 'float', overdraft_used: 'float',
    interest_rate: 'float', interest_earned: 'float',
    cashback_rate: 'float', cashback_earned: 'float',
    loyalty_points_rate: 'float', loyalty_points_earned: 'float',
    auto_top_up_threshold: 'float', auto_top_up_amount: 'float',
    low_balance_threshold: 'float', kyc_level_required: 'integer',
    statement_day: 'integer',
    is_active: 'boolean', is_primary: 'boolean', is_default: 'boolean',
    overdraft_allowed: 'boolean', frozen: 'boolean',
    auto_top_up_enabled: 'boolean', low_balance_alert: 'boolean',
    low_balance_alert_sent: 'boolean', kyc_verified: 'boolean',
    restrictions: 'json', allowed_operations: 'json',
    blocked_operations: 'json', notification_thresholds: 'json',
    metadata: 'json', tags: 'json',
  };

  static relations = {
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
    transactions: { type: 'hasMany', model: 'WalletTransaction', foreignKey: 'wallet_id', localKey: 'id' },
  };

  static walletTypes = {
    PERSONAL: 'personal', MERCHANT: 'merchant', CORPORATE: 'corporate',
    ESCROW: 'escrow', SAVINGS: 'savings', REWARDS: 'rewards',
  };

  static walletStatuses = {
    ACTIVE: 'active', INACTIVE: 'inactive', FROZEN: 'frozen',
    CLOSED: 'closed', SUSPENDED: 'suspended', PENDING: 'pending',
  };

  static generateWalletNumber() {
    return `WAL-${Date.now().toString(36).toUpperCase()}`;
  }

  /**
   * Create a wallet for a user
   */
  static async createWallet(userId, currency = 'USD', options = {}) {
    const existing = await this.findOne({ where: { user_id: userId, currency, is_active: true } });
    if (existing) throw new Error(`Wallet for ${currency} already exists`);

    const walletCount = await this.count({ where: { user_id: userId } });

    return this.create({
      user_id: userId, unified_account_id: options.unifiedAccountId,
      wallet_number: this.generateWalletNumber(),
      wallet_type: options.walletType || this.walletTypes.PERSONAL,
      wallet_status: this.walletStatuses.ACTIVE,
      currency: currency.toUpperCase(), balance: 0, available_balance: 0,
      held_balance: 0, pending_balance: 0, reserved_balance: 0,
      is_active: true, is_primary: walletCount === 0, is_default: walletCount === 0,
      daily_limit: options.dailyLimit || 10000,
      monthly_limit: options.monthlyLimit || 50000,
      per_transaction_limit: options.perTransactionLimit || 5000,
      minimum_balance: options.minimumBalance || 0,
      maximum_balance: options.maximumBalance || 1000000,
      kyc_level_required: options.kycLevelRequired || 1,
      allowed_operations: options.allowedOperations || ['credit', 'debit', 'transfer', 'payment'],
      metadata: options.metadata || {}, tenant_id: options.tenantId,
    });
  }

  /**
   * Find wallet by user and currency
   */
  static async findByUserAndCurrency(userId, currency) {
    return this.findOne({ where: { user_id: userId, currency: currency.toUpperCase(), is_active: true } });
  }

  /**
   * Find all wallets for a user
   */
  static async findByUser(userId) {
    return this.findAll({ where: { user_id: userId, is_active: true }, orderBy: { is_primary: 'DESC', created_at: 'ASC' } });
  }

  /**
   * Credit a wallet (add funds)
   */
  static async credit(walletId, amount, metadata = {}) {
    const wallet = await this.findById(walletId);
    if (!wallet) throw new Error('Wallet not found');
    if (!wallet.is_active) throw new Error('Wallet is not active');

    const newBalance = wallet.balance + amount;
    if (wallet.maximum_balance > 0 && newBalance > wallet.maximum_balance) {
      throw new Error('Transaction would exceed maximum balance');
    }

    return this.update({ id: walletId }, {
      balance: Math.round(newBalance * 100) / 100,
      available_balance: Math.round((wallet.available_balance + amount) * 100) / 100,
      total_credited: Math.round((wallet.total_credited + amount) * 100) / 100,
      last_transaction_at: new Date().toISOString(),
      last_transaction_type: 'credit',
      last_transaction_amount: amount,
      last_transaction_reference: metadata.reference,
    });
  }

  /**
   * Debit a wallet (remove funds)
   */
  static async debit(walletId, amount, metadata = {}) {
    const wallet = await this.findById(walletId);
    if (!wallet) throw new Error('Wallet not found');
    if (!wallet.is_active) throw new Error('Wallet is not active');

    if (wallet.available_balance < amount) {
      if (wallet.overdraft_allowed && (wallet.available_balance + wallet.overdraft_limit - wallet.overdraft_used) >= amount) {
        // Allow overdraft
      } else {
        throw new Error('Insufficient funds');
      }
    }

    const newBalance = wallet.balance - amount;
    return this.update({ id: walletId }, {
      balance: Math.round(newBalance * 100) / 100,
      available_balance: Math.round((wallet.available_balance - amount) * 100) / 100,
      total_debited: Math.round((wallet.total_debited + amount) * 100) / 100,
      last_transaction_at: new Date().toISOString(),
      last_transaction_type: 'debit',
      last_transaction_amount: amount,
      last_transaction_reference: metadata.reference,
    });
  }

  /**
   * Hold funds (for pending transactions)
   */
  static async holdFunds(walletId, amount) {
    const wallet = await this.findById(walletId);
    if (!wallet) throw new Error('Wallet not found');
    if (wallet.available_balance < amount) throw new Error('Insufficient available funds');

    return this.update({ id: walletId }, {
      available_balance: Math.round((wallet.available_balance - amount) * 100) / 100,
      held_balance: Math.round((wallet.held_balance + amount) * 100) / 100,
    });
  }

  /**
   * Release held funds
   */
  static async releaseFunds(walletId, amount) {
    const wallet = await this.findById(walletId);
    if (!wallet) throw new Error('Wallet not found');

    return this.update({ id: walletId }, {
      available_balance: Math.round((wallet.available_balance + amount) * 100) / 100,
      held_balance: Math.max(0, Math.round((wallet.held_balance - amount) * 100) / 100),
    });
  }

  /**
   * Freeze a wallet
   */
  static async freeze(walletId, reason, frozenBy) {
    return this.update({ id: walletId }, {
      frozen: true, frozen_reason: reason, frozen_at: new Date().toISOString(),
      frozen_by: frozenBy, wallet_status: this.walletStatuses.FROZEN,
    });
  }

  /**
   * Get wallet balance summary for a user
   */
  static async getBalanceSummary(userId) {
    const wallets = await this.findByUser(userId);
    return wallets.map(w => ({
      walletId: w.id, currency: w.currency, balance: w.balance,
      availableBalance: w.available_balance, heldBalance: w.held_balance,
    }));
  }
}

module.exports = Wallet;