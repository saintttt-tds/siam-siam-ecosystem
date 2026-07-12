const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Drone Model - Delivery Drone Information
 * 
 * Manages the drone fleet for autonomous delivery operations.
 * Tracks drone specifications, status, maintenance, and flight data.
 * 
 * TABLE: drones
 * 
 * DRONE STATUSES:
 * - idle: Ready for assignment, at base station
 * - pre_flight: Performing pre-flight checks
 * - charging: Battery charging at base station
 * - in_flight: Currently on a delivery mission
 * - returning: Returning to base after delivery
 * - landing: Landing sequence in progress
 * - maintenance: Undergoing maintenance/servicing
 * - error: Error state, requires intervention
 * - decommissioned: Permanently retired from service
 */

class Drone extends BaseModel {
  static tableName = 'drones';
  static primaryKey = 'id';
  
  static fields = [
    'id',
    // Identification
    'serial_number', 'registration_number', 'name',
    'fleet_number', 'manufacturer', 'model',
    'manufacture_date', 'purchase_date',
    // Specifications
    'drone_type', 'weight_kg', 'max_payload_kg',
    'max_range_km', 'max_speed_kmh', 'cruise_speed_kmh',
    'max_altitude_meters', 'max_flight_time_minutes',
    'max_wind_resistance_kmh', 'max_temperature_celsius',
    'min_temperature_celsius', 'water_resistance_rating',
    'noise_level_db', 'dimensions_cm',
    // Battery
    'battery_capacity_mah', 'battery_voltage',
    'battery_type', 'battery_cycle_count',
    'battery_health_percent', 'charging_time_minutes',
    // Current state
    'status', 'sub_status', 'current_flight_id',
    'current_delivery_id', 'current_order_id',
    'current_mission_type',
    // Location & Navigation
    'base_lat', 'base_lon', 'base_altitude',
    'current_lat', 'current_lon', 'current_altitude',
    'current_speed_kmh', 'current_heading',
    'current_waypoint_index', 'total_waypoints',
    'last_location_at', 'location_accuracy',
    // Telemetry
    'battery_level_percent', 'battery_voltage_reading',
    'signal_strength', 'gps_satellites',
    'motor_temperature', 'esc_temperature',
    'imu_status', 'compass_status', 'barometer_reading',
    // Flight statistics
    'total_flights', 'total_flight_hours',
    'total_distance_km', 'total_deliveries_completed',
    'total_deliveries_failed', 'total_payload_delivered_kg',
    // Current flight
    'current_flight_start_at', 'estimated_flight_end_at',
    'flight_plan', 'return_to_base_triggered',
    'emergency_landing_triggered',
    // Maintenance
    'last_maintenance_at', 'next_maintenance_at',
    'maintenance_due_hours', 'maintenance_notes',
    'total_maintenance_count', 'last_inspection_at',
    // Firmware
    'firmware_version', 'firmware_update_available',
    'firmware_last_updated_at', 'hardware_version',
    // Insurance & Certification
    'insurance_expiry', 'certification_expiry',
    'operator_certification', 'airworthiness_certificate',
    // Cargo
    'cargo_bay_temperature', 'cargo_bay_humidity',
    'cargo_bay_status', 'payload_weight_kg',
    // Safety
    'parachute_deployed', 'collision_avoidance_status',
    'geo_fence_status', 'return_to_home_altitude',
    // Base station
    'base_station_id', 'base_station_name',
    'charging_pad_id', 'assigned_operator_id',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    flight_plan: 'json',
    metadata: 'json',
    tags: 'json',
    weight_kg: 'float',
    max_payload_kg: 'float',
    max_range_km: 'float',
    max_speed_kmh: 'float',
    cruise_speed_kmh: 'float',
    max_altitude_meters: 'float',
    max_flight_time_minutes: 'float',
    max_wind_resistance_kmh: 'float',
    max_temperature_celsius: 'float',
    min_temperature_celsius: 'float',
    noise_level_db: 'float',
    battery_capacity_mah: 'integer',
    battery_cycle_count: 'integer',
    battery_health_percent: 'float',
    charging_time_minutes: 'integer',
    base_lat: 'float',
    base_lon: 'float',
    base_altitude: 'float',
    current_lat: 'float',
    current_lon: 'float',
    current_altitude: 'float',
    current_speed_kmh: 'float',
    current_heading: 'float',
    location_accuracy: 'float',
    battery_level_percent: 'float',
    battery_voltage_reading: 'float',
    signal_strength: 'float',
    gps_satellites: 'integer',
    motor_temperature: 'float',
    esc_temperature: 'float',
    barometer_reading: 'float',
    total_flights: 'integer',
    total_flight_hours: 'float',
    total_distance_km: 'float',
    total_deliveries_completed: 'integer',
    total_deliveries_failed: 'integer',
    total_payload_delivered_kg: 'float',
    current_waypoint_index: 'integer',
    total_waypoints: 'integer',
    total_maintenance_count: 'integer',
    cargo_bay_temperature: 'float',
    cargo_bay_humidity: 'float',
    payload_weight_kg: 'float',
    return_to_home_altitude: 'float',
    return_to_base_triggered: 'boolean',
    emergency_landing_triggered: 'boolean',
    firmware_update_available: 'boolean',
    parachute_deployed: 'boolean',
    imu_status: 'boolean',
    compass_status: 'boolean',
  };

