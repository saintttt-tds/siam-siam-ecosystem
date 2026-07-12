const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Address Model - Physical/Delivery Address
 * 
 * Stores physical addresses for users, orders, and deliveries.
 * Supports multiple address types with geolocation data.
 * 
 * TABLE: addresses
 * 
 * ADDRESS TYPES:
 * - home: Primary residence
 * - work: Workplace address
 * - billing: Billing address for payments
 * - shipping: Delivery destination
 * - pickup: Collection point
 * - other: Miscellaneous
 * 
 * VERIFICATION:
 * - Addresses can be verified via geocoding
 * - Delivery zone validation on save
 * - Duplicate detection to prevent address spam
 */

class Address extends BaseModel {
  static tableName = 'addresses';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id',
    // Address metadata
    'type', 'label', 'is_default',
    // Recipient information
    'full_name', 'phone', 'email', 'company_name',
    // Address lines
    'address_line1', 'address_line2', 'address_line3',
    // Locality
    'city', 'state', 'postal_code', 'country',
    'neighborhood', 'landmark',
    // Geolocation
    'lat', 'lon', 'geocoded_at', 'geocode_accuracy',
    // Delivery specifics
    'delivery_instructions', 'access_code',
    'gate_code', 'floor_number', 'apartment_number',
    // Verification
    'is_verified', 'verified_at', 'verified_by',
    'verification_method', 'is_business_address',
    // Delivery zone
    'delivery_zone_id', 'delivery_zone_name',
    'is_in_delivery_zone', 'delivery_zone_checked_at',
    // Usage tracking
    'use_count', 'last_used_at',
    // Metadata
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    is_default: 'boolean',
    is_verified: 'boolean',
    is_business_address: 'boolean',
    is_in_delivery_zone: 'boolean',
    lat: 'float',
    lon: 'float',
    geocode_accuracy: 'float',
    use_count: 'integer',
    floor_number: 'integer',
    metadata: 'json',
    tags: 'json',
  };

  static relations = {
    user: {
      type: 'belongsTo',
      model: 'User',
      foreignKey: 'user_id',
      ownerKey: 'id',
    },
  };

  // Address type constants
  static types = {
    HOME: 'home',
    WORK: 'work',
    BILLING: 'billing',
    SHIPPING: 'shipping',
    PICKUP: 'pickup',
    OTHER: 'other',
  };

  // Validation rules
  static validationRules = {
    type: { required: true, enum: Object.values(this.types) },
    full_name: { required: true, maxLength: 200 },
    phone: { required: true },
    address_line1: { required: true, maxLength: 500 },
    city: { required: true, maxLength: 200 },
    country: { required: true, maxLength: 2 },
    postal_code: { maxLength: 20 },
    delivery_instructions: { maxLength: 500 },
  };

  /**
   * Find all addresses for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   */
  static async findByUser(userId, options = {}) {
    return this.findAll({
      where: { user_id: userId },
      orderBy: { is_default: 'DESC', created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Find default address for a user by type
   * @param {string} userId - User ID
   * @param {string} type - Address type (optional)
   */
  static async getDefault(userId, type = null) {
    const criteria = { user_id: userId, is_default: true };
    if (type) criteria.type = type;
    
    return this.findOne({
      where: criteria,
    });
  }

  /**
   * Set an address as default (unset others of same type)
   * @param {string} userId - User ID
   * @param {string} addressId - Address to set as default
   */
  static async setDefault(userId, addressId) {
    // Get the address to find its type
    const address = await this.findById(addressId);
    if (!address || address.user_id !== userId) {
      throw new Error('Address not found or does not belong to user');
    }

    // Unset default for other addresses of the same type
    await connectionPool.query(
      `UPDATE ${this.tableName}
       SET is_default = false, updated_at = NOW()
       WHERE user_id = $1 AND type = $2 AND id != $3`,
      [userId, address.type, addressId]
    );

    // Set new default
    return this.update({ id: addressId }, {
      is_default: true,
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Find addresses within a delivery zone
   * @param {string} zoneId - Delivery zone ID
   * @param {Object} options - Query options
   */
  static async findByDeliveryZone(zoneId, options = {}) {
    return this.findAll({
      where: { delivery_zone_id: zoneId, is_in_delivery_zone: true },
      ...options,
    });
  }

  /**
   * Find nearby addresses for delivery optimization
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {number} radiusKm - Search radius in kilometers
   */
  static async findNearby(lat, lon, radiusKm = 5) {
    const text = `
      SELECT *,
        (6371 * acos(
          cos(radians($1)) * cos(radians(lat))
          * cos(radians(lon) - radians($2))
          + sin(radians($1)) * sin(radians(lat))
        )) AS distance_km
      FROM ${this.tableName}
      WHERE lat IS NOT NULL
        AND lon IS NOT NULL
      HAVING distance_km <= $3
      ORDER BY distance_km ASC
      LIMIT 50
    `;
    
    const result = await connectionPool.query(text, [lat, lon, radiusKm]);
    return result.rows;
  }

  /**
   * Check for duplicate addresses (prevent spam)
   * @param {string} userId - User ID
   * @param {Object} addressData - Address data to check
   */
  static async isDuplicate(userId, addressData) {
    const existing = await this.findOne({
      where: {
        user_id: userId,
        address_line1: addressData.address_line1,
        city: addressData.city,
        country: addressData.country,
      },
    });

    return !!existing;
  }

  /**
   * Format address as a display string
   * @returns {string} Formatted address
   */
  formatDisplay() {
    const parts = [];
    
    if (this.full_name) parts.push(this.full_name);
    if (this.address_line1) parts.push(this.address_line1);
    if (this.address_line2) parts.push(this.address_line2);
    if (this.city) {
      const locality = [this.city];
      if (this.state) locality.push(this.state);
      if (this.postal_code) locality.push(this.postal_code);
      parts.push(locality.join(', '));
    }
    if (this.country) parts.push(this.country);
    if (this.phone) parts.push(`Phone: ${this.phone}`);
    
    return parts.join('\n');
  }

  /**
   * Validate address has minimum required fields for delivery
   * @returns {Object} Validation result
   */
  validateForDelivery() {
    const errors = [];

    if (!this.full_name || this.full_name.trim().length === 0) {
      errors.push('Recipient name is required');
    }
    if (!this.phone) {
      errors.push('Contact phone number is required');
    }
    if (!this.address_line1 || this.address_line1.trim().length === 0) {
      errors.push('Address line 1 is required');
    }
    if (!this.city) {
      errors.push('City is required');
    }
    if (!this.country) {
      errors.push('Country is required');
    }
    if (!this.lat || !this.lon) {
      errors.push('Address must be geocoded with coordinates');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

module.exports = Address;