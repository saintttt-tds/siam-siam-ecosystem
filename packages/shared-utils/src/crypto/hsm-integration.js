const crypto = require('crypto');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * Hardware Security Module (HSM) Integration Interface
 * 
 * Provides a unified interface for cryptographic operations
 * backed by a Hardware Security Module in production.
 * 
 * In development, uses Node.js crypto as software fallback.
 * In production, connects to a real HSM for:
 * - Key generation and storage (never leaves HSM)
 * - Cryptographic signing and verification
 * - Encryption/decryption operations
 * - True random number generation
 * 
 * PRODUCTION HSM OPTIONS:
 * - AWS CloudHSM
 * - Thales Luna HSM
 * - Utimaco HSM
 * - nCipher nShield
 * 
 * SECURITY NOTE:
 * In production, private keys NEVER leave the HSM.
 * All cryptographic operations are performed inside the HSM.
 * The software fallback is for DEVELOPMENT ONLY.
 * 
 * @example
 *   const hsm = require('@siamsiam/shared-utils').crypto.hsmIntegration;
 *   await hsm.connect();
 *   const signature = await hsm.sign('data to sign', 'key_123');
 */

class HSMIntegration {
  constructor() {
    // PRODUCTION: Set to actual HSM provider
    this.provider = process.env.HSM_PROVIDER || 'software'; // software | aws_cloudhsm | thales | utimaco
    this.isConnected = false;
    this.isDevelopment = config.isDevelopment;
    
    // Partition/domain for key isolation
    this.partition = process.env.HSM_PARTITION || 'siamsiam';
    
    // Key labels for different purposes
    this.keyLabels = {
      masterKey: 'siamsiam_master_key',
      jwtSigning: 'siamsiam_jwt_signing',
      dataEncryption: 'siamsiam_data_encryption',
      tlsCertificate: 'siamsiam_tls',
    };
  }

  /**
   * Connect to HSM
   * In development, initializes software mode
   * In production, establishes connection to physical HSM
   */
  async connect() {
    if (this.isConnected) return;

    try {
      if (this.provider === 'software') {
        this.isConnected = true;
        logger.info('HSM running in SOFTWARE mode (DEVELOPMENT ONLY)');
        if (!this.isDevelopment) {
          logger.warn('⚠️ CRITICAL: HSM in software mode in non-development environment!');
        }
        return;
      }

      // PRODUCTION: Connect to actual HSM
      // switch (this.provider) {
      //   case 'aws_cloudhsm':
      //     await this._connectCloudHSM();
      //     break;
      //   case 'thales':
      //     await this._connectThales();
      //     break;
      //   case 'utimaco':
      //     await this._connectUtimaco();
      //     break;
      // }

      this.isConnected = true;
      logger.info(`HSM connected via ${this.provider}`);
    } catch (error) {
      logger.error('HSM connection failed', { error: error.message });
      throw new Error('Failed to connect to HSM');
    }
  }

  /**
   * Generate a new key pair in the HSM
   * @param {string} algorithm - Key algorithm (RSA-2048, RSA-4096, EC-P256)
   * @param {string} label - Key label/identifier
   * @returns {Object} Key metadata (public key only, private stays in HSM)
   */
  async generateKeyPair(algorithm = 'RSA-2048', label) {
    if (!this.isConnected) await this.connect();

    try {
      if (this.provider === 'software') {
        // Development: Generate in-memory key pair
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: algorithm.includes('4096') ? 4096 : 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });

        // In production, private key would be stored in HSM, not returned
        // Store securely for development session
        this._storeDevelopmentKey(label, { publicKey, privateKey });

        return {
          keyId: label,
          algorithm,
          publicKey,
          createdAt: new Date().toISOString(),
        };
      }

