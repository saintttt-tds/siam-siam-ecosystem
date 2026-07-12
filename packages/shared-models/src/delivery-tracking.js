const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Delivery Tracking Model - Real-time Tracking Events
 * 
 * Records all tracking events for a delivery journey.
 * Each event captures location, status, and context at a point in time.
 * Used for real-time customer tracking, analytics, and route optimization.
 * 
 * TABLE: delivery_tracking
 * 
 * EVENT TYPES:
 * - location_update: GPS position ping
 * - status_change: Delivery status transition
 * - checkpoint: Reached a predefined checkpoint
 * - delivery_attempt: Attempted delivery
 * - delay: Delay encountered
 * - notification: Customer notification sent
 * - geofence_enter: Entered a geofenced area
 * - geofence_exit: Exited a geofenced area
 * - speed_alert: Speeding detected
 * - battery_low: Device/drone battery low
 */

class DeliveryTracking extends BaseModel {
  static tableName = 'delivery_tracking';
  static primaryKey = 'id';
  static timestamps = false; // Uses recorded_at instead of created_at
  
  static fields = [
    'id', 'delivery_id', 'order_id',
    'driver_id', 'drone_id',
    // Event type and status
    'event_type', 'status', 'sub_status',
    'event_description', 'event_sequence',
    // Location data
    'latitude', 'longitude', 'altitude',
    'accuracy_meters', 'speed_kmh', 'heading_degrees',
    'location_provider', 'location_address',
    'location_geocoded', 'location_city',
    'location_country', 'location_postal_code',
    // Geofence
    'geofence_id', 'geofence_name',
    'geofence_event', 'distance_to_geofence_meters',
    // Checkpoint
    'checkpoint_id', 'checkpoint_name',
    'checkpoint_type', 'checkpoint_sequence',
    'distance_from_checkpoint_meters',
    'estimated_arrival_at_checkpoint',
    // Timing
    'recorded_at', 'recorded_at_device_time',
    'time_since_last_event_seconds',
    'estimated_delivery_at', 'delay_minutes',
    'delay_reason',
    // Device info
    'device_id', 'device_battery_level',
    'device_signal_strength', 'device_temperature',
    'app_version', 'app_state',
    // Vehicle/Drone telemetry
    'vehicle_speed', 'engine_status',
    'fuel_level', 'battery_voltage',
    'motor_temperature', 'cargo_temperature',
    'cargo_humidity', 'vibration_level',
    // Route
    'route_id', 'route_segment_index',
    'distance_covered_km', 'distance_remaining_km',
    'route_deviation_meters', 'is_on_route',
    // Delivery attempt
    'attempt_number', 'attempt_result',
    'attempt_notes', 'recipient_available',
    'left_at_door', 'left_with_neighbor',
    'neighbor_name', 'neighbor_address',
    // Customer notification
    'notification_type', 'notification_channel',
    'notification_sent_at', 'notification_status',
    // Metadata
    'metadata', 'tags',
    'tenant_id', 'created_at',
  ];

  static casts = {
    latitude: 'float',
    longitude: 'float',
    altitude: 'float',
    accuracy_meters: 'float',
    speed_kmh: 'float',
    heading_degrees: 'float',
    distance_to_geofence_meters: 'float',
    distance_from_checkpoint_meters: 'float',
    device_battery_level: 'float',
    device_signal_strength: 'float',
    device_temperature: 'float',
    vehicle_speed: 'float',
    fuel_level: 'float',
    battery_voltage: 'float',
    motor_temperature: 'float',
    cargo_temperature: 'float',
    cargo_humidity: 'float',
    vibration_level: 'float',
    distance_covered_km: 'float',
    distance_remaining_km: 'float',
    route_deviation_meters: 'float',
    delay_minutes: 'integer',
    event_sequence: 'integer',
    time_since_last_event_seconds: 'integer',
    attempt_number: 'integer',
    route_segment_index: 'integer',
    location_geocoded: 'boolean',
    location_matched: 'boolean',
    is_on_route: 'boolean',
    recipient_available: 'boolean',
    left_at_door: 'boolean',
    left_with_neighbor: 'boolean',
    metadata: 'json',
    tags: 'json',
  };

  static relations = {
    delivery: { type: 'belongsTo', model: 'Delivery', foreignKey: 'delivery_id', ownerKey: 'id' },
  };

  // Event type constants
  static eventTypes = {
    LOCATION_UPDATE: 'location_update',
    STATUS_CHANGE: 'status_change',
    CHECKPOINT_REACHED: 'checkpoint_reached',
    CHECKPOINT_DEPARTED: 'checkpoint_departed',
    DELIVERY_ATTEMPT: 'delivery_attempt',
    DELIVERY_COMPLETED: 'delivery_completed',
    DELIVERY_FAILED: 'delivery_failed',
    DELAY: 'delay',
    NOTIFICATION_SENT: 'notification_sent',
    GEOFENCE_ENTER: 'geofence_enter',
    GEOFENCE_EXIT: 'geofence_exit',
    SPEED_ALERT: 'speed_alert',
    BATTERY_LOW: 'battery_low',
    ROUTE_DEVIATION: 'route_deviation',
    DRIVER_ACCEPTED: 'driver_accepted',
    DRIVER_ARRIVED_PICKUP: 'driver_arrived_pickup',
    PACKAGE_PICKED_UP: 'package_picked_up',
    OUT_FOR_DELIVERY: 'out_for_delivery',
    CUSTOMER_CONTACTED: 'customer_contacted',
    RETURN_INITIATED: 'return_initiated',
    POD_CAPTURED: 'pod_captured',
  };

