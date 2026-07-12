const crypto = require('crypto');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * Transparent Data Encryption for Stored Data
 * 
 * Provides field-level encryption for sensitive data stored in PostgreSQL.
 * Implements AES-256-GCM with per-field initialization vectors.
 * 
 * USE CASES:
 * - Personally Identifiable Information (PII)
 * - Payment card data (before tokenization)
 * - API keys and secrets
 * - Session tokens
 * - Health records
 * 
 * SECURITY FEATURES:
 * - AES-256-GCM (authenticated encryption)
 * - Unique IV per encryption
 * - Authentication tag to detect tampering
 * - Key derivation with PBKDF2
 * 
 * PRODUCTION REQUIREMENTS:
 * - Store encryption key in HashiCorp Vault or AWS KMS
 * - Implement key rotation without downtime
 * - Never log encrypted data or keys
 * - Use HSM for key management in production
 * - Regular security audits of encryption implementation
 * 
 * @example
 *   const encrypted = Encryption.encrypt('sensitive data');
 *   const decrypted = Encryption.decrypt(encrypted);
 */

class Encryption {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
    this.saltLength = 32;
    this.iterations = 100000;
    this.digest = 'sha512';
    
    // PRODUCTION: Replace with Vault/KMS key retrieval
    this.masterKey = config.encryption.key;
    
    if (!this.masterKey || this.masterKey.length < 32) {
      if (config.isProduction) {
        throw new Error('Encryption key must be at least 32 characters in production!');
      }
      logger.warn('⚠️ Using development encryption key - NOT FOR PRODUCTION');
    }
  }

  /**
   * Encrypt a value
   * @param {string} text - Plain text to encrypt
   * @returns {string} Encrypted value in format: salt:iv:authTag:ciphertext (hex)
   */
  encrypt(text) {
    if (!text) return null;
    
    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);
      
      // Derive key using PBKDF2
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
      
      // Get authentication tag
      const authTag = cipher.getAuthTag();
      
      // Format: salt:iv:authTag:ciphertext
      const result = [
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
   * Decrypt a value
   * @param {string} encryptedText - Encrypted value in format: salt:iv:authTag:ciphertext
   * @returns {string} Decrypted plain text
   */
  decrypt(encryptedText) {
    if (!encryptedText) return null;
    
    try {
      // Parse components
      const parts = encryptedText.split(':');
      if (parts.length !== 4) {
        throw new Error('Invalid encrypted data format');
      }
      
      const salt = Buffer.from(parts[0], 'hex');
      const iv = Buffer.from(parts[1], 'hex');
      const authTag = Buffer.from(parts[2], 'hex');
      const ciphertext = parts[3];
      
      // Derive key using PBKDF2
      const key = crypto.pbkdf2Sync(
        this.masterKey,
        salt,
        this.iterations,
        this.keyLength,
        this.digest
      );
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv, {
        authTagLength: this.tagLength,
      });
      
      // Set authentication tag
      decipher.setAuthTag(authTag);
      
      // Decrypt
      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      // Don't log the encrypted data
      logger.error('Decryption failed', { error: error.message });
      throw new Error('Failed to decrypt data - data may be corrupted or tampered');
    }
  }

  /**
   * Encrypt specific fields in an object
   * @param {Object} data - Object containing fields to encrypt
   * @param {string[]} fields - Field names to encrypt
   * @returns {Object} Object with encrypted fields
   */
  encryptFields(data, fields) {
    if (!data) return data;
    
    const encrypted = { ...data };
    
    for (const field of fields) {
      if (encrypted[field]) {
        encrypted[field] = this.encrypt(encrypted[field]);
      }
    }
    
    return encrypted;
  }

  /**
   * Decrypt specific fields in an object
   * @param {Object} data - Object containing encrypted fields
   * @param {string[]} fields - Field names to decrypt
   * @returns {Object} Object with decrypted fields
   */
  decryptFields(data, fields) {
    if (!data) return data;
    
    const decrypted = { ...data };
    
    for (const field of fields) {
      if (decrypted[field]) {
        try {
          decrypted[field] = this.decrypt(decrypted[field]);
        } catch (error) {
          // Field might not be encrypted
          logger.warn(`Failed to decrypt field: ${field}`, { error: error.message });
        }
      }
    }
    
    return decrypted;
  }

  /**
   * Hash a value (one-way, cannot be decrypted)
   * Uses SHA-256 for consistent hashing
   */
  hash(text) {
    if (!text) return null;
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Hash a value with a salt (for passwords, etc.)
   * Uses PBKDF2 for key stretching
   */
  hashWithSalt(text, salt) {
    if (!text) return null;
    
    const effectiveSalt = salt || crypto.randomBytes(16).toString('hex');
    
    const hash = crypto.pbkdf2Sync(
      text,
      effectiveSalt,
      this.iterations,
      64,
      this.digest
    ).toString('hex');
    
    return `${effectiveSalt}:${hash}`;
  }

  /**
   * Verify a value against a salted hash
   */
  verifyHash(text, hashedValue) {
    if (!text || !hashedValue) return false;
    
    const [salt, originalHash] = hashedValue.split(':');
    const newHash = this.hashWithSalt(text, salt);
    
    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(newHash),
      Buffer.from(hashedValue)
    );
  }

  /**
   * Generate a secure random token
   * @param {number} length - Length in bytes (default: 32 -> 64 hex characters)
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a secure random string (URL-safe base64)
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
   * Mask sensitive data for logging
   * Shows first 4 and last 4 characters, masks the rest
   */
  mask(text, showFirst = 4, showLast = 4) {
    if (!text) return null;
    if (text.length <= showFirst + showLast) return '*'.repeat(text.length);
    
    const first = text.substring(0, showFirst);
    const last = text.substring(text.length - showLast);
    const masked = '*'.repeat(text.length - showFirst - showLast);
    
    return `${first}${masked}${last}`;
  }
}

// Export singleton instance
module.exports = new Encryption();