const { createClient } = require('redis');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * Redis Client - Connection and Operations
 * 
 * Centralized Redis client with:
 * - Automatic reconnection
 * - Cluster mode support
 * - Pipeline operations
 * - Pub/sub messaging
 * - Key prefixing for multi-tenancy
 * - Connection health monitoring
 * 
 * @example
 *   const redis = require('@siamsiam/shared-utils').cache.redisClient;
 *   await redis.connect();
 *   await redis.set('user:123', userData, 3600);
 *   const user = await redis.get('user:123');
 */

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.prefix = 'siamsiam:'; // Key prefix for namespacing
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 20;
  }

  /**
   * Connect to Redis
   */
  async connect() {
    if (this.isConnected) return;

    try {
      const options = {
        socket: {
          host: config.redis.host,
          port: config.redis.port,
          reconnectStrategy: (retries) => {
            if (retries > this.maxReconnectAttempts) {
              logger.error('Max Redis reconnection attempts reached');
              return new Error('Max reconnection attempts reached');
            }
            const delay = Math.min(retries * 100, 3000);
            return delay;
          },
        },
        password: config.redis.password || undefined,
        database: config.redis.db || 0,
      };

      this.client = createClient(options);

      this.client.on('connect', () => {
        logger.info('Redis connecting...');
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        logger.info('✅ Redis connected and ready');
      });

      this.client.on('error', (err) => {
        logger.error('Redis error', { error: err.message });
      });

      this.client.on('end', () => {
        this.isConnected = false;
        logger.warn('Redis connection ended');
      });

      await this.client.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis', { error: error.message });
      throw error;
    }
  }

  /**
   * Get cached value
   */
  async get(key) {
    try {
      const value = await this.client.get(this._key(key));
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis GET failed', { key, error: error.message });
      return null;
    }
  }

  /**
   * Set cached value
   */
  async set(key, value, ttl = 3600) {
    try {
      const serialized = JSON.stringify(value);
      await this.client.set(this._key(key), serialized, { EX: ttl });
      return true;
    } catch (error) {
      logger.error('Redis SET failed', { key, error: error.message });
      return false;
    }
  }

  /**
   * Set value only if key doesn't exist (distributed lock)
   */
  async setNX(key, value, ttl) {
    try {
      const result = await this.client.set(this._key(key), JSON.stringify(value), {
        NX: true,
        EX: ttl,
      });
      return result === 'OK';
    } catch (error) {
      logger.error('Redis SETNX failed', { key, error: error.message });
      return false;
    }
  }

  /**
   * Delete cached value
   */
  async del(key) {
    try {
      await this.client.del(this._key(key));
      return true;
    } catch (error) {
      logger.error('Redis DEL failed', { key, error: error.message });
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    try {
      return await this.client.exists(this._key(key));
    } catch (error) {
      return false;
    }
  }

  /**
   * Increment a counter
   */
  async increment(key, ttl = 900) {
    try {
      const fullKey = this._key(key);
      const value = await this.client.incr(fullKey);
      if (value === 1 && ttl) {
        await this.client.expire(fullKey, ttl);
      }
      return value;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get TTL of key
   */
  async ttl(key) {
    try {
      return await this.client.ttl(this._key(key));
    } catch (error) {
      return -2;
    }
  }

  /**
   * Set key expiration
   */
  async expire(key, seconds) {
    try {
      return await this.client.expire(this._key(key), seconds);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get multiple keys
   */
  async mget(keys) {
    try {
      const fullKeys = keys.map(k => this._key(k));
      const values = await this.client.mGet(fullKeys);
      return values.map(v => v ? JSON.parse(v) : null);
    } catch (error) {
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys
   */
  async mset(keyValuePairs, ttl = 3600) {
    try {
      const multi = this.client.multi();
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        multi.set(this._key(key), JSON.stringify(value), { EX: ttl });
      }
      
      await multi.exec();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find keys matching pattern
   */
  async keys(pattern) {
    try {
      return await this.client.keys(this._key(pattern));
    } catch (error) {
      return [];
    }
  }

  /**
   * Delete keys matching pattern
   */
  async deletePattern(pattern) {
    try {
      const keys = await this.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return keys.length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Publish message to channel
   */
  async publish(channel, message) {
    try {
      return await this.client.publish(this._key(channel), JSON.stringify(message));
    } catch (error) {
      return 0;
    }
  }

  /**
   * Subscribe to channel
   */
  async subscribe(channel, handler) {
    try {
      const subscriber = this.client.duplicate();
      await subscriber.connect();
      await subscriber.subscribe(this._key(channel), (message) => {
        handler(JSON.parse(message));
      });
      return subscriber;
    } catch (error) {
      logger.error('Redis subscribe failed', { channel, error: error.message });
      return null;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get client instance for direct operations
   */
  getClient() {
    return this.client;
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.client) {
      logger.info('Shutting down Redis connection...');
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis connection closed');
    }
  }

  // ==================== PRIVATE ====================

  _key(key) {
    return `${this.prefix}${key}`;
  }
}

// Export singleton instance
module.exports = new RedisClient();