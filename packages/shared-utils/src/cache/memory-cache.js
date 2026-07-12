/**
 * In-Memory LRU Cache
 * 
 * Fast in-process cache for hot data with:
 * - LRU (Least Recently Used) eviction
 * - TTL (Time-To-Live) expiration
 * - Maximum size limits
 * - Statistics tracking
 * 
 * USE CASES:
 * - Frequently accessed configuration
 * - Session data (with Redis as backup)
 * - Rate limiting counters
 * - Hot database query results
 * 
 * @example
 *   const cache = require('@siamsiam/shared-utils').cache.memoryCache;
 *   cache.set('config:features', featureFlags, 60000);
 *   const flags = cache.get('config:features');
 */

class MemoryCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 10000;
    this.defaultTTL = options.defaultTTL || 60000; // 1 minute
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
    };
    this.cleanupInterval = null;
    this._startCleanup();
  }

  /**
   * Get value from cache
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      return undefined;
    }

    // Update access time for LRU
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    
    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key, value, ttl = this.defaultTTL) {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this._evictLRU();
    }

    this.cache.set(key, {
      value,
      createdAt: Date.now(),
      expiresAt: ttl > 0 ? Date.now() + ttl : null,
      lastAccessed: Date.now(),
    });

    this.stats.sets++;
  }

  /**
   * Delete value from cache
   */
  del(key) {
    return this.cache.delete(key);
  }

  /**
   * Check if key exists and is not expired
   */
  has(key) {
    return this.get(key) !== undefined;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%',
    };
  }

  /**
   * Get or set (atomic)
   */
  getOrSet(key, fetchFn, ttl = this.defaultTTL) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const value = fetchFn();
    this.set(key, value, ttl);
    return value;
  }

  // ==================== PRIVATE ====================

  /**
   * Evict least recently used entry
   * @private
   */
  _evictLRU() {
    let oldest = null;
    let oldestKey = null;

    for (const [key, entry] of this.cache) {
      if (!oldest || entry.lastAccessed < oldest.lastAccessed) {
        oldest = entry;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Start periodic cleanup of expired entries
   * @private
   */
  _startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, entry] of this.cache) {
        if (entry.expiresAt && now > entry.expiresAt) {
          this.cache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.stats.evictions += cleaned;
      }
    }, 30000); // Every 30 seconds

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }
}

// Export singleton instance
module.exports = new MemoryCache();