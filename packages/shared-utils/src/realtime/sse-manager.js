const crypto = require('crypto');
const logger = require('../logging/logger');

/**
 * Server-Sent Events (SSE) Manager
 * 
 * Manages SSE connections for pushing real-time updates to clients.
 * SSE is simpler than WebSockets for one-way server-to-client streaming.
 * 
 * USE CASES:
 * - Real-time status updates
 * - Progress indicators
 * - Live feed updates
 * - Notification streaming
 * 
 * ADVANTAGES OVER WEBSOCKETS:
 * - Simpler protocol (HTTP-based)
 * - Automatic reconnection (built into browser)
 * - Better firewall compatibility
 * - Native browser EventSource API
 * 
 * @example
 *   const sse = require('@siamsiam/shared-utils').realtime.sseManager;
 *   
 *   // In Express route
 *   app.get('/api/events', (req, res) => {
 *     sse.connect(req, res, 'user_123');
 *   });
 *   
 *   // Send event
 *   sse.send('user_123', 'order_update', { orderId: 123, status: 'shipped' });
 */

class SSEManager {
  constructor() {
    this.clients = new Map(); // clientId -> { res, userId, channels }
    this.userClients = new Map(); // userId -> Set<clientId>
    this.channelClients = new Map(); // channel -> Set<clientId>
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      eventsSent: 0,
    };
    this.heartbeatInterval = null;
    this.maxClientsPerUser = 5;
  }

  /**
   * Initialize SSE connection
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Object} options - Connection options
   */
  connect(req, res, options = {}) {
    const clientId = this._generateClientId();
    const userId = options.userId || null;
    const channels = options.channels || [];

    // Check max connections per user
    if (userId && this.userClients.has(userId)) {
      const userClientCount = this.userClients.get(userId).size;
      if (userClientCount >= this.maxClientsPerUser) {
        res.status(429).json({ error: 'Too many SSE connections' });
        return;
      }
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial connection event
    this._sendEvent(res, 'connected', {
      clientId,
      timestamp: new Date().toISOString(),
    });

    // Store client
    this.clients.set(clientId, {
      res,
      userId,
      channels: new Set(channels),
      connectedAt: Date.now(),
      lastEventAt: Date.now(),
      eventCount: 0,
    });

    this.stats.totalConnections++;
    this.stats.activeConnections = this.clients.size;

    // Add to user index
    if (userId) {
      if (!this.userClients.has(userId)) {
        this.userClients.set(userId, new Set());
      }
      this.userClients.get(userId).add(clientId);
    }

    // Add to channel index
    for (const channel of channels) {
      this._joinChannel(clientId, channel);
    }

    // Handle client disconnect
    req.on('close', () => {
      this._handleDisconnect(clientId);
    });

    req.on('error', () => {
      this._handleDisconnect(clientId);
    });

    // Start heartbeat if not already running
    if (!this.heartbeatInterval) {
      this._startHeartbeat();
    }

    logger.debug('SSE client connected', {
      clientId,
      userId,
      channels,
    });

    return clientId;
  }

  /**
   * Send event to specific client
   * @param {string} clientId - Client identifier
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  send(clientId, event, data) {
    const client = this.clients.get(clientId);
    if (!client) return false;

    try {
      this._sendEvent(client.res, event, data);
      client.lastEventAt = Date.now();
      client.eventCount++;
      this.stats.eventsSent++;
      return true;
    } catch (error) {
      logger.error('Failed to send SSE event', {
        clientId,
        event,
        error: error.message,
      });
      this._handleDisconnect(clientId);
      return false;
    }
  }

  /**
   * Send event to a user (all their SSE connections)
   * @param {string} userId - User identifier
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  sendToUser(userId, event, data) {
    const userClients = this.userClients.get(userId);
    if (!userClients) return 0;

    let sent = 0;
    for (const clientId of userClients) {
      if (this.send(clientId, event, data)) sent++;
    }
    return sent;
  }

  /**
   * Broadcast event to a channel
   * @param {string} channel - Channel name
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  broadcastToChannel(channel, event, data) {
    const channelClients = this.channelClients.get(channel);
    if (!channelClients) return 0;

    let sent = 0;
    for (const clientId of channelClients) {
      if (this.send(clientId, event, data)) sent++;
    }
    return sent;
  }

  /**
   * Broadcast event to all clients
   */
  broadcastAll(event, data) {
    let sent = 0;
    for (const clientId of this.clients.keys()) {
      if (this.send(clientId, event, data)) sent++;
    }
    return sent;
  }

  /**
   * Join a channel
   */
  joinChannel(clientId, channel) {
    this._joinChannel(clientId, channel);
  }

  /**
   * Leave a channel
   */
  leaveChannel(clientId, channel) {
    const channelClients = this.channelClients.get(channel);
    if (channelClients) {
      channelClients.delete(clientId);
      if (channelClients.size === 0) {
        this.channelClients.delete(channel);
      }
    }

    const client = this.clients.get(clientId);
    if (client) {
      client.channels.delete(channel);
    }
  }

  /**
   * Close a client connection
   */
  closeClient(clientId, reason = 'server_close') {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Send close event
    this._sendEvent(client.res, 'close', { reason });
    
    // End response
    client.res.end();
    
    this._handleDisconnect(clientId);
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeConnections: this.clients.size,
      channels: this.channelClients.size,
      usersWithConnections: this.userClients.size,
    };
  }

  /**
   * Graceful shutdown
   */
  shutdown() {
    logger.info('Shutting down SSE connections...');
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    for (const [clientId] of this.clients) {
      this.closeClient(clientId, 'shutdown');
    }
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Send SSE formatted event
   * @private
   */
  _sendEvent(res, event, data) {
    const id = Date.now();
    const payload = JSON.stringify(data);

    res.write(`id: ${id}\n`);
    res.write(`event: ${event}\n`);
    res.write(`data: ${payload}\n\n`);
  }

  /**
   * Handle client disconnection
   * @private
   */
  _handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from user index
    if (client.userId && this.userClients.has(client.userId)) {
      this.userClients.get(client.userId).delete(clientId);
      if (this.userClients.get(client.userId).size === 0) {
        this.userClients.delete(client.userId);
      }
    }

    // Remove from channels
    for (const channel of client.channels) {
      const channelClients = this.channelClients.get(channel);
      if (channelClients) {
        channelClients.delete(clientId);
        if (channelClients.size === 0) {
          this.channelClients.delete(channel);
        }
      }
    }

    // Remove client
    this.clients.delete(clientId);
    this.stats.activeConnections = this.clients.size;

    logger.debug('SSE client disconnected', { clientId });
  }

  /**
   * Join a channel
   * @private
   */
  _joinChannel(clientId, channel) {
    if (!this.channelClients.has(channel)) {
      this.channelClients.set(channel, new Set());
    }
    this.channelClients.get(channel).add(clientId);

    const client = this.clients.get(clientId);
    if (client) {
      client.channels.add(channel);
    }
  }

  /**
   * Start heartbeat to keep connections alive
   * @private
   */
  _startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      
      for (const [clientId, client] of this.clients) {
        // Send heartbeat comment (SSE comment format)
        try {
          client.res.write(`: heartbeat ${now}\n\n`);
        } catch (error) {
          this._handleDisconnect(clientId);
        }
      }
    }, 15000); // Every 15 seconds

    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }

  /**
   * Generate unique client ID
   * @private
   */
  _generateClientId() {
    return `sse_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }
}

// Export singleton instance
module.exports = new SSEManager();