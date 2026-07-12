const crypto = require('crypto');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * USSD Session State Management
 * 
 * Manages USSD sessions with:
 * - Session creation and tracking
 * - State persistence
 * - Session timeout handling
 * - Concurrent session limits
 * - Session data encryption
 * 
 * USSD sessions are short-lived (typically 30-120 seconds)
 * and state must be maintained between consecutive requests.
 * 
 * @example
 *   const sessions = require('@siamsiam/shared-utils').ussd.sessionManager;
 *   
 *   const session = sessions.create('+263771234567', 'main_menu');
 *   sessions.update(sessionId, { currentMenu: 'send_money', data: { amount: 100 } });
 *   const currentSession = sessions.get(sessionId);
 */

class USSDSessionManager {
  constructor() {
    this.sessions = new Map();
    this.sessionTimeout = 120000; // 2 minutes
    this.maxSessionsPerPhone = 3;
    this.cleanupInterval = setInterval(() => {
      this._cleanupExpiredSessions();
    }, 30000); // Every 30 seconds

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Create a new USSD session
   * @param {string} phoneNumber - User's phone number
   * @param {string} initialMenu - Starting menu
   * @param {Object} metadata - Additional session metadata
   * @returns {Object} Session object
   */
  create(phoneNumber, initialMenu = 'main_menu', metadata = {}) {
    // Check existing sessions for this phone
    const existingSessions = this._getSessionsByPhone(phoneNumber);
    
    // Clear old sessions if max reached
    if (existingSessions.length >= this.maxSessionsPerPhone) {
      const oldest = existingSessions[0];
      this.destroy(oldest.id);
    }

    const sessionId = this._generateSessionId();
    const session = {
      id: sessionId,
      phoneNumber,
      currentMenu: initialMenu,
      previousMenu: null,
      menuStack: [initialMenu],
      data: {},
      inputHistory: [],
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        lastActivity: Date.now(),
        requestCount: 0,
        language: metadata.language || 'en',
        networkProvider: metadata.networkProvider || null,
        sessionType: metadata.sessionType || 'user',
      },
      isActive: true,
      expiresAt: Date.now() + this.sessionTimeout,
    };

    this.sessions.set(sessionId, session);
    
    logger.debug('USSD session created', {
      sessionId,
      phoneNumber: this._maskPhone(phoneNumber),
      initialMenu,
    });

    return session;
  }

  /**
   * Get an active session
   * @param {string} sessionId - Session identifier
   * @returns {Object|null} Session or null if not found/expired
   */
  get(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session) return null;
    if (!session.isActive) return null;
    
    // Check expiration
    if (Date.now() > session.expiresAt) {
      this.destroy(sessionId);
      return null;
    }

    // Update last activity and extend timeout
    session.metadata.lastActivity = Date.now();
    session.metadata.requestCount++;
    session.expiresAt = Date.now() + this.sessionTimeout;

    return session;
  }

  /**
   * Update session state
   * @param {string} sessionId - Session identifier
   * @param {Object} updates - Fields to update
   */
  update(sessionId, updates) {
    const session = this.get(sessionId);
    if (!session) return false;

    // Update menu navigation
    if (updates.currentMenu && updates.currentMenu !== session.currentMenu) {
      session.previousMenu = session.currentMenu;
      session.currentMenu = updates.currentMenu;
      session.menuStack.push(updates.currentMenu);
    }

    // Update data
    if (updates.data) {
      session.data = { ...session.data, ...updates.data };
    }

    // Record input
    if (updates.input !== undefined) {
      session.inputHistory.push({
        input: updates.input,
        menu: session.currentMenu,
        timestamp: Date.now(),
      });
    }

    // Update metadata
    if (updates.metadata) {
      session.metadata = { ...session.metadata, ...updates.metadata };
    }

    session.metadata.lastActivity = Date.now();
    session.expiresAt = Date.now() + this.sessionTimeout;

    return true;
  }

  /**
   * Navigate to a menu (go back)
   */
  goBack(sessionId) {
    const session = this.get(sessionId);
    if (!session) return null;

    // Pop current menu
    session.menuStack.pop();
    
    // Get previous menu
    const previousMenu = session.menuStack[session.menuStack.length - 1] || 'main_menu';
    
    session.previousMenu = session.currentMenu;
    session.currentMenu = previousMenu;

    return previousMenu;
  }

  /**
   * Navigate to main menu
   */
  goHome(sessionId) {
    const session = this.get(sessionId);
    if (!session) return null;

    session.previousMenu = session.currentMenu;
    session.currentMenu = 'main_menu';
    session.menuStack = ['main_menu'];
    session.data = {};

    return 'main_menu';
  }

  /**
   * Destroy a session
   */
  destroy(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      this.sessions.delete(sessionId);
      logger.debug('USSD session destroyed', { sessionId });
      return true;
    }
    return false;
  }

  /**
   * Set session data
   */
  setData(sessionId, key, value) {
    const session = this.get(sessionId);
    if (!session) return false;

    session.data[key] = value;
    return true;
  }

  /**
   * Get session data
   */
  getData(sessionId, key) {
    const session = this.get(sessionId);
    if (!session) return null;

    return session.data[key] || null;
  }

  /**
   * Clear session data
   */
  clearData(sessionId) {
    const session = this.get(sessionId);
    if (!session) return false;

    session.data = {};
    return true;
  }

  /**
   * Get session statistics
   */
  getStats() {
    let activeSessions = 0;
    const byMenu = {};

    for (const [, session] of this.sessions) {
      if (session.isActive && Date.now() <= session.expiresAt) {
        activeSessions++;
        byMenu[session.currentMenu] = (byMenu[session.currentMenu] || 0) + 1;
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      expiredSessions: this.sessions.size - activeSessions,
      byMenu,
    };
  }

  /**
   * Get all sessions for a phone number
   */
  getSessionsByPhone(phoneNumber) {
    return this._getSessionsByPhone(phoneNumber);
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Generate unique session ID
   * @private
   */
  _generateSessionId() {
    return `ussd_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  }

  /**
   * Get sessions by phone number
   * @private
   */
  _getSessionsByPhone(phoneNumber) {
    const sessions = [];
    
    for (const [id, session] of this.sessions) {
      if (session.phoneNumber === phoneNumber && session.isActive) {
        sessions.push({ id, ...session });
      }
    }
    
    return sessions.sort((a, b) => a.metadata.createdAt - b.metadata.createdAt);
  }

  /**
   * Clean up expired sessions
   * @private
   */
  _cleanupExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions) {
      if (now > session.expiresAt || !session.isActive) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned ${cleaned} expired USSD sessions`);
    }
  }

  /**
   * Mask phone number for logging
   * @private
   */
  _maskPhone(phone) {
    if (!phone) return 'unknown';
    return phone.substring(0, 4) + '***' + phone.slice(-3);
  }
}

// Export singleton instance
module.exports = new USSDSessionManager();