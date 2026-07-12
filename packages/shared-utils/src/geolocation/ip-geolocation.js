const axios = require('axios');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * IP-to-Location Lookup Service
 * 
 * Provides geolocation data based on IP address using
 * multiple providers with fallback support.
 * 
 * DATA PROVIDED:
 * - Country, region, city
 * - Latitude, longitude
 * - Timezone
 * - ISP information
 * - Connection type
 * 
 * PROVIDERS (with fallback):
 * - MaxMind GeoIP2 (local database - fastest)
 * - ip-api.com (free tier)
 * - ipinfo.io (commercial)
 * 
 * @example
 *   const ipGeo = require('@siamsiam/shared-utils').geolocation.ipGeolocation;
 *   const location = await ipGeo.lookup('41.203.67.18');
 *   if (location.country === 'ZW') { /* Zimbabwe-specific logic * / }
 */

class IPGeolocation {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 3600000; // 1 hour
    this.providers = [
      { name: 'ipapi', url: 'http://ip-api.com/json/{ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,as,query' },
      { name: 'ipinfo', url: 'https://ipinfo.io/{ip}/json', headers: { Authorization: `Bearer ${config.thirdParty.ipinfoToken || ''}` } },
    ];
    this.currentProviderIndex = 0;
    this.requestTimeout = 5000;
    this.maxRetries = 2;
  }

  /**
   * Lookup geolocation for an IP address
   * @param {string} ip - IP address to lookup
   * @param {Object} options - Lookup options
   * @returns {Promise<Object>} Geolocation data
   */
  async lookup(ip, options = {}) {
    const { bypassCache = false } = options;

    // Check local IPs
    if (this._isLocalIP(ip)) {
      return this._getLocalLocation();
    }

    // Check cache
    if (!bypassCache && this.cache.has(ip)) {
      const cached = this.cache.get(ip);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data;
      }
    }

    // Try providers
    let lastError = null;

    for (let i = 0; i < this.providers.length; i++) {
      const providerIndex = (this.currentProviderIndex + i) % this.providers.length;
      const provider = this.providers[providerIndex];

      try {
        const data = await this._queryProvider(provider, ip);
        
        if (data) {
          const location = this._normalizeResponse(data, provider.name);
          
          // Cache result
          this.cache.set(ip, {
            data: location,
            timestamp: Date.now(),
          });

          this.currentProviderIndex = providerIndex;
          return location;
        }
      } catch (error) {
        lastError = error;
        logger.warn(`IP geolocation provider failed: ${provider.name}`, {
          error: error.message,
          ip,
        });
      }
    }

    // All providers failed - return default
    logger.error('All IP geolocation providers failed', {
      ip,
      lastError: lastError?.message,
    });

    return {
      ip,
      country: 'Unknown',
      countryCode: 'UN',
      region: null,
      city: null,
      lat: 0,
      lon: 0,
      timezone: 'UTC',
      isp: null,
      source: 'fallback',
      isReliable: false,
    };
  }

  /**
   * Bulk lookup multiple IPs
   * @param {string[]} ips - Array of IP addresses
   * @returns {Promise<Object>} Map of IP -> location
   */
  async bulkLookup(ips) {
    const results = {};
    const uniqueIPs = [...new Set(ips)];

    // Check cache first
    const uncachedIPs = [];
    for (const ip of uniqueIPs) {
      if (this.cache.has(ip)) {
        const cached = this.cache.get(ip);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          results[ip] = cached.data;
          continue;
        }
      }
      uncachedIPs.push(ip);
    }

    // Lookup uncached IPs in parallel (with rate limiting)
    const batchSize = 5;
    for (let i = 0; i < uncachedIPs.length; i += batchSize) {
      const batch = uncachedIPs.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(ip => this.lookup(ip))
      );

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results[batch[index]] = result.value;
        } else {
          results[batch[index]] = {
            ip: batch[index],
            error: result.reason?.message,
          };
        }
      });
    }

    return results;
  }

  /**
   * Get location from IP (simplified - returns country only)
   */
  async getCountry(ip) {
    const location = await this.lookup(ip);
    return location.countryCode;
  }

  /**
   * Check if IP is from a specific country
   */
  async isFromCountry(ip, countryCode) {
    const location = await this.lookup(ip);
    return location.countryCode === countryCode;
  }

  /**
   * Check if IP is within Africa
   */
  async isAfrican(ip) {
    const africanCountries = new Set([
      'ZW', 'ZA', 'BW', 'ZM', 'KE', 'NG', 'TZ',
      'GH', 'UG', 'RW', 'MW', 'MZ', 'NA', 'AO',
      'EG', 'MA', 'TN', 'DZ', 'LY', 'SD', 'ET',
      'SO', 'CD', 'CG', 'GA', 'CM', 'CI', 'SN',
      'ML', 'BF', 'NE', 'TD', 'CF', 'SS', 'ER',
      'DJ', 'BI', 'GM', 'GW', 'GN', 'SL', 'LR',
      'TG', 'BJ', 'GQ', 'ST', 'CV', 'KM', 'SC',
      'MU', 'MG', 'SZ', 'LS',
    ]);

    const location = await this.lookup(ip);
    return africanCountries.has(location.countryCode);
  }

  /**
   * Clear lookup cache
   */
  clearCache() {
    this.cache.clear();
    logger.debug('IP geolocation cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([ip, entry]) => ({
        ip,
        age: Date.now() - entry.timestamp,
        country: entry.data.countryCode,
      })),
    };
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Query a geolocation provider
   * @private
   */
  async _queryProvider(provider, ip) {
    const url = provider.url.replace('{ip}', ip);
    
    const response = await axios.get(url, {
      headers: provider.headers || {},
      timeout: this.requestTimeout,
    });

    return response.data;
  }

  /**
   * Normalize response from different providers
   * @private
   */
  _normalizeResponse(data, providerName) {
    switch (providerName) {
      case 'ipapi':
        return {
          ip: data.query,
          country: data.country,
          countryCode: data.countryCode,
          region: data.regionName,
          regionCode: data.region,
          city: data.city,
          lat: data.lat,
          lon: data.lon,
          timezone: data.timezone,
          isp: data.isp,
          org: data.org,
          as: data.as,
          source: 'ipapi',
          isReliable: true,
        };

      case 'ipinfo':
        // Handle ipinfo response format
        const loc = data.loc?.split(',');
        return {
          ip: data.ip,
          country: data.country,
          countryCode: data.country,
          region: data.region,
          city: data.city,
          lat: loc ? parseFloat(loc[0]) : null,
          lon: loc ? parseFloat(loc[1]) : null,
          timezone: data.timezone,
          isp: data.org,
          org: data.org,
          postal: data.postal,
          source: 'ipinfo',
          isReliable: true,
        };

      default:
        return data;
    }
  }

  /**
   * Check if IP is local/private
   * @private
   */
  _isLocalIP(ip) {
    // Localhost
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
    
    // Private ranges
    if (/^10\./.test(ip)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
    if (/^192\.168\./.test(ip)) return true;
    
    // Link-local
    if (/^169\.254\./.test(ip)) return true;
    
    return false;
  }

  /**
   * Get default location for local IPs
   * @private
   */
  _getLocalLocation() {
    return {
      ip: '127.0.0.1',
      country: 'Local',
      countryCode: 'LO',
      region: 'Local Development',
      city: 'Local',
      lat: 0,
      lon: 0,
      timezone: 'UTC',
      isp: 'Local',
      source: 'local',
      isReliable: false,
    };
  }
}

module.exports = new IPGeolocation();