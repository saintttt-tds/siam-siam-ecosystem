const distanceCalculator = require('./distance-calculator');
const logger = require('../logging/logger');

/**
 * Delivery Zone Coverage and Availability Check
 * 
 * Validates whether a location falls within defined delivery zones.
 * Supports multiple zone types, dynamic zone definitions,
 * and real-time availability checking.
 * 
 * ZONE TYPES:
 * - Circular: Point + radius
 * - Polygon: Set of coordinate points
 * - Administrative: City, province, country
 * - Custom: Business-defined zones
 * 
 * @example
 *   const zones = require('@siamsiam/shared-utils').geolocation.zoneValidator;
 *   const result = zones.isInDeliveryZone(lat, lon, zoneId);
 *   if (result.available) { /* show delivery options * / }
 */

class ZoneValidator {
  constructor() {
    // Zone cache
    this.zones = new Map();
    
    // Default zones (PRODUCTION: Load from database)
    this._loadDefaultZones();
  }

  /**
   * Check if location is within a delivery zone
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {string} zoneId - Zone identifier
   * @returns {Object} Validation result
   */
  isInDeliveryZone(lat, lon, zoneId) {
    const zone = this.zones.get(zoneId);
    
    if (!zone) {
      return {
        available: false,
        error: 'Zone not found',
        zoneId,
      };
    }

    if (!zone.active) {
      return {
        available: false,
        error: 'Zone is inactive',
        zoneId,
        zoneName: zone.name,
      };
    }

    // Check operating hours
    if (!this._isWithinOperatingHours(zone)) {
      return {
        available: false,
        error: 'Outside operating hours',
        zoneId,
        zoneName: zone.name,
        operatingHours: zone.operatingHours,
      };
    }

    // Check location against zone type
    let inZone = false;
    
    switch (zone.type) {
      case 'circle':
        inZone = this._isInCircle(lat, lon, zone);
        break;
      case 'polygon':
        inZone = this._isInPolygon(lat, lon, zone.points);
        break;
      case 'administrative':
        inZone = this._isInAdministrativeZone(lat, lon, zone);
        break;
      case 'custom':
        inZone = this._checkCustomZone(lat, lon, zone);
        break;
      default:
        inZone = false;
    }

    return {
      available: inZone,
      zoneId,
      zoneName: zone.name,
      zoneType: zone.type,
      deliveryFee: inZone ? zone.deliveryFee : null,
      estimatedTime: inZone ? zone.estimatedTime : null,
      minimumOrder: inZone ? zone.minimumOrder : null,
      maxDistance: zone.maxDistance,
    };
  }

  /**
   * Find all available zones for a location
   * @returns {Array} Available zones
   */
  findAvailableZones(lat, lon) {
    const availableZones = [];
    
    for (const [zoneId, zone] of this.zones) {
      const result = this.isInDeliveryZone(lat, lon, zoneId);
      if (result.available) {
        availableZones.push(result);
      }
    }
    
    // Sort by delivery fee (cheapest first)
    availableZones.sort((a, b) => (a.deliveryFee || 0) - (b.deliveryFee || 0));
    
    return availableZones;
  }

  /**
   * Check if delivery is available to a location (any zone)
   */
  isDeliveryAvailable(lat, lon) {
    const zones = this.findAvailableZones(lat, lon);
    return {
      available: zones.length > 0,
      zones,
      bestZone: zones[0] || null,
    };
  }

  /**
   * Add or update a delivery zone
   */
  addZone(zoneId, zoneConfig) {
    this.zones.set(zoneId, {
      id: zoneId,
      ...zoneConfig,
      updatedAt: new Date().toISOString(),
    });
    
    logger.info('Delivery zone added/updated', { zoneId, name: zoneConfig.name });
  }

  /**
   * Remove a delivery zone
   */
  removeZone(zoneId) {
    this.zones.delete(zoneId);
    logger.info('Delivery zone removed', { zoneId });
  }

  /**
   * Get all zones
   */
  getAllZones() {
    return Array.from(this.zones.entries()).map(([id, zone]) => ({
      id,
      name: zone.name,
      type: zone.type,
      active: zone.active,
      deliveryFee: zone.deliveryFee,
      estimatedTime: zone.estimatedTime,
    }));
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Check if point is within a circular zone
   * @private
   */
  _isInCircle(lat, lon, zone) {
    const distance = distanceCalculator.getDistance(
      lat, lon,
      zone.center.lat, zone.center.lon
    );
    return distance <= zone.radius;
  }

  /**
   * Check if point is within a polygon zone (Ray casting algorithm)
   * @private
   */
  _isInPolygon(lat, lon, points) {
    if (!points || points.length < 3) return false;
    
    let inside = false;
    
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].lat, yi = points[i].lon;
      const xj = points[j].lat, yj = points[j].lon;
      
      const intersect = ((yi > lon) !== (yj > lon)) &&
        (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }

  /**
   * Check administrative zone (city/province/country)
   * @private
   */
  _isInAdministrativeZone(lat, lon, zone) {
    // PRODUCTION TODO: Use reverse geocoding service
    // For now, check against bounding box
    if (zone.boundingBox) {
      return lat >= zone.boundingBox.minLat &&
             lat <= zone.boundingBox.maxLat &&
             lon >= zone.boundingBox.minLon &&
             lon <= zone.boundingBox.maxLon;
    }
    return false;
  }

  /**
   * Check custom zone rules
   * @private
   */
  _checkCustomZone(lat, lon, zone) {
    if (zone.customChecker && typeof zone.customChecker === 'function') {
      return zone.customChecker(lat, lon);
    }
    return false;
  }

  /**
   * Check if within operating hours
   * @private
   */
  _isWithinOperatingHours(zone) {
    if (!zone.operatingHours) return true;
    
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hour * 60 + minutes;
    
    const todayHours = zone.operatingHours[dayOfWeek];
    if (!todayHours) return false;
    
    for (const slot of todayHours) {
      const [startH, startM] = slot.start.split(':').map(Number);
      const [endH, endM] = slot.end.split(':').map(Number);
      const startTime = startH * 60 + startM;
      const endTime = endH * 60 + endM;
      
      if (currentTime >= startTime && currentTime <= endTime) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Load default delivery zones
   * @private
   */
  _loadDefaultZones() {
    // Harare CBD zone
    this.addZone('harare_cbd', {
      name: 'Harare CBD',
      type: 'circle',
      active: true,
      center: { lat: -17.825, lon: 31.033 },
      radius: 10,
      deliveryFee: 5.00,
      estimatedTime: '30-45 min',
      minimumOrder: 10,
      maxDistance: 10,
      operatingHours: {
        1: [{ start: '08:00', end: '18:00' }], // Monday
        2: [{ start: '08:00', end: '18:00' }], // Tuesday
        3: [{ start: '08:00', end: '18:00' }], // Wednesday
        4: [{ start: '08:00', end: '18:00' }], // Thursday
        5: [{ start: '08:00', end: '18:00' }], // Friday
        6: [{ start: '09:00', end: '14:00' }], // Saturday
      },
    });

    // Bulawayo zone
    this.addZone('bulawayo', {
      name: 'Bulawayo',
      type: 'circle',
      active: true,
      center: { lat: -20.15, lon: 28.583 },
      radius: 15,
      deliveryFee: 7.00,
      estimatedTime: '45-60 min',
      minimumOrder: 10,
      maxDistance: 15,
    });
  }
}

module.exports = new ZoneValidator();