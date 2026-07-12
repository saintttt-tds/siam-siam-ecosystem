const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Deposit Model - Wallet Deposit Record
 * 
 * Records deposits into user wallets via various methods:
 * bank transfer, mobile money, cash deposit, crypto.
 * Tracks deposit lifecycle from initiation to confirmation.
 * 
 * TABLE: deposits
 * 
 * DEPOSIT LIFECYCLE:
 * 1. User initiates deposit request
 * 2. Deposit instructions generated (bank details, reference)
 * 3. User makes payment via chosen method
 * 4. System detects incoming payment (auto or manual)
 * 5. Deposit verified and confirmed
 * 6. Wallet balance updated
 */

class Deposit extends BaseModel {
  static tableName = 'deposits';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id', 'wallet_id',
    // Deposit details
    'deposit_number', 'amount', 'currency',
    'fee_amount', 'net_amount', 'exchange_rate',
    'source_currency', 'converted_amount',
    // Method
    'deposit_method', 'method_details',
    'payment_reference', 'external_reference',
    // Bank deposit specifics
    'bank_name', 'bank_account_number',
    'bank_account_name', 'bank_branch_code',
    'bank_swift_code', 'depositor_name',
    'depositor_phone', 'depositor_bank',
    // Mobile money specifics
    'mobile_wallet_provider', 'mobile_wallet_number',
    'mobile_transaction_id',
    // Cash deposit specifics
    'cash_deposit_location', 'cash_deposit_agent',
    'cash_deposit_receipt_url',
    // Crypto specifics
    'crypto_currency', 'crypto_network',
    'crypto_address', 'crypto_tx_hash',
    'crypto_confirmations', 'crypto_required_confirmations',
    // Status tracking
    'status', 'sub_status', 'status_history',
    'is_verified', 'verified_at', 'verified_by',
    'verification_method', 'verification_notes',
    // Instructions
    'deposit_instructions', 'deposit_reference',
    'instructions_sent_at', 'instructions_expiry',
    // Timing
    'initiated_at', 'payment_made_at',
    'detected_at', 'confirmed_at',
    'completed_at', 'expired_at', 'cancelled_at',
    // Limits and compliance
    'is_within_limits', 'limit_check_result',
    'aml_check_passed', 'aml_check_details',
    // Related
    'transaction_id', 'wallet_transaction_id',
    // Customer communication
    'confirmation_sent', 'confirmation_channel',
    'receipt_url', 'receipt_sent',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    amount: 'float',
    fee_amount: 'float',
    net_amount: 'float',
    exchange_rate: 'float',
    converted_amount: 'float',
    method_details: 'json',
    status_history: 'json',
    deposit_instructions: 'json',
    limit_check_result: 'json',
    aml_check_details: 'json',
    metadata: 'json',
    tags: 'json',
    is_verified: 'boolean',
    is_within_limits: 'boolean',
    aml_check_passed: 'boolean',
    confirmation_sent: 'boolean',
    receipt_sent: 'boolean',
    crypto_confirmations: 'integer',
    crypto_required_confirmations: 'integer',
  };

  static relations = {
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
    wallet: { type: 'belongsTo', model: 'Wallet', foreignKey: 'wallet_id', ownerKey: 'id' },
    transaction: { type: 'belongsTo', model: 'Transaction', foreignKey: 'transaction_id', ownerKey: 'id' },
  };

  static statuses = {
    PENDING: 'pending',
    INSTRUCTIONS_SENT: 'instructions_sent',
    PAYMENT_DETECTED: 'payment_detected',
    VERIFYING: 'verifying',
    CONFIRMED: 'confirmed',
    COMPLETED: 'completed',
    FAILED: 'failed',
    EXPIRED: 'expired',
    CANCELLED: 'cancelled',
    DISPUTED: 'disputed',
  };

  static depositMethods = {
    BANK_TRANSFER: 'bank_transfer',
    MOBILE_MONEY: 'mobile_money',
    CASH_DEPOSIT: 'cash_deposit',
    CRYPTO: 'crypto',
    CARD: 'card',
    WALLET_TRANSFER: 'wallet_transfer',
  };

  /**
   * Generate deposit number
   */
  static generateDepositNumber() {
    const timestamp = Date.now().toString(36).toUpperCase();
    return `DEP-${timestamp}`;
  }

  /**
   * Generate unique deposit reference for bank transfers
   */
  static generateDepositReference(userId) {
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `SIAM-${userId?.substring(0, 8) || 'USER'}-${random}`;
  }

  /**
   * Initiate a deposit
   */
  static async initiate(userId, walletId, amount, currency, method, options = {}) {
    const depositNumber = this.generateDepositNumber();
    const depositReference = this.generateDepositReference(userId);

    // Generate deposit instructions based on method
    const instructions = this._generateInstructions(method, {
      amount, currency, depositReference,
      bankName: options.bankName,
      bankAccountNumber: options.bankAccountNumber,
      bankAccountName: options.bankAccountName,
      expiryHours: options.expiryHours || 24,
    });

    return this.create({
      user_id: userId,
      wallet_id: walletId,
      deposit_number: depositNumber,
      amount,
      currency,
      fee_amount: options.fee || 0,
      net_amount: amount - (options.fee || 0),
      deposit_method: method,
      method_details: options.methodDetails || {},
      deposit_reference: depositReference,
      deposit_instructions: instructions,
      instructions_sent_at: new Date().toISOString(),
      instructions_expiry: new Date(Date.now() + (options.expiryHours || 24) * 3600000).toISOString(),
      status: this.statuses.INSTRUCTIONS_SENT,
      status_history: [{
        status: this.statuses.INSTRUCTIONS_SENT,
        timestamp: new Date().toISOString(),
        note: 'Deposit initiated, instructions generated',
      }],
      initiated_at: new Date().toISOString(),
      tenant_id: options.tenantId || null,
      metadata: options.metadata || {},
    });
  }

  /**
   * Detect incoming payment (auto-detection or manual confirmation)
   */
  static async detectPayment(depositId, paymentDetails = {}) {
    const deposit = await this.findById(depositId);
    if (!deposit) throw new Error('Deposit not found');

    const history = deposit.status_history || [];
    history.push({
      status: this.statuses.PAYMENT_DETECTED,
      timestamp: new Date().toISOString(),
      note: 'Payment detected',
      details: paymentDetails,
    });

    return this.update({ id: depositId }, {
      status: this.statuses.PAYMENT_DETECTED,
      status_history: history,
      payment_made_at: paymentDetails.paymentDate || new Date().toISOString(),
      detected_at: new Date().toISOString(),
      external_reference: paymentDetails.externalRef || null,
      depositor_name: paymentDetails.depositorName || null,
      depositor_phone: paymentDetails.depositorPhone || null,
      depositor_bank: paymentDetails.depositorBank || null,
      amount: paymentDetails.amount || deposit.amount,
      net_amount: paymentDetails.netAmount || deposit.net_amount,
    });
  }

  /**
   * Verify and confirm deposit
   */
  static async confirm(depositId, verifiedBy, options = {}) {
    const deposit = await this.findById(depositId);
    if (!deposit) throw new Error('Deposit not found');

    const history = deposit.status_history || [];
    history.push({
      status: this.statuses.CONFIRMED,
      timestamp: new Date().toISOString(),
      note: options.notes || 'Deposit verified and confirmed',
      verifiedBy,
    });

    history.push({
      status: this.statuses.COMPLETED,
      timestamp: new Date().toISOString(),
      note: 'Deposit completed, wallet updated',
    });

    return this.update({ id: depositId }, {
      status: this.statuses.COMPLETED,
      status_history: history,
      is_verified: true,
      verified_at: new Date().toISOString(),
      verified_by: verifiedBy,
      verification_method: options.method || 'manual',
      verification_notes: options.notes || null,
      confirmed_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
  }

  /**
   * Find deposits by user
   */
  static async findByUser(userId, options = {}) {
    return this.paginate({
      where: { user_id: userId },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Find pending deposits (awaiting confirmation)
   */
  static async findPending() {
    return this.findAll({
      where: {
        status: [this.statuses.PAYMENT_DETECTED, this.statuses.VERIFYING],
      },
      orderBy: { created_at: 'ASC' },
    });
  }

  /**
   * Find deposits by reference
   */
  static async findByReference(reference) {
    return this.findOne({
      where: { deposit_reference: reference },
    });
  }

  /**
   * Find deposits by external reference
   */
  static async findByExternalReference(externalRef) {
    return this.findOne({
      where: { external_reference: externalRef },
    });
  }

  /**
   * Cancel expired deposits
   */
  static async cancelExpired() {
    const text = `
      UPDATE ${this.tableName}
      SET status = $1,
          expired_at = NOW(),
          status_history = status_history || '[]'::jsonb || jsonb_build_array(jsonb_build_object(
            'status', $1,
            'timestamp', NOW()::text,
            'note', 'Deposit expired automatically'
          ))
      WHERE status = $2
        AND instructions_expiry < NOW()
    `;
    const result = await connectionPool.query(text, [
      this.statuses.EXPIRED,
      this.statuses.INSTRUCTIONS_SENT,
    ]);
    return result.rowCount;
  }

  /**
   * Get deposit statistics
   */
  static async getStats(options = {}) {
    const text = `
      SELECT
        COUNT(*) as total_deposits,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'pending' OR status = 'instructions_sent' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_deposited,
        SUM(fee_amount) as total_fees,
        AVG(CASE WHEN status = 'completed' THEN 
          EXTRACT(EPOCH FROM (completed_at - initiated_at)) / 60 
        END) as avg_completion_minutes
      FROM ${this.tableName}
      ${options.startDate ? 'WHERE created_at >= $1' : ''}
    `;
    const values = options.startDate ? [options.startDate.toISOString()] : [];
    const result = await connectionPool.query(text, values);
    return result.rows[0];
  }

  /**
   * Generate deposit instructions based on method
   * @private
   */
  static _generateInstructions(method, details) {
    switch (method) {
      case this.depositMethods.BANK_TRANSFER:
        return {
          method: 'Bank Transfer',
          steps: [
            'Use your banking app or visit your bank branch',
            'Transfer the exact amount shown below',
            `Use reference: ${details.depositReference}`,
            'Your deposit will be confirmed within 1-3 business hours',
          ],
          bankDetails: {
            bankName: details.bankName || 'CBZ Bank',
            accountName: details.bankAccountName || 'SiamSiam Technologies',
            accountNumber: details.bankAccountNumber || '012345678901',
            branchCode: details.bankBranchCode || '001',
            swiftCode: details.bankSwiftCode || 'COBZZWHA',
          },
          amount: details.amount,
          currency: details.currency,
          reference: details.depositReference,
          expiryHours: details.expiryHours,
        };

      case this.depositMethods.MOBILE_MONEY:
        return {
          method: 'Mobile Money',
          steps: [
            'Dial the mobile money USSD code',
            'Select Send Money',
            `Enter merchant number: ${details.merchantNumber || '0771000000'}`,
            `Enter amount: ${details.amount} ${details.currency}`,
            `Enter reference: ${details.depositReference}`,
          ],
          reference: details.depositReference,
        };

      case this.depositMethods.CASH_DEPOSIT:
        return {
          method: 'Cash Deposit',
          steps: [
            'Visit any authorized deposit location',
            'Provide your deposit reference',
            'Deposit the exact amount in cash',
            'Collect your deposit receipt',
          ],
          locations: details.locations || ['All major retail partners'],
          reference: details.depositReference,
        };

      case this.depositMethods.CRYPTO:
        return {
          method: 'Cryptocurrency',
          steps: [
            'Send the exact amount to the wallet address below',
            'Only send on the specified network',
            'Wait for network confirmations',
          ],
          walletAddress: details.cryptoAddress,
          network: details.cryptoNetwork,
          requiredConfirmations: details.requiredConfirmations || 3,
        };

      default:
        return { method: 'Standard Deposit', steps: [] };
    }
  }
}

module.exports = Deposit;