  static relations = {
    deliveries: { type: 'hasMany', model: 'Delivery', foreignKey: 'drone_id', localKey: 'id' },
  };

  static statuses = {
    IDLE: 'idle',
    PRE_FLIGHT: 'pre_flight',
    CHARGING: 'charging',
    IN_FLIGHT: 'in_flight',
    RETURNING: 'returning',
    LANDING: 'landing',
    MAINTENANCE: 'maintenance',
    ERROR: 'error',
    DECOMMISSIONED: 'decommissioned',
  };

  static missionTypes = {
    DELIVERY: 'delivery',
    RETURN: 'return',
    PATROL: 'patrol',
    INSPECTION: 'inspection',
    EMERGENCY: 'emergency',
    TEST: 'test',
  };

  /**
   * Find available drones for delivery assignment
   */
  static async findAvailable(payloadWeightKg = null, maxDistanceKm = null) {
    const criteria = {
      status: [this.statuses.IDLE, this.statuses.CHARGING],
      battery_level_percent: { operator: '>=', value: 30 },
    };

    const drones = await this.findAll({
      where: criteria,
      orderBy: { battery_level_percent: 'DESC' },
    });

    return drones.filter(drone => {
      if (payloadWeightKg && drone.max_payload_kg < payloadWeightKg) return false;
      if (maxDistanceKm && drone.max_range_km < maxDistanceKm * 2) return false; // Round trip
      return true;
    });
  }

  /**
   * Assign drone to a delivery mission
   */
  static async assignMission(droneId, deliveryId, orderId, missionType = 'delivery') {
    return this.update({ id: droneId }, {
      status: this.statuses.PRE_FLIGHT,
      current_delivery_id: deliveryId,
      current_order_id: orderId,
      current_mission_type: missionType,
      current_flight_start_at: new Date().toISOString(),
    });
  }

  /**
   * Update drone position during flight
   */
  static async updatePosition(droneId, lat, lon, altitude, metadata = {}) {
    return this.update({ id: droneId }, {
      current_lat: lat,
      current_lon: lon,
      current_altitude: altitude,
      current_speed_kmh: metadata.speed || null,
      current_heading: metadata.heading || null,
      current_waypoint_index: metadata.waypointIndex || null,
      last_location_at: new Date().toISOString(),
      location_accuracy: metadata.accuracy || null,
      battery_level_percent: metadata.batteryLevel || null,
      signal_strength: metadata.signalStrength || null,
      gps_satellites: metadata.satellites || null,
      motor_temperature: metadata.motorTemp || null,
    });
  }

  /**
   * Update telemetry data
   */
  static async updateTelemetry(droneId, telemetry) {
    const updates = {
      battery_level_percent: telemetry.batteryLevel,
      battery_voltage_reading: telemetry.batteryVoltage,
      signal_strength: telemetry.signalStrength,
      motor_temperature: telemetry.motorTemp,
      esc_temperature: telemetry.escTemp,
      barometer_reading: telemetry.barometer,
      imu_status: telemetry.imuOk,
      compass_status: telemetry.compassOk,
      cargo_bay_temperature: telemetry.cargoTemp,
      cargo_bay_humidity: telemetry.cargoHumidity,
    };

    return this.update({ id: droneId }, updates);
  }

  /**
   * Complete a delivery mission
   */
  static async completeMission(droneId, success = true) {
    const drone = await this.findById(droneId);
    const updates = {
      status: this.statuses.IDLE,
      current_delivery_id: null,
      current_order_id: null,
      current_mission_type: null,
      current_flight_id: null,
      total_flights: (drone.total_flights || 0) + 1,
      total_distance_km: (drone.total_distance_km || 0) + (drone.current_waypoint_index > 0 ? 10 : 0), // Estimate
    };

    if (success) {
      updates.total_deliveries_completed = (drone.total_deliveries_completed || 0) + 1;
    } else {
      updates.total_deliveries_failed = (drone.total_deliveries_failed || 0) + 1;
    }

    return this.update({ id: droneId }, updates);
  }

  /**
   * Schedule maintenance
   */
  static async scheduleMaintenance(droneId) {
    return this.update({ id: droneId }, {
      status: this.statuses.MAINTENANCE,
      last_maintenance_at: new Date().toISOString(),
      next_maintenance_at: new Date(Date.now() + 100 * 3600000).toISOString(), // 100 flight hours
      total_maintenance_count: connectionPool.raw('total_maintenance_count + 1'),
    });
  }

  /**
   * Get fleet statistics
   */
  static async getFleetStats() {
    const text = `
      SELECT
        COUNT(*) as total_drones,
        COUNT(CASE WHEN status = 'idle' THEN 1 END) as available,
        COUNT(CASE WHEN status = 'in_flight' THEN 1 END) as in_flight,
        COUNT(CASE WHEN status = 'charging' THEN 1 END) as charging,
        COUNT(CASE WHEN status = 'maintenance' THEN 1 END) as in_maintenance,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as errors,
        AVG(battery_level_percent) as avg_battery,
        SUM(total_flights) as total_flights,
        SUM(total_distance_km) as total_distance_km,
        SUM(total_deliveries_completed) as total_deliveries
      FROM ${this.tableName}
      WHERE status != 'decommissioned'
    `;
    const result = await connectionPool.query(text);
    return result.rows[0];
  }
}

module.exports = Drone;