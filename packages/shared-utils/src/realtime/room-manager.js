const logger = require('../logging/logger');

/**
 * WebSocket Room/Channel Management
 * 
 * Manages rooms/channels for grouping connections:
 * - Room creation and deletion
 * - Member management (join/leave)
 * - Room-level broadcasting
 * - Room metadata and configuration
 * - Persistent and ephemeral rooms
 * 
 * USE CASES:
 * - Delivery tracking rooms (order-specific)
 * - Admin monitoring rooms
 * - Support chat rooms
 * - Auction/bidding rooms
 * - Live event rooms
 * 
 * @example
 *   const rooms = require('@siamsiam/shared-utils').realtime.roomManager;
 *   
 *   rooms.create('order_123', { type: 'tracking', metadata: { orderId: '123' } });
 *   rooms.join('order_123', 'client_abc');
 *   rooms.broadcast('order_123', 'location_update', { lat: -17.825, lon: 31.033 });
 */

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomName -> roomInfo
    this.memberRooms = new Map(); // memberId -> Set<roomName>
    
    // Cleanup interval for empty rooms
    this.cleanupInterval = setInterval(() => {
      this._cleanupEmptyRooms();
    }, 300000); // Every 5 minutes

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Create a room
   * @param {string} roomName - Room identifier
   * @param {Object} options - Room configuration
   */
  create(roomName, options = {}) {
    if (this.rooms.has(roomName)) {
      // Room already exists
      return this.rooms.get(roomName);
    }

    const room = {
      name: roomName,
      type: options.type || 'general',
      createdAt: Date.now(),
      createdBy: options.createdBy || 'system',
      members: new Set(),
      metadata: options.metadata || {},
      persistent: options.persistent || false,
      maxMembers: options.maxMembers || 0, // 0 = unlimited
      isLocked: false,
      password: options.password || null,
      stats: {
        totalJoined: 0,
        totalLeft: 0,
        messagesCount: 0,
      },
      config: {
        allowBroadcast: options.allowBroadcast !== false,
        allowInvite: options.allowInvite !== false,
        historySize: options.historySize || 100,
      },
      history: [], // Recent messages
    };

    this.rooms.set(roomName, room);
    
    logger.debug('Room created', {
      room: roomName,
      type: room.type,
      persistent: room.persistent,
    });

    return room;
  }

  /**
   * Delete a room
   */
  delete(roomName) {
    const room = this.rooms.get(roomName);
    if (!room) return false;

    // Remove all members
    for (const memberId of room.members) {
      this._removeMemberFromRoom(memberId, roomName);
    }

    this.rooms.delete(roomName);
    
    logger.debug('Room deleted', { room: roomName });
    return true;
  }

  /**
   * Join a room
   * @param {string} roomName - Room to join
   * @param {string} memberId - Member identifier
   * @param {Object} options - Join options
   */
  join(roomName, memberId, options = {}) {
    let room = this.rooms.get(roomName);

    // Auto-create room if it doesn't exist
    if (!room) {
      room = this.create(roomName, { type: 'auto', ...options });
    }

    // Check if room is locked
    if (room.isLocked && !options.bypassLock) {
      return { success: false, error: 'Room is locked' };
    }

    // Check password
    if (room.password && options.password !== room.password) {
      return { success: false, error: 'Invalid room password' };
    }

    // Check max members
    if (room.maxMembers > 0 && room.members.size >= room.maxMembers) {
      return { success: false, error: 'Room is full' };
    }

    // Add member
    room.members.add(memberId);
    room.stats.totalJoined++;

    // Track member's rooms
    if (!this.memberRooms.has(memberId)) {
      this.memberRooms.set(memberId, new Set());
    }
    this.memberRooms.get(memberId).add(roomName);

    logger.debug('Member joined room', {
      room: roomName,
      member: memberId,
      memberCount: room.members.size,
    });

    return {
      success: true,
      room: roomName,
      memberCount: room.members.size,
    };
  }

  /**
   * Leave a room
   */
  leave(roomName, memberId) {
    const room = this.rooms.get(roomName);
    if (!room) return false;

    this._removeMemberFromRoom(memberId, roomName);

    // Delete non-persistent empty rooms
    if (!room.persistent && room.members.size === 0) {
      this.rooms.delete(roomName);
    }

    return true;
  }

  /**
   * Get room members
   */
  getMembers(roomName) {
    const room = this.rooms.get(roomName);
    return room ? Array.from(room.members) : [];
  }

  /**
   * Get member's rooms
   */
  getMemberRooms(memberId) {
    const rooms = this.memberRooms.get(memberId);
    return rooms ? Array.from(rooms) : [];
  }

  /**
   * Check if member is in room
   */
  isMember(roomName, memberId) {
    const room = this.rooms.get(roomName);
    return room ? room.members.has(memberId) : false;
  }

  /**
   * Get room count
   */
  getRoomCount(roomName) {
    const room = this.rooms.get(roomName);
    return room ? room.members.size : 0;
  }

  /**
   * Lock/unlock room
   */
  setLock(roomName, locked) {
    const room = this.rooms.get(roomName);
    if (!room) return false;

    room.isLocked = locked;
    logger.debug(`Room ${locked ? 'locked' : 'unlocked'}`, { room: roomName });
    return true;
  }

  /**
   * Add message to room history
   */
  addMessage(roomName, message) {
    const room = this.rooms.get(roomName);
    if (!room) return;

    room.history.push({
      ...message,
      timestamp: Date.now(),
    });

    // Trim history
    if (room.history.length > room.config.historySize) {
      room.history = room.history.slice(-room.config.historySize);
    }

    room.stats.messagesCount++;
  }

  /**
   * Get room history
   */
  getHistory(roomName, limit = 50) {
    const room = this.rooms.get(roomName);
    if (!room) return [];

    return room.history.slice(-limit);
  }

  /**
   * Get room information
   */
  getInfo(roomName) {
    const room = this.rooms.get(roomName);
    if (!room) return null;

    return {
      name: room.name,
      type: room.type,
      createdAt: room.createdAt,
      memberCount: room.members.size,
      persistent: room.persistent,
      isLocked: room.isLocked,
      hasPassword: !!room.password,
      stats: room.stats,
      metadata: room.metadata,
    };
  }

  /**
   * Get all rooms
   */
  getAllRooms() {
    return Array.from(this.rooms.entries()).map(([name, room]) => ({
      name,
      type: room.type,
      memberCount: room.members.size,
      persistent: room.persistent,
      isLocked: room.isLocked,
    }));
  }

  /**
   * Get room statistics
   */
  getStats() {
    let totalMembers = 0;
    for (const room of this.rooms.values()) {
      totalMembers += room.members.size;
    }

    return {
      totalRooms: this.rooms.size,
      totalMembers,
      averageMembersPerRoom: this.rooms.size > 0 
        ? Math.round(totalMembers / this.rooms.size) 
        : 0,
      roomsByType: this._countByType(),
    };
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Remove member from room
   * @private
   */
  _removeMemberFromRoom(memberId, roomName) {
    const room = this.rooms.get(roomName);
    if (!room) return;

    room.members.delete(memberId);
    room.stats.totalLeft++;

    const memberRooms = this.memberRooms.get(memberId);
    if (memberRooms) {
      memberRooms.delete(roomName);
      if (memberRooms.size === 0) {
        this.memberRooms.delete(memberId);
      }
    }
  }

  /**
   * Clean up empty non-persistent rooms
   * @private
   */
  _cleanupEmptyRooms() {
    let cleaned = 0;

    for (const [roomName, room] of this.rooms) {
      if (!room.persistent && room.members.size === 0) {
        this.rooms.delete(roomName);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned ${cleaned} empty rooms`);
    }
  }

  /**
   * Count rooms by type
   * @private
   */
  _countByType() {
    const counts = {};
    for (const room of this.rooms.values()) {
      counts[room.type] = (counts[room.type] || 0) + 1;
    }
    return counts;
  }
}

// Export singleton instance
module.exports = new RoomManager();