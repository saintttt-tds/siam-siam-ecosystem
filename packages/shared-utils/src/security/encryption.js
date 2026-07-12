const crypto = require('crypto');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * AES-256-GCM Encryption Utilities
 * 
 * Military-grade encryption for sensitive data with:
 * - AES-256-GCM (Galois/Counter Mode) - provides both encryption and authentication
 * - PBKDF2 key derivation (100,000 iterations)
 * - Unique IV per encryption operation
 * - Authentication tag to detect tampering
 * - Constant-time comparison for hash verification
 * 
 * USE CASES:
 * - PII encryption (names, addresses, phone numbers)
 * - Payment data encryption (before tokenization)
 * - API keys and secrets at rest
 * - Session data encryption
 * - Health records encryption
 * 
 * PRODUCTION REQUIREMENTS:
 * - Store master key in HashiCorp Vault or AWS KMS
 * - Rotate keys every 90 days (minimum)
 * - Use HSM for key management in production
 * - Never log keys or encrypted data
 * - Regular penetration testing of encryption implementation
 * 
 * @example
 *   const { encrypt, decrypt } = require('@siamsiam/shared-utils').security.encryption;
 *   const encrypted = encrypt('sensitive data');
 *   const decrypted = decrypt(encrypted);
 */

class Encryption {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits (GCM auth tag)
    this.saltLength = 32;
    this.iterations = 100000; // PBKDF2 iterations
    this.digest = 'sha512';
    
    // PRODUCTION: Load from Vault/KMS, not environment variable
    this.masterKey = config.encryption.key;
    
