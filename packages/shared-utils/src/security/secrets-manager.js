const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * Secrets Manager Interface
 * 
 * Provides a unified interface for retrieving secrets from various sources:
 * - Environment variables (development)
 * - HashiCorp Vault (production)
 * - AWS Secrets Manager (AWS deployment)
 * - GCP Secret Manager (GCP deployment)
 * - Azure Key Vault (Azure deployment)
 * 
 * SECRETS NEVER:
 * - Logged or printed
 * - Committed to version control
 * - Stored in plain text files
 * - Shared between environments
 * 
 * PRODUCTION TODO:
 * - Integrate with HashiCorp Vault
 * - Implement secret rotation
 * - Add secret access auditing
 * - Set up automatic secret expiry
 * 
 * @example
 *   const secrets = require('@siamsiam/shared-utils').security.secretsManager;
 *   const dbPassword = await secrets.get('database.password');
 *   const apiKey = await secrets.get('stripe.api_key');
 */

class SecretsManager {
  constructor() {
    this.backend = this._determineBackend();
    this.cache = new Map();
    this.cacheTTL = 300000; // 5 minutes
  }

  /**
   * Get a secret by path
   * @param {string} path - Dot-notation path to secret (e.g., 'database.password')
   * @param {Object} options - Retrieval options
   * @returns {Promise<string>} Secret value
   */
  async get(path, options = {}) {
    const { bypassCache = false } = options;

    // Check cache first
    if (!bypassCache && this.cache.has(path)) {
      const cached = this.cache.get(path);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.value;
      }
      this.cache.delete(path);
    }

    try {
      let value;

      switch (this.backend) {
        case 'vault':
          value = await this._getFromVault(path);
          break;
        case 'aws':
          value = await this._getFromAWS(path);
          break;
        case 'env':
        default:
          value = this._getFromEnv(path);
          break;
      }

      // Cache the value
      if (value !== null && value !== undefined) {
        this.cache.set(path, {
          value,
          timestamp: Date.now(),
        });
      }

      return value;
    } catch (error) {
      logger.error(`Failed to retrieve secret: ${this._maskPath(path)}`, {
        error: error.message,
        backend: this.backend,
      });

      // Fallback to environment variable
      if (this.backend !== 'env') {
        logger.warn(`Falling back to environment variable for: ${this._maskPath(path)}`);
        return this._getFromEnv(path);
      }

      throw error;
    }
  }

  /**
   * Get multiple secrets at once
   * @param {string[]} paths - Array of secret paths
   * @returns {Promise<Object>} Map of path -> value
   */
  async getMany(paths) {
    const results = {};

    await Promise.all(
      paths.map(async (path) => {
        try {
          results[path] = await this.get(path);
        } catch (error) {
          logger.error(`Failed to get secret: ${this._maskPath(path)}`, {
            error: error.message,
          });
          results[path] = null;
        }
      })
    );

    return results;
  }

  /**
   * Set a secret (if supported by backend)
   * @param {string} path - Secret path
   * @param {string} value - Secret value
   */
  async set(path, value) {
    try {
      switch (this.backend) {
        case 'vault':
          await this._setInVault(path, value);
          break;
        case 'aws':
          await this._setInAWS(path, value);
          break;
        default:
          throw new Error(`Setting secrets not supported for backend: ${this.backend}`);
      }

      // Update cache
      this.cache.set(path, {
        value,
        timestamp: Date.now(),
      });

      logger.info(`Secret updated: ${this._maskPath(path)}`);
    } catch (error) {
      logger.error(`Failed to set secret: ${this._maskPath(path)}`, {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Rotate a secret
   * @param {string} path - Secret path
   * @param {Function} generator - Function that generates new secret value
   */
  async rotate(path, generator) {
    const oldValue = await this.get(path, { bypassCache: true });
    const newValue = await generator();

    // Set new value
    await this.set(path, newValue);

    // Invalidate cache
    this.cache.delete(path);

    logger.info(`Secret rotated: ${this._maskPath(path)}`);

    return {
      path,
      rotated: true,
      oldValueLength: oldValue?.length || 0,
      newValueLength: newValue?.length || 0,
    };
  }

  /**
   * Clear secrets cache
   */
  clearCache() {
    this.cache.clear();
    logger.debug('Secrets cache cleared');
  }

  /**
   * Get backend type
   */
  getBackend() {
    return this.backend;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Determine which backend to use
   * @private
   */
  _determineBackend() {
    if (process.env.VAULT_ADDR) return 'vault';
    if (process.env.AWS_SECRETS_MANAGER_ENABLED === 'true') return 'aws';
    if (process.env.GCP_SECRET_MANAGER_ENABLED === 'true') return 'gcp';
    return 'env';
  }

  /**
   * Get secret from environment variable
   * @private
   */
  _getFromEnv(path) {
    // Convert path to environment variable name
    // 'database.password' -> 'DB_PASSWORD'
    const envName = path
      .replace(/\./g, '_')
      .replace(/([A-Z])/g, '_$1')
      .toUpperCase();
    
    const value = process.env[envName];
    
    if (!value && config.isProduction) {
      logger.warn(`Environment variable not set: ${envName}`);
    }

    return value || null;
  }

  /**
   * Get secret from HashiCorp Vault
   * @private
   */
  async _getFromVault(path) {
    // PRODUCTION TODO: Implement Vault integration
    // const vault = require('node-vault')({
    //   endpoint: process.env.VAULT_ADDR,
    //   token: process.env.VAULT_TOKEN,
    // });
    // const { data } = await vault.read(`secret/data/${path}`);
    // return data.data.value;
    
    logger.warn('Vault integration not implemented - falling back to env');
    return this._getFromEnv(path);
  }

  /**
   * Get secret from AWS Secrets Manager
   * @private
   */
  async _getFromAWS(path) {
    // PRODUCTION TODO: Implement AWS Secrets Manager
    // const AWS = require('aws-sdk');
    // const client = new AWS.SecretsManager();
    // const { SecretString } = await client.getSecretValue({ SecretId: path }).promise();
    // return SecretString;
    
    logger.warn('AWS Secrets Manager not implemented - falling back to env');
    return this._getFromEnv(path);
  }

  /**
   * Mask secret path for logging
   * @private
   */
  _maskPath(path) {
    if (!path) return 'unknown';
    const parts = path.split('.');
    if (parts.length > 1) {
      return `${parts[0]}.****`;
    }
    return '****';
  }
}

// Export singleton instance
module.exports = new SecretsManager();