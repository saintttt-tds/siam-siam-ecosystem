const logger = require('../logging/logger');
const config = require('@siamsiam/shared-config');

/**
 * Online/Offline User Status Tracking
 * 
 * Tracks user presence across the ecosystem:
 * - Online/offline status
 * - Last seen timestamp
 * - Active device tracking
 * - Session duration tracking
 * - Away/idle detection
 * 
 * USE CASES:
 * - Admin presence dashboard
 * - Driver availability tracking
 * - Customer support agent status
 * - User activity monitoring
 * 
 * @example
 *   const presence = require('@siamsiam/shared-utils').realtime.presenceTracker;
 *   
 *   presence.setOnline(userId, { device: 'mobile', sessionId: 'sess_123' });
 *   const status = presence.getStatus(userId);
 *   presence.setAway(userId);
 */

class PresenceTracker {
  constructor() {
    this.users = new Map(); // userId -> presence info
    this.idleTimeout = 300000; // 5 minutes to idle
    this.awayTimeout = 600000; // 10 minutes to away
    this.offlineTimeout = 1800000; // 30 minutes to offline
    this.cleanupInterval = null;
    
    this._startCleanup();
  }

  /**
   * Set user as online
   * @param {string} userId - User identifier
   * @param {Object} metadata - Connection metadata
   */
  setOnline(userId, metadata = {}) {
    const presence = {
      userId,
      status: 'online',
      lastSeen: Date.now(),
      connectedAt: Date.now(),
      devices: new Set([metadata.device || 'unknown']),
      sessions: new Set([metadata.sessionId || `sess_${Date.now()}`]),
      metadata: {
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        platform: metadata.platform,
        ...metadata,
      },
      statusHistory: [],
    };

    // If user was already tracked, preserve history
    const existing = this.users.get(userId);
    if (existing) {
      presence.statusHistory = existing.statusHistory || [];
      presence.devices = new Set([...existing.devices, ...presence.devices]);
      presence.sessions = new Set([...existing.sessions, ...presence.sessions]);
    }

    presence.statusHistory.push({
      from: existing?.status || 'offline',
      to: 'online',
      timestamp: Date.now(),
    });

    this.users.set(userId, presence);

    // PRODUCTION: Publish presence event
    // eventBus.publish('presence.changed', { userId, status: 'online' });

    logger.debug(`User online: ${userId}`, {
      device: metadata.device,
      platform: metadata.platform,
    });

    return presence;
  }

  /**
   * Set user as offline
   */
  setOffline(userId) {
    const presence = this.users.get(userId);
    if (!presence) return;

    presence.status = 'offline';
    presence.lastSeen = Date.now();
    
    presence.statusHistory.push({
      from: presence.status,
      to: 'offline',
      timestamp: Date.now(),
    });

    logger.debug(`User offline: ${userId}`);
  }

  /**
   * Set user as away (idle)
   */
  setAway(userId) {
    const presence = this.users.get(userId);
    if (!presence || presence.status === 'offline') return;

    presence.status = 'away';
    presence.lastSeen = Date.now();
    
    presence.statusHistory.push({
      from: 'online',
      to: 'away',
      timestamp: Date.now(),
    });
  }

  /**
   * Set user as idle
   */
  setIdle(userId) {
    const presence = this.users.get(userId);
    if (!presence || presence.status === 'offline') return;

    presence.status = 'idle';
    presence.lastSeen = Date.now();
  }

  /**
   * Heartbeat - update last seen timestamp
   */
  heartbeat(userId, metadata = {}) {
    const presence = this.users.get(userId);
    if (!presence) {
      return this.setOnline(userId, metadata);
    }

    presence.lastSeen = Date.now();
    if (presence.status !== 'online') {
      presence.status = 'online';
    }

    if (metadata.device) {
      presence.devices.add(metadata.device);
    }

    return presence;
  }

  /**
   * Get user presence status
   */
  getStatus(userId) {
    const presence = this.users.get(userId);
    if (!presence) return { userId, status: 'offline', lastSeen: null };

    return {
      userId: presence.userId,
      status: presence.status,
      lastSeen: presence.lastSeen,
      lastSeenAgo: Date.now() - presence.lastSeen,
      connectedAt: presence.connectedAt,
      devices: Array.from(presence.devices),
      sessions: Array.from(presence.sessions).length,
      metadata: presence.metadata,
    };
  }

  /**
   * Get users by status
   * @param {string} status - 'online', 'idle', 'away', 'offline'
   * @returns {Array} User IDs with that status
   */
  getUsersByStatus(status) {
    const users = [];
    
    for (const [userId, presence] of this.users) {
      if (presence.status === status) {
        users.push(userId);
      }
    }
    
    return users;
  }

  /**
   * Get all online users
   */
  getOnlineUsers() {
    return this.getUsersByStatus('online');
  }

  /**
   * Get presence stats
   */
  getStats() {
    let online = 0, idle = 0, away = 0, total = this.users.size;

    for (const [, presence] of this.users) {
      switch (presence.status) {
        case 'online': online++; break;
        case 'idle': idle++; break;
        case 'away': away++; break;
      }
    }

    return {
      total,
      online,
      idle,
      away,
      offline: total - online - idle - away,
    };
  }

  /**
   * Check if user is online
   */
  isOnline(userId) {
    const presence = this.users.get(userId);
    return presence?.status === 'online';
  }

  /**
   * Get time since last activity
   */
  getLastActivity(userId) {
    const presence = this.users.get(userId);
    return presence ? Date.now() - presence.lastSeen : null;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Start periodic cleanup of inactive users
   * @private
   */
  _startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [userId, presence] of this.users) {
        const idleTime = now - presence.lastSeen;

        // Update status based on idle time
        if (presence.status === 'online' && idleTime > this.idleTimeout) {
          this.setIdle(userId);
        } else if (presence.status === 'idle' && idleTime > this.awayTimeout) {
          this.setAway(userId);
        } else if (idleTime > this.offlineTimeout) {
          this.setOffline(userId);
          this.users.delete(userId);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug(`Presence cleanup: removed ${cleaned} offline users`);
      }
    }, 60000); // Every minute

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }
}

// Export singleton instance
module.exports = new PresenceTracker();