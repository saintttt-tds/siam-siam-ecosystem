const net = require('net');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * IP Allowlist and Blocklist Management
 * 
 * Manages IP-based access control with support for:
 * - Individual IP addresses (192.168.1.1)
 * - CIDR ranges (192.168.1.0/24)
 * - Wildcard patterns (192.168.*.*)
 * - Dynamic updates without restart
 * - Automatic expiry for temporary blocks
 * 
 * USE CASES:
 * - Admin panel access restriction
 * - API endpoint protection
 * - Automated blocking of malicious IPs
 * - Geo-based access control
 * - Partner/vendor IP allowlisting
 * 
 * PRODUCTION TODO:
 * - Store lists in database for persistence
 * - Integrate with threat intelligence feeds
 * - Implement automatic unblocking after cooldown
 * - Add rate of change monitoring
 * 
 * @example
 *   const ipList = require('@siamsiam/shared-utils').security.ipWhitelist;
 *   
 *   ipList.addToAllowlist('10.0.0.0/8'); // Allow internal network
 *   ipList.addToBlocklist('192.168.1.100', 'Manual block');
 *   
 *   if (ipList.isBlocked(clientIp)) { /* deny access * / }
 *   if (!ipList.isAllowed(clientIp)) { /* deny access * / }
 */

class IPWhitelist {
  constructor() {
    this.allowlist = new Map();  // IP/CIDR -> metadata
    this.blocklist = new Map();  // IP/CIDR -> metadata
    this.tempBlocks = new Map(); // IP -> expiry timestamp
    
    // Default allowlist (always allowed)
    this.addToAllowlist('127.0.0.1', 'Localhost');
    this.addToAllowlist('::1', 'Localhost IPv6');
    
    // Private network ranges (typically allowed for internal services)
    this.addToAllowlist('10.0.0.0/8', 'Private network');
    this.addToAllowlist('172.16.0.0/12', 'Private network');
    this.addToAllowlist('192.168.0.0/16', 'Private network');
    
    // Start cleanup interval
    this._startTempBlockCleanup();
  }

  /**
   * Add IP or CIDR range to allowlist
   * @param {string} cidr - IP address or CIDR range
   * @param {string} description - Why this is allowed
   * @param {Object} options - Additional options
   */
  addToAllowlist(cidr, description = '', options = {}) {
    const entry = {
      cidr,
      description,
      addedAt: new Date().toISOString(),
      addedBy: options.addedBy || 'system',
      expiresAt: options.expiresAt || null,
      permanent: options.permanent !== false,
    };

    this.allowlist.set(cidr, entry);
    logger.info(`IP added to allowlist: ${cidr}`, { description });
  }

  /**
   * Remove from allowlist
   */
  removeFromAllowlist(cidr) {
    this.allowlist.delete(cidr);
    logger.info(`IP removed from allowlist: ${cidr}`);
  }

  /**
   * Add IP or CIDR range to blocklist
   * @param {string} cidr - IP address or CIDR range
   * @param {string} reason - Reason for blocking
   * @param {Object} options - Additional options
   */
  addToBlocklist(cidr, reason = '', options = {}) {
    const entry = {
      cidr,
      reason,
      addedAt: new Date().toISOString(),
      addedBy: options.addedBy || 'system',
      expiresAt: options.expiresAt || null,
      permanent: options.permanent !== false,
      blockCount: options.blockCount || 0,
    };

    this.blocklist.set(cidr, entry);
    logger.warn(`IP added to blocklist: ${cidr}`, { reason });
  }

  /**
   * Remove from blocklist
   */
  removeFromBlocklist(cidr) {
    this.blocklist.delete(cidr);
    logger.info(`IP removed from blocklist: ${cidr}`);
  }

  /**
   * Temporarily block an IP
   * @param {string} ip - IP address to block
   * @param {number} durationMs - Block duration in milliseconds
   * @param {string} reason - Reason for blocking
   */
  tempBlock(ip, durationMs = 3600000, reason = '') {
    this.tempBlocks.set(ip, {
      expiresAt: Date.now() + durationMs,
      reason,
      blockedAt: new Date().toISOString(),
    });
    
    logger.warn(`IP temporarily blocked: ${ip}`, {
      duration: `${durationMs / 1000}s`,
      reason,
    });
  }

  /**
   * Remove temporary block
   */
  removeTempBlock(ip) {
    this.tempBlocks.delete(ip);
    logger.info(`Temporary block removed for: ${ip}`);
  }

  /**
   * Check if an IP is blocked
   * @param {string} ip - IP address to check
   * @returns {Object|boolean} Block info if blocked, false otherwise
   */
  isBlocked(ip) {
    // Check temporary blocks first
    const tempBlock = this.tempBlocks.get(ip);
    if (tempBlock) {
      if (Date.now() < tempBlock.expiresAt) {
        return { blocked: true, reason: tempBlock.reason, temporary: true };
      }
      // Expired - remove
      this.tempBlocks.delete(ip);
    }

    // Check permanent blocklist
    for (const [cidr, entry] of this.blocklist) {
      if (this._ipInRange(ip, cidr)) {
        // Check if block has expired
        if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
          this.blocklist.delete(cidr);
          continue;
        }
        return { blocked: true, reason: entry.reason, entry };
      }
    }

    return false;
  }

  /**
   * Check if an IP is allowed
   * @param {string} ip - IP address to check
   * @returns {boolean} True if IP is allowed
   */
  isAllowed(ip) {
    // Check allowlist
    for (const [cidr, entry] of this.allowlist) {
      if (this._ipInRange(ip, cidr)) {
        // Check if allow has expired
        if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
          this.allowlist.delete(cidr);
          continue;
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Express middleware for IP filtering
   * @param {Object} options - Middleware options
   */
  middleware(options = {}) {
    const {
      allowlistOnly = false,      // Only allow listed IPs
      blocklistOnly = true,       // Block listed IPs
      excludePaths = [],          // Paths to exclude from filtering
      trustProxy = true,          // Trust X-Forwarded-For header
    } = options;

    return (req, res, next) => {
      // Skip excluded paths
      if (excludePaths.some(p => req.path.startsWith(p))) {
        return next();
      }

      // Get client IP
      const clientIp = trustProxy 
        ? (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip)
        : req.ip;

      // Check blocklist first
      if (blocklistOnly) {
        const blocked = this.isBlocked(clientIp);
        if (blocked) {
          logger.warn('Request blocked by IP filter', {
            ip: clientIp,
            path: req.path,
            reason: blocked.reason,
          });
          
          return res.status(403).json({
            success: false,
            error: 'Access denied',
            reason: 'IP address is blocked',
          });
        }
      }

      // Check allowlist
      if (allowlistOnly && !this.isAllowed(clientIp)) {
        logger.warn('Request denied - IP not in allowlist', {
          ip: clientIp,
          path: req.path,
        });
        
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          reason: 'IP address not authorized',
        });
      }

      next();
    };
  }

  /**
   * Get statistics about IP lists
   */
  getStats() {
    return {
      allowlist: {
        count: this.allowlist.size,
        entries: Array.from(this.allowlist.entries()).map(([cidr, entry]) => ({
          cidr,
          description: entry.description,
          addedAt: entry.addedAt,
          permanent: entry.permanent,
        })),
      },
      blocklist: {
        count: this.blocklist.size,
        entries: Array.from(this.blocklist.entries()).map(([cidr, entry]) => ({
          cidr,
          reason: entry.reason,
          addedAt: entry.addedAt,
          permanent: entry.permanent,
        })),
      },
      tempBlocks: {
        count: this.tempBlocks.size,
        entries: Array.from(this.tempBlocks.entries()).map(([ip, entry]) => ({
          ip,
          reason: entry.reason,
          blockedAt: entry.blockedAt,
          expiresIn: Math.max(0, entry.expiresAt - Date.now()),
        })),
      },
    };
  }

  /**
   * Export blocklist for sharing with other services
   */
  exportBlocklist() {
    return Array.from(this.blocklist.entries()).map(([cidr, entry]) => ({
      cidr,
      reason: entry.reason,
      addedAt: entry.addedAt,
    }));
  }

  /**
   * Import blocklist from external source
   */
  importBlocklist(entries) {
    let imported = 0;
    
    for (const entry of entries) {
      if (entry.cidr) {
        this.addToBlocklist(entry.cidr, entry.reason || 'Imported');
        imported++;
      }
    }

    logger.info(`Imported ${imported} entries to blocklist`);
    return imported;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Check if an IP is within a CIDR range
   * @private
   */
  _ipInRange(ip, cidr) {
    try {
      // Handle wildcard patterns (192.168.*.*)
      if (cidr.includes('*')) {
        return this._matchWildcard(ip, cidr);
      }

      // If cidr is a single IP (no /)
      if (!cidr.includes('/')) {
        return ip === cidr;
      }

      // CIDR range check
      const [range, bits] = cidr.split('/');
      const mask = ~(2 ** (32 - parseInt(bits)) - 1);
      
      const ipNum = this._ipToNumber(ip);
      const rangeNum = this._ipToNumber(range);
      
      return (ipNum & mask) === (rangeNum & mask);
    } catch (error) {
      logger.error('IP range check failed', { ip, cidr, error: error.message });
      return false;
    }
  }

  /**
   * Match IP against wildcard pattern
   * @private
   */
  _matchWildcard(ip, pattern) {
    const ipParts = ip.split('.');
    const patternParts = pattern.split('.');

    if (ipParts.length !== 4 || patternParts.length !== 4) {
      return false;
    }

    for (let i = 0; i < 4; i++) {
      if (patternParts[i] !== '*' && patternParts[i] !== ipParts[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Convert IP address to number
   * @private
   */
  _ipToNumber(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4) {
      // Handle IPv6
      return 0;
    }
    return parts.reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  }

  /**
   * Start periodic cleanup of temporary blocks
   * @private
   */
  _startTempBlockCleanup() {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [ip, entry] of this.tempBlocks) {
        if (now >= entry.expiresAt) {
          this.tempBlocks.delete(ip);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug(`Cleaned ${cleaned} expired temporary blocks`);
      }
    }, 60000); // Every minute

    // Also clean up expired allowlist/blocklist entries
    setInterval(() => {
      const now = new Date();
      
      for (const [cidr, entry] of this.allowlist) {
        if (entry.expiresAt && new Date(entry.expiresAt) < now) {
          this.allowlist.delete(cidr);
        }
      }
      
      for (const [cidr, entry] of this.blocklist) {
        if (entry.expiresAt && new Date(entry.expiresAt) < now) {
          this.blocklist.delete(cidr);
        }
      }
    }, 300000); // Every 5 minutes
  }
}

// Export singleton instance
module.exports = new IPWhitelist();