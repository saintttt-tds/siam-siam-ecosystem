/**
 * Browser/Device GPS Location Retrieval
 * 
 * Provides utilities for working with device geolocation data
 * from browsers and mobile devices.
 * 
 * BROWSER API:
 * - navigator.geolocation.getCurrentPosition()
 * - navigator.geolocation.watchPosition()
 * 
 * MOBILE:
 * - Android: LocationManager / FusedLocationProvider
 * - iOS: CLLocationManager
 * 
 * @example
 *   const deviceLoc = require('@siamsiam/shared-utils').geolocation.deviceLocation;
 *   const coordinates = deviceLoc.parseBrowserPosition(position);
 */

class DeviceLocation {
  constructor() {
    // Location accuracy thresholds (meters)
    this.accuracyThresholds = {
      excellent: 10,   // GPS lock
      good: 50,        // Good GPS
      moderate: 100,   // WiFi triangulation
      poor: 500,       // Cell tower
      bad: 1000,       // Very rough
    };
  }

  /**
   * Parse browser geolocation position
   * @param {GeolocationPosition} position - Browser position object
   * @returns {Object} Parsed location data
   */
  parseBrowserPosition(position) {
    if (!position || !position.coords) {
      return { available: false, error: 'No position data' };
    }

    const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = position.coords;

    return {
      available: true,
      lat: latitude,
      lon: longitude,
      accuracy,
      accuracyLevel: this.getAccuracyLevel(accuracy),
      altitude: altitude || null,
      altitudeAccuracy: altitudeAccuracy || null,
      heading: heading || null, // Degrees (0-360)
      speed: speed || null,     // m/s
      timestamp: position.timestamp || Date.now(),
      source: 'browser',
    };
  }

  /**
   * Parse mobile device location (from native APIs)
   * @param {Object} location - Mobile location object
   * @returns {Object} Parsed location data
   */
  parseMobileLocation(location) {
    return {
      available: true,
      lat: location.latitude || location.lat,
      lon: location.longitude || location.lon,
      accuracy: location.accuracy || null,
      accuracyLevel: this.getAccuracyLevel(location.accuracy),
      altitude: location.altitude || null,
      heading: location.heading || location.bearing || null,
      speed: location.speed || null,
      timestamp: location.timestamp || Date.now(),
      source: location.provider || 'mobile',
    };
  }

  /**
   * Get accuracy level description
   * @param {number} accuracy - Accuracy in meters
   * @returns {string} Accuracy level
   */
  getAccuracyLevel(accuracy) {
    if (!accuracy) return 'unknown';
    if (accuracy <= this.accuracyThresholds.excellent) return 'excellent';
    if (accuracy <= this.accuracyThresholds.good) return 'good';
    if (accuracy <= this.accuracyThresholds.moderate) return 'moderate';
    if (accuracy <= this.accuracyThresholds.poor) return 'poor';
    return 'bad';
  }

  /**
   * Check if location accuracy is good enough for delivery
   * @param {number} accuracy - Accuracy in meters
   * @returns {boolean}
   */
  isAccurateEnoughForDelivery(accuracy) {
    return accuracy <= this.accuracyThresholds.good;
  }

  /**
   * Check if location accuracy is good enough for zone validation
   * @param {number} accuracy - Accuracy in meters
   * @returns {boolean}
   */
  isAccurateEnoughForZones(accuracy) {
    return accuracy <= this.accuracyThresholds.moderate;
  }

  /**
   * Calculate distance from device location to a point
   * @param {Object} deviceLocation - Parsed device location
   * @param {number} targetLat - Target latitude
   * @param {number} targetLon - Target longitude
   * @returns {Object} Distance info
   */
  getDistanceTo(deviceLocation, targetLat, targetLon) {
    const distanceCalculator = require('./distance-calculator');
    
    const distance = distanceCalculator.getDistance(
      deviceLocation.lat, deviceLocation.lon,
      targetLat, targetLon
    );

    return {
      distance,
      formatted: distanceCalculator.formatDistance(distance * 1000),
      accuracy: deviceLocation.accuracy,
      isWithinAccuracy: distance <= deviceLocation.accuracy,
    };
  }

  /**
   * Validate location data completeness
   * @param {Object} location - Location object
   * @returns {Object} Validation result
   */
  validate(location) {
    const errors = [];

    if (!location) {
      return { valid: false, errors: ['No location data'] };
    }

    // Check coordinates
    if (typeof location.lat !== 'number' || typeof location.lon !== 'number') {
      errors.push('Missing or invalid coordinates');
    } else {
      // Validate latitude range (-90 to 90)
      if (location.lat < -90 || location.lat > 90) {
        errors.push(`Invalid latitude: ${location.lat}`);
      }
      
      // Validate longitude range (-180 to 180)
      if (location.lon < -180 || location.lon > 180) {
        errors.push(`Invalid longitude: ${location.lon}`);
      }

      // Check for 0,0 (often a default/null value)
      if (location.lat === 0 && location.lon === 0) {
        errors.push('Location is at 0,0 (likely invalid)');
      }
    }

    // Check accuracy
    if (location.accuracy && location.accuracy > 5000) {
      errors.push(`Accuracy too low: ${location.accuracy}m`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * Generate mock location for testing
   * @param {number} lat - Base latitude
   * @param {number} lon - Base longitude
   * @param {number} variance - Random variance in degrees
   * @returns {Object} Mock location
   */
  generateMockLocation(lat, lon, variance = 0.001) {
    return {
      available: true,
      lat: lat + (Math.random() - 0.5) * variance * 2,
      lon: lon + (Math.random() - 0.5) * variance * 2,
      accuracy: 10 + Math.random() * 40,
      accuracyLevel: 'good',
      altitude: null,
      heading: Math.random() * 360,
      speed: Math.random() * 15,
      timestamp: Date.now(),
      source: 'mock',
    };
  }

  /**
   * Get location permission status (browser)
   * @returns {Promise<string>} 'granted', 'denied', 'prompt', or 'unsupported'
   */
  async checkPermission() {
    if (typeof navigator === 'undefined' || !navigator.permissions) {
      return 'unsupported';
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      return result.state;
    } catch (error) {
      return 'unsupported';
    }
  }

  /**
   * Get current position with timeout
   * @param {Object} options - Geolocation options
   * @returns {Promise<Object>} Position data
   */
  getCurrentPosition(options = {}) {
    const {
      enableHighAccuracy = true,
      timeout = 10000,
      maximumAge = 60000,
    } = options;

    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve(this.parseBrowserPosition(position));
        },
        (error) => {
          reject(new Error(`Geolocation error: ${error.message} (code: ${error.code})`));
        },
        { enableHighAccuracy, timeout, maximumAge }
      );
    });
  }

  /**
   * Start watching position
   * @param {Function} callback - Called with each position update
   * @param {Object} options - Watch options
   * @returns {number} Watch ID (for clearing)
   */
  watchPosition(callback, options = {}) {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new Error('Geolocation not supported');
    }

    const {
      enableHighAccuracy = true,
      timeout = 10000,
      maximumAge = 0,
      distanceFilter = 10, // Minimum distance (meters) between updates
    } = options;

    return navigator.geolocation.watchPosition(
      (position) => {
        callback(null, this.parseBrowserPosition(position));
      },
      (error) => {
        callback(error);
      },
      { enableHighAccuracy, timeout, maximumAge }
    );
  }

  /**
   * Clear position watch
   * @param {number} watchId - Watch ID to clear
   */
  clearWatch(watchId) {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
  }
}

module.exports = new DeviceLocation();