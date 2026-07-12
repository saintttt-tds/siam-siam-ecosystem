const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Telemetry Model - Drone/Vehicle Telemetry Data
 * 
 * High-frequency telemetry data from delivery drones and vehicles.
 * Optimized for time-series storage with automatic downsampling.
 * 
 * TABLE: telemetry
 */

class Telemetry extends BaseModel {
  static tableName = 'telemetry';
  static primaryKey = 'id';
  static timestamps = false;
  
  static fields = [
    'id', 'delivery_id', 'drone_id', 'driver_id', 'vehicle_id',
    'session_id', 'telemetry_type',
    'timestamp_unix_ms', 'recorded_at',
    'latitude', 'longitude', 'altitude_meters',
    'accuracy_meters', 'speed_kmh', 'heading_degrees',
    'ground_speed_kmh', 'vertical_speed_ms',
    'acceleration_x', 'acceleration_y', 'acceleration_z',
    'gyroscope_x', 'gyroscope_y', 'gyroscope_z',
    'magnetometer_x', 'magnetometer_y', 'magnetometer_z',
    'roll_degrees', 'pitch_degrees', 'yaw_degrees',
    'battery_voltage', 'battery_current_amps',
    'battery_level_percent', 'battery_temperature_celsius',
    'battery_cycle_count', 'battery_health_percent',
    'motor_rpm_1', 'motor_rpm_2', 'motor_rpm_3', 'motor_rpm_4',
    'motor_temperature_1', 'motor_temperature_2',
    'motor_temperature_3', 'motor_temperature_4',
    'esc_temperature_1', 'esc_temperature_2',
    'esc_temperature_3', 'esc_temperature_4',
    'propeller_efficiency', 'thrust_newtons',
    'ambient_temperature_celsius', 'ambient_humidity_percent',
    'ambient_pressure_hpa', 'wind_speed_kmh',
    'wind_direction_degrees', 'wind_gust_kmh',
    'cargo_temperature_celsius', 'cargo_humidity_percent',
    'cargo_weight_kg', 'cargo_bay_door_status',
    'gps_satellites', 'gps_fix_quality', 'gps_hdop',
    'gps_vdop', 'gps_pdop', 'rtk_fix', 'rtk_age_seconds',
    'signal_strength_dbm', 'link_quality_percent',
    'packets_sent', 'packets_lost', 'packet_loss_rate',
    'cpu_usage_percent', 'memory_usage_percent',
    'storage_used_percent', 'firmware_version',
    'flight_mode', 'flight_phase', 'autopilot_status',
    'return_to_home_triggered', 'failsafe_triggered',
    'geofence_breach', 'geofence_breach_meters',
    'obstacle_detected', 'obstacle_distance_cm',
    'obstacle_direction', 'collision_avoidance_activated',
    'vibration_level', 'shock_detected',
    'shock_magnitude_g', 'error_codes',
    'warning_codes', 'status_flags',
    'metadata', 'tenant_id', 'created_at',
  ];