    // Validate master key length
    if (!this.masterKey || this.masterKey.length < 32) {
      if (config.isProduction) {
        throw new Error('❌ Encryption master key must be at least 32 characters in production!');
      }
      logger.warn('⚠️ Using weak/short encryption key - NOT FOR PRODUCTION');
    }
  }

  /**
   * Encrypt a value using AES-256-GCM with PBKDF2 key derivation
   * @param {string|Object} data - Data to encrypt (objects will be JSON stringified)
   * @returns {string} Encrypted value in format: version:salt:iv:authTag:ciphertext
   */
  encrypt(data) {
    if (!data) return null;
    
    // Convert objects to JSON
    const text = typeof data === 'object' ? JSON.stringify(data) : String(data);
    
    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);
      
      // Derive encryption key using PBKDF2
      const key = crypto.pbkdf2Sync(
        this.masterKey,
        salt,
        this.iterations,
        this.keyLength,
        this.digest
      );
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv, {
        authTagLength: this.tagLength,
      });
      
      // Encrypt
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get authentication tag (detects tampering)
      const authTag = cipher.getAuthTag();
      
      // Format: version:salt:iv:authTag:ciphertext
      // Version allows future algorithm changes
      const result = [
        'v1',
        salt.toString('hex'),
        iv.toString('hex'),
        authTag.toString('hex'),
        encrypted,
      ].join(':');
      
      return result;
    } catch (error) {
      logger.error('Encryption failed', { error: error.message });
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt a value encrypted with encrypt()
   * @param {string} encryptedData - Encrypted value
   * @param {boolean} parseJson - Parse result as JSON (default: false)
   * @returns {string|Object} Decrypted data
   */
  decrypt(encryptedData, parseJson = false) {
    if (!encryptedData) return null;
    
    try {
      // Parse components
      const parts = encryptedData.split(':');
      
      // Version 1: salt:iv:authTag:ciphertext
      if (parts[0] === 'v1' && parts.length === 5) {
        return this._decryptV1(parts, parseJson);
      }
      // Legacy format (no version): salt:iv:authTag:ciphertext
      else if (parts.length === 4) {
        return this._decryptLegacy(parts, parseJson);
      }
      // Unencrypted data (backward compatibility)
      else {
        logger.warn('Data appears unencrypted, returning as-is');
        return encryptedData;
      }
    } catch (error) {
      logger.error('Decryption failed', { error: error.message });
      throw new Error('Failed to decrypt data - data may be corrupted or tampered');
    }
  }

  /**
   * Encrypt specific fields in an object
   * @param {Object} data - Object containing fields to encrypt
   * @param {string[]} fields - Field names to encrypt
   * @returns {Object} Object with specified fields encrypted
   */
  encryptFields(data, fields) {
    if (!data) return data;
    
    const encrypted = { ...data };
    
    for (const field of fields) {
      if (encrypted[field] !== undefined && encrypted[field] !== null) {
        encrypted[field] = this.encrypt(encrypted[field]);
      }
    }
    
    return encrypted;
  }

  /**
   * Decrypt specific fields in an object
   * @param {Object} data - Object containing encrypted fields
   * @param {string[]} fields - Field names to decrypt
   * @returns {Object} Object with specified fields decrypted
   */
  decryptFields(data, fields) {
    if (!data) return data;
    
    const decrypted = { ...data };
    
    for (const field of fields) {
      if (decrypted[field]) {
        try {
          decrypted[field] = this.decrypt(decrypted[field]);
        } catch (error) {
          // Field might not be encrypted or might be in old format
          logger.debug(`Could not decrypt field: ${field}`, { error: error.message });
        }
      }
    }
    
    return decrypted;
  }

  /**
   * Hash data using SHA-256 (one-way, deterministic)
   * Use for lookups, not for passwords
   */
  hash(text) {
    if (!text) return null;
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Hash password with salt using bcrypt-like approach
   * Uses PBKDF2 for key stretching
   */
  hashPassword(password) {
    if (!password) throw new Error('Password is required');
    
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(
      password,
      salt,
      this.iterations,
      64,
      this.digest
    ).toString('hex');
    
    // Format: algorithm:iterations:salt:hash
    return `pbkdf2:${this.iterations}:${salt}:${hash}`;
  }

  /**
   * Verify password against hash
   */
  verifyPassword(password, hashedPassword) {
    if (!password || !hashedPassword) return false;
    
    try {
      const [algorithm, iterations, salt, originalHash] = hashedPassword.split(':');
      
      if (algorithm !== 'pbkdf2') {
        // Legacy or different algorithm
        return false;
      }
      
      const hash = crypto.pbkdf2Sync(
        password,
        salt,
        parseInt(iterations),
        64,
        this.digest
      ).toString('hex');
      
      // Constant-time comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(hash),
        Buffer.from(originalHash)
      );
    } catch (error) {
      logger.error('Password verification failed', { error: error.message });
      return false;
    }
  }

  /**
   * Generate a cryptographically secure random token
   * @param {number} length - Number of random bytes (default: 32 -> 64 hex chars)
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a URL-safe random string
   */
  generateRandomString(length = 32) {
    return crypto
      .randomBytes(length)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Generate a numeric OTP (One-Time Password)
   * @param {number} digits - Number of digits (default: 6)
   */
  generateOTP(digits = 6) {
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    const randomBytes = crypto.randomBytes(4);
    const randomNumber = randomBytes.readUInt32BE(0);
    return String(min + (randomNumber % (max - min + 1)));
  }

  /**
   * Mask sensitive data for display
   * Shows first N and last M characters
   */
  mask(text, showFirst = 4, showLast = 4, maskChar = '*') {
    if (!text) return '';
    if (text.length <= showFirst + showLast) {
      return maskChar.repeat(text.length);
    }
    
    const first = text.substring(0, showFirst);
    const last = text.substring(text.length - showLast);
    const middle = maskChar.repeat(text.length - showFirst - showLast);
    
    return `${first}${middle}${last}`;
  }

  /**
   * Mask email address
   */
  maskEmail(email) {
    if (!email || !email.includes('@')) return '***@***.***';
    const [localPart, domain] = email.split('@');
    if (localPart.length <= 2) return `${localPart[0]}***@${domain}`;
    return `${localPart[0]}${'*'.repeat(localPart.length - 2)}${localPart[localPart.length - 1]}@${domain}`;
  }

  /**
   * Mask phone number
   */
  maskPhone(phone) {
    if (!phone) return '***';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length <= 4) return '*'.repeat(cleaned.length);
    return `${'*'.repeat(cleaned.length - 4)}${cleaned.slice(-4)}`;
  }

  /**
   * Mask credit card number (PCI-DSS compliant)
   */
  maskCardNumber(cardNumber) {
    if (!cardNumber) return '****';
    const cleaned = cardNumber.replace(/\D/g, '');
    if (cleaned.length < 4) return '****';
    return `****${cleaned.slice(-4)}`;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Decrypt V1 format
   * @private
   */
  _decryptV1(parts, parseJson) {
    const [, saltHex, ivHex, authTagHex, ciphertext] = parts;
    
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const key = crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      this.iterations,
      this.keyLength,
      this.digest
    );
    
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv, {
      authTagLength: this.tagLength,
    });
    
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return parseJson ? JSON.parse(decrypted) : decrypted;
  }

  /**
   * Decrypt legacy format
   * @private
   */
  _decryptLegacy(parts, parseJson) {
    // Legacy format support
    return this._decryptV1(['v1', ...parts], parseJson);
  }
}

// Export singleton instance
module.exports = new Encryption();