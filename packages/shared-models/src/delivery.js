const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Delivery Model - Delivery Job Record
 * 
 * Represents a delivery job from pickup to completion.
 * Tracks driver/drone assignment, routing, and proof of delivery.
 * 
 * TABLE: deliveries
 * 
 * DELIVERY METHODS:
 * - motorcycle: Standard motorbike delivery
 * - car: Car/van delivery for larger items
 * - bicycle: Eco-friendly bike delivery
 * - walking: Walking delivery for very short distances
 * - drone: Autonomous drone delivery
 * - third_party: External logistics partner
 */

class Delivery extends BaseModel {
  static tableName = 'deliveries';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'order_id', 'delivery_number',
    // Assignment
    'driver_id', 'drone_id', 'delivery_method',
    'backup_driver_id', 'assignment_type',
    // Locations
    'pickup_address_id', 'pickup_address_json',
    'delivery_address_id', 'delivery_address_json',
    'pickup_lat', 'pickup_lon',
    'delivery_lat', 'delivery_lon',
    // Route
    'route_waypoints', 'route_distance_km',
    'route_duration_minutes', 'route_polyline',
    // Status
    'status', 'status_history',
    'pickup_at', 'picked_up_at',
    'in_transit_at', 'out_for_delivery_at',
    'delivered_at', 'failed_at', 'cancelled_at',
    // Timing
    'estimated_pickup_at', 'estimated_delivery_at',
    'actual_delivery_time_minutes', 'delay_minutes',
    'delay_reason',
    // Recipient
    'recipient_name', 'recipient_phone', 'recipient_email',
    'delivery_instructions', 'access_code',
    // Contactless delivery
    'is_contactless', 'drop_off_location',
    'drop_off_photo_url',
    // Proof of Delivery
    'proof_of_delivery_type', 'signature_url',
    'photo_url', 'recipient_name_collected',
    'recipient_relation', 'id_document_photo_url',
    // COD (Cash on Delivery)
    'is_cod', 'cod_amount', 'cod_currency',
    'cod_collected', 'cod_collection_status',
    'cod_reference',
    // Package info
    'package_count', 'package_weight_kg',
    'package_dimensions', 'package_description',
    'fragile_items', 'requires_signature',
    'temperature_controlled', 'temperature_range',
    // Ratings
    'customer_rating', 'customer_feedback',
    'driver_rating', 'driver_feedback',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    pickup_address_json: 'json',
    delivery_address_json: 'json',
    route_waypoints: 'json',
    status_history: 'json',
    package_dimensions: 'json',
    metadata: 'json',
    tags: 'json',
    is_contactless: 'boolean',
    is_cod: 'boolean',
    cod_collected: 'boolean',
    fragile_items: 'boolean',
    requires_signature: 'boolean',
    temperature_controlled: 'boolean',
    route_distance_km: 'float',
    route_duration_minutes: 'float',
    cod_amount: 'float',
    package_weight_kg: 'float',
    customer_rating: 'integer',
    driver_rating: 'integer',
    actual_delivery_time_minutes: 'integer',
    delay_minutes: 'integer',
    package_count: 'integer',
  };

  static relations = {
    order: { type: 'belongsTo', model: 'Order', foreignKey: 'order_id', ownerKey: 'id' },
    driver: { type: 'belongsTo', model: 'Driver', foreignKey: 'driver_id', ownerKey: 'id' },
    drone: { type: 'belongsTo', model: 'Drone', foreignKey: 'drone_id', ownerKey: 'id' },
    tracking: { type: 'hasMany', model: 'DeliveryTracking', foreignKey: 'delivery_id', localKey: 'id' },
  };

  static statuses = {
    PENDING: 'pending', ASSIGNED: 'assigned',
    ACCEPTED: 'accepted', EN_ROUTE_TO_PICKUP: 'en_route_to_pickup',
    ARRIVED_AT_PICKUP: 'arrived_at_pickup', PICKED_UP: 'picked_up',
    IN_TRANSIT: 'in_transit', OUT_FOR_DELIVERY: 'out_for_delivery',
    ARRIVED_AT_DELIVERY: 'arrived_at_delivery', DELIVERED: 'delivered',
    FAILED: 'failed', CANCELLED: 'cancelled', RETURNED: 'returned',
    RESCHEDULED: 'rescheduled',
  };

  static deliveryMethods = {
    MOTORCYCLE: 'motorcycle', CAR: 'car',
    BICYCLE: 'bicycle', WALKING: 'walking',
    DRONE: 'drone', THIRD_PARTY: 'third_party',
  };

  static proofTypes = {
    SIGNATURE: 'signature', PHOTO: 'photo',
    ID_DOCUMENT: 'id_document', PIN_CODE: 'pin_code',
    NONE: 'none',
  };

  /**
   * Generate delivery number
   */
  static generateDeliveryNumber() {
    const timestamp = Date.now().toString(36).toUpperCase();
    return `DLV-${timestamp}`;
  }

  /**
   * Find deliveries by driver
   */
  static async findByDriver(driverId, options = {}) {
    return this.findAll({
      where: { driver_id: driverId },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Find active deliveries for a driver
   */
  static async findActiveByDriver(driverId) {
    return this.findAll({
      where: {
        driver_id: driverId,
        status: [
          this.statuses.ACCEPTED, this.statuses.EN_ROUTE_TO_PICKUP,
          this.statuses.ARRIVED_AT_PICKUP, this.statuses.PICKED_UP,
          this.statuses.IN_TRANSIT, this.statuses.OUT_FOR_DELIVERY,
        ],
      },
    });
  }

  /**
   * Find pending deliveries (unassigned)
   */
  static async findPending(options = {}) {
    return this.findAll({
      where: { status: this.statuses.PENDING },
      orderBy: { created_at: 'ASC' },
      ...options,
    });
  }

  /**
   * Find deliveries near a location
   */
  static async findNearby(lat, lon, radiusKm = 10) {
    const text = `
      SELECT *,
        (6371 * acos(
          cos(radians($1)) * cos(radians(pickup_lat))
          * cos(radians(pickup_lon) - radians($2))
          + sin(radians($1)) * sin(radians(pickup_lat))
        )) AS distance_km
      FROM ${this.tableName}
      WHERE status = 'pending'
        AND pickup_lat IS NOT NULL
      HAVING distance_km <= $3
      ORDER BY distance_km ASC
    `;
    const result = await connectionPool.query(text, [lat, lon, radiusKm]);
    return result.rows;
  }

  /**
   * Assign delivery to driver
   */
  static async assignDriver(deliveryId, driverId, method = 'motorcycle') {
    const updates = {
      driver_id: driverId,
      delivery_method: method,
      status: this.statuses.ASSIGNED,
      assigned_at: new Date().toISOString(),
    };

    // Add to status history
    const delivery = await this.findById(deliveryId);
    if (delivery) {
      const history = delivery.status_history || [];
      history.push({
        status: this.statuses.ASSIGNED,
        timestamp: new Date().toISOString(),
        driverId,
        method,
      });
      updates.status_history = history;
    }

    return this.update({ id: deliveryId }, updates);
  }

  /**
   * Update delivery status with timestamp
   */
  static async updateStatus(deliveryId, status, metadata = {}) {
    const delivery = await this.findById(deliveryId);
    if (!delivery) throw new Error('Delivery not found');

    const updates = { status };
    const history = delivery.status_history || [];

    // Set status-specific timestamps
    switch (status) {
      case this.statuses.PICKED_UP:
        updates.picked_up_at = new Date().toISOString();
        break;
      case this.statuses.IN_TRANSIT:
        updates.in_transit_at = new Date().toISOString();
        break;
      case this.statuses.OUT_FOR_DELIVERY:
        updates.out_for_delivery_at = new Date().toISOString();
        break;
      case this.statuses.DELIVERED:
        updates.delivered_at = new Date().toISOString();
        updates.actual_delivery_time_minutes = metadata.durationMinutes;
        break;
      case this.statuses.FAILED:
        updates.failed_at = new Date().toISOString();
        updates.failure_reason = metadata.reason;
        break;
      case this.statuses.CANCELLED:
        updates.cancelled_at = new Date().toISOString();
        updates.cancellation_reason = metadata.reason;
        break;
    }

    history.push({
      status,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
    updates.status_history = history;

    return this.update({ id: deliveryId }, updates);
  }

  /**
   * Record proof of delivery
   */
  static async recordProofOfDelivery(deliveryId, proofType, proofData = {}) {
    const updates = {
      status: this.statuses.DELIVERED,
      delivered_at: new Date().toISOString(),
      proof_of_delivery_type: proofType,
    };

    switch (proofType) {
      case this.proofTypes.SIGNATURE:
        updates.signature_url = proofData.signatureUrl;
        break;
      case this.proofTypes.PHOTO:
        updates.photo_url = proofData.photoUrl;
        break;
      case this.proofTypes.ID_DOCUMENT:
        updates.id_document_photo_url = proofData.documentUrl;
        updates.recipient_name_collected = proofData.recipientName;
        break;
      case this.proofTypes.PIN_CODE:
        updates.delivery_pin = proofData.pin;
        break;
    }

    if (proofData.recipientName) {
      updates.recipient_name_collected = proofData.recipientName;
    }
    if (proofData.recipientRelation) {
      updates.recipient_relation = proofData.recipientRelation;
    }

    return this.update({ id: deliveryId }, updates);
  }

  /**
   * Record COD collection
   */
  static async recordCODCollection(deliveryId, amount, reference = null) {
    return this.update({ id: deliveryId }, {
      cod_collected: true,
      cod_collection_status: 'collected',
      cod_reference: reference,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Get delivery statistics
   */
  static async getStats(options = {}) {
    const text = `
      SELECT
        COUNT(*) as total_deliveries,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN status IN ('accepted', 'en_route_to_pickup', 'picked_up', 'in_transit', 'out_for_delivery') THEN 1 END) as active,
        AVG(actual_delivery_time_minutes) as avg_delivery_time,
        AVG(customer_rating) as avg_customer_rating,
        SUM(CASE WHEN is_cod THEN cod_amount ELSE 0 END) as total_cod_amount
      FROM ${this.tableName}
      ${options.startDate ? 'WHERE created_at >= $1' : ''}
    `;
    const values = options.startDate ? [options.startDate.toISOString()] : [];
    const result = await connectionPool.query(text, values);
    return result.rows[0];
  }
}

module.exports = Delivery;