const crypto = require('crypto');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * USSD Session Data Encryption
 * 
 * Encrypts sensitive data within USSD sessions:
 * - PIN numbers
 * - Account numbers
 * - Transaction amounts
 * - Session tokens
 * 
 * USSD data passes through mobile networks and may be stored
 * temporarily, so sensitive data must be encrypted.
 * 
 * @example
 *   const ussdEncrypt = require('@siamsiam/shared-utils').ussd.encryption;
 *   
 *   const encrypted = ussdEncrypt.encrypt('1234');
 *   const decrypted = ussdEncrypt.decrypt(encrypted);
 */

class USSDEncryption {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
    
    // Derive key from master key + USSD-specific salt
    this.key = this._deriveKey(config.encryption.key, 'ussd_session_encryption');
  }

  /**
   * Encrypt USSD data
   * @param {string} data - Data to encrypt
   * @returns {string} Encrypted data (hex)
   */
  encrypt(data) {
    if (!data) return null;

    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv, {
        authTagLength: this.tagLength,
      });

      let encrypted = cipher.update(String(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      // Format: iv:authTag:ciphertext
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      logger.error('USSD encryption failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Decrypt USSD data
   * @param {string} encryptedData - Encrypted data
   * @returns {string} Decrypted data
   */
  decrypt(encryptedData) {
    if (!encryptedData) return null;

    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const ciphertext = parts[2];

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv, {
        authTagLength: this.tagLength,
      });

      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('USSD decryption failed', { error: error.message });
      throw new Error('Failed to decrypt USSD data');
    }
  }

  /**
   * Encrypt a PIN for temporary storage
   */
  encryptPIN(pin) {
    // Add pepper before encrypting
    const pepper = 'ussd_pin_pepper';
    return this.encrypt(`${pin}:${pepper}`);
  }

  /**
   * Decrypt and verify PIN
   */
  decryptPIN(encryptedPin) {
    const decrypted = this.decrypt(encryptedPin);
    if (!decrypted) return null;
    
    // Remove pepper
    const [pin] = decrypted.split(':');
    return pin;
  }

  /**
   * Generate a secure session token
   */
  generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // ==================== PRIVATE ====================

  /**
   * Derive encryption key using PBKDF2
   * @private
   */
  _deriveKey(masterKey, salt) {
    return crypto.pbkdf2Sync(
      masterKey,
      salt,
      100000,
      this.keyLength,
      'sha512'
    );
  }
}

// Export singleton instance
module.exports = new USSDEncryption();