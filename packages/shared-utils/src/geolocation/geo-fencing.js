const distanceCalculator = require('./distance-calculator');
const logger = require('../logging/logger');

/**
 * Virtual Perimeter Creation and Alerts
 * 
 * Creates and manages geofences - virtual boundaries that trigger
 * events when a device enters or exits the defined area.
 * 
 * USE CASES:
 * - Delivery zone alerts
 * - Driver proximity notifications
 * - Store check-in detection
 * - Asset tracking
 * - Security zone monitoring
 * 
 * GEOFENCE TYPES:
 * - Circular: Point + radius
 * - Polygon: Array of coordinate points
 * - Route corridor: Path with width
 * 
 * @example
 *   const geofencing = require('@siamsiam/shared-utils').geolocation.geoFencing;
 *   
 *   geofencing.createFence('store_1', {
 *     type: 'circle',
 *     center: { lat: -17.825, lon: 31.033 },
 *     radius: 100, // meters
 *   });
 *   
 *   const result = geofencing.checkPosition('driver_1', { lat: -17.826, lon: 31.034 });
 *   if (result.entered) { /* trigger notification * / }
 */

class GeoFencing {
  constructor() {
    this.fences = new Map();
    this.deviceStates = new Map(); // Track device positions relative to fences
  }

  /**
   * Create a geofence
   * @param {string} id - Unique fence identifier
   * @param {Object} config - Fence configuration
   */
  createFence(id, config) {
    const fence = {
      id,
      type: config.type || 'circle',
      active: true,
      createdAt: new Date().toISOString(),
      metadata: config.metadata || {},
      ...config,
    };

    // Validate fence configuration
    this._validateFence(fence);

    this.fences.set(id, fence);
    logger.info('Geofence created', { id, type: fence.type });

    return fence;
  }

  /**
   * Update a geofence
   */
  updateFence(id, updates) {
    const fence = this.fences.get(id);
    if (!fence) throw new Error(`Geofence not found: ${id}`);

    Object.assign(fence, updates, {
      updatedAt: new Date().toISOString(),
    });

    // Clear device states for this fence
    this.deviceStates.forEach((states, deviceId) => {
      delete states[id];
    });

    logger.info('Geofence updated', { id });
    return fence;
  }

  /**
   * Delete a geofence
   */
  deleteFence(id) {
    this.fences.delete(id);
    
    // Clear device states for this fence
    this.deviceStates.forEach((states, deviceId) => {
      delete states[id];
    });

    logger.info('Geofence deleted', { id });
  }

  /**
   * Check a device position against all active fences
   * @param {string} deviceId - Device identifier
   * @param {number} lat - Current latitude
   * @param {number} lon - Current longitude
   * @param {Object} options - Check options
   * @returns {Object} Check result with enter/exit events
   */
  checkPosition(deviceId, lat, lon, options = {}) {
    const events = [];
    const currentStates = {};

    if (!this.deviceStates.has(deviceId)) {
      this.deviceStates.set(deviceId, {});
    }

    const deviceStates = this.deviceStates.get(deviceId);

    for (const [fenceId, fence] of this.fences) {
      if (!fence.active) continue;

      const isInside = this._isInsideFence(lat, lon, fence);
      const wasInside = deviceStates[fenceId] || false;

      currentStates[fenceId] = isInside;

      // Detect state changes
      if (isInside && !wasInside) {
        events.push({
          type: 'enter',
          fenceId,
          deviceId,
          timestamp: new Date().toISOString(),
          position: { lat, lon },
          fenceName: fence.name || fenceId,
        });
      } else if (!isInside && wasInside) {
        events.push({
          type: 'exit',
          fenceId,
          deviceId,
          timestamp: new Date().toISOString(),
          position: { lat, lon },
          fenceName: fence.name || fenceId,
        });
      }

      // Check proximity (outside but close)
      if (!isInside && fence.type === 'circle') {
        const distance = distanceCalculator.getDistance(
          lat, lon,
          fence.center.lat, fence.center.lon
        );
        
        if (distance * 1000 <= fence.radius * 1.5) { // Within 150% of radius
          events.push({
            type: 'nearby',
            fenceId,
            deviceId,
            timestamp: new Date().toISOString(),
            position: { lat, lon },
            distance: distance * 1000, // meters
            fenceName: fence.name || fenceId,
          });
        }
      }
    }

    // Update device states
    this.deviceStates.set(deviceId, currentStates);

    return {
      deviceId,
      position: { lat, lon },
      insideFences: Object.entries(currentStates)
        .filter(([, inside]) => inside)
        .map(([fenceId]) => fenceId),
      events,
      hasEntered: events.some(e => e.type === 'enter'),
      hasExited: events.some(e => e.type === 'exit'),
    };
  }

