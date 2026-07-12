const BaseModel = require('./base-model');
const SoftDeleteMixin = require('./soft-delete-mixin');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Driver Model - Delivery Driver Profile
 * 
 * Manages delivery driver profiles, availability, location,
 * performance metrics, and compliance documentation.
 * 
 * TABLE: drivers
 * 
 * DRIVER STATUSES:
 * - offline: Not available for deliveries
 * - online: Available and waiting for assignments
 * - busy: Currently on a delivery
 * - on_break: Temporarily unavailable
 * - suspended: Temporarily deactivated
 * - inactive: Permanently deactivated
 */

class Driver extends BaseModel {
  static tableName = 'drivers';
  static primaryKey = 'id';
  static softDelete = true;
  
  static fields = [
    'id', 'user_id',
    // Personal info
    'first_name', 'last_name', 'email', 'phone',
    'alternative_phone', 'date_of_birth', 'gender',
    'profile_photo_url', 'national_id_encrypted',
    'nationality', 'languages_spoken',
    // Address
    'address_line1', 'address_line2', 'city',
    'state', 'postal_code', 'country',
    'home_lat', 'home_lon',
    // Vehicle info
    'vehicle_type', 'vehicle_make', 'vehicle_model',
    'vehicle_year', 'vehicle_color', 'vehicle_plate',
    'vehicle_photo_url', 'vehicle_insurance_url',
    'vehicle_insurance_expiry', 'vehicle_license_url',
    'max_load_kg', 'has_refrigeration', 'has_thermal_bag',
    // License & Documents
    'drivers_license_number', 'drivers_license_class',
    'drivers_license_url', 'drivers_license_expiry',
    'background_check_status', 'background_check_date',
    'police_clearance_url', 'medical_certificate_url',
    // Status & Availability
    'status', 'is_available', 'is_active', 'is_verified',
    'verified_at', 'verified_by',
    'available_since', 'last_activity_at',
    'max_delivery_distance_km', 'preferred_areas',
    // Location
    'current_lat', 'current_lon', 'current_accuracy',
    'current_altitude', 'current_speed_kmh',
    'current_heading', 'last_location_at',
    'location_provider', 'device_battery_level',
    // Performance
    'total_deliveries', 'completed_deliveries',
    'cancelled_deliveries', 'failed_deliveries',
    'on_time_deliveries', 'late_deliveries',
    'total_distance_km', 'total_earnings',
    'average_rating', 'total_ratings',
    'customer_feedback_score', 'acceptance_rate',
    'completion_rate', 'on_time_rate',
    // Current delivery
    'current_delivery_id', 'current_order_id',
    'current_route_id', 'stops_remaining',
    'estimated_completion_at',
    // Wallet & Earnings
    'wallet_balance', 'pending_earnings',
    'total_earned_30d', 'total_earned_7d',
    // Shift
    'shift_start_at', 'shift_end_at',
    'total_shift_hours_today', 'total_shift_hours_week',
    'breaks_taken', 'last_break_at',
    // Device
    'device_id', 'device_type', 'app_version',
    'device_os', 'device_os_version',
    // Notifications
    'notification_token', 'notification_enabled',
    'sound_enabled', 'vibration_enabled',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
    'deleted_at', 'deleted_by',
  ];

  static casts = {
    languages_spoken: 'json',
    preferred_areas: 'json',
    metadata: 'json',
    tags: 'json',
    is_available: 'boolean',
    is_active: 'boolean',
    is_verified: 'boolean',
    has_refrigeration: 'boolean',
    has_thermal_bag: 'boolean',
    notification_enabled: 'boolean',
    sound_enabled: 'boolean',
    vibration_enabled: 'boolean',
    home_lat: 'float',
    home_lon: 'float',
    current_lat: 'float',
    current_lon: 'float',
    current_accuracy: 'float',
    current_altitude: 'float',
    current_speed_kmh: 'float',
    current_heading: 'float',
    device_battery_level: 'float',
    max_load_kg: 'float',
    max_delivery_distance_km: 'float',
    total_distance_km: 'float',
    total_earnings: 'float',
    average_rating: 'float',
    customer_feedback_score: 'float',
    acceptance_rate: 'float',
    completion_rate: 'float',
    on_time_rate: 'float',
    wallet_balance: 'float',
    pending_earnings: 'float',
    total_earned_30d: 'float',
    total_earned_7d: 'float',
    total_shift_hours_today: 'float',
    total_shift_hours_week: 'float',
    total_deliveries: 'integer',
    completed_deliveries: 'integer',
    cancelled_deliveries: 'integer',
    failed_deliveries: 'integer',
    on_time_deliveries: 'integer',
    late_deliveries: 'integer',
    total_ratings: 'integer',
    stops_remaining: 'integer',
    breaks_taken: 'integer',
  };

  static relations = {
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
    deliveries: { type: 'hasMany', model: 'Delivery', foreignKey: 'driver_id', localKey: 'id' },
  };

  static statuses = {
    OFFLINE: 'offline',
    ONLINE: 'online',
    BUSY: 'busy',
    ON_BREAK: 'on_break',
    SUSPENDED: 'suspended',
    INACTIVE: 'inactive',
  };

  static vehicleTypes = {
    MOTORCYCLE: 'motorcycle',
    BICYCLE: 'bicycle',
    CAR: 'car',
    VAN: 'van',
    TRUCK: 'truck',
    WALKING: 'walking',
    SCOOTER: 'scooter',
  };

