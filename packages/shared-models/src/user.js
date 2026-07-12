const BaseModel = require('./base-model');
const SoftDeleteMixin = require('./soft-delete-mixin');
const { encryption } = require('@siamsiam/shared-utils').security;
const { phoneValidator, emailValidator } = require('@siamsiam/shared-utils').validators;
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * User Model - Customer/End-User Account
 * 
 * This is the central user entity in the SiamSiam ecosystem.
 * Manages authentication, profile, KYC, preferences, and account state.
 * 
 * TABLE: users
 * 
 * RELATIONSHIPS:
 * - hasMany: UserSession (active login sessions)
 * - hasMany: UserDevice (registered devices)
 * - hasMany: Wallet (multi-currency wallets)
 * - hasMany: Address (saved addresses)
 * - hasMany: Order (placed orders)
 * - hasOne: UnifiedAccount (cross-platform SSO)
 * - hasMany: Notification (received notifications)
 * 
 * SECURITY:
 * - password_hash uses bcrypt (12 rounds)
 * - national_id encrypted at rest (AES-256-GCM)
 * - date_of_birth encrypted at rest
 * - Failed login tracking with automatic lockout
 * - Session management with device tracking
 * 
 * KYC LEVELS:
 * 0 - Unverified: Basic account, limited features
 * 1 - Basic: Phone or email verified
 * 2 - Verified: ID document verified
 * 3 - Enhanced: Full KYC (address proof, biometric)
 */

class User extends BaseModel {
  // ==================== TABLE CONFIGURATION ====================
  
  static tableName = 'users';
  static primaryKey = 'id';
  static softDelete = true;
  
  static fields = [
    'id',
    // Authentication
    'email', 'phone', 'password_hash',
    // Profile
    'first_name', 'last_name', 'date_of_birth', 'gender',
    'profile_picture_url', 'language', 'timezone',
    // Identity & KYC
    'national_id', 'national_id_type', 'nationality',
    'kyc_status', 'kyc_level', 'kyc_verified_at',
    'kyc_documents', 'kyc_notes',
    // Verification
    'email_verified', 'email_verified_at',
    'phone_verified', 'phone_verified_at',
    'identity_verified', 'identity_verified_at',
    // Account State
    'is_active', 'is_suspended', 'suspended_reason',
    'suspended_at', 'suspended_until',
    // Security
    'failed_login_attempts', 'locked_until',
    'last_login_at', 'last_login_ip', 'last_login_device',
    'password_changed_at', 'requires_password_change',
    // Preferences & Settings
    'preferences', 'notification_settings',
    'marketing_consent', 'data_processing_consent',
    // Metadata
    'referral_code', 'referred_by',
    'signup_ip', 'signup_device', 'signup_source',
    'total_orders', 'total_spent', 'loyalty_points',
    // GDPR
    'data_retention_consent', 'data_export_requests',
    'right_to_be_forgotten',
    // Timestamps & Meta
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
    'deleted_at', 'deleted_by', 'restored_at',
  ];

  static hidden = [
    'password_hash', 'national_id', 'failed_login_attempts',
    'locked_until', 'data_retention_consent',
  ];

  static guarded = [
    'id', 'password_hash', 'kyc_verified_at', 'email_verified_at',
    'phone_verified_at', 'failed_login_attempts', 'locked_until',
    'last_login_at', 'last_login_ip', 'version',
    'created_at', 'updated_at', 'deleted_at',
  ];

  static casts = {
    is_active: 'boolean',
    is_suspended: 'boolean',
    email_verified: 'boolean',
    phone_verified: 'boolean',
    identity_verified: 'boolean',
    marketing_consent: 'boolean',
    data_processing_consent: 'boolean',
    data_retention_consent: 'boolean',
    requires_password_change: 'boolean',
    right_to_be_forgotten: 'boolean',
    kyc_level: 'integer',
    failed_login_attempts: 'integer',
    total_orders: 'integer',
    loyalty_points: 'integer',
    preferences: 'json',
    notification_settings: 'json',
    kyc_documents: 'json',
    metadata: 'json',
    tags: 'json',
  };

  static relations = {
    sessions: {
      type: 'hasMany',
      model: 'UserSession',
      foreignKey: 'user_id',
      localKey: 'id',
    },
    devices: {
      type: 'hasMany',
      model: 'UserDevice',
      foreignKey: 'user_id',
      localKey: 'id',
    },
    wallets: {
      type: 'hasMany',
      model: 'Wallet',
      foreignKey: 'user_id',
      localKey: 'id',
    },
    addresses: {
      type: 'hasMany',
      model: 'Address',
      foreignKey: 'user_id',
      localKey: 'id',
    },
    orders: {
      type: 'hasMany',
      model: 'Order',
      foreignKey: 'user_id',
      localKey: 'id',
    },
    unifiedAccount: {
      type: 'hasOne',
      model: 'UnifiedAccount',
      foreignKey: 'user_id',
      localKey: 'id',
    },
    notifications: {
      type: 'hasMany',
      model: 'Notification',
      foreignKey: 'user_id',
      localKey: 'id',
    },
  };

