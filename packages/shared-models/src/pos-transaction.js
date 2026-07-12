const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * POS Transaction Model - Point of Sale Transaction Record
 * 
 * Records all POS transactions including sales, returns, voids,
 * and other till operations with full audit trail.
 * 
 * TABLE: pos_transactions
 */

class PosTransaction extends BaseModel {
  static tableName = 'pos_transactions';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'device_id', 'store_id', 'branch_id', 'merchant_id',
    'operator_id', 'operator_name', 'supervisor_id', 'supervisor_name',
    'transaction_number', 'transaction_type', 'transaction_subtype',
    'status', 'sub_status', 'status_history',
    'subtotal', 'tax', 'tax_rate', 'tax_name', 'tax_breakdown',
    'discount', 'discount_amount', 'discount_percent',
    'discount_code', 'discount_reason',
    'shipping_cost', 'handling_fee', 'total', 'currency',
    'amount_tendered', 'change_due', 'change_given',
    'payment_method', 'payment_status', 'payment_reference',
    'payment_processor', 'payment_authorization',
    'items', 'item_count', 'customer_id', 'customer_name',
    'customer_phone', 'customer_email',
    'is_synced', 'synced_at', 'synced_from',
    'is_offline', 'offline_queue_id', 'local_id',
    'fiscal_receipt_number', 'fiscal_status',
    'fiscal_transaction_id', 'fiscal_device_id',
    'receipt_number', 'receipt_url',
    'voided_transaction_id', 'void_reason',
    'voided_by', 'voided_at',
    'return_transaction_id', 'exchange_transaction_id',
    'notes', 'internal_notes',
    'operator_notes', 'customer_notes',
    'tags', 'metadata',
    'tenant_id', 'version',
    'created_at', 'updated_at',
  ];

  static casts = {
    subtotal: 'float', tax: 'float', tax_rate: 'float',
    discount: 'float', discount_amount: 'float', discount_percent: 'float',
    total: 'float', amount_tendered: 'float',
    change_due: 'float', change_given: 'float',
    items: 'json', tax_breakdown: 'json',
    status_history: 'json', metadata: 'json', tags: 'json',
    item_count: 'integer', is_synced: 'boolean', is_offline: 'boolean',
  };

  static transactionTypes = {
    SALE: 'sale', RETURN: 'return', EXCHANGE: 'exchange',
    VOID: 'void', REFUND: 'refund', QUOTE: 'quote',
    LAYAWAY: 'layaway', DEPOSIT: 'deposit', PAYOUT: 'payout',
  };

  static relations = {
    device: { type: 'belongsTo', model: 'PosDevice', foreignKey: 'device_id', ownerKey: 'id' },
    branch: { type: 'belongsTo', model: 'Branch', foreignKey: 'branch_id', ownerKey: 'id' },
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
  };

  static generateTransactionNumber() { return `POS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`; }

  /**
   * Create a POS transaction
   */
  static async createTransaction(deviceId, branchId, operatorId, transactionData) {
    return this.create({
      device_id: deviceId, branch_id: branchId,
      store_id: transactionData.storeId, merchant_id: transactionData.merchantId,
      operator_id: operatorId, operator_name: transactionData.operatorName,
      transaction_number: this.generateTransactionNumber(),
      transaction_type: transactionData.type || this.transactionTypes.SALE,
      status: 'completed', status_history: [{ status: 'completed', timestamp: new Date().toISOString() }],
      subtotal: transactionData.subtotal, tax: transactionData.tax,
      tax_rate: transactionData.taxRate, tax_name: transactionData.taxName || 'VAT',
      discount: transactionData.discount || 0, discount_amount: transactionData.discountAmount || 0,
      total: transactionData.total, currency: transactionData.currency || 'USD',
      amount_tendered: transactionData.amountTendered, change_due: transactionData.changeDue,
      payment_method: transactionData.paymentMethod, payment_status: 'paid',
      items: transactionData.items, item_count: transactionData.items?.length || 0,
      customer_id: transactionData.customerId, customer_name: transactionData.customerName,
      is_offline: transactionData.isOffline || false,
      receipt_number: transactionData.receiptNumber,
      metadata: transactionData.metadata || {}, tenant_id: transactionData.tenantId,
    });
  }

  /**
   * Find transactions by branch
   */
  static async findByBranch(branchId, options = {}) {
    return this.paginate({ where: { branch_id: branchId }, orderBy: { created_at: 'DESC' }, ...options });
  }

  /**
   * Find transactions by device
   */
  static async findByDevice(deviceId, options = {}) {
    return this.paginate({ where: { device_id: deviceId }, orderBy: { created_at: 'DESC' }, ...options });
  }

  /**
   * Void a transaction
   */
  static async voidTransaction(transactionId, reason, voidedBy) {
    const txn = await this.findById(transactionId);
    if (!txn) throw new Error('Transaction not found');
    if (txn.transaction_type === this.transactionTypes.VOID) throw new Error('Transaction already voided');

    // Create void transaction
    const voidTxn = await this.create({
      device_id: txn.device_id, branch_id: txn.branch_id, store_id: txn.store_id,
      merchant_id: txn.merchant_id, operator_id: txn.operator_id,
      transaction_number: this.generateTransactionNumber(),
      transaction_type: this.transactionTypes.VOID,
      status: 'completed', voided_transaction_id: transactionId,
      void_reason: reason, voided_by: voidedBy, voided_at: new Date().toISOString(),
      subtotal: -txn.subtotal, tax: -txn.tax, total: -txn.total,
      currency: txn.currency, items: txn.items, item_count: txn.item_count,
      fiscal_status: 'pending', is_synced: false,
      tenant_id: txn.tenant_id,
    });

    // Update original transaction
    await this.update({ id: transactionId }, { status: 'voided', voided_transaction_id: voidTxn.id });

    return voidTxn;
  }

  /**
   * Get daily sales summary
   */
  static async getDailySummary(branchId, date = new Date()) {
    const text = `SELECT COUNT(*) as transaction_count, SUM(CASE WHEN transaction_type = 'sale' THEN total ELSE 0 END) as total_sales, SUM(CASE WHEN transaction_type = 'return' THEN ABS(total) ELSE 0 END) as total_returns, SUM(tax) as total_tax, SUM(discount_amount) as total_discounts, COUNT(DISTINCT operator_id) as active_operators, AVG(total) as average_sale FROM ${this.tableName} WHERE branch_id = $1 AND DATE(created_at) = $2 AND status != 'voided' AND transaction_type IN ('sale', 'return')`;
    const result = await connectionPool.query(text, [branchId, date.toISOString().split('T')[0]]);
    return result.rows[0];
  }

  /**
   * Sync offline transactions
   */
  static async syncOffline(transactions) {
    const synced = [];
    for (const txn of transactions) {
      const record = await this.create({ ...txn, is_synced: true, synced_at: new Date().toISOString(), is_offline: false });
      synced.push(record.id);
    }
    return synced;
  }
}

module.exports = PosTransaction;