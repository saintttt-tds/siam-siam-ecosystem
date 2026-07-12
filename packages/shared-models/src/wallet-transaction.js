const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Wallet Transaction Model - Wallet Credit/Debit Transaction
 * 
 * Records all transactions affecting a wallet balance.
 * Each entry captures the before/after balance, transaction type,
 * reference, and full audit context.
 * 
 * TABLE: wallet_transactions
 */

class WalletTransaction extends BaseModel {
  static tableName = 'wallet_transactions';
  static primaryKey = 'id';
  static timestamps = false;
  
  static fields = [
    'id', 'wallet_id', 'user_id', 'transaction_id',
    'transaction_number', 'transaction_type', 'transaction_subtype',
    'direction', 'amount', 'currency',
    'balance_before', 'balance_after',
    'available_before', 'available_after',
    'held_before', 'held_after',
    'fee', 'fee_currency', 'fee_amount',
    'exchange_rate', 'source_currency', 'source_amount',
    'reference_type', 'reference_id', 'reference',
    'external_reference', 'description',
    'source', 'source_details', 'destination', 'destination_details',
    'status', 'sub_status', 'status_history',
    'is_reversible', 'reversal_transaction_id', 'reversed_at',
    'reversal_reason', 'reversed_by',
    'processed_at', 'completed_at', 'failed_at',
    'failure_reason', 'failure_code',
    'ip_address', 'device_id', 'user_agent',
    'location', 'country', 'city',
    'receipt_url', 'receipt_number',
    'notification_sent', 'notification_channel',
    'reconciled', 'reconciled_at', 'reconciliation_ref',
    'accounting_period', 'accounting_status',
    'metadata', 'tags', 'notes',
    'tenant_id', 'created_at',
  ];

  static casts = {
    amount: 'float', balance_before: 'float', balance_after: 'float',
    available_before: 'float', available_after: 'float',
    held_before: 'float', held_after: 'float',
    fee: 'float', fee_amount: 'float', exchange_rate: 'float',
    source_amount: 'float',
    is_reversible: 'boolean', notification_sent: 'boolean',
    reconciled: 'boolean',
    source_details: 'json', destination_details: 'json',
    status_history: 'json', metadata: 'json', tags: 'json',
  };

  static relations = {
    wallet: { type: 'belongsTo', model: 'Wallet', foreignKey: 'wallet_id', ownerKey: 'id' },
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
    transaction: { type: 'belongsTo', model: 'Transaction', foreignKey: 'transaction_id', ownerKey: 'id' },
  };

  static transactionTypes = {
    DEPOSIT: 'deposit', WITHDRAWAL: 'withdrawal', PAYMENT: 'payment',
    REFUND: 'refund', TRANSFER_IN: 'transfer_in', TRANSFER_OUT: 'transfer_out',
    COMMISSION: 'commission', FEE: 'fee', ADJUSTMENT: 'adjustment',
    INTEREST: 'interest', CASHBACK: 'cashback', LOYALTY_REDEMPTION: 'loyalty_redemption',
    CORRECTION: 'correction', CHARGEBACK: 'chargeback',
  };

  static directions = { CREDIT: 'credit', DEBIT: 'debit' };

  static generateTransactionNumber() { return `WLT-${Date.now().toString(36).toUpperCase()}`; }

  /**
   * Record a wallet transaction
   */
  static async record(walletId, userId, type, amount, direction, balanceBefore, balanceAfter, metadata = {}) {
    return this.create({
      wallet_id: walletId, user_id: userId,
      transaction_id: metadata.transactionId,
      transaction_number: this.generateTransactionNumber(),
      transaction_type: type, transaction_subtype: metadata.subtype,
      direction, amount: Math.round(amount * 100) / 100,
      currency: metadata.currency || 'USD',
      balance_before: Math.round(balanceBefore * 100) / 100,
      balance_after: Math.round(balanceAfter * 100) / 100,
      available_before: metadata.availableBefore, available_after: metadata.availableAfter,
      fee: metadata.fee || 0, fee_amount: metadata.feeAmount || 0,
      reference_type: metadata.referenceType, reference_id: metadata.referenceId,
      reference: metadata.reference, description: metadata.description?.substring(0, 500),
      source: metadata.source, source_details: metadata.sourceDetails,
      destination: metadata.destination, destination_details: metadata.destinationDetails,
      status: 'completed', completed_at: new Date().toISOString(),
      ip_address: metadata.ipAddress, device_id: metadata.deviceId,
      metadata: metadata.metadata || {}, tenant_id: metadata.tenantId,
    });
  }

  /**
   * Find transactions by wallet
   */
  static async findByWallet(walletId, options = {}) {
    return this.paginate({ where: { wallet_id: walletId }, orderBy: { created_at: 'DESC' }, ...options });
  }

  /**
   * Find transactions by user
   */
  static async findByUser(userId, options = {}) {
    return this.paginate({ where: { user_id: userId }, orderBy: { created_at: 'DESC' }, ...options });
  }

  /**
   * Get wallet transaction summary
   */
  static async getSummary(walletId, startDate = null, endDate = null) {
    const text = `
      SELECT direction, transaction_type, COUNT(*) as count,
        SUM(amount) as total_amount, SUM(fee_amount) as total_fees
      FROM ${this.tableName} WHERE wallet_id = $1
        ${startDate ? 'AND created_at >= $2' : ''}
        ${endDate ? `AND created_at <= $${startDate ? 3 : 2}` : ''}
      GROUP BY direction, transaction_type ORDER BY total_amount DESC
    `;
    const values = [walletId]; if (startDate) values.push(startDate); if (endDate) values.push(endDate);
    const result = await connectionPool.query(text, values);
    return result.rows;
  }
}

module.exports = WalletTransaction;