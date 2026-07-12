const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Store Network Model - Multi-Branch Store Network
 * 
 * Manages store networks where a single merchant operates
 * multiple branches/locations under one entity.
 * 
 * TABLE: store_networks
 */

class StoreNetwork extends BaseModel {
  static tableName = 'store_networks';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'merchant_id', 'network_name', 'network_slug',
    'network_type', 'description', 'logo_url',
    'headquarters_branch_id', 'primary_branch_id',
    'total_branches', 'active_branches',
    'total_staff', 'total_products', 'total_orders',
    'total_revenue', 'currency',
    'country', 'region', 'coverage_area',
    'is_active', 'is_verified', 'verified_at',
    'settings', 'network_policies',
    'inventory_sharing', 'inventory_sharing_mode',
    'order_routing', 'order_routing_mode',
    'staff_sharing', 'staff_sharing_mode',
    'pricing_strategy', 'pricing_unification',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    total_branches: 'integer', active_branches: 'integer',
    total_staff: 'integer', total_products: 'integer',
    total_orders: 'integer', total_revenue: 'float',
    is_active: 'boolean', is_verified: 'boolean',
    inventory_sharing: 'boolean', staff_sharing: 'boolean',
    settings: 'json', network_policies: 'json',
    coverage_area: 'json', metadata: 'json', tags: 'json',
  };

  static relations = {
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
    branches: { type: 'hasMany', model: 'Branch', foreignKey: 'store_id', localKey: 'id' },
  };

  static networkTypes = {
    CHAIN: 'chain', FRANCHISE: 'franchise', COOPERATIVE: 'cooperative',
    MARKETPLACE: 'marketplace', SINGLE: 'single',
  };

  /**
   * Create a store network
   */
  static async createNetwork(merchantId, networkData) {
    return this.create({
      merchant_id: merchantId, network_name: networkData.networkName,
      network_slug: networkData.networkSlug || networkData.networkName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      network_type: networkData.networkType || this.networkTypes.CHAIN,
      description: networkData.description?.substring(0, 1000),
      logo_url: networkData.logoUrl, country: networkData.country,
      region: networkData.region, coverage_area: networkData.coverageArea || [],
      is_active: true, settings: networkData.settings || {},
      network_policies: networkData.networkPolicies || {},
      inventory_sharing: networkData.inventorySharing || false,
      inventory_sharing_mode: networkData.inventorySharingMode || 'none',
      order_routing: networkData.orderRouting || 'nearest',
      order_routing_mode: networkData.orderRoutingMode || 'auto',
      staff_sharing: networkData.staffSharing || false,
      pricing_strategy: networkData.pricingStrategy || 'unified',
      pricing_unification: networkData.pricingUnification !== false,
      metadata: networkData.metadata || {}, tenant_id: networkData.tenantId,
    });
  }

  /**
   * Find network by merchant
   */
  static async findByMerchant(merchantId) {
    return this.findOne({ where: { merchant_id: merchantId, is_active: true } });
  }

  /**
   * Update network statistics
   */
  static async updateStats(networkId) {
    const text = `
      SELECT
        COUNT(*) as branch_count,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_count
      FROM branches WHERE store_id = $1
    `;
    const result = await connectionPool.query(text, [networkId]);
    const stats = result.rows[0];
    if (stats) {
      await this.update({ id: networkId }, { total_branches: parseInt(stats.branch_count), active_branches: parseInt(stats.active_count) });
    }
  }
}

module.exports = StoreNetwork;