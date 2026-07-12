/**
 * Haversine Formula Distance Calculator
 * 
 * Calculates the great-circle distance between two points
 * on the Earth's surface using the Haversine formula.
 * 
 * FORMULA:
 * a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlon/2)
 * c = 2 * atan2(√a, √(1-a))
 * d = R * c
 * 
 * ACCURACY:
 * - Within 0.5% for most distances
 * - Accounts for Earth's curvature
 * - Assumes spherical Earth (WGS84 ellipsoid)
 * 
 * USE CASES:
 * - Delivery distance calculation
 * - Store proximity search
 * - Zone coverage validation
 * - Travel time estimation
 * 
 * @example
 *   const calc = require('@siamsiam/shared-utils').geolocation.distanceCalculator;
 *   const km = calc.getDistance(lat1, lon1, lat2, lon2);
 *   const miles = calc.getDistance(lat1, lon1, lat2, lon2, 'miles');
 */

class DistanceCalculator {
  constructor() {
    // Earth's radius in different units
    this.earthRadius = {
      km: 6371,
      miles: 3959,
      meters: 6371000,
      feet: 20902231,
      yards: 6967420,
    };
  }

  /**
   * Calculate distance between two points
   * @param {number} lat1 - Latitude of point 1
   * @param {number} lon1 - Longitude of point 1
   * @param {number} lat2 - Latitude of point 2
   * @param {number} lon2 - Longitude of point 2
   * @param {string} unit - Unit of measurement (km, miles, meters, feet)
   * @returns {number} Distance in specified unit
   */
  getDistance(lat1, lon1, lat2, lon2, unit = 'km') {
    const R = this.earthRadius[unit] || this.earthRadius.km;
    
    const dLat = this._toRad(lat2 - lat1);
    const dLon = this._toRad(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this._toRad(lat1)) * Math.cos(this._toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return Math.round(distance * 100) / 100;
  }

  /**
   * Calculate bearing between two points
   * @returns {number} Bearing in degrees (0-360)
   */
  getBearing(lat1, lon1, lat2, lon2) {
    const dLon = this._toRad(lon2 - lon1);
    
    const y = Math.sin(dLon) * Math.cos(this._toRad(lat2));
    const x = Math.cos(this._toRad(lat1)) * Math.sin(this._toRad(lat2)) -
              Math.sin(this._toRad(lat1)) * Math.cos(this._toRad(lat2)) * Math.cos(dLon);
    
    let bearing = this._toDeg(Math.atan2(y, x));
    return (bearing + 360) % 360;
  }

  /**
   * Calculate destination point given distance and bearing
   * @param {number} lat - Starting latitude
   * @param {number} lon - Starting longitude
   * @param {number} distance - Distance to travel
   * @param {number} bearing - Bearing in degrees
   * @param {string} unit - Distance unit
   * @returns {Object} { lat, lon }
   */
  getDestination(lat, lon, distance, bearing, unit = 'km') {
    const R = this.earthRadius[unit] || this.earthRadius.km;
    const angularDistance = distance / R;
    
    const lat1 = this._toRad(lat);
    const lon1 = this._toRad(lon);
    const brng = this._toRad(bearing);
    
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(brng)
    );
    
    const lon2 = lon1 + Math.atan2(
      Math.sin(brng) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );
    
    return {
      lat: this._toDeg(lat2),
      lon: this._toDeg(lon2),
    };
  }

  /**
   * Calculate bounding box for a point and radius
   * @param {number} lat - Center latitude
   * @param {number} lon - Center longitude
   * @param {number} radiusKm - Radius in kilometers
   * @returns {Object} { minLat, maxLat, minLon, maxLon }
   */
  getBoundingBox(lat, lon, radiusKm) {
    const latDelta = this._toDeg(radiusKm / this.earthRadius.km);
    const lonDelta = this._toDeg(
      radiusKm / (this.earthRadius.km * Math.cos(this._toRad(lat)))
    );
    
    return {
      minLat: lat - latDelta,
      maxLat: lat + latDelta,
      minLon: lon - lonDelta,
      maxLon: lon + lonDelta,
    };
  }

