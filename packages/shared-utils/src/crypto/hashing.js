const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * Password Hashing Service (bcrypt/argon2)
 * 
 * Provides secure password hashing with:
 * - bcrypt (current standard, 12 rounds)
 * - argon2id support (future upgrade path)
 * - Automatic salt generation
 * - Constant-time comparison
 * - Hash upgrade detection
 * - Legacy hash migration
 * 
 * HASHING BEST PRACTICES:
 * - Never store plaintext passwords
 * - Use strong, slow hashing algorithms (bcrypt, argon2)
 * - Include unique salt per password
 * - Use sufficient work factor (cost/rounds)
 * - Upgrade hashes when better algorithms become available
 * 
 * WORK FACTORS:
 * - bcrypt: 12 rounds (recommended, ~250ms on modern hardware)
 * - argon2id: memory=65536, iterations=3, parallelism=4 (OWASP recommended)
 * 
 * @example
 *   const hashing = require('@siamsiam/shared-utils').crypto.hashing;
 *   
 *   // Hash a password
 *   const hash = await hashing.hash('user_password');
 *   
 *   // Verify a password
 *   const isValid = await hashing.verify('user_password', hash);
 *   
 *   // Check if hash needs upgrade
 *   if (hashing.needsUpgrade(hash)) {
 *     const newHash = await hashing.hash('user_password');
 *     // Store newHash in database
 *   }
 */

class HashingService {
  constructor() {
    // Bcrypt configuration
    this.bcryptRounds = 12; // Cost factor (2^12 = 4096 iterations)
    
    // Argon2 configuration (for future use)
    this.argon2Config = {
      memoryCost: 65536,    // 64 MB
      timeCost: 3,          // 3 iterations
      parallelism: 4,       // 4 threads
      hashLength: 32,       // 32 bytes output
      saltLength: 16,       // 16 bytes salt
    };

    // Hash version prefixes for identification
    this.hashPrefixes = {
      bcrypt: '$2a$',      // bcrypt
      bcrypt_v2: '$2b$',   // bcrypt (fixed version)
      argon2: '$argon2id$', // argon2id
      sha256: 'sha256:',   // Legacy (migrate!)
      pbkdf2: 'pbkdf2:',   // Legacy (migrate!)
    };
  }

  /**
   * Hash a password using bcrypt
   * @param {string} password - Plain text password
   * @returns {Promise<string>} Hashed password
   */
  async hash(password) {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    try {
      // Generate salt and hash
      const salt = await bcrypt.genSalt(this.bcryptRounds);
      const hash = await bcrypt.hash(password, salt);
      
      return hash;
    } catch (error) {
      logger.error('Password hashing failed', { error: error.message });
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Verify password against hash
   * @param {string} password - Plain text password
   * @param {string} hash - Stored hash
   * @returns {Promise<boolean>} True if password matches
   */
  async verify(password, hash) {
    if (!password || !hash) return false;

    try {
      // Detect hash type and verify accordingly
      if (hash.startsWith(this.hashPrefixes.bcrypt) || 
          hash.startsWith(this.hashPrefixes.bcrypt_v2)) {
        return await bcrypt.compare(password, hash);
      }

      if (hash.startsWith(this.hashPrefixes.sha256)) {
        return this._verifySHA256(password, hash);
      }

      if (hash.startsWith(this.hashPrefixes.pbkdf2)) {
        return this._verifyPBKDF2(password, hash);
      }

      // Unknown hash format
      logger.warn('Unknown hash format during verification');
      return false;
    } catch (error) {
      logger.error('Password verification failed', { error: error.message });
      return false;
    }
  }

  /**
   * Check if hash needs to be upgraded to newer algorithm
   * @param {string} hash - Existing hash
   * @returns {boolean} True if hash should be upgraded
   */
  needsUpgrade(hash) {
    if (!hash) return true;

    // Check if using legacy hashing
    if (hash.startsWith(this.hashPrefixes.sha256)) return true;
    if (hash.startsWith(this.hashPrefixes.pbkdf2)) return true;

    // Check bcrypt cost factor
    if (hash.startsWith(this.hashPrefixes.bcrypt) || 
        hash.startsWith(this.hashPrefixes.bcrypt_v2)) {
      // Extract cost factor from hash ($2a$12$...)
      const costMatch = hash.match(/^\$2[ab]\$(\d+)\$/);
      if (costMatch) {
        const cost = parseInt(costMatch[1]);
        return cost < this.bcryptRounds;
      }
    }

    return false;
  }

  /**
   * Generate a secure random password
   * @param {number} length - Password length (default: 16)
   * @returns {string} Random password
   */
  generatePassword(length = 16) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';
    
    // Ensure at least one of each character type
    password += 'abcdefghijklmnopqrstuvwxyz'[crypto.randomInt(26)];
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[crypto.randomInt(26)];
    password += '0123456789'[crypto.randomInt(10)];
    password += '!@#$%^&*'[crypto.randomInt(8)];
    
    // Fill remaining with random characters
    for (let i = password.length; i < length; i++) {
      password += charset[crypto.randomInt(charset.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => crypto.randomInt(3) - 1).join('');
  }

  /**
   * Hash data using SHA-256 (for non-password use)
   * @param {string} data - Data to hash
   * @returns {string} Hex-encoded hash
   */
  sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Hash data using SHA-512
   * @param {string} data - Data to hash
   * @returns {string} Hex-encoded hash
   */
  sha512(data) {
    return crypto.createHash('sha512').update(data).digest('hex');
  }

  /**
   * Generate HMAC-SHA256
   * @param {string} data - Data to sign
   * @param {string} secret - Secret key
   * @returns {string} Hex-encoded HMAC
   */
  hmac(data, secret) {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Compare two strings in constant time (prevents timing attacks)
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {boolean} True if equal
   */
  constantTimeCompare(a, b) {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Verify legacy SHA-256 hash
   * @private
   */
  _verifySHA256(password, hash) {
    // Legacy format: sha256:salt:hash
    const parts = hash.split(':');
    if (parts.length !== 3) return false;
    
    const [, salt, originalHash] = parts;
    const computedHash = crypto
      .createHash('sha256')
      .update(salt + password)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(computedHash),
      Buffer.from(originalHash)
    );
  }

  /**
   * Verify legacy PBKDF2 hash
   * @private
   */
  _verifyPBKDF2(password, hash) {
    // Legacy format: pbkdf2:iterations:salt:hash
    const parts = hash.split(':');
    if (parts.length !== 4) return false;
    
    const [, iterations, salt, originalHash] = parts;
    const computedHash = crypto
      .pbkdf2Sync(password, salt, parseInt(iterations), 64, 'sha512')
      .toString('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(computedHash),
      Buffer.from(originalHash)
    );
  }
}

// Export singleton instance
module.exports = new HashingService();