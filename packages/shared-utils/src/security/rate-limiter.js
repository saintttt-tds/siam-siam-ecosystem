const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * Token Bucket Rate Limiting Algorithm
 * 
 * Implements rate limiting using the token bucket algorithm with
 * Redis for distributed rate limiting across multiple instances.
 * 
 * ALGORITHM:
 * - Each client gets a "bucket" that fills with tokens at a constant rate
 * - Each request consumes one token
 * - When bucket is empty, requests are rejected
 * - Tokens refill over time (smoother than fixed window)
 * 
 * STRATEGIES:
 * - Per IP: Rate limit by client IP address
 * - Per User: Rate limit by authenticated user ID
 * - Per API Key: Rate limit by API key
 * - Per Endpoint: Different limits for different endpoints
 * - Global: Overall system rate limit
 * 
 * PRODUCTION CONSIDERATIONS:
 * - Use Redis for distributed rate limiting
 * - Implement sliding window for more accurate limiting
 * - Return proper HTTP 429 with Retry-After header
 * - Monitor rate limit hits for potential abuse
 * 
 * @example
 *   const limiter = rateLimiter.createMiddleware({
 *     windowMs: 60000,
 *     max: 100,
 *     keyGenerator: (req) => req.ip,
 *   });
 *   app.use(limiter);
 */

class RateLimiter {
  constructor() {
    this.store = new Map(); // In-memory store (use Redis in production)
    this.cleanupInterval = null;
  }