  /**
   * Check if a point is within a radius of another point
   * @returns {boolean}
   */
  isWithinRadius(lat1, lon1, lat2, lon2, radiusKm) {
    return this.getDistance(lat1, lon1, lat2, lon2, 'km') <= radiusKm;
  }

  /**
   * Calculate midpoint between two points
   * @returns {Object} { lat, lon }
   */
  getMidpoint(lat1, lon1, lat2, lon2) {
    const dLon = this._toRad(lon2 - lon1);
    
    const Bx = Math.cos(this._toRad(lat2)) * Math.cos(dLon);
    const By = Math.cos(this._toRad(lat2)) * Math.sin(dLon);
    
    const lat3 = Math.atan2(
      Math.sin(this._toRad(lat1)) + Math.sin(this._toRad(lat2)),
      Math.sqrt(
        (Math.cos(this._toRad(lat1)) + Bx) * (Math.cos(this._toRad(lat1)) + Bx) + By * By
      )
    );
    
    const lon3 = this._toRad(lon1) + Math.atan2(
      By,
      Math.cos(this._toRad(lat1)) + Bx
    );
    
    return {
      lat: this._toDeg(lat3),
      lon: this._toDeg(lon3),
    };
  }

  /**
   * Calculate total distance of a route (array of points)
   * @param {Array} points - Array of { lat, lon } objects
   * @param {string} unit - Distance unit
   * @returns {number} Total distance
   */
  getRouteDistance(points, unit = 'km') {
    if (!points || points.length < 2) return 0;
    
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += this.getDistance(
        points[i - 1].lat, points[i - 1].lon,
        points[i].lat, points[i].lon,
        unit
      );
    }
    
    return total;
  }

  /**
   * Find nearest point from a list
   * @param {number} lat - Reference latitude
   * @param {number} lon - Reference longitude
   * @param {Array} points - Array of { lat, lon, ... } objects
   * @returns {Object} Nearest point with distance
   */
  findNearest(lat, lon, points) {
    if (!points || points.length === 0) return null;
    
    let nearest = null;
    let minDistance = Infinity;
    
    for (const point of points) {
      const distance = this.getDistance(lat, lon, point.lat, point.lon);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = { ...point, distance };
      }
    }
    
    return nearest;
  }

  /**
   * Cluster nearby points
   * @param {Array} points - Array of { lat, lon } objects
   * @param {number} clusterRadiusKm - Cluster radius in km
   * @returns {Array} Array of clusters
   */
  clusterPoints(points, clusterRadiusKm = 1) {
    const clusters = [];
    const used = new Set();
    
    for (let i = 0; i < points.length; i++) {
      if (used.has(i)) continue;
      
      const cluster = {
        center: points[i],
        points: [points[i]],
        count: 1,
      };
      
      used.add(i);
      
      for (let j = i + 1; j < points.length; j++) {
        if (used.has(j)) continue;
        
        const dist = this.getDistance(
          cluster.center.lat, cluster.center.lon,
          points[j].lat, points[j].lon
        );
        
        if (dist <= clusterRadiusKm) {
          cluster.points.push(points[j]);
          cluster.count++;
          used.add(j);
        }
      }
      
      clusters.push(cluster);
    }
    
    return clusters;
  }

  /**
   * Convert distance to human-readable string
   */
  formatDistance(meters) {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  }

  /**
   * Estimate travel time
   * @param {number} distanceKm - Distance in kilometers
   * @param {string} mode - Travel mode (driving, walking, cycling, flying)
   * @returns {number} Estimated time in minutes
   */
  estimateTravelTime(distanceKm, mode = 'driving') {
    const speeds = {
      driving: 60,    // 60 km/h average in city
      walking: 5,     // 5 km/h walking
      cycling: 20,    // 20 km/h cycling
      flying: 800,    // 800 km/h commercial flight
      drone: 50,      // 50 km/h delivery drone
    };
    
    const speed = speeds[mode] || speeds.driving;
    const hours = distanceKm / speed;
    
    return Math.round(hours * 60);
  }

  // ==================== PRIVATE METHODS ====================

  _toRad(deg) {
    return deg * (Math.PI / 180);
  }

  _toDeg(rad) {
    return rad * (180 / Math.PI);
  }
}

module.exports = new DistanceCalculator();