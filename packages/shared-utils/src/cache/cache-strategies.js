const redisClient = require('./redis-client');
const memoryCache = require('./memory-cache');
const logger = require('../logging/logger');

/**
 * Cache Strategy Implementations
 * 
 * Multiple caching patterns for different use cases:
 * - Cache-Aside: Application manages cache explicitly
 * - Write-Through: Cache updated synchronously with database
 * - Write-Behind: Cache updated, database updated asynchronously
 * - Read-Through: Cache automatically loads from database on miss
 * 
 * @example
 *   const strategies = require('@siamsiam/shared-utils').cache.cacheStrategies;
 *   
 *   const user = await strategies.cacheAside(
 *     'user:123',
 *     () => db.findUser('123'),
 *     { ttl: 3600, useRedis: true }
 *   );
 */

class CacheStrategies {
  /**
   * Cache-Aside Pattern
   * Application checks cache first, loads from DB on miss
   */
  async cacheAside(key, fetchFn, options = {}) {
    const {
      ttl = 3600,
      useRedis = true,
      useMemory = true,
      memoryTTL = 60000,
    } = options;

    // Try memory cache first (fastest)
    if (useMemory) {
      const cached = memoryCache.get(key);
      if (cached !== undefined) {
        logger.debug('Memory cache hit', { key });
        return cached;
      }
    }

    // Try Redis cache
    if (useRedis && redisClient.isConnected) {
      try {
        const cached = await redisClient.get(key);
        if (cached !== null) {
          logger.debug('Redis cache hit', { key });
          // Populate memory cache
          if (useMemory) {
            memoryCache.set(key, cached, memoryTTL);
          }
          return cached;
        }
      } catch (error) {
        logger.warn('Redis cache miss/fail', { key, error: error.message });
      }
    }

    // Cache miss - fetch from source
    logger.debug('Cache miss, fetching from source', { key });
    const data = await fetchFn();

    if (data !== null && data !== undefined) {
      // Populate caches
      if (useRedis) {
        await redisClient.set(key, data, ttl).catch(() => {});
      }
      if (useMemory) {
        memoryCache.set(key, data, memoryTTL);
      }
    }

    return data;
  }

  /**
   * Write-Through Pattern
   * Update cache synchronously when data is written
   */
  async writeThrough(key, data, writeFn, options = {}) {
    const { ttl = 3600, useRedis = true } = options;

    // Write to database first
    const result = await writeFn(data);

    // Update cache
    if (useRedis) {
      await redisClient.set(key, result || data, ttl).catch(() => {});
    }
    memoryCache.set(key, result || data);

    return result;
  }

  /**
   * Cache invalidation on write
   */
  async invalidateOnWrite(key, writeFn) {
    // Invalidate cache
    memoryCache.del(key);
    await redisClient.del(key).catch(() => {});

    // Execute write
    return await writeFn();
  }

  /**
   * Multi-level get (memory -> Redis -> source)
   */
  async multiLevelGet(key, fetchFn, options = {}) {
    return this.cacheAside(key, fetchFn, {
      useRedis: true,
      useMemory: true,
      ...options,
    });
  }

  /**
   * Batch cache aside
   */
  async batchCacheAside(keys, fetchFn, options = {}) {
    const { ttl = 3600, useRedis = true } = options;
    const results = {};
    const missingKeys = [];

    // Check cache for all keys
    if (useRedis && redisClient.isConnected) {
      const cached = await redisClient.mget(keys);
      keys.forEach((key, index) => {
        if (cached[index] !== null) {
          results[key] = cached[index];
        } else {
          missingKeys.push(key);
        }
      });
    } else {
      missingKeys.push(...keys);
    }

    // Fetch missing keys
    if (missingKeys.length > 0) {
      const fetched = await fetchFn(missingKeys);
      
      // Populate cache
      if (useRedis && fetched) {
        const toCache = {};
        for (const key of missingKeys) {
          if (fetched[key] !== undefined) {
            results[key] = fetched[key];
            toCache[key] = fetched[key];
          }
        }
        await redisClient.mset(toCache, ttl).catch(() => {});
      }
    }

    return results;
  }
}

module.exports = new CacheStrategies();