  /**
   * Create Express middleware for rate limiting
   * @param {Object} options - Rate limit options
   */
  createMiddleware(options = {}) {
    const {
      windowMs = 60000, // 1 minute window
      max = 100, // Max requests per window
      keyGenerator = (req) => req.ip, // Default: by IP
      skipFailedRequests = false,
      skipSuccessfulRequests = false,
      handler = null,
      headers = true,
    } = options;

    return async (req, res, next) => {
      try {
        const key = `rate_limit:${keyGenerator(req)}`;
        const result = await this._checkLimit(key, windowMs, max);

        // Set rate limit headers
        if (headers) {
          res.setHeader('X-RateLimit-Limit', max);
          res.setHeader('X-RateLimit-Remaining', Math.max(0, max - result.count));
          res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));
        }

        if (result.exceeded) {
          // Store original response methods
          const originalEnd = res.end;
          const originalJson = res.json;
          
          // Intercept response to check if we should count this request
          if (skipFailedRequests || skipSuccessfulRequests) {
            res.end = function (...args) {
              if (
                (skipFailedRequests && res.statusCode >= 400) ||
                (skipSuccessfulRequests && res.statusCode < 400)
              ) {
                // Don't count this request, increment remaining
                res.setHeader('X-RateLimit-Remaining', Math.max(0, max - result.count + 1));
              }
              return originalEnd.apply(res, args);
            };
          }

          // Rate limit exceeded
          logger.warn('Rate limit exceeded', {
            key: this._maskKey(key),
            count: result.count,
            limit: max,
            ip: req.ip,
          });

          if (handler) {
            return handler(req, res, next);
          }

          res.status(429).json({
            success: false,
            error: 'Too many requests, please try again later.',
            retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
            limit: max,
            remaining: 0,
          });
        } else {
          next();
        }
      } catch (error) {
        logger.error('Rate limiter error', { error: error.message });
        next(); // Fail open - don't block requests if rate limiter fails
      }
    };
  }

  /**
   * Check if request is within rate limit
   * @private
   */
  async _checkLimit(key, windowMs, max) {
    // PRODUCTION TODO: Use Redis instead of in-memory store
    // const redis = require('../cache/redis-client');
    
    const now = Date.now();
    let bucket = this.store.get(key);

    if (!bucket || now > bucket.resetTime) {
      // Create new bucket
      bucket = {
        tokens: max,
        count: 0,
        resetTime: now + windowMs,
        lastRefill: now,
      };
      this.store.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    if (now > bucket.lastRefill) {
      const elapsed = now - bucket.lastRefill;
      const refillRate = max / windowMs; // Tokens per millisecond
      const refillTokens = Math.floor(elapsed * refillRate);
      
      bucket.tokens = Math.min(max, bucket.tokens + refillTokens);
      bucket.lastRefill = now;
    }

    // Check if tokens available
    if (bucket.tokens > 0) {
      bucket.tokens--;
      bucket.count++;
      return { exceeded: false, count: bucket.count, resetTime: bucket.resetTime };
    }

    bucket.count++;
    return { exceeded: true, count: bucket.count, resetTime: bucket.resetTime };
  }

  /**
   * Create a rate-limited function wrapper
   * @param {Function} fn - Function to rate limit
   * @param {Object} options - Rate limit options
   */
  createFunctionLimiter(fn, options = {}) {
    const {
      maxCalls = 10,
      perInterval = 1000,
    } = options;

    const queue = [];
    let callsInWindow = 0;
    let windowStart = Date.now();

    return async (...args) => {
      const now = Date.now();
      
      // Reset window if interval passed
      if (now - windowStart > perInterval) {
        windowStart = now;
        callsInWindow = 0;
      }

      // If limit exceeded, queue the call
      if (callsInWindow >= maxCalls) {
        return new Promise((resolve, reject) => {
          const delay = perInterval - (now - windowStart);
          queue.push({ args, resolve, reject, delay });
          
          setTimeout(() => {
            const item = queue.shift();
            if (item) {
              this._executeFunction(fn, item);
            }
          }, delay);
        });
      }

      // Execute immediately
      callsInWindow++;
      try {
        return await fn(...args);
      } catch (error) {
        throw error;
      }
    };
  }

  /**
   * Get current rate limit status for a key
   */
  getStatus(key) {
    const bucket = this.store.get(`rate_limit:${key}`);
    
    if (!bucket) {
      return { count: 0, remaining: 'unlimited', resetTime: null };
    }

    return {
      count: bucket.count,
      remaining: bucket.tokens,
      resetTime: bucket.resetTime,
      resetIn: Math.max(0, bucket.resetTime - Date.now()),
    };
  }

  /**
   * Reset rate limit for a key
   */
  reset(key) {
    this.store.delete(`rate_limit:${key}`);
  }

  /**
   * Reset all rate limits
   */
  resetAll() {
    this.store.clear();
  }

  /**
   * Start periodic cleanup of expired entries
   */
  startCleanup(intervalMs = 60000) {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, bucket] of this.store) {
        if (now > bucket.resetTime) {
          this.store.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug(`Rate limiter cleanup: removed ${cleaned} expired entries`);
      }
    }, intervalMs);

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Stop cleanup
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get rate limiter statistics
   */
  getStats() {
    const now = Date.now();
    let totalEntries = 0;
    let blockedKeys = 0;

    for (const [, bucket] of this.store) {
      totalEntries++;
      if (bucket.tokens <= 0 && now < bucket.resetTime) {
        blockedKeys++;
      }
    }

    return {
      totalEntries,
      blockedKeys,
      storeSize: this.store.size,
    };
  }

  /**
   * Mask key for logging (hide IPs/IDs)
   * @private
   */
  _maskKey(key) {
    if (!key) return 'unknown';
    const parts = key.split(':');
    if (parts.length > 2) {
      const sensitive = parts.slice(2).join(':');
      if (sensitive.length > 8) {
        return `${parts[0]}:${parts[1]}:${sensitive.substring(0, 4)}...${sensitive.slice(-4)}`;
      }
    }
    return key.substring(0, 20) + '...';
  }

  /**
   * Execute queued function
   * @private
   */
  async _executeFunction(fn, item) {
    try {
      const result = await fn(...item.args);
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    }
  }
}

// Export singleton
const rateLimiter = new RateLimiter();

// Start cleanup in production
if (config.isProduction) {
  rateLimiter.startCleanup();
}

module.exports = rateLimiter;