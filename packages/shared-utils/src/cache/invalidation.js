const redisClient = require('./redis-client');
const memoryCache = require('./memory-cache');
const logger = require('../logging/logger');

/**
 * Cache Invalidation Strategies
 * 
 * Implements various cache invalidation patterns to ensure
 * data consistency across the distributed cache layer.
 * 
 * STRATEGIES:
 * - Key-based: Invalidate specific keys
 * - Pattern-based: Invalidate keys matching pattern
 * - Tag-based: Invalidate all keys with a tag
 * - TTL-based: Natural expiration
 * - Event-based: Invalidate on specific events
 * 
 * @example
 *   const invalidation = require('@siamsiam/shared-utils').cache.invalidation;
 *   
 *   // Invalidate user cache
 *   await invalidation.invalidateUser(userId);
 *   
 *   // Invalidate all product caches
 *   await invalidation.invalidateByPattern('product:*');
 *   
 *   // Invalidate by tag
 *   await invalidation.invalidateByTag('inventory');
 */

class CacheInvalidation {
  constructor() {
    this.tagIndex = new Map(); // tag -> Set<keys>
  }

  /**
   * Invalidate a specific key in all cache layers
   */
  async invalidateKey(key) {
    memoryCache.del(key);
    if (redisClient.isConnected) {
      await redisClient.del(key).catch(() => {});
    }
    logger.debug('Cache key invalidated', { key });
  }

  /**
   * Invalidate multiple keys
   */
  async invalidateKeys(keys) {
    for (const key of keys) {
      memoryCache.del(key);
    }
    if (redisClient.isConnected) {
      await Promise.all(keys.map(k => redisClient.del(k).catch(() => {})));
    }
  }

  /**
   * Invalidate keys matching a pattern
   */
  async invalidateByPattern(pattern) {
    // Clear memory cache (simple pattern matching)
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of memoryCache.cache.keys()) {
      if (regex.test(key)) {
        memoryCache.del(key);
      }
    }

    // Clear Redis cache
    if (redisClient.isConnected) {
      const deleted = await redisClient.deletePattern(pattern);
      logger.debug('Cache pattern invalidated', { pattern, deleted });
    }
  }

  /**
   * Invalidate by tag
   */
  async invalidateByTag(tag) {
    const keys = this.tagIndex.get(tag);
    if (!keys || keys.size === 0) return;

    await this.invalidateKeys(Array.from(keys));
    this.tagIndex.delete(tag);
    
    logger.debug('Cache tag invalidated', { tag, keyCount: keys.size });
  }

  /**
   * Associate key with tag (for tag-based invalidation)
   */
  tagKey(key, tag) {
    if (!this.tagIndex.has(tag)) {
      this.tagIndex.set(tag, new Set());
    }
    this.tagIndex.get(tag).add(key);
  }

  /**
   * Invalidate user-related caches
   */
  async invalidateUser(userId) {
    await this.invalidateByPattern(`user:${userId}:*`);
    await this.invalidateKey(`user:${userId}`);
  }

  /**
   * Invalidate product-related caches
   */
  async invalidateProduct(productId) {
    await this.invalidateByPattern(`product:${productId}:*`);
    await this.invalidateKey(`product:${productId}`);
    await this.invalidateByTag('products');
  }

  /**
   * Invalidate order-related caches
   */
  async invalidateOrder(orderId) {
    await this.invalidateByPattern(`order:${orderId}:*`);
    await this.invalidateKey(`order:${orderId}`);
  }

  /**
   * Invalidate all session caches
   */
  async invalidateSessions() {
    await this.invalidateByPattern('session:*');
  }

  /**
   * Invalidate all configuration caches
   */
  async invalidateConfig() {
    await this.invalidateByPattern('config:*');
  }

  /**
   * Full cache flush
   */
  async flushAll() {
    memoryCache.clear();
    if (redisClient.isConnected) {
      await redisClient.deletePattern('*');
    }
    this.tagIndex.clear();
    logger.info('Full cache flush completed');
  }
}

// Export singleton instance
module.exports = new CacheInvalidation();