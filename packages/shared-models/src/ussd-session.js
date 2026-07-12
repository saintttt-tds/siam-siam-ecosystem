const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * USSD Session Model - USSD Session Data
 * 
 * Stores session state for USSD menu navigation.
 * USSD is stateless by nature, so session data must be
 * persisted between consecutive requests from the same user.
 * 
 * TABLE: ussd_sessions
 */

class UssdSession extends BaseModel {
  static tableName = 'ussd_sessions';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'session_id', 'phone_number',
    'current_menu', 'current_menu_id', 'previous_menu',
    'menu_stack', 'menu_history',
    'session_data', 'input_history', 'navigation_path',
    'session_type', 'session_status',
    'network_provider', 'network_code', 'country',
    'language', 'language_selected', 'fallback_language',
    'is_authenticated', 'user_id', 'auth_method',
    'pin_verified', 'pin_attempts', 'pin_locked_until',
    'kyc_level', 'kyc_verified',
    'transaction_id', 'transaction_type', 'transaction_amount',
    'transaction_currency', 'transaction_status',
    'is_active', 'started_at', 'last_activity_at',
    'expires_at', 'completed_at', 'terminated_at',
    'termination_reason', 'timeout_count',
    'total_inputs', 'total_menus_visited',
    'total_duration_seconds', 'session_duration_seconds',
    'error_count', 'last_error', 'last_error_at',
    'device_info', 'network_info',
    'session_tags', 'notes',
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at',
  ];

  static casts = {
    menu_stack: 'json', menu_history: 'json',
    session_data: 'json', input_history: 'json',
    navigation_path: 'json', device_info: 'json',
    network_info: 'json', session_tags: 'json',
    metadata: 'json', tags: 'json',
    is_authenticated: 'boolean', pin_verified: 'boolean',
    kyc_verified: 'boolean', is_active: 'boolean',
    pin_attempts: 'integer', kyc_level: 'integer',
    timeout_count: 'integer', total_inputs: 'integer',
    total_menus_visited: 'integer', error_count: 'integer',
    total_duration_seconds: 'integer', session_duration_seconds: 'integer',
    transaction_amount: 'float',
  };

  static sessionStatuses = {
    ACTIVE: 'active', COMPLETED: 'completed', TERMINATED: 'terminated',
    TIMEOUT: 'timeout', ERROR: 'error', CANCELLED: 'cancelled',
  };

  static generateSessionId() {
    const crypto = require('crypto');
    return `USS-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Create a new USSD session
   */
  static async createSession(phoneNumber, initialMenu = 'main_menu', options = {}) {
    const sessionId = this.generateSessionId();

    return this.create({
      session_id: sessionId, phone_number: phoneNumber,
      current_menu: initialMenu, current_menu_id: initialMenu,
      menu_stack: [initialMenu], menu_history: [{ menu: initialMenu, enteredAt: new Date().toISOString() }],
      navigation_path: [initialMenu],
      session_data: options.sessionData || {}, input_history: [],
      session_type: options.sessionType || 'user', session_status: this.sessionStatuses.ACTIVE,
      network_provider: options.networkProvider, network_code: options.networkCode,
      country: options.country, language: options.language || 'en',
      is_active: true, started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + (options.timeoutSeconds || 120) * 1000).toISOString(),
      metadata: options.metadata || {}, tenant_id: options.tenantId,
    });
  }

  /**
   * Find active session by session ID
   */
  static async findActive(sessionId) {
    const session = await this.findOne({ where: { session_id: sessionId, is_active: true } });
    if (!session) return null;
    if (new Date(session.expires_at) < new Date()) {
      await this.endSession(session.id, 'timeout');
      return null;
    }
    return session;
  }

  /**
   * Find active session by phone number
   */
  static async findByPhone(phoneNumber) {
    return this.findOne({
      where: { phone_number: phoneNumber, is_active: true },
      orderBy: { started_at: 'DESC' },
    });
  }

  /**
   * Update session navigation
   */
  static async navigate(sessionId, nextMenu, input = null) {
    const session = await this.findActive(sessionId);
    if (!session) throw new Error('Session not found or expired');

    const menuStack = [...(session.menu_stack || [])];
    const menuHistory = [...(session.menu_history || [])];
    const inputHistory = [...(session.input_history || [])];
    const navigationPath = [...(session.navigation_path || [])];

    if (input) {
      inputHistory.push({ input, menu: session.current_menu, timestamp: new Date().toISOString() });
    }
    menuStack.push(nextMenu);
    menuHistory.push({ menu: nextMenu, enteredAt: new Date().toISOString() });
    navigationPath.push(nextMenu);

    return this.update({ id: session.id }, {
      previous_menu: session.current_menu, current_menu: nextMenu,
      current_menu_id: nextMenu, menu_stack: menuStack,
      menu_history: menuHistory, input_history: inputHistory,
      navigation_path: navigationPath,
      last_activity_at: new Date().toISOString(),
      total_inputs: input ? connectionPool.raw('total_inputs + 1') : undefined,
      total_menus_visited: connectionPool.raw('total_menus_visited + 1'),
      expires_at: new Date(Date.now() + 120000).toISOString(),
    });
  }

  /**
   * Update session data
   */
  static async updateData(sessionId, data) {
    const session = await this.findActive(sessionId);
    if (!session) throw new Error('Session not found');
    return this.update({ id: session.id }, {
      session_data: { ...(session.session_data || {}), ...data },
      last_activity_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 120000).toISOString(),
    });
  }

  /**
   * End a USSD session
   */
  static async endSession(sessionId, reason = 'completed') {
    const session = await this.findById(sessionId);
    if (!session) return null;
    const now = new Date();
    return this.update({ id: sessionId }, {
      is_active: false, session_status: reason === 'timeout' ? this.sessionStatuses.TIMEOUT : this.sessionStatuses.COMPLETED,
      completed_at: now.toISOString(), terminated_at: now.toISOString(),
      termination_reason: reason,
      session_duration_seconds: Math.floor((now.getTime() - new Date(session.started_at).getTime()) / 1000),
    });
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpired() {
    const result = await connectionPool.query(
      `UPDATE ${this.tableName} SET is_active = false, session_status = 'timeout', termination_reason = 'expired' WHERE is_active = true AND expires_at < NOW()`
    );
    return result.rowCount;
  }
}

module.exports = UssdSession;