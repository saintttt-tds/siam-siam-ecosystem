/**
 * Cache Module Index
 * 
 * Redis and in-memory caching infrastructure for
 * high-performance data access across services.
 */

module.exports = {
  redisClient: require('./redis-client'),
  memoryCache: require('./memory-cache'),
  cacheStrategies: require('./cache-strategies'),
  invalidation: require('./invalidation'),
};