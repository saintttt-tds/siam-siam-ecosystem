const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Live Tracking Model - Real-time Location Tracking Data
 * 
 * Stores high-frequency location pings for real-time tracking.
 * Optimized for time-series data with automatic cleanup.
 * Separate from delivery_tracking to handle high write volume.
 * 
 * TABLE: live_tracking
 * 
 * DATA RETENTION:
 * - Raw pings: 24 hours
 * - Aggregated data: 30 days
 * - Route summaries: 1 year
 */

class LiveTracking extends BaseModel {
  static tableName = 'live_tracking';
  static primaryKey = 'id';
  static timestamps = false;
  
  static fields = [
    'id', 'session_id', 'delivery_id',
    'driver_id', 'drone_id',
    // Location
    'latitude', 'longitude', 'altitude',
    'accuracy_meters', 'speed_kmh',
    'heading_degrees', 'bearing_accuracy',
    // Motion
    'is_moving', 'motion_type',
    'acceleration_x', 'acceleration_y', 'acceleration_z',
    'gyroscope_x', 'gyroscope_y', 'gyroscope_z',
    // Environment
    'temperature_celsius', 'humidity_percent',
    'pressure_hpa', 'light_level_lux',
    // Device
    'device_id', 'device_battery_level',
    'device_signal_strength', 'device_charging',
    'gps_satellites', 'gps_fix_quality',
    // Timing
    'recorded_at', 'recorded_at_unix_ms',
    'time_since_last_ping_ms', 'ping_sequence',
    // Route
    'route_id', 'distance_from_start_km',
    'distance_to_destination_km', 'eta_minutes',
    'on_route', 'route_deviation_meters',
    // Geofence
    'active_geofences', 'nearest_geofence_id',
    'nearest_geofence_distance_meters',
    // Metadata
    'metadata', 'tenant_id', 'created_at',
  ];

  static casts = {
    latitude: 'float',
    longitude: 'float',
    altitude: 'float',
    accuracy_meters: 'float',
    speed_kmh: 'float',
    heading_degrees: 'float',
    bearing_accuracy: 'float',
    acceleration_x: 'float',
    acceleration_y: 'float',
    acceleration_z: 'float',
    gyroscope_x: 'float',
    gyroscope_y: 'float',
    gyroscope_z: 'float',
    temperature_celsius: 'float',
    humidity_percent: 'float',
    pressure_hpa: 'float',
    light_level_lux: 'float',
    device_battery_level: 'float',
    device_signal_strength: 'float',
    gps_satellites: 'integer',
    gps_fix_quality: 'integer',
    recorded_at_unix_ms: 'integer',
    time_since_last_ping_ms: 'integer',
    ping_sequence: 'integer',
    distance_from_start_km: 'float',
    distance_to_destination_km: 'float',
    eta_minutes: 'integer',
    route_deviation_meters: 'float',
    nearest_geofence_distance_meters: 'float',
    is_moving: 'boolean',
    device_charging: 'boolean',
    on_route: 'boolean',
    active_geofences: 'json',
    metadata: 'json',
  };

  /**
   * Record a location ping
   */
  static async recordPing(params = {}) {
    return this.create({
      session_id: params.sessionId,
      delivery_id: params.deliveryId,
      driver_id: params.driverId || null,
      drone_id: params.droneId || null,
      latitude: params.latitude,
      longitude: params.longitude,
      altitude: params.altitude || null,
      accuracy_meters: params.accuracy || null,
      speed_kmh: params.speed || null,
      heading_degrees: params.heading || null,
      bearing_accuracy: params.bearingAccuracy || null,
      is_moving: params.isMoving !== false,
      motion_type: params.motionType || null,
      acceleration_x: params.accelX || null,
      acceleration_y: params.accelY || null,
      acceleration_z: params.accelZ || null,
      temperature_celsius: params.temperature || null,
      humidity_percent: params.humidity || null,
      device_id: params.deviceId || null,
      device_battery_level: params.batteryLevel || null,
      device_signal_strength: params.signalStrength || null,
      device_charging: params.isCharging || false,
      gps_satellites: params.satellites || null,
      gps_fix_quality: params.fixQuality || null,
      recorded_at: params.recordedAt || new Date().toISOString(),
      recorded_at_unix_ms: params.recordedAtUnixMs || Date.now(),
      time_since_last_ping_ms: params.timeSinceLastPing || 0,
      ping_sequence: params.sequence || 0,
      route_id: params.routeId || null,
      distance_from_start_km: params.distanceFromStart || null,
      distance_to_destination_km: params.distanceToDestination || null,
      eta_minutes: params.etaMinutes || null,
      on_route: params.onRoute !== false,
      route_deviation_meters: params.routeDeviation || null,
      active_geofences: params.activeGeofences || null,
      nearest_geofence_id: params.nearestGeofenceId || null,
      nearest_geofence_distance_meters: params.nearestGeofenceDistance || null,
      metadata: params.metadata || {},
      tenant_id: params.tenantId || null,
    });
  }

  /**
   * Get latest position for a delivery
   */
  static async getLatestPosition(deliveryId) {
    return this.findOne({
      where: { delivery_id: deliveryId },
      orderBy: { recorded_at_unix_ms: 'DESC' },
    });
  }

  /**
   * Get position history for a time window
   */
  static async getPositionHistory(deliveryId, startTime, endTime = new Date()) {
    return this.findAll({
      where: {
        delivery_id: deliveryId,
        recorded_at: { operator: '>=', value: startTime.toISOString() },
      },
      orderBy: { recorded_at_unix_ms: 'ASC' },
    });
  }

  /**
   * Get active tracking sessions
   */
  static async getActiveSessions() {
    const text = `
      SELECT DISTINCT ON (delivery_id)
        delivery_id, driver_id, drone_id,
        latitude, longitude, speed_kmh,
        recorded_at, device_battery_level
      FROM ${this.tableName}
      WHERE recorded_at > NOW() - INTERVAL '5 minutes'
      ORDER BY delivery_id, recorded_at_unix_ms DESC
    `;
    const result = await connectionPool.query(text);
    return result.rows;
  }

  /**
   * Purge old pings (retention: 24 hours)
   */
  static async purgeOldPings(retentionHours = 24) {
    const text = `
      DELETE FROM ${this.tableName}
      WHERE recorded_at < NOW() - INTERVAL '${retentionHours} hours'
    `;
    const result = await connectionPool.query(text);
    
    if (result.rowCount > 0) {
      logger.debug('Purged old live tracking pings', {
        count: result.rowCount,
        olderThan: `${retentionHours} hours`,
      });
    }
    
    return result.rowCount;
  }

  /**
   * Aggregate pings into route segments (for historical analysis)
   */
  static async aggregateRoute(deliveryId) {
    const text = `
      SELECT
        delivery_id,
        MIN(recorded_at) as start_time,
        MAX(recorded_at) as end_time,
        COUNT(*) as ping_count,
        MAX(distance_from_start_km) as total_distance_km,
        AVG(speed_kmh) as avg_speed_kmh,
        MAX(speed_kmh) as max_speed_kmh,
        ST_MakeLine(
          ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) ORDER BY recorded_at
        ) as route_line
      FROM ${this.tableName}
      WHERE delivery_id = $1
      GROUP BY delivery_id
    `;
    const result = await connectionPool.query(text, [deliveryId]);
    return result.rows[0];
  }
}

module.exports = LiveTracking;