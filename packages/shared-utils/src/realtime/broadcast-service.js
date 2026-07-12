const websocketManager = require('./websocket-manager');
const sseManager = require('./sse-manager');
const logger = require('../logging/logger');

/**
 * Mass Notification Broadcasting Service
 * 
 * Unified interface for broadcasting messages across all real-time channels.
 * Supports targeted and mass broadcasting with delivery tracking.
 * 
 * CHANNELS:
 * - WebSocket rooms
 * - SSE channels
 * - Push notifications (via notification service)
 * - In-app notifications
 * 
 * USE CASES:
 * - System announcements
 * - Promotional broadcasts
 * - Emergency alerts
 * - Feature updates
 * - Maintenance notifications
 * 
 * @example
 *   const broadcast = require('@siamsiam/shared-utils').realtime.broadcastService;
 *   
 *   // Broadcast to all connected clients
 *   await broadcast.sendAll('system_announcement', {
 *     message: 'System maintenance in 30 minutes'
 *   });
 *   
 *   // Broadcast to delivery drivers in Harare
 *   await broadcast.sendToGroup('drivers_harare', 'new_order', orderData);
 */

class BroadcastService {
  constructor() {
    this.broadcastHistory = [];
    this.maxHistorySize = 1000;
    this.stats = {
      totalBroadcasts: 0,
      totalRecipients: 0,
      failedDeliveries: 0,
    };
  }

  /**
   * Send broadcast to all connected clients
   * @param {string} event - Event type
   * @param {Object} data - Broadcast data
   * @param {Object} options - Broadcast options
   * @returns {Object} Broadcast result
   */
  async sendAll(event, data, options = {}) {
    const broadcastId = this._createBroadcastId();
    const startTime = Date.now();

    logger.info('Starting mass broadcast', {
      broadcastId,
      event,
    });

    let wsSent = 0;
    let sseSent = 0;

    // WebSocket broadcast
    if (options.ws !== false) {
      wsSent = websocketManager.broadcastAll({
        type: event,
        broadcastId,
        data,
        timestamp: new Date().toISOString(),
      });
    }

    // SSE broadcast
    if (options.sse !== false) {
      sseSent = sseManager.broadcastAll(event, {
        broadcastId,
        data,
        timestamp: new Date().toISOString(),
      });
    }

    const totalSent = wsSent + sseSent;
    const duration = Date.now() - startTime;

    // Record broadcast
    this._recordBroadcast({
      broadcastId,
      type: 'all',
      event,
      recipients: totalSent,
      duration,
      timestamp: new Date().toISOString(),
    });

    logger.info('Mass broadcast completed', {
      broadcastId,
      event,
      wsSent,
      sseSent,
      totalSent,
      duration: `${duration}ms`,
    });

    return {
      broadcastId,
      event,
      totalSent,
      wsSent,
      sseSent,
      duration,
    };
  }

  /**
   * Send broadcast to a specific group
   * @param {string} group - Group/channel name
   * @param {string} event - Event type
   * @param {Object} data - Broadcast data
   */
  async sendToGroup(group, event, data, options = {}) {
    const broadcastId = this._createBroadcastId();
    
    let wsSent = 0;
    let sseSent = 0;

    // WebSocket room broadcast
    if (options.ws !== false) {
      wsSent = websocketManager.broadcastToRoom(group, {
        type: event,
        broadcastId,
        data,
        timestamp: new Date().toISOString(),
      });
    }

    // SSE channel broadcast
    if (options.sse !== false) {
      sseSent = sseManager.broadcastToChannel(group, event, {
        broadcastId,
        data,
        timestamp: new Date().toISOString(),
      });
    }

    const totalSent = wsSent + sseSent;

    this._recordBroadcast({
      broadcastId,
      type: 'group',
      group,
      event,
      recipients: totalSent,
      timestamp: new Date().toISOString(),
    });

    return {
      broadcastId,
      group,
      event,
      totalSent,
      wsSent,
      sseSent,
    };
  }