  static hooks = {
    beforeCreate: [
      async (data) => {
        // Normalize email and phone
        if (data.email) {
          data.email = data.email.toLowerCase().trim();
        }
        if (data.phone) {
          data.phone = phoneValidator.toE164(data.phone);
        }
        
        // Hash password if provided
        if (data.password_hash && !data.password_hash.startsWith('$2')) {
          data.password_hash = await require('bcryptjs').hash(data.password_hash, 12);
        }
        
        // Encrypt sensitive fields
        if (data.national_id) {
          data.national_id = encryption.encrypt(data.national_id);
        }
        if (data.date_of_birth) {
          data.date_of_birth = encryption.encrypt(data.date_of_birth);
        }
        
        // Set defaults
        data.kyc_level = data.kyc_level || 0;
        data.kyc_status = data.kyc_status || 'unverified';
        data.is_active = data.is_active !== false;
      },
    ],
    beforeUpdate: [
      async (data, instance) => {
        // Prevent modification of sensitive fields through mass update
        delete data.password_hash;
        delete data.failed_login_attempts;
        delete data.locked_until;
      },
    ],
  };

  // ==================== KYC LEVELS ====================
  
  static kycLevels = {
    0: {
      name: 'unverified',
      label: 'Unverified',
      features: ['basic_browsing'],
      maxTransactionAmount: 100,
      maxWalletBalance: 500,
      maxDailyVolume: 200,
    },
    1: {
      name: 'basic',
      label: 'Basic',
      features: ['basic_browsing', 'purchases', 'wallet_deposit'],
      maxTransactionAmount: 1000,
      maxWalletBalance: 2000,
      maxDailyVolume: 1000,
    },
    2: {
      name: 'verified',
      label: 'Verified',
      features: ['basic_browsing', 'purchases', 'wallet_deposit', 'withdrawals', 'fx_trading'],
      maxTransactionAmount: 10000,
      maxWalletBalance: 50000,
      maxDailyVolume: 25000,
    },
    3: {
      name: 'enhanced',
      label: 'Enhanced',
      features: ['basic_browsing', 'purchases', 'wallet_deposit', 'withdrawals', 'fx_trading', 'corporate', 'api_access'],
      maxTransactionAmount: 100000,
      maxWalletBalance: 500000,
      maxDailyVolume: 100000,
    },
  };

  // ==================== CUSTOM QUERIES ====================

  /**
   * Find user by email (case-insensitive)
   */
  static async findByEmail(email) {
    if (!email) return null;
    return this.findOne({
      where: { email: email.toLowerCase().trim() },
    });
  }

  /**
   * Find user by phone (E.164 format)
   */
  static async findByPhone(phone) {
    if (!phone) return null;
    const normalized = phoneValidator.toE164(phone);
    if (!normalized) return null;
    
    return this.findOne({
      where: { phone: normalized },
    });
  }

  /**
   * Find user by email or phone (login lookup)
   */
  static async findForLogin(identifier) {
    // Determine if identifier is email or phone
    if (identifier.includes('@')) {
      return this.findByEmail(identifier);
    }
    
    const phoneResult = phoneValidator.validate(identifier);
    if (phoneResult.valid) {
      return this.findByPhone(phoneResult.e164);
    }
    
    return null;
  }

