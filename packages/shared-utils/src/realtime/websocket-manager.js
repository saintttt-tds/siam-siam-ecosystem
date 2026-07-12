const WebSocket = require('ws');
const crypto = require('crypto');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * WebSocket Connection Pool Management
 * 
 * Manages WebSocket connections with:
 * - Connection pooling for multiple clients
 * - Automatic reconnection handling
 * - Heartbeat/ping-pong for connection health
 * - Authentication and authorization
 * - Message broadcasting
 * - Connection tracking and metrics
 * 
 * USE CASES:
 * - Real-time delivery tracking
 * - Live admin dashboard updates
 * - Driver location broadcasting
 * - Chat and support messaging
 * - Live notifications
 * 
 * @example
 *   const wsManager = require('@siamsiam/shared-utils').realtime.websocketManager;
 *   
 *   wsManager.initialize(server);
 *   wsManager.onConnection((ws, req) => {
 *     wsManager.send(ws, { type: 'welcome', data: { message: 'Connected!' } });
 *   });
 */

class WebSocketManager {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // clientId -> { ws, userId, metadata }
    this.userConnections = new Map(); // userId -> Set<clientId>
    this.rooms = new Map(); // roomName -> Set<clientId>
    this.heartbeatInterval = null;
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      messagesReceived: 0,
      messagesSent: 0,
    };
  }

  /**
   * Initialize WebSocket server
   * @param {http.Server} server - HTTP server instance
   * @param {Object} options - WebSocket options
   */
  initialize(server, options = {}) {
    this.wss = new WebSocket.Server({
      server,
      path: options.path || '/ws',
      maxPayload: options.maxPayload || 1024 * 1024, // 1MB
      clientTracking: true,
      verifyClient: options.verifyClient || this._defaultVerifyClient.bind(this),
    });

    this.wss.on('connection', (ws, req) => this._handleConnection(ws, req));
    this.wss.on('error', (error) => this._handleError(error));
    this.wss.on('close', () => this._handleServerClose());

    // Start heartbeat
    this._startHeartbeat(options.heartbeatInterval || 30000);

    logger.info('WebSocket server initialized', {
      path: options.path || '/ws',
    });
  }

  /**
   * Register connection handler
   */
  onConnection(callback) {
    this.connectionCallback = callback;
  }

  /**
   * Register message handler
   */
  onMessage(callback) {
    this.messageCallback = callback;
  }

  /**
   * Send message to a specific client
   * @param {string} clientId - Client identifier
   * @param {Object} data - Message data
   */
  send(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.ws.send(JSON.stringify(data));
      this.stats.messagesSent++;
      return true;
    } catch (error) {
      logger.error('Failed to send WebSocket message', {
        clientId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Send message to a user (all their connections)
   */
  sendToUser(userId, data) {
    const connections = this.userConnections.get(userId);
    if (!connections) return 0;

    let sent = 0;
    for (const clientId of connections) {
      if (this.send(clientId, data)) sent++;
    }
    return sent;
  }

  /**
   * Broadcast to a room
   */
  broadcastToRoom(roomName, data, excludeClientId = null) {
    const room = this.rooms.get(roomName);
    if (!room) return 0;

    let sent = 0;
    for (const clientId of room) {
      if (clientId === excludeClientId) continue;
      if (this.send(clientId, data)) sent++;
    }
    return sent;
  }

  /**
   * Broadcast to all connected clients
   */
  broadcastAll(data) {
    let sent = 0;
    for (const clientId of this.clients.keys()) {
      if (this.send(clientId, data)) sent++;
    }
    return sent;
  }

  /**
   * Join a client to a room
   */
  joinRoom(clientId, roomName) {
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
    }
    this.rooms.get(roomName).add(clientId);
    
    const client = this.clients.get(clientId);
    if (client) {
      client.rooms.add(roomName);
    }
    
    logger.debug(`Client ${clientId} joined room: ${roomName}`);
  }

  /**
   * Leave a room
   */
  leaveRoom(clientId, roomName) {
    const room = this.rooms.get(roomName);
    if (room) room.delete(clientId);

    const client = this.clients.get(clientId);
    if (client) {
      client.rooms.delete(roomName);
    }
  }

  /**
   * Get client information
   */
  getClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return null;

    return {
      clientId,
      userId: client.userId,
      connectedAt: client.connectedAt,
      rooms: Array.from(client.rooms),
      metadata: client.metadata,
      readyState: client.ws.readyState,
    };
  }

  /**
   * Get all clients in a room
   */
  getRoomClients(roomName) {
    const room = this.rooms.get(roomName);
    return room ? Array.from(room) : [];
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeConnections: this.clients.size,
      rooms: this.rooms.size,
      usersWithConnections: this.userConnections.size,
      uptime: process.uptime(),
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('Shutting down WebSocket server...');
    
    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all connections
    for (const [clientId, client] of this.clients) {
      try {
        client.ws.close(1001, 'Server shutting down');
      } catch (error) {
        logger.error(`Error closing connection: ${clientId}`, {
          error: error.message,
        });
      }
    }

    // Close server
    if (this.wss) {
      return new Promise((resolve) => {
        this.wss.close(() => {
          logger.info('WebSocket server closed');
          resolve();
        });
      });
    }
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Handle new WebSocket connection
   * @private
   */
  _handleConnection(ws, req) {
    const clientId = this._generateClientId();
    const clientInfo = {
      ws,
      clientId,
      userId: null,
      connectedAt: new Date().toISOString(),
      rooms: new Set(),
      metadata: {
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        origin: req.headers.origin,
      },
      isAlive: true,
      pingCount: 0,
    };

    // Store client
    this.clients.set(clientId, clientInfo);
    this.stats.totalConnections++;
    this.stats.activeConnections = this.clients.size;

    // WebSocket event handlers
    ws.on('message', (data) => this._handleMessage(ws, data, clientId));
    ws.on('close', (code, reason) => this._handleClose(clientId, code, reason));
    ws.on('error', (error) => this._handleClientError(clientId, error));
    ws.on('pong', () => {
      clientInfo.isAlive = true;
      clientInfo.pingCount = 0;
    });

    // Send welcome message
    this.send(clientId, {
      type: 'connection',
      data: {
        clientId,
        message: 'Connected to SiamSiam WebSocket',
        timestamp: new Date().toISOString(),
      },
    });

    // Call connection callback
    if (this.connectionCallback) {
      this.connectionCallback(ws, req, clientId);
    }

    logger.info('WebSocket client connected', {
      clientId,
      ip: clientInfo.metadata.ip,
    });
  }

  /**
   * Handle incoming message
   * @private
   */
  _handleMessage(ws, data, clientId) {
    this.stats.messagesReceived++;

    try {
      const message = JSON.parse(data.toString());
      
      // Handle system messages
      if (message.type === 'auth') {
        this._handleAuth(clientId, message.data);
        return;
      }

      if (message.type === 'join') {
        this.joinRoom(clientId, message.data.room);
        return;
      }

      if (message.type === 'leave') {
        this.leaveRoom(clientId, message.data.room);
        return;
      }

      if (message.type === 'ping') {
        this.send(clientId, { type: 'pong', timestamp: Date.now() });
        return;
      }

      // Call message callback
      if (this.messageCallback) {
        this.messageCallback(clientId, message);
      }
    } catch (error) {
      logger.error('Failed to parse WebSocket message', {
        clientId,
        error: error.message,
      });
      this.send(clientId, {
        type: 'error',
        data: { message: 'Invalid message format' },
      });
    }
  }

  /**
   * Handle client authentication
   * @private
   */
  _handleAuth(clientId, authData) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // PRODUCTION TODO: Verify JWT token
    const userId = authData.userId || authData.token;
    
    if (userId) {
      // Remove from old user connections
      if (client.userId && this.userConnections.has(client.userId)) {
        this.userConnections.get(client.userId).delete(clientId);
      }

      // Add to new user connections
      client.userId = userId;
      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, new Set());
      }
      this.userConnections.get(userId).add(clientId);

      // Update metadata
      if (authData.metadata) {
        Object.assign(client.metadata, authData.metadata);
      }

      this.send(clientId, {
        type: 'auth_success',
        data: { userId, clientId },
      });

      logger.debug('WebSocket client authenticated', { clientId, userId });
    }
  }

  /**
   * Handle client disconnection
   * @private
   */
  _handleClose(clientId, code, reason) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from rooms
    for (const roomName of client.rooms) {
      const room = this.rooms.get(roomName);
      if (room) room.delete(clientId);
    }

    // Remove from user connections
    if (client.userId && this.userConnections.has(client.userId)) {
      this.userConnections.get(client.userId).delete(clientId);
      if (this.userConnections.get(client.userId).size === 0) {
        this.userConnections.delete(client.userId);
      }
    }

    // Remove client
    this.clients.delete(clientId);
    this.stats.activeConnections = this.clients.size;

    logger.info('WebSocket client disconnected', {
      clientId,
      code,
      reason: reason?.toString(),
      userId: client.userId,
    });
  }

  /**
   * Handle WebSocket errors
   * @private
   */
  _handleError(error) {
    logger.error('WebSocket server error', { error: error.message });
  }

  /**
   * Handle client errors
   * @private
   */
  _handleClientError(clientId, error) {
    logger.error('WebSocket client error', {
      clientId,
      error: error.message,
    });
  }

  /**
   * Handle server close
   * @private
   */
  _handleServerClose() {
    logger.info('WebSocket server closed');
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  /**
   * Start heartbeat to detect dead connections
   * @private
   */
  _startHeartbeat(intervalMs) {
    this.heartbeatInterval = setInterval(() => {
      for (const [clientId, client] of this.clients) {
        if (!client.isAlive) {
          logger.warn('Terminating dead WebSocket connection', { clientId });
          client.ws.terminate();
          this.clients.delete(clientId);
          continue;
        }

        client.isAlive = false;
        client.pingCount++;
        client.ws.ping();

        // Terminate if too many pings without pong
        if (client.pingCount > 3) {
          logger.warn('WebSocket client not responding to pings', {
            clientId,
            pingCount: client.pingCount,
          });
          client.ws.terminate();
          this.clients.delete(clientId);
        }
      }
    }, intervalMs);

    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }

  /**
   * Default client verification
   * @private
   */
  _defaultVerifyClient(info, callback) {
    // PRODUCTION: Verify origin, check auth tokens, etc.
    const allowedOrigins = config.server.cors.origin === '*' 
      ? true 
      : config.server.cors.origin;

    if (allowedOrigins === true) {
      callback(true);
      return;
    }

    const origin = info.origin || info.req.headers.origin;
    callback(origin === allowedOrigins);
  }

  /**
   * Generate unique client ID
   * @private
   */
  _generateClientId() {
    return `ws_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }
}

// Export singleton instance
module.exports = new WebSocketManager();