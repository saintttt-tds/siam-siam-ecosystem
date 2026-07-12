const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * MFA Method Model - User MFA Configuration
 * 
 * Stores user's multi-factor authentication methods.
 * Supports TOTP (authenticator apps), SMS, Email, biometric,
 * and hardware security keys (FIDO2/WebAuthn).
 * 
 * TABLE: mfa_methods
 * 
 * MFA METHODS:
 * - totp: Time-based One-Time Password (Google Authenticator, Authy, etc.)
 * - sms: SMS verification codes
 * - email: Email verification codes
 * - biometric: Fingerprint, face recognition
 * - security_key: FIDO2/WebAuthn hardware keys (YubiKey, etc.)
 * - backup_codes: Printed/displayed recovery codes
 * 
 * MFA ENROLLMENT FLOW:
 * 1. User initiates MFA setup
 * 2. Method-specific enrollment (scan QR, verify phone, etc.)
 * 3. User verifies with test code
 * 4. Method is activated
 * 5. Backup codes generated as fallback
 */

class MfaMethod extends BaseModel {
  static tableName = 'mfa_methods';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id',
    // Method identification
    'method_type', 'method_label', 'method_identifier',
    'display_name', 'device_name', 'device_type',
    // Status
    'is_enabled', 'is_primary', 'is_verified',
    'verified_at', 'verification_method',
    'enrolled_at', 'last_rotated_at',
    // Secret/Key storage
    'secret_encrypted', 'secret_type',
    'public_key', 'credential_id',
    'key_handle', 'attestation_data',
    // TOTP specific
    'totp_algorithm', 'totp_digits', 'totp_period',
    'totp_qr_code_url', 'totp_issuer',
    // SMS/Email specific
    'backup_phone', 'backup_email',
    'phone_last_verified', 'email_last_verified',
    // Biometric specific
    'biometric_type', 'biometric_vendor',
    'biometric_device_id', 'biometric_enrolled_at',
    'biometric_template_id',
    // Security key specific
    'security_key_model', 'security_key_aaguid',
    'security_key_transports', 'security_key_registered_at',
    // Usage tracking
    'last_used_at', 'use_count', 'last_verified_at',
    // Security
    'failed_attempts', 'max_failed_attempts',
    'locked_until', 'lock_reason',
    'last_failed_at', 'last_failed_ip',
    // Recovery
    'recovery_codes_generated', 'recovery_codes_remaining',
    'recovery_codes_generated_at',
    // Device trust
    'trusted_devices', 'trust_expires_at',
    'remember_device', 'remember_device_days',
    // Notifications
    'notify_on_new_device', 'notify_on_failure',
    'notification_channels',
    // Compliance
    'is_compliant', 'compliance_level',
    'last_compliance_check_at',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at',
  ];

  static casts = {
    trusted_devices: 'json',
    notification_channels: 'json',
    metadata: 'json',
    tags: 'json',
    is_enabled: 'boolean', is_primary: 'boolean',
    is_verified: 'boolean', is_compliant: 'boolean',
    recovery_codes_generated: 'boolean',
    remember_device: 'boolean',
    notify_on_new_device: 'boolean', notify_on_failure: 'boolean',
    totp_digits: 'integer', totp_period: 'integer',
    use_count: 'integer', failed_attempts: 'integer',
    max_failed_attempts: 'integer',
    recovery_codes_remaining: 'integer',
    remember_device_days: 'integer',
    compliance_level: 'integer',
  };

  static relations = {
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
  };

  static methodTypes = {
    TOTP: 'totp', SMS: 'sms', EMAIL: 'email',
    BIOMETRIC: 'biometric', SECURITY_KEY: 'security_key',
    BACKUP_CODES: 'backup_codes',
  };

  static biometricTypes = {
    FINGERPRINT: 'fingerprint', FACE: 'face',
    IRIS: 'iris', VOICE: 'voice', PALM: 'palm',
  };

  static totpDefaults = {
    algorithm: 'SHA1', digits: 6, period: 30,
  };

  /**
   * Find all enabled MFA methods for a user
   */
  static async findByUser(userId) {
    return this.findAll({
      where: { user_id: userId, is_enabled: true },
      orderBy: { is_primary: 'DESC', enrolled_at: 'ASC' },
    });
  }

  /**
   * Find the primary MFA method for a user
   */
  static async getPrimary(userId) {
    return this.findOne({
      where: { user_id: userId, is_primary: true, is_enabled: true },
    });
  }

  /**
   * Check if user has any MFA methods enabled
   */
  static async hasMfaEnabled(userId) {
    const count = await this.count({
      where: { user_id: userId, is_enabled: true },
    });
    return count > 0;
  }

  /**
   * Enroll a new MFA method
   */
  static async enroll(userId, methodType, options = {}) {
    // Check if method already exists
    const existing = await this.findOne({
      where: { user_id: userId, method_type: methodType },
    });

    const hasExistingMethods = await this.hasMfaEnabled(userId);
    const secretEncrypted = options.secret
      ? require('@siamsiam/shared-utils').security.encryption.encrypt(options.secret)
      : null;

    if (existing) {
      // Re-enroll existing method
      return this.update({ id: existing.id }, {
        is_enabled: true,
        is_verified: options.isVerified || false,
        verified_at: options.isVerified ? new Date().toISOString() : null,
        secret_encrypted: secretEncrypted || existing.secret_encrypted,
        method_label: options.label || existing.method_label,
        device_name: options.deviceName || existing.device_name,
        is_primary: !hasExistingMethods || options.isPrimary || false,
        enrolled_at: new Date().toISOString(),
        failed_attempts: 0,
        locked_until: null,
        metadata: { ...(existing.metadata || {}), ...(options.metadata || {}), reEnrolledAt: new Date().toISOString() },
      });
    }

    // Create new method
    return this.create({
      user_id: userId,
      method_type: methodType,
      method_label: options.label || this._getDefaultLabel(methodType),
      method_identifier: options.identifier || null,
      display_name: options.displayName || null,
      device_name: options.deviceName || null,
      device_type: options.deviceType || null,
      is_enabled: true,
      is_primary: !hasExistingMethods || options.isPrimary || false,
      is_verified: options.isVerified || false,
      verified_at: options.isVerified ? new Date().toISOString() : null,
      verification_method: options.verificationMethod,
      enrolled_at: new Date().toISOString(),
      secret_encrypted: secretEncrypted,
      secret_type: options.secretType || 'base32',
      // TOTP specific
      totp_algorithm: options.totpAlgorithm || this.totpDefaults.algorithm,
      totp_digits: options.totpDigits || this.totpDefaults.digits,
      totp_period: options.totpPeriod || this.totpDefaults.period,
      totp_qr_code_url: options.totpQrCodeUrl,
      totp_issuer: options.totpIssuer || 'SiamSiam',
      // SMS/Email
      backup_phone: options.backupPhone,
      backup_email: options.backupEmail,
      // Biometric
      biometric_type: options.biometricType,
      biometric_vendor: options.biometricVendor,
      biometric_device_id: options.biometricDeviceId,
      // Security key
      security_key_model: options.securityKeyModel,
      security_key_aaguid: options.securityKeyAaguid,
      security_key_transports: options.securityKeyTransports,
      public_key: options.publicKey,
      credential_id: options.credentialId,
      // Settings
      max_failed_attempts: options.maxFailedAttempts || 5,
      remember_device: options.rememberDevice || false,
      remember_device_days: options.rememberDeviceDays || 30,
      notify_on_new_device: options.notifyOnNewDevice !== false,
      notify_on_failure: options.notifyOnFailure !== false,
      is_compliant: true,
      compliance_level: options.complianceLevel || 1,
      metadata: options.metadata || {},
      tenant_id: options.tenantId || null,
    });
  }

  /**
   * Verify an MFA method (confirm enrollment)
   */
  static async verify(methodId, verificationMethod = 'code') {
    return this.update({ id: methodId }, {
      is_verified: true,
      verified_at: new Date().toISOString(),
      verification_method: verificationMethod,
      failed_attempts: 0,
      locked_until: null,
    });
  }

  /**
   * Disable an MFA method
   */
  static async disable(methodId, reason = null) {
    const method = await this.findById(methodId);
    if (!method) throw new Error('MFA method not found');

    // If this was primary, set another method as primary
    if (method.is_primary) {
      const nextMethod = await this.findOne({
        where: { user_id: method.user_id, is_enabled: true, id: { operator: '!=', value: methodId } },
        orderBy: { enrolled_at: 'ASC' },
      });
      if (nextMethod) {
        await this.update({ id: nextMethod.id }, { is_primary: true });
      }
    }

    return this.update({ id: methodId }, {
      is_enabled: false,
      is_primary: false,
      notes: reason,
      metadata: { ...(method.metadata || {}), disabledAt: new Date().toISOString(), disabledReason: reason },
    });
  }

  /**
   * Set a method as primary
   */
  static async setPrimary(userId, methodId) {
    // Unset all other primary methods
    await connectionPool.query(
      `UPDATE ${this.tableName} SET is_primary = false, updated_at = NOW() WHERE user_id = $1`,
      [userId]
    );
    return this.update({ id: methodId }, { is_primary: true, updated_at: new Date().toISOString() });
  }

  /**
   * Record successful MFA verification
   */
  static async recordSuccess(methodId, metadata = {}) {
    return this.update({ id: methodId }, {
      last_used_at: new Date().toISOString(),
      last_verified_at: new Date().toISOString(),
      use_count: connectionPool.raw('use_count + 1'),
      failed_attempts: 0,
      locked_until: null,
      metadata: {
        ...(await this.findById(methodId))?.metadata || {},
        lastSuccessAt: new Date().toISOString(),
        lastSuccessIp: metadata.ip,
        lastSuccessDevice: metadata.deviceId,
      },
    });
  }

  /**
   * Record failed MFA attempt
   */
  static async recordFailure(methodId, ip = null) {
    const method = await this.findById(methodId);
    if (!method) return null;

    const attempts = (method.failed_attempts || 0) + 1;
    const maxAttempts = method.max_failed_attempts || 5;
    const updates = {
      failed_attempts: attempts,
      last_failed_at: new Date().toISOString(),
      last_failed_ip: ip,
    };

    if (attempts >= maxAttempts) {
      updates.locked_until = new Date(Date.now() + 30 * 60000).toISOString();
      updates.lock_reason = `Exceeded maximum failed attempts (${maxAttempts})`;
      logger.warn('MFA method locked due to failed attempts', {
        methodId, userId: method.user_id, attempts, methodType: method.method_type,
      });
    }

    return this.update({ id: methodId }, updates);
  }

  /**
   * Check if method is locked
   */
  static async isLocked(methodId) {
    const method = await this.findById(methodId);
    if (!method) return true;
    if (!method.locked_until) return false;
    if (new Date(method.locked_until) < new Date()) {
      // Auto-unlock
      await this.update({ id: methodId }, { locked_until: null, failed_attempts: 0 });
      return false;
    }
    return true;
  }

  /**
   * Rotate TOTP secret
   */
  static async rotateSecret(methodId, newSecret) {
    const secretEncrypted = require('@siamsiam/shared-utils').security.encryption.encrypt(newSecret);
    return this.update({ id: methodId }, {
      secret_encrypted: secretEncrypted,
      last_rotated_at: new Date().toISOString(),
      is_verified: false,
      verified_at: null,
    });
  }

  /**
   * Generate TOTP secret and QR code URL
   */
  static generateTOTPSetup(userEmail, issuer = 'SiamSiam') {
    const secret = crypto.randomBytes(20).toString('base64');
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedEmail = encodeURIComponent(userEmail);
    const qrCodeUrl = `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

    return { secret, qrCodeUrl };
  }

  /**
   * Get MFA summary for a user
   */
  static async getSummary(userId) {
    const methods = await this.findByUser(userId);
    const primary = methods.find(m => m.is_primary);
    const backupCodesRemaining = await require('./mfa-backup-code').getRemainingCount(userId);

    return {
      mfaEnabled: methods.length > 0,
      totalMethods: methods.length,
      primaryMethod: primary ? { type: primary.method_type, label: primary.method_label } : null,
      methods: methods.map(m => ({
        id: m.id, type: m.method_type, label: m.method_label,
        isPrimary: m.is_primary, isVerified: m.is_verified,
        lastUsedAt: m.last_used_at, deviceName: m.device_name,
      })),
      backupCodesRemaining,
      backupCodesNeeded: backupCodesRemaining <= 2,
    };
  }

  /**
   * Get default label for method type
   * @private
   */
  static _getDefaultLabel(methodType) {
    const labels = {
      totp: 'Authenticator App',
      sms: 'SMS Verification',
      email: 'Email Verification',
      biometric: 'Biometric',
      security_key: 'Security Key',
      backup_codes: 'Recovery Codes',
    };
    return labels[methodType] || methodType;
  }
}

module.exports = MfaMethod;