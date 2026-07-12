const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * POS Offline Queue Model - Offline POS Transaction Queue
 * 
 * Queues transactions when POS device is offline.
 * Transactions are synced to the server when connectivity is restored.
 * Ensures no sales are lost during network outages.
 * 
 * TABLE: pos_offline_queue
 */

class PosOfflineQueue extends BaseModel {
  static tableName = 'pos_offline_queue';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'device_id', 'store_id', 'branch_id',
    'transaction_data', 'transaction_type',
    'transaction_number', 'transaction_date',
    'amount', 'currency', 'payment_method',
    'status', 'sync_status', 'attempts',
    'max_attempts', 'first_attempt_at',
    'last_attempt_at', 'synced_at',
    'sync_error', 'sync_error_code',
    'is_critical', 'priority',
    'local_id', 'local_timestamp',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at',
  ];

  static casts = {
    transaction_data: 'json', amount: 'float',
    attempts: 'integer', max_attempts: 'integer',
    priority: 'integer', is_critical: 'boolean',
    metadata: 'json', tags: 'json',
  };

  static statuses = { PENDING: 'pending', SYNCING: 'syncing', SYNCED: 'synced', FAILED: 'failed', CANCELLED: 'cancelled' };

  static relations = {
    device: { type: 'belongsTo', model: 'PosDevice', foreignKey: 'device_id', ownerKey: 'id' },
  };

  /**
   * Queue an offline transaction
   */
  static async queue(deviceId, storeId, branchId, transactionData) {
    return this.create({
      device_id: deviceId, store_id: storeId, branch_id: branchId,
      transaction_data: transactionData, transaction_type: transactionData.type || 'sale',
      transaction_number: transactionData.transactionNumber,
      transaction_date: transactionData.transactionDate || new Date().toISOString(),
      amount: transactionData.total || transactionData.amount,
      currency: transactionData.currency || 'USD',
      payment_method: transactionData.paymentMethod,
      status: this.statuses.PENDING, sync_status: 'pending',
      max_attempts: 10, priority: transactionData.priority || 0,
      local_id: transactionData.localId, local_timestamp: transactionData.localTimestamp || Date.now(),
      is_critical: transactionData.isCritical || false,
      metadata: transactionData.metadata || {}, tenant_id: transactionData.tenantId,
    });
  }

  /**
   * Get pending transactions for a device
   */
  static async getPending(deviceId, limit = 50) {
    return this.findAll({
      where: { device_id: deviceId, status: [this.statuses.PENDING, this.statuses.FAILED], attempts: { operator: '<', value: connectionPool.raw('max_attempts') } },
      orderBy: { priority: 'DESC', created_at: 'ASC' }, limit,
    });
  }

  /**
   * Mark transaction as synced
   */
  static async markSynced(queueId) {
    return this.update({ id: queueId }, { status: this.statuses.SYNCED, sync_status: 'synced', synced_at: new Date().toISOString() });
  }

  /**
   * Mark transaction as failed
   */
  static async markFailed(queueId, error, errorCode = null) {
    const item = await this.findById(queueId);
    const attempts = (item?.attempts || 0) + 1;
    const updates = { status: this.statuses.FAILED, sync_status: 'failed', attempts, last_attempt_at: new Date().toISOString(), sync_error: error?.substring(0, 500), sync_error_code: errorCode };
    return this.update({ id: queueId }, updates);
  }

  /**
   * Get queue statistics for a device
   */
  static async getStats(deviceId) {
    const text = `SELECT COUNT(*) as total, COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending, COUNT(CASE WHEN status = 'synced' THEN 1 END) as synced, COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed FROM ${this.tableName} WHERE device_id = $1`;
    const result = await connectionPool.query(text, [deviceId]);
    return result.rows[0];
  }

  /**
   * Cancel a queued transaction
   */
  static async cancel(queueId, reason = null) {
    return this.update({ id: queueId }, { status: this.statuses.CANCELLED, notes: reason });
  }

  /**
   * Purge old synced transactions
   */
  static async purgeSynced(daysOld = 30) {
    const result = await connectionPool.query(`DELETE FROM ${this.tableName} WHERE status = 'synced' AND synced_at < NOW() - INTERVAL '${daysOld} days'`);
    return result.rowCount;
  }
}

module.exports = PosOfflineQueue;