  /**
   * Check if device is inside a specific fence
   */
  isInsideFence(deviceId, fenceId, lat, lon) {
    const fence = this.fences.get(fenceId);
    if (!fence || !fence.active) return false;

    return this._isInsideFence(lat, lon, fence);
  }

  /**
   * Get all active fences
   */
  getActiveFences() {
    return Array.from(this.fences.values())
      .filter(f => f.active)
      .map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        metadata: f.metadata,
      }));
  }

  /**
   * Get device's current state
   */
  getDeviceState(deviceId) {
    return this.deviceStates.get(deviceId) || {};
  }

  /**
   * Get all devices inside a fence
   */
  getDevicesInFence(fenceId) {
    const devices = [];

    for (const [deviceId, states] of this.deviceStates) {
      if (states[fenceId]) {
        devices.push(deviceId);
      }
    }

    return devices;
  }

  /**
   * Create a route corridor fence
   * @param {string} id - Fence ID
   * @param {Array} waypoints - Array of { lat, lon } points
   * @param {number} corridorWidthMeters - Width of corridor
   * @param {Object} metadata - Additional metadata
   */
  createRouteFence(id, waypoints, corridorWidthMeters = 50, metadata = {}) {
    return this.createFence(id, {
      type: 'route_corridor',
      waypoints,
      corridorWidth: corridorWidthMeters,
      metadata,
    });
  }

  /**
   * Create a store pickup zone
   */
  createStoreZone(storeId, lat, lon, radiusMeters = 100, metadata = {}) {
    return this.createFence(`store_${storeId}`, {
      type: 'circle',
      name: `Store ${storeId} Pickup Zone`,
      center: { lat, lon },
      radius: radiusMeters,
      metadata: { ...metadata, storeId, zoneType: 'pickup' },
    });
  }

  /**
   * Create a delivery area fence
   */
  createDeliveryZone(zoneId, center, radiusMeters, metadata = {}) {
    return this.createFence(`delivery_${zoneId}`, {
      type: 'circle',
      name: `Delivery Zone ${zoneId}`,
      center,
      radius: radiusMeters,
      metadata: { ...metadata, zoneId, zoneType: 'delivery' },
    });
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Check if point is inside a fence
   * @private
   */
  _isInsideFence(lat, lon, fence) {
    switch (fence.type) {
      case 'circle':
        return this._isInsideCircle(lat, lon, fence);
      case 'polygon':
        return this._isInsidePolygon(lat, lon, fence.points);
      case 'route_corridor':
        return this._isInsideRouteCorridor(lat, lon, fence);
      default:
        return false;
    }
  }

  /**
   * Check if point is inside a circular fence
   * @private
   */
  _isInsideCircle(lat, lon, fence) {
    const distance = distanceCalculator.getDistance(
      lat, lon,
      fence.center.lat, fence.center.lon,
      'meters'
    );
    return distance <= fence.radius;
  }

  /**
   * Check if point is inside a polygon fence
   * @private
   */
  _isInsidePolygon(lat, lon, points) {
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
   * Check if point is inside a route corridor
   * @private
   */
  _isInsideRouteCorridor(lat, lon, fence) {
    if (!fence.waypoints || fence.waypoints.length < 2) return false;

    const widthKm = fence.corridorWidth / 1000; // Convert to km

    // Check distance to each segment
    for (let i = 1; i < fence.waypoints.length; i++) {
      const p1 = fence.waypoints[i - 1];
      const p2 = fence.waypoints[i];

      const distToSegment = this._distanceToSegment(lat, lon, p1, p2);
      
      if (distToSegment <= widthKm) return true;
    }

    return false;
  }

  /**
   * Calculate distance from point to line segment
   * @private
   */
  _distanceToSegment(lat, lon, p1, p2) {
    // Simplified: check distance to both endpoints and perpendicular distance
    const d1 = distanceCalculator.getDistance(lat, lon, p1.lat, p1.lon);
    const d2 = distanceCalculator.getDistance(lat, lon, p2.lat, p2.lon);
    
    // Approximate: minimum of distances to endpoints
    // PRODUCTION TODO: Implement proper point-to-segment distance
    return Math.min(d1, d2);
  }

  /**
   * Validate fence configuration
   * @private
   */
  _validateFence(fence) {
    switch (fence.type) {
      case 'circle':
        if (!fence.center || !fence.radius) {
          throw new Error('Circle fence requires center and radius');
        }
        break;
      case 'polygon':
        if (!fence.points || fence.points.length < 3) {
          throw new Error('Polygon fence requires at least 3 points');
        }
        break;
      case 'route_corridor':
        if (!fence.waypoints || fence.waypoints.length < 2) {
          throw new Error('Route corridor requires at least 2 waypoints');
        }
        break;
      default:
        throw new Error(`Unknown fence type: ${fence.type}`);
    }
  }
}

module.exports = new GeoFencing();