  // Checkpoint types
  static checkpointTypes = {
    WAREHOUSE: 'warehouse',
    SORTING_CENTER: 'sorting_center',
    TRANSIT_HUB: 'transit_hub',
    PICKUP_POINT: 'pickup_point',
    DELIVERY_ADDRESS: 'delivery_address',
    WAYPOINT: 'waypoint',
    CUSTOM: 'custom',
  };

  /**
   * Record a location update event
   * @param {Object} params - Location update parameters
   */
  static async recordLocation(params = {}) {
    return this.create({
      delivery_id: params.deliveryId,
      order_id: params.orderId,
      driver_id: params.driverId || null,
      drone_id: params.droneId || null,
      event_type: this.eventTypes.LOCATION_UPDATE,
      status: params.status || null,
      event_description: params.description || 'Location update',
      event_sequence: params.sequence || 0,
      latitude: params.latitude,
      longitude: params.longitude,
      altitude: params.altitude || null,
      accuracy_meters: params.accuracy || null,
      speed_kmh: params.speed || null,
      heading_degrees: params.heading || null,
      location_provider: params.provider || 'gps',
      location_address: params.address || null,
      location_city: params.city || null,
      location_country: params.country || null,
      recorded_at: params.recordedAt || new Date().toISOString(),
      recorded_at_device_time: params.deviceTime || null,
      device_id: params.deviceId || null,
      device_battery_level: params.batteryLevel || null,
      device_signal_strength: params.signalStrength || null,
      route_id: params.routeId || null,
      route_segment_index: params.routeSegmentIndex || null,
      distance_covered_km: params.distanceCovered || null,
      distance_remaining_km: params.distanceRemaining || null,
      is_on_route: params.isOnRoute !== false,
      route_deviation_meters: params.routeDeviation || null,
      estimated_delivery_at: params.estimatedDelivery || null,
      delay_minutes: params.delayMinutes || null,
      delay_reason: params.delayReason || null,
      metadata: params.metadata || {},
      tags: params.tags || [],
      tenant_id: params.tenantId || null,
    });
  }

  /**
   * Record a status change event
   */
  static async recordStatusChange(params = {}) {
    return this.create({
      delivery_id: params.deliveryId,
      order_id: params.orderId,
      driver_id: params.driverId || null,
      event_type: this.eventTypes.STATUS_CHANGE,
      status: params.status,
      sub_status: params.subStatus || null,
      event_description: params.description || `Status changed to ${params.status}`,
      event_sequence: params.sequence || 0,
      latitude: params.latitude || null,
      longitude: params.longitude || null,
      recorded_at: params.recordedAt || new Date().toISOString(),
      metadata: params.metadata || {},
      tenant_id: params.tenantId || null,
    });
  }

  /**
   * Record a checkpoint event
   */
  static async recordCheckpoint(params = {}) {
    return this.create({
      delivery_id: params.deliveryId,
      order_id: params.orderId,
      event_type: params.isDeparture ? this.eventTypes.CHECKPOINT_DEPARTED : this.eventTypes.CHECKPOINT_REACHED,
      status: params.status || null,
      event_description: params.description || `${params.isDeparture ? 'Departed' : 'Reached'} ${params.checkpointName}`,
      event_sequence: params.sequence || 0,
      checkpoint_id: params.checkpointId || null,
      checkpoint_name: params.checkpointName,
      checkpoint_type: params.checkpointType || this.checkpointTypes.WAYPOINT,
      checkpoint_sequence: params.checkpointSequence || 0,
      latitude: params.latitude,
      longitude: params.longitude,
      recorded_at: params.recordedAt || new Date().toISOString(),
      estimated_arrival_at_checkpoint: params.estimatedArrival || null,
      metadata: params.metadata || {},
      tenant_id: params.tenantId || null,
    });
  }

  /**
   * Record a delivery attempt
   */
  static async recordDeliveryAttempt(params = {}) {
    return this.create({
      delivery_id: params.deliveryId,
      order_id: params.orderId,
      driver_id: params.driverId || null,
      event_type: params.success ? this.eventTypes.DELIVERY_COMPLETED : this.eventTypes.DELIVERY_ATTEMPT,
      status: params.status || null,
      event_description: params.description || `Delivery attempt ${params.attemptNumber}`,
      event_sequence: params.sequence || 0,
      attempt_number: params.attemptNumber || 1,
      attempt_result: params.success ? 'success' : 'failed',
      attempt_notes: params.notes || null,
      recipient_available: params.recipientAvailable || false,
      left_at_door: params.leftAtDoor || false,
      left_with_neighbor: params.leftWithNeighbor || false,
      neighbor_name: params.neighborName || null,
      neighbor_address: params.neighborAddress || null,
      latitude: params.latitude || null,
      longitude: params.longitude || null,
      recorded_at: params.recordedAt || new Date().toISOString(),
      metadata: params.metadata || {},
      tenant_id: params.tenantId || null,
    });
  }

