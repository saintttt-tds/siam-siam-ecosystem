const os = require('os');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');
const redisClient = require('../cache/redis-client');

/**
 * Service Health Check
 * 
 * Provides health check endpoints for:
 * - Kubernetes liveness probes (is the app running?)
 * - Kubernetes readiness probes (is the app ready to serve?)
 * - Load balancer health checks
 * - Monitoring system integration
 * 
 * HEALTH STATES:
 * - healthy: All checks passing
 * - degraded: Some non-critical checks failing
 * - unhealthy: Critical checks failing
 * 
 * @example
 *   const health = require('@siamsiam/shared-utils').monitoring.healthCheck;
 *   
 *   // Express route
 *   app.get('/health', async (req, res) => {
 *     const status = await health.check();
 *     res.status(status.healthy ? 200 : 503).json(status);
 *   });
 *   
 *   // Kubernetes liveness
 *   app.get('/health/live', async (req, res) => {
 *     const status = await health.liveness();
 *     res.status(status.alive ? 200 : 500).json(status);
 *   });
 *   
 *   // Kubernetes readiness
 *   app.get('/health/ready', async (req, res) => {
 *     const status = await health.readiness();
 *     res.status(status.ready ? 200 : 503).json(status);
 *   });
 */

class HealthCheck {
  constructor() {
    // Registered health checks
    this.checks = new Map();
    
    // Startup timestamp
    this.startTime = Date.now();
    
    // Register default checks
    this._registerDefaultChecks();
  }

  /**
   * Run all health checks (full health status)
   * @returns {Promise<Object>} Complete health status
   */
  async check() {
    const results = {};
    let overallHealthy = true;
    let degraded = false;

    for (const [name, check] of this.checks) {
      const startTime = Date.now();
      
      try {
        const result = await check.handler();
        const duration = Date.now() - startTime;
        
        results[name] = {
          status: 'healthy',
          duration: `${duration}ms`,
          ...result,
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        
        if (check.critical) {
          overallHealthy = false;
          results[name] = {
            status: 'unhealthy',
            error: error.message,
            duration: `${duration}ms`,
          };
        } else {
          degraded = true;
          results[name] = {
            status: 'degraded',
            error: error.message,
            duration: `${duration}ms`,
          };
        }
      }
    }

    const status = overallHealthy ? (degraded ? 'degraded' : 'healthy') : 'unhealthy';

    return {
      status,
      healthy: overallHealthy,
      degraded,
      timestamp: new Date().toISOString(),
      service: process.env.SERVICE_NAME || 'unknown',
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      uptimeFormatted: this._formatUptime(Date.now() - this.startTime),
      pid: process.pid,
      hostname: os.hostname(),
      nodeVersion: process.version,
      memoryUsage: this._getMemoryUsage(),
      checks: results,
    };
  }

  /**
   * Liveness check (is the application alive?)
   * Used by Kubernetes liveness probe
   * @returns {Promise<Object>} Liveness status
   */
  async liveness() {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Readiness check (is the application ready to serve requests?)
   * Used by Kubernetes readiness probe
   * @returns {Promise<Object>} Readiness status
   */
  async readiness() {
    const results = {};
    let ready = true;

    // Only run critical checks for readiness
    for (const [name, check] of this.checks) {
      if (!check.critical) continue;
      
      try {
        await check.handler();
        results[name] = { status: 'ready' };
      } catch (error) {
        ready = false;
        results[name] = { status: 'not_ready', error: error.message };
      }
    }

    return {
      ready,
      timestamp: new Date().toISOString(),
      checks: results,
    };
  }

  /**
   * Register a health check
   * @param {string} name - Check name
   * @param {Function} handler - Async check function
   * @param {Object} options - Check options
   */
  registerCheck(name, handler, options = {}) {
    this.checks.set(name, {
      handler,
      critical: options.critical !== false,
      timeout: options.timeout || 5000,
    });
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Register default health checks
   * @private
   */
  _registerDefaultChecks() {
    // Memory usage check
    this.registerCheck('memory', async () => {
      const usage = process.memoryUsage();
      const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
      const usagePercent = Math.round((usage.heapUsed / usage.heapTotal) * 100);
      
      if (usagePercent > 95) {
        throw new Error(`Memory usage critical: ${usagePercent}% (${heapUsedMB}MB / ${heapTotalMB}MB)`);
      }
      
      return {
        heapUsedMB,
        heapTotalMB,
        usagePercent,
        rssMB: Math.round(usage.rss / 1024 / 1024),
      };
    }, { critical: true });

    // Event loop lag check
    this.registerCheck('event_loop', async () => {
      const lag = await this._measureEventLoopLag();
      
      if (lag > 500) {
        throw new Error(`Event loop lag too high: ${lag}ms`);
      }
      
      return { lagMs: lag };
    }, { critical: false });

    // Redis check (if configured)
    this.registerCheck('redis', async () => {
      if (!redisClient.isConnected) {
        return { status: 'not_configured', connected: false };
      }
      
      const healthy = await redisClient.healthCheck();
      if (!healthy) throw new Error('Redis health check failed');
      
      return { connected: true };
    }, { critical: true });
  }

  /**
   * Measure event loop lag
   * @private
   */
  _measureEventLoopLag() {
    return new Promise((resolve) => {
      const start = Date.now();
      setImmediate(() => {
        resolve(Date.now() - start);
      });
    });
  }

  /**
   * Get memory usage information
   * @private
   */
  _getMemoryUsage() {
    const usage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    
    return {
      heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
      rssMB: Math.round(usage.rss / 1024 / 1024),
      systemTotalMB: Math.round(totalMem / 1024 / 1024),
      systemFreeMB: Math.round(freeMem / 1024 / 1024),
      systemUsagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
    };
  }

  /**
   * Format uptime as human-readable string
   * @private
   */
  _formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}

// Export singleton instance
module.exports = new HealthCheck();