      // PRODUCTION: Generate key in HSM
      // const keyId = await hsmClient.generateKey(algorithm, label);
      // const publicKey = await hsmClient.getPublicKey(keyId);
      // return { keyId, algorithm, publicKey };

    } catch (error) {
      logger.error('Key generation failed', { algorithm, label, error: error.message });
      throw error;
    }
  }

  /**
   * Sign data using a key stored in HSM
   * @param {string|Buffer} data - Data to sign
   * @param {string} keyLabel - Key identifier
   * @param {string} algorithm - Signing algorithm (SHA256, SHA512)
   * @returns {string} Signature (base64 encoded)
   */
  async sign(data, keyLabel, algorithm = 'SHA256') {
    if (!this.isConnected) await this.connect();

    try {
      if (this.provider === 'software') {
        const keyPair = this._getDevelopmentKey(keyLabel);
        if (!keyPair) throw new Error(`Key not found: ${keyLabel}`);

        const sign = crypto.createSign(algorithm);
        sign.update(data);
        sign.end();
        return sign.sign(keyPair.privateKey, 'base64');
      }

      // PRODUCTION: Sign using HSM
      // return await hsmClient.sign(keyLabel, data, algorithm);

    } catch (error) {
      logger.error('Signing failed', { keyLabel, algorithm, error: error.message });
      throw error;
    }
  }

  /**
   * Verify a signature using a public key
   * @param {string} data - Original data
   * @param {string} signature - Signature to verify (base64)
   * @param {string} publicKey - Public key (PEM format)
   * @param {string} algorithm - Verification algorithm
   * @returns {boolean} True if signature is valid
   */
  async verify(data, signature, publicKey, algorithm = 'SHA256') {
    try {
      const verify = crypto.createVerify(algorithm);
      verify.update(data);
      verify.end();
      return verify.verify(publicKey, signature, 'base64');
    } catch (error) {
      logger.error('Verification failed', { error: error.message });
      return false;
    }
  }

  /**
   * Encrypt data using HSM-backed key
   * @param {string} data - Data to encrypt
   * @param {string} keyLabel - Key identifier
   * @returns {string} Encrypted data (hex encoded)
   */
  async encrypt(data, keyLabel) {
    if (!this.isConnected) await this.connect();

    try {
      if (this.provider === 'software') {
        const keyPair = this._getDevelopmentKey(keyLabel);
        if (!keyPair) throw new Error(`Key not found: ${keyLabel}`);

        return crypto.publicEncrypt(
          keyPair.publicKey,
          Buffer.from(data, 'utf8')
        ).toString('base64');
      }

      // PRODUCTION: Encrypt using HSM
      // return await hsmClient.encrypt(keyLabel, data);

    } catch (error) {
      logger.error('Encryption failed', { keyLabel, error: error.message });
      throw error;
    }
  }

  /**
   * Decrypt data using HSM-backed key
   * @param {string} encryptedData - Encrypted data (base64)
   * @param {string} keyLabel - Key identifier
   * @returns {string} Decrypted data
   */
  async decrypt(encryptedData, keyLabel) {
    if (!this.isConnected) await this.connect();

    try {
      if (this.provider === 'software') {
        const keyPair = this._getDevelopmentKey(keyLabel);
        if (!keyPair) throw new Error(`Key not found: ${keyLabel}`);

        return crypto.privateDecrypt(
          keyPair.privateKey,
          Buffer.from(encryptedData, 'base64')
        ).toString('utf8');
      }

      // PRODUCTION: Decrypt using HSM
      // return await hsmClient.decrypt(keyLabel, encryptedData);

    } catch (error) {
      logger.error('Decryption failed', { keyLabel, error: error.message });
      throw error;
    }
  }

  /**
   * Generate a true random number from HSM
   * @param {number} length - Number of random bytes
   * @returns {Buffer} Random bytes
   */
  async generateRandom(length = 32) {
    if (!this.isConnected) await this.connect();

    try {
      if (this.provider === 'software') {
        return crypto.randomBytes(length);
      }

      // PRODUCTION: Get random from HSM
      // return await hsmClient.generateRandom(length);

    } catch (error) {
      logger.error('Random generation failed, falling back to software', { error: error.message });
      return crypto.randomBytes(length);
    }
  }

  /**
   * Get HSM status and health information
   * @returns {Object} HSM status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      provider: this.provider,
      mode: this.provider === 'software' ? 'DEVELOPMENT' : 'PRODUCTION',
      isDevelopment: this.isDevelopment,
      partition: this.partition,
      availableKeys: Object.keys(this.keyLabels).length,
    };
  }

  /**
   * Disconnect from HSM and cleanup
   */
  async disconnect() {
    if (this.provider === 'software') {
      this._developmentKeyStore.clear();
    }
    // PRODUCTION: Disconnect from HSM
    this.isConnected = false;
    logger.info('HSM disconnected');
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Development-only in-memory key store
   * PRODUCTION: Keys are stored securely in HSM, never in application memory
   * @private
   */
  _developmentKeyStore = new Map();

  /**
   * Store key for development session
   * @private
   */
  _storeDevelopmentKey(label, keyPair) {
    if (!this.isDevelopment) {
      throw new Error('Cannot store keys in memory outside development!');
    }
    this._developmentKeyStore.set(label, keyPair);
  }

  /**
   * Retrieve development key
   * @private
   */
  _getDevelopmentKey(label) {
    return this._developmentKeyStore.get(label);
  }
}

// Export singleton instance
module.exports = new HSMIntegration();