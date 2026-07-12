const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Branch Model - Store Branch Location
 * 
 * Represents a physical store branch for merchants with multiple locations.
 * Each branch can have its own inventory, POS devices, and operating hours.
 * 
 * TABLE: branches
 */

class Branch extends BaseModel {
  static tableName = 'branches';
  static primaryKey = 'id';
  static softDelete = true;
  
  static fields = [
    'id', 'merchant_id', 'store_id',
    // Branch info
    'name', 'code', 'branch_type',
    'description', 'is_headquarters', 'is_active',
    // Contact
    'phone', 'email', 'website',
    'manager_name', 'manager_phone', 'manager_email',
    // Address
    'address_line1', 'address_line2', 'address_line3',
    'city', 'state', 'postal_code', 'country',
    'lat', 'lon', 'geocoded_at',
    // Operating hours
    'operating_hours', 'timezone',
    'is_24_hours', 'is_weekend_open',
    // Facilities
    'facilities', 'parking_available',
    'wheelchair_accessible', 'has_pickup_point',
    'has_pos', 'pos_device_count',
    // Inventory
    'inventory_sync_enabled', 'last_inventory_sync_at',
    // Delivery
    'delivery_enabled', 'delivery_zone_id',
    'pickup_enabled', 'max_pickup_radius_km',
    // Orders
    'order_handling_capacity', 'current_order_count',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
    'deleted_at', 'deleted_by',
  ];

  static casts = {
    operating_hours: 'json',
    facilities: 'json',
    metadata: 'json',
    tags: 'json',
    is_headquarters: 'boolean',
    is_active: 'boolean',
    is_24_hours: 'boolean',
    is_weekend_open: 'boolean',
    parking_available: 'boolean',
    wheelchair_accessible: 'boolean',
    has_pickup_point: 'boolean',
    has_pos: 'boolean',
    inventory_sync_enabled: 'boolean',
    delivery_enabled: 'boolean',
    pickup_enabled: 'boolean',
    lat: 'float',
    lon: 'float',
    max_pickup_radius_km: 'float',
    order_handling_capacity: 'integer',
    current_order_count: 'integer',
    pos_device_count: 'integer',
  };

  static relations = {
    merchant: { type: 'belongsTo', model: 'Merchant', foreignKey: 'merchant_id', ownerKey: 'id' },
  };

  static branchTypes = {
    RETAIL_STORE: 'retail_store', WAREHOUSE: 'warehouse',
    PICKUP_POINT: 'pickup_point', OFFICE: 'office',
    POPUP: 'popup', MOBILE: 'mobile',
  };

  /**
   * Find branches by merchant
   */
  static async findByMerchant(merchantId) {
    return this.findAll({
      where: { merchant_id: merchantId, is_active: true },
      orderBy: { is_headquarters: 'DESC', name: 'ASC' },
    });
  }

  /**
   * Find branches near a location
   */
  static async findNearby(lat, lon, radiusKm = 20, options = {}) {
    const text = `
      SELECT *,
        (6371 * acos(
          cos(radians($1)) * cos(radians(lat))
          * cos(radians(lon) - radians($2))
          + sin(radians($1)) * sin(radians(lat))
        )) AS distance_km
      FROM ${this.tableName}
      WHERE is_active = true
        AND lat IS NOT NULL AND lon IS NOT NULL
        ${options.merchantId ? 'AND merchant_id = $4' : ''}
        ${options.branchType ? 'AND branch_type = $5' : ''}
      HAVING distance_km <= $3
      ORDER BY distance_km ASC
      LIMIT ${options.limit || 20}
    `;

    const values = [lat, lon, radiusKm];
    if (options.merchantId) values.push(options.merchantId);
    if (options.branchType) values.push(options.branchType);

    const result = await connectionPool.query(text, values);
    return result.rows;
  }

  /**
   * Check if branch is currently open
   */
  isCurrentlyOpen() {
    if (!this.operating_hours) return false;
    if (this.is_24_hours) return true;

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sunday
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const todayHours = this.operating_hours[dayOfWeek];
    if (!todayHours || todayHours.closed) return false;

    for (const slot of todayHours.slots || []) {
      const [openH, openM] = (slot.open || '00:00').split(':').map(Number);
      const [closeH, closeM] = (slot.close || '00:00').split(':').map(Number);
      const openMinutes = openH * 60 + openM;
      const closeMinutes = closeH * 60 + closeM;

      if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
        return true;
      }
    }

    return false;
  }

  /**
   * Update current order count
   */
  static async updateOrderCount(branchId, delta = 1) {
    await connectionPool.query(
      `UPDATE ${this.tableName}
       SET current_order_count = GREATEST(0, current_order_count + $2),
           updated_at = NOW()
       WHERE id = $1`,
      [branchId, delta]
    );
  }

  /**
   * Check if branch can accept more orders
   */
  static async canAcceptOrders(branchId) {
    const branch = await this.findById(branchId);
    if (!branch || !branch.is_active) return false;
    if (!branch.isCurrentlyOpen()) return false;
    if (branch.order_handling_capacity > 0) {
      return branch.current_order_count < branch.order_handling_capacity;
    }
    return true;
  }
}

module.exports = Branch;