  /**
   * Find driver by user ID
   */
  static async findByUser(userId) {
    return this.findOne({ where: { user_id: userId } });
  }

  /**
   * Find available drivers near a location
   */
  static async findNearby(lat, lon, radiusKm = 10, vehicleType = null) {
    const text = `
      SELECT *,
        (6371 * acos(
          cos(radians($1)) * cos(radians(current_lat))
          * cos(radians(current_lon) - radians($2))
          + sin(radians($1)) * sin(radians(current_lat))
        )) AS distance_km
      FROM ${this.tableName}
      WHERE status = 'online'
        AND is_available = true
        AND is_active = true
        AND is_verified = true
        AND current_lat IS NOT NULL
        AND current_lon IS NOT NULL
        ${vehicleType ? 'AND vehicle_type = $4' : ''}
      HAVING distance_km <= $3
      ORDER BY distance_km ASC, average_rating DESC
      LIMIT 20
    `;

    const values = [lat, lon, radiusKm];
    if (vehicleType) values.push(vehicleType);

    const result = await connectionPool.query(text, values);
    return result.rows;
  }

  /**
   * Update driver location
   */
  static async updateLocation(driverId, lat, lon, metadata = {}) {
    return this.update({ id: driverId }, {
      current_lat: lat,
      current_lon: lon,
      current_accuracy: metadata.accuracy || null,
      current_altitude: metadata.altitude || null,
      current_speed_kmh: metadata.speed || null,
      current_heading: metadata.heading || null,
      last_location_at: new Date().toISOString(),
      location_provider: metadata.provider || 'gps',
      device_battery_level: metadata.batteryLevel || null,
    });
  }

  /**
   * Set driver availability
   */
  static async setAvailability(driverId, available) {
    const updates = {
      is_available: available,
      status: available ? this.statuses.ONLINE : this.statuses.OFFLINE,
    };

    if (available) {
      updates.available_since = new Date().toISOString();
    }

    return this.update({ id: driverId }, updates);
  }

  /**
   * Accept a delivery assignment
   */
  static async acceptDelivery(driverId, deliveryId, orderId) {
    return this.update({ id: driverId }, {
      status: this.statuses.BUSY,
      current_delivery_id: deliveryId,
      current_order_id: orderId,
      stops_remaining: 1,
    });
  }

  /**
   * Complete current delivery
   */
  static async completeDelivery(driverId) {
    const driver = await this.findById(driverId);
    const updates = {
      status: this.statuses.ONLINE,
      current_delivery_id: null,
      current_order_id: null,
      current_route_id: null,
      stops_remaining: 0,
      total_deliveries: (driver.total_deliveries || 0) + 1,
      completed_deliveries: (driver.completed_deliveries || 0) + 1,
    };

    // Recalculate rates
    const totalAttempts = updates.completed_deliveries + (driver.cancelled_deliveries || 0) + (driver.failed_deliveries || 0);
    updates.completion_rate = totalAttempts > 0 
      ? Math.round((updates.completed_deliveries / totalAttempts) * 10000) / 100 
      : 100;

    return this.update({ id: driverId }, updates);
  }

  /**
   * Go on break
   */
  static async takeBreak(driverId) {
    const driver = await this.findById(driverId);
    return this.update({ id: driverId }, {
      status: this.statuses.ON_BREAK,
      breaks_taken: (driver.breaks_taken || 0) + 1,
      last_break_at: new Date().toISOString(),
    });
  }

  /**
   * End break and go back online
   */
  static async endBreak(driverId) {
    return this.update({ id: driverId }, {
      status: this.statuses.ONLINE,
      is_available: true,
    });
  }

  /**
   * Verify driver account
   */
  static async verify(driverId, verifiedBy) {
    return this.update({ id: driverId }, {
      is_verified: true,
      verified_at: new Date().toISOString(),
      verified_by: verifiedBy,
    });
  }

  /**
   * Get driver performance summary
   */
  static async getPerformanceSummary(driverId) {
    const text = `
      SELECT
        d.*,
        COUNT(del.id) FILTER (WHERE del.created_at > NOW() - INTERVAL '30 days') as deliveries_30d,
        AVG(del.customer_rating) FILTER (WHERE del.created_at > NOW() - INTERVAL '30 days') as rating_30d,
        COUNT(del.id) FILTER (WHERE del.status = 'delivered' AND del.created_at > NOW() - INTERVAL '30 days') as completed_30d,
        COUNT(del.id) FILTER (WHERE del.status = 'failed' AND del.created_at > NOW() - INTERVAL '30 days') as failed_30d,
        SUM(del.route_distance_km) FILTER (WHERE del.created_at > NOW() - INTERVAL '30 days') as distance_30d,
        AVG(del.actual_delivery_time_minutes) FILTER (WHERE del.created_at > NOW() - INTERVAL '30 days') as avg_delivery_time_30d
      FROM ${this.tableName} d
      LEFT JOIN deliveries del ON d.id = del.driver_id
      WHERE d.id = $1
      GROUP BY d.id
    `;
    const result = await connectionPool.query(text, [driverId]);
    return result.rows[0];
  }

  /**
   * Get all online drivers count
   */
  static async getOnlineCount() {
    return this.count({
      where: { status: this.statuses.ONLINE, is_available: true, is_active: true },
    });
  }
}

Object.assign(Driver, SoftDeleteMixin);
module.exports = Driver;