  static casts = {
    timestamp_unix_ms: 'integer', latitude: 'float',
    longitude: 'float', altitude_meters: 'float',
    accuracy_meters: 'float', speed_kmh: 'float',
    heading_degrees: 'float', ground_speed_kmh: 'float',
    vertical_speed_ms: 'float', acceleration_x: 'float',
    acceleration_y: 'float', acceleration_z: 'float',
    gyroscope_x: 'float', gyroscope_y: 'float',
    gyroscope_z: 'float', magnetometer_x: 'float',
    magnetometer_y: 'float', magnetometer_z: 'float',
    roll_degrees: 'float', pitch_degrees: 'float',
    yaw_degrees: 'float', battery_voltage: 'float',
    battery_current_amps: 'float', battery_level_percent: 'float',
    battery_temperature_celsius: 'float', battery_health_percent: 'float',
    motor_rpm_1: 'integer', motor_rpm_2: 'integer',
    motor_rpm_3: 'integer', motor_rpm_4: 'integer',
    motor_temperature_1: 'float', motor_temperature_2: 'float',
    motor_temperature_3: 'float', motor_temperature_4: 'float',
    esc_temperature_1: 'float', esc_temperature_2: 'float',
    esc_temperature_3: 'float', esc_temperature_4: 'float',
    propeller_efficiency: 'float', thrust_newtons: 'float',
    ambient_temperature_celsius: 'float',
    ambient_humidity_percent: 'float', ambient_pressure_hpa: 'float',
    wind_speed_kmh: 'float', wind_direction_degrees: 'float',
    wind_gust_kmh: 'float', cargo_temperature_celsius: 'float',
    cargo_humidity_percent: 'float', cargo_weight_kg: 'float',
    gps_satellites: 'integer', gps_fix_quality: 'integer',
    gps_hdop: 'float', gps_vdop: 'float', gps_pdop: 'float',
    signal_strength_dbm: 'float', link_quality_percent: 'float',
    packets_sent: 'integer', packets_lost: 'integer',
    packet_loss_rate: 'float', cpu_usage_percent: 'float',
    memory_usage_percent: 'float', storage_used_percent: 'float',
    obstacle_distance_cm: 'float', shock_magnitude_g: 'float',
    rtk_fix: 'boolean', return_to_home_triggered: 'boolean',
    failsafe_triggered: 'boolean', geofence_breach: 'boolean',
    obstacle_detected: 'boolean', collision_avoidance_activated: 'boolean',
    shock_detected: 'boolean', error_codes: 'json',
    warning_codes: 'json', status_flags: 'json',
    metadata: 'json',
  };

  static relations = {
    delivery: { type: 'belongsTo', model: 'Delivery', foreignKey: 'delivery_id', ownerKey: 'id' },
    drone: { type: 'belongsTo', model: 'Drone', foreignKey: 'drone_id', ownerKey: 'id' },
    driver: { type: 'belongsTo', model: 'Driver', foreignKey: 'driver_id', ownerKey: 'id' },
  };

  static telemetryTypes = {
    DRONE: 'drone', VEHICLE: 'vehicle', CARGO: 'cargo',
    BATTERY: 'battery', ENVIRONMENT: 'environment', SYSTEM: 'system',
  };

  /**
   * Record telemetry data point
   */
  static async record(deliveryId, telemetryData) {
    return this.create({
      delivery_id: deliveryId, drone_id: telemetryData.droneId,
      driver_id: telemetryData.driverId, vehicle_id: telemetryData.vehicleId,
      session_id: telemetryData.sessionId,
      telemetry_type: telemetryData.telemetryType || this.telemetryTypes.DRONE,
      timestamp_unix_ms: telemetryData.timestampUnixMs || Date.now(),
      recorded_at: new Date().toISOString(),
      latitude: telemetryData.latitude, longitude: telemetryData.longitude,
      altitude_meters: telemetryData.altitudeMeters,
      speed_kmh: telemetryData.speedKmh,
      heading_degrees: telemetryData.headingDegrees,
      battery_level_percent: telemetryData.batteryLevelPercent,
      battery_voltage: telemetryData.batteryVoltage,
      ambient_temperature_celsius: telemetryData.ambientTemperatureCelsius,
      cargo_temperature_celsius: telemetryData.cargoTemperatureCelsius,
      signal_strength_dbm: telemetryData.signalStrengthDbm,
      gps_satellites: telemetryData.gpsSatellites,
      flight_mode: telemetryData.flightMode,
      metadata: telemetryData.metadata || {},
      tenant_id: telemetryData.tenantId,
    });
  }

  /**
   * Get latest telemetry for a delivery
   */
  static async getLatest(deliveryId) {
    return this.findOne({ where: { delivery_id: deliveryId }, orderBy: { timestamp_unix_ms: 'DESC' } });
  }

  /**
   * Get telemetry history for a time range
   */
  static async getHistory(deliveryId, startTime, endTime) {
    return this.findAll({
      where: {
        delivery_id: deliveryId,
        timestamp_unix_ms: { operator: '>=', value: startTime },
      },
      orderBy: { timestamp_unix_ms: 'ASC' },
    });
  }

  /**
   * Purge old telemetry data (retention: 90 days)
   */
  static async purgeOld(daysOld = 90) {
    const result = await connectionPool.query(
      `DELETE FROM ${this.tableName} WHERE created_at < NOW() - INTERVAL '${daysOld} days'`
    );
    return result.rowCount;
  }
}

module.exports = Telemetry;