  /**
   * Search users by name, email, or phone
   */
  static async search(query, options = {}) {
    const text = `
      SELECT ${this.fields.filter(f => !this.hidden.includes(f)).join(', ')}
      FROM ${this.tableName}
      WHERE deleted_at IS NULL
        AND (
          email ILIKE $1
          OR phone ILIKE $1
          OR first_name ILIKE $1
          OR last_name ILIKE $1
          OR CONCAT(first_name, ' ', last_name) ILIKE $1
        )
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await require('@siamsiam/shared-utils').database.connectionPool.query(
      text,
      [`%${query}%`, options.limit || 20, options.offset || 0]
    );
    
    return result.rows;
  }

  // ==================== AUTHENTICATION METHODS ====================

  /**
   * Record a successful login
   */
  static async recordLogin(userId, ipAddress, deviceInfo = null) {
    return connectionPool.query(
      `UPDATE ${this.tableName}
       SET last_login_at = $1,
           last_login_ip = $2,
           last_login_device = $3,
           failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = $1
       WHERE id = $4`,
      [new Date().toISOString(), ipAddress, deviceInfo, userId]
    );
  }

  /**
   * Record a failed login attempt with automatic lockout
   */
  static async recordFailedLogin(userId) {
    const result = await connectionPool.query(
      `UPDATE ${this.tableName}
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE
             WHEN failed_login_attempts + 1 >= 5 
             THEN NOW() + INTERVAL '30 minutes'
             ELSE NULL
           END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING failed_login_attempts, locked_until`,
      [userId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Check if account is locked
   */
  static async isLocked(userId) {
    const user = await this.findById(userId);
    if (!user) return true;
    
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return true;
    }
    
    // Auto-unlock if lock period expired
    if (user.locked_until && new Date(user.locked_until) <= new Date()) {
      await this.update({ id: userId }, {
        locked_until: null,
        failed_login_attempts: 0,
      });
      return false;
    }
    
    return false;
  }

  // ==================== KYC METHODS ====================

  /**
   * Update KYC status and level
   */
  static async updateKYC(userId, level, status, verifiedBy = null) {
    const updates = {
      kyc_level: level,
      kyc_status: status,
    };
    
    if (status === 'verified' || status === 'enhanced') {
      updates.kyc_verified_at = new Date().toISOString();
    }
    
    return this.update({ id: userId }, updates);
  }

  /**
   * Get KYC limits for a user
   */
  static getKYCLimits(kycLevel) {
    const level = this.kycLevels[kycLevel] || this.kycLevels[0];
    return {
      maxTransactionAmount: level.maxTransactionAmount,
      maxWalletBalance: level.maxWalletBalance,
      maxDailyVolume: level.maxDailyVolume,
    };
  }

  // ==================== ACCOUNT MANAGEMENT ====================

  /**
   * Suspend a user account
   */
  static async suspend(userId, reason, suspendedBy, durationHours = null) {
    const updates = {
      is_suspended: true,
      suspended_reason: reason,
      suspended_at: new Date().toISOString(),
      suspended_by: suspendedBy,
    };
    
    if (durationHours) {
      const until = new Date();
      until.setHours(until.getHours() + durationHours);
      updates.suspended_until = until.toISOString();
    }
    
    return this.update({ id: userId }, updates);
  }

  /**
   * Unsuspend a user account
   */
  static async unsuspend(userId) {
    return this.update({ id: userId }, {
      is_suspended: false,
      suspended_reason: null,
      suspended_at: null,
      suspended_until: null,
    });
  }

  /**
   * Check if user is suspended
   */
  static async isSuspended(userId) {
    const user = await this.findById(userId);
    if (!user) return true;
    
    if (!user.is_suspended) return false;
    
    // Auto-unsuspend if suspension period expired
    if (user.suspended_until && new Date(user.suspended_until) <= new Date()) {
      await this.unsuspend(userId);
      return false;
    }
    
    return true;
  }

  // ==================== GDPR COMPLIANCE ====================

  /**
   * Export all user data (GDPR data portability)
   */
  static async exportData(userId) {
    const user = await this.findById(userId, {
      with: ['sessions', 'devices', 'wallets', 'addresses', 'orders'],
    });
    
    if (!user) return null;

    return {
      profile: user.toJSON(),
      sessions: user._relations.sessions?.map(s => s.toJSON()) || [],
      devices: user._relations.devices?.map(d => d.toJSON()) || [],
      wallets: user._relations.wallets?.map(w => w.toJSON()) || [],
      addresses: user._relations.addresses?.map(a => a.toJSON()) || [],
      orders: user._relations.orders?.map(o => o.toJSON()) || [],
      exportedAt: new Date().toISOString(),
      exportReason: 'GDPR Data Portability Request',
    };
  }

  /**
   * Anonymize user data (right to be forgotten)
   */
  static async anonymize(userId) {
    const anonymousData = {
      email: `deleted_${userId}@anonymized.siamsiam.com`,
      phone: null,
      password_hash: null,
      first_name: 'Deleted',
      last_name: 'User',
      date_of_birth: null,
      national_id: null,
      profile_picture_url: null,
      is_active: false,
      right_to_be_forgotten: true,
      data_retention_consent: false,
      marketing_consent: false,
      preferences: {},
      notification_settings: {},
      metadata: { anonymized_at: new Date().toISOString() },
    };
    
    return this.update({ id: userId }, anonymousData);
  }
}

// Apply soft delete mixin
SoftDeleteMixin.applyTo(User);

module.exports = User;