  /**
   * Send to specific users
   * @param {string[]} userIds - Array of user IDs
   * @param {string} event - Event type
   * @param {Object} data - Broadcast data
   */
  async sendToUsers(userIds, event, data, options = {}) {
    const broadcastId = this._createBroadcastId();
    let totalSent = 0;
    const results = [];

    for (const userId of userIds) {
      let sent = 0;

      // WebSocket
      if (options.ws !== false) {
        sent += websocketManager.sendToUser(userId, {
          type: event,
          broadcastId,
          data,
          timestamp: new Date().toISOString(),
        });
      }

      // SSE
      if (options.sse !== false) {
        sent += sseManager.sendToUser(userId, event, {
          broadcastId,
          data,
          timestamp: new Date().toISOString(),
        });
      }

      totalSent += sent;
      results.push({ userId, sent });
    }

    this._recordBroadcast({
      broadcastId,
      type: 'users',
      event,
      recipients: totalSent,
      userCount: userIds.length,
      timestamp: new Date().toISOString(),
    });

    return {
      broadcastId,
      event,
      totalSent,
      userCount: userIds.length,
      results,
    };
  }

  /**
   * Send to a specific client connection
   */
  async sendToClient(clientId, event, data, options = {}) {
    let sent = false;

    if (options.ws !== false) {
      sent = websocketManager.send(clientId, {
        type: event,
        data,
        timestamp: new Date().toISOString(),
      });
    }

    if (!sent && options.sse !== false) {
      sent = sseManager.send(clientId, event, data);
    }

    return { sent, clientId, event };
  }

  /**
   * Get broadcast history
   */
  getHistory(limit = 50) {
    return this.broadcastHistory.slice(-limit);
  }

  /**
   * Get broadcast statistics
   */
  getStats() {
    return {
      ...this.stats,
      historySize: this.broadcastHistory.length,
    };
  }

  /**
   * Create a targeted notification broadcast
   * Combines real-time with push notifications
   */
  async notifyUsers(userIds, notification, options = {}) {
    const {
      title,
      message,
      data = {},
      priority = 'normal',
    } = notification;

    // Send real-time
    const realtimeResult = await this.sendToUsers(userIds, 'notification', {
      title,
      message,
      data,
      priority,
    }, options);

    // PRODUCTION TODO: Also send push notifications via notification service
    // await notificationService.sendPush(userIds, { title, message, data });

    // PRODUCTION TODO: Send in-app notifications
    // await notificationService.sendInApp(userIds, { title, message, data });

    return {
      ...realtimeResult,
      pushSent: 0, // Placeholder
      inAppSent: 0, // Placeholder
    };
  }

  /**
   * Send system alert to all admins
   */
  async alertAdmins(alert, options = {}) {
    return this.sendToGroup('admins', 'system_alert', {
      ...alert,
      severity: alert.severity || 'info',
      timestamp: new Date().toISOString(),
    }, options);
  }

  /**
   * Send delivery update to order tracking room
   */
  async sendDeliveryUpdate(orderId, update, options = {}) {
    const room = `order_tracking_${orderId}`;
    return this.sendToGroup(room, 'delivery_update', {
      orderId,
      ...update,
      timestamp: new Date().toISOString(),
    }, options);
  }

  /**
   * Send price update to all connected clients
   */
  async broadcastPriceUpdate(productId, price, currency, options = {}) {
    return this.sendAll('price_update', {
      productId,
      price,
      currency,
      timestamp: new Date().toISOString(),
    }, options);
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Create unique broadcast ID
   * @private
   */
  _createBroadcastId() {
    return `bc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Record broadcast for history
   * @private
   */
  _recordBroadcast(broadcast) {
    this.broadcastHistory.push(broadcast);
    this.stats.totalBroadcasts++;
    this.stats.totalRecipients += broadcast.recipients || 0;

    // Trim history
    if (this.broadcastHistory.length > this.maxHistorySize) {
      this.broadcastHistory = this.broadcastHistory.slice(-this.maxHistorySize);
    }
  }
}

// Export singleton instance
module.exports = new BroadcastService();