  /**
   * Find tracking events for a delivery (ordered by time)
   */
  static async findByDelivery(deliveryId, options = {}) {
    return this.findAll({
      where: { delivery_id: deliveryId },
      orderBy: { recorded_at: options.descending ? 'DESC' : 'ASC' },
      limit: options.limit || 1000,
      ...options,
    });
  }

  /**
   * Get the latest tracking event for a delivery
   */
  static async getLatest(deliveryId) {
    return this.findOne({
      where: { delivery_id: deliveryId },
      orderBy: { recorded_at: 'DESC' },
    });
  }

  /**
   * Get latest location for a delivery
   */
  static async getLatestLocation(deliveryId) {
    return this.findOne({
      where: {
        delivery_id: deliveryId,
        event_type: this.eventTypes.LOCATION_UPDATE,
        latitude: { operator: 'IS NOT', value: null },
      },
      orderBy: { recorded_at: 'DESC' },
    });
  }

  /**
   * Get tracking events since a specific time
   */
  static async getSince(deliveryId, sinceTimestamp) {
    return this.findAll({
      where: {
        delivery_id: deliveryId,
        recorded_at: { operator: '>', value: sinceTimestamp },
      },
      orderBy: { recorded_at: 'ASC' },
    });
  }

  /**
   * Get tracking summary for a delivery
   */
  static async getSummary(deliveryId) {
    const text = `
      SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT event_type) as event_types_count,
        MIN(recorded_at) as first_event_at,
        MAX(recorded_at) as last_event_at,
        COUNT(CASE WHEN event_type = 'location_update' THEN 1 END) as location_updates,
        COUNT(CASE WHEN event_type = 'status_change' THEN 1 END) as status_changes,
        COUNT(CASE WHEN event_type LIKE 'checkpoint%' THEN 1 END) as checkpoint_events,
        COUNT(CASE WHEN event_type LIKE 'delivery_%' THEN 1 END) as delivery_events,
        MAX(distance_covered_km) as total_distance_km,
        AVG(speed_kmh) as avg_speed_kmh,
        MAX(speed_kmh) as max_speed_kmh,
        SUM(delay_minutes) as total_delay_minutes
      FROM ${this.tableName}
      WHERE delivery_id = $1
    `;

    const result = await connectionPool.query(text, [deliveryId]);
    return result.rows[0];
  }

  /**
   * Build a timeline of tracking events (for customer display)
   */
  static async buildTimeline(deliveryId) {
    const events = await this.findByDelivery(deliveryId, {
      where: {
        delivery_id: deliveryId,
        event_type: [
          this.eventTypes.DRIVER_ACCEPTED,
          this.eventTypes.DRIVER_ARRIVED_PICKUP,
          this.eventTypes.PACKAGE_PICKED_UP,
          this.eventTypes.CHECKPOINT_REACHED,
          this.eventTypes.OUT_FOR_DELIVERY,
          this.eventTypes.DELIVERY_ATTEMPT,
          this.eventTypes.DELIVERY_COMPLETED,
          this.eventTypes.STATUS_CHANGE,
        ],
      },
      orderBy: { recorded_at: 'ASC' },
    });

    return events.map(event => ({
      time: event.recorded_at,
      type: event.event_type,
      status: event.status,
      description: event.event_description,
      location: event.checkpoint_name || event.location_address || null,
      attempt: event.attempt_number || null,
      result: event.attempt_result || null,
    }));
  }

  /**
   * Check if delivery is currently in a geofence
   */
  static async getCurrentGeofences(deliveryId) {
    const text = `
      WITH latest_geofence_events AS (
        SELECT 
          geofence_id,
          geofence_name,
          geofence_event,
          recorded_at,
          ROW_NUMBER() OVER (PARTITION BY geofence_id ORDER BY recorded_at DESC) as rn
        FROM ${this.tableName}
        WHERE delivery_id = $1
          AND geofence_id IS NOT NULL
      )
      SELECT geofence_id, geofence_name, geofence_event, recorded_at
      FROM latest_geofence_events
      WHERE rn = 1 AND geofence_event = 'enter'
    `;

    const result = await connectionPool.query(text, [deliveryId]);
    return result.rows;
  }

  /**
   * Purge old tracking events (retention policy)
   */
  static async purgeOldEvents(retentionDays = 90) {
    const text = `
      DELETE FROM ${this.tableName}
      WHERE recorded_at < NOW() - INTERVAL '${retentionDays} days'
    `;
    const result = await connectionPool.query(text);
    
    if (result.rowCount > 0) {
      logger.info('Purged old delivery tracking events', {
        count: result.rowCount,
        olderThan: `${retentionDays} days`,
      });
    }
    
    return result.rowCount;
  }
}

module.exports = DeliveryTracking;