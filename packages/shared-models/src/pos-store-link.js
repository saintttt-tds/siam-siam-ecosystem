const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * POS Store Link Model - POS to Online Store Link
 * 
 * Links a physical POS system/store to the online marketplace.
 * Enables unified inventory, order synchronization, and cross-channel
 * operations between brick-and-mortar and online stores.
 * 
 * TABLE: pos_store_links
 * 
 * SYNCHRONIZATION MODES:
 * - real_time: Instant sync between POS and online
 * - interval: Sync at defined intervals (e.g., every 5 minutes)
 * - manual: Sync triggered manually by store staff
 * - scheduled: Sync at specific times of day
 */

class PosStoreLink extends BaseModel {
  static tableName = 'pos_store_links';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'merchant_id', 'store_id', 'branch_id',
    'online_store_id', 'pos_device_id',
    'link_name', 'link_type', 'sync_mode',
    'sync_direction', 'sync_interval_minutes',
    'sync_schedule', 'last_sync_at', 'last_sync_status',
    'last_sync_error', 'last_sync_duration_ms',
    'products_synced_count', 'orders_synced_count',
    'inventory_synced_count', 'customers_synced_count',
    'sync_inventory', 'sync_orders', 'sync_customers',
    'sync_products', 'sync_pricing', 'sync_promotions',
    'inventory_sync_mode', 'inventory_buffer_percent',
    'price_sync_mode', 'price_override_allowed',
    'order_routing_mode', 'auto_accept_orders',
    'auto_accept_threshold', 'max_concurrent_orders',
    'is_active', 'is_paused', 'paused_reason',
    'paused_at', 'paused_by', 'resumed_at',
    'error_count', 'consecutive_errors',
    'max_consecutive_errors', 'error_action',
    'last_error_at', 'last_error_message',
    'health_check_at', 'health_status',
    'created_by', 'approved_by', 'approved_at',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at',
  ];

  static casts = {
    sync_schedule: 'json',
    sync_inventory: 'boolean', sync_orders: 'boolean',
    sync_customers: 'boolean', sync_products: 'boolean',
    sync_pricing: 'boolean', sync_promotions: 'boolean',
    price_override_allowed: 'boolean', auto_accept_orders: 'boolean',
    is_active: 'boolean', is_paused: 'boolean',
    inventory_buffer_percent: 'float',
    auto_accept_threshold: 'float',
    max_concurrent_orders: 'integer',
    sync_interval_minutes: 'integer',
    products_synced_count: 'integer', orders_synced_count: 'integer',
    inventory_synced_count: 'integer', customers_synced_count: 'integer',
    last_sync_duration_ms: 'integer',
    error_count: 'integer', consecutive_errors: 'integer',
    max_consecutive_errors: 'integer',
    metadata: 'json', tags: 'json',
  };

  static relations = {
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
    branch: { type: 'belongsTo', model: 'Branch', foreignKey: 'branch_id', ownerKey: 'id' },
  };

  static syncModes = { REAL_TIME: 'real_time', INTERVAL: 'interval', MANUAL: 'manual', SCHEDULED: 'scheduled' };
  static syncDirections = { BIDIRECTIONAL: 'bidirectional', POS_TO_ONLINE: 'pos_to_online', ONLINE_TO_POS: 'online_to_pos' };

  /**
   * Create a POS-to-store link
   */
  static async createLink(merchantId, branchId, onlineStoreId, config = {}) {
    const existing = await this.findOne({ where: { branch_id: branchId, is_active: true } });
    if (existing) throw new Error('Branch is already linked to an online store');

    return this.create({
      merchant_id: merchantId, branch_id: branchId,
      online_store_id: onlineStoreId, store_id: config.storeId,
      pos_device_id: config.posDeviceId,
      link_name: config.linkName || `Link-${Date.now()}`,
      link_type: config.linkType || 'standard',
      sync_mode: config.syncMode || this.syncModes.REAL_TIME,
      sync_direction: config.syncDirection || this.syncDirections.BIDIRECTIONAL,
      sync_interval_minutes: config.syncIntervalMinutes || 5,
      sync_inventory: config.syncInventory !== false,
      sync_orders: config.syncOrders !== false,
      sync_customers: config.syncCustomers || false,
      sync_products: config.syncProducts !== false,
      sync_pricing: config.syncPricing !== false,
      inventory_sync_mode: config.inventorySyncMode || 'deduct_on_sale',
      inventory_buffer_percent: config.inventoryBufferPercent || 5,
      auto_accept_orders: config.autoAcceptOrders !== false,
      max_concurrent_orders: config.maxConcurrentOrders || 10,
      is_active: true, health_status: 'healthy',
      max_consecutive_errors: config.maxConsecutiveErrors || 5,
      error_action: config.errorAction || 'pause',
      metadata: config.metadata || {}, tenant_id: config.tenantId,
    });
  }

  /**
   * Find active links for a merchant
   */
  static async findByMerchant(merchantId) {
    return this.findAll({ where: { merchant_id: merchantId, is_active: true } });
  }

  /**
   * Find link by branch
   */
  static async findByBranch(branchId) {
    return this.findOne({ where: { branch_id: branchId, is_active: true } });
  }

  /**
   * Record successful sync
   */
  static async recordSync(linkId, stats = {}) {
    const updates = {
      last_sync_at: new Date().toISOString(),
      last_sync_status: 'success',
      last_sync_error: null,
      last_sync_duration_ms: stats.durationMs || 0,
      consecutive_errors: 0,
      health_status: 'healthy',
    };
    if (stats.productsSynced) updates.products_synced_count = connectionPool.raw(`products_synced_count + ${stats.productsSynced}`);
    if (stats.ordersSynced) updates.orders_synced_count = connectionPool.raw(`orders_synced_count + ${stats.ordersSynced}`);
    if (stats.inventorySynced) updates.inventory_synced_count = connectionPool.raw(`inventory_synced_count + ${stats.inventorySynced}`);
    return this.update({ id: linkId }, updates);
  }

  /**
   * Record sync error
   */
  static async recordError(linkId, error) {
    const link = await this.findById(linkId);
    const consecutive = (link?.consecutive_errors || 0) + 1;
    const updates = {
      last_sync_at: new Date().toISOString(),
      last_sync_status: 'error',
      last_sync_error: error?.substring(0, 500),
      last_error_at: new Date().toISOString(),
      last_error_message: error?.substring(0, 500),
      error_count: connectionPool.raw('error_count + 1'),
      consecutive_errors: consecutive,
    };

    if (consecutive >= (link?.max_consecutive_errors || 5)) {
      updates.is_paused = true;
      updates.paused_reason = `Exceeded maximum consecutive errors (${link.max_consecutive_errors})`;
      updates.paused_at = new Date().toISOString();
      updates.health_status = 'error';
      logger.warn('POS link paused due to consecutive errors', { linkId, consecutive });
    }

    return this.update({ id: linkId }, updates);
  }

  /**
   * Pause synchronization
   */
  static async pause(linkId, reason, pausedBy) {
    return this.update({ id: linkId }, {
      is_paused: true, paused_reason: reason,
      paused_at: new Date().toISOString(), paused_by: pausedBy,
    });
  }

  /**
   * Resume synchronization
   */
  static async resume(linkId) {
    return this.update({ id: linkId }, {
      is_paused: false, paused_reason: null,
      resumed_at: new Date().toISOString(),
      consecutive_errors: 0, health_status: 'healthy',
    });
  }
}

module.exports = PosStoreLink;