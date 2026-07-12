const logger = require('../logging/logger');

/**
 * Response Time and Throughput Tracking
 * 
 * Tracks application performance metrics:
 * - Request/response times
 * - Throughput (requests per second)
 * - Error rates
 * - Database query times
 * - External API call times
 * 
 * @example
 *   const perf = require('@siamsiam/shared-utils').monitoring.performanceTracker;
 *   
 *   const tracker = perf.start('db_query');
 *   // ... perform operation ...
 *   tracker.end({ query: 'SELECT * FROM users' });
 */

class PerformanceTracker {
  constructor() {
    this.metrics = new Map();
    this.activeTrackers = new Map();
  }

  /**
   * Start tracking an operation
   * @param {string} operation - Operation name
   * @returns {Object} Tracker object with .end() method
   */
  start(operation) {
    const trackerId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const tracker = {
      id: trackerId,
      operation,
      startTime: Date.now(),
      startMemory: process.memoryUsage().heapUsed,
    };

    this.activeTrackers.set(trackerId, tracker);

    return {
      end: (metadata = {}) => this._endTracking(trackerId, metadata),
      getDuration: () => Date.now() - tracker.startTime,
    };
  }

  /**
   * Record a completed operation directly
   * @param {string} operation - Operation name
   * @param {number} durationMs - Duration in milliseconds
   * @param {Object} metadata - Additional metadata
   */
  record(operation, durationMs, metadata = {}) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, {
        count: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        durations: [],
        errors: 0,
      });
    }

    const metric = this.metrics.get(operation);
    metric.count++;
    metric.totalDuration += durationMs;
    metric.minDuration = Math.min(metric.minDuration, durationMs);
    metric.maxDuration = Math.max(metric.maxDuration, durationMs);
    metric.durations.push(durationMs);

    // Keep last 1000 durations
    if (metric.durations.length > 1000) {
      metric.durations = metric.durations.slice(-1000);
    }

    // Log slow operations
    if (durationMs > 1000) {
      logger.warn(`Slow operation: ${operation}`, {
        duration: `${durationMs}ms`,
        ...metadata,
      });
    }
  }

  /**
   * Get performance statistics for an operation
   * @param {string} operation - Operation name
   * @returns {Object} Performance statistics
   */
  getStats(operation) {
    const metric = this.metrics.get(operation);
    if (!metric) return null;

    const avgDuration = metric.count > 0 
      ? Math.round(metric.totalDuration / metric.count) 
      : 0;

    // Calculate percentiles
    const sortedDurations = [...metric.durations].sort((a, b) => a - b);
    const p50 = this._percentile(sortedDurations, 50);
    const p90 = this._percentile(sortedDurations, 90);
    const p95 = this._percentile(sortedDurations, 95);
    const p99 = this._percentile(sortedDurations, 99);

    return {
      operation,
      count: metric.count,
      avgDuration: `${avgDuration}ms`,
      minDuration: `${metric.minDuration}ms`,
      maxDuration: `${metric.maxDuration}ms`,
      totalDuration: `${metric.totalDuration}ms`,
      percentiles: {
        p50: `${p50}ms`,
        p90: `${p90}ms`,
        p95: `${p95}ms`,
        p99: `${p99}ms`,
      },
      errors: metric.errors,
      errorRate: metric.count > 0 
        ? `${((metric.errors / metric.count) * 100).toFixed(2)}%` 
        : '0%',
    };
  }

  /**
   * Get all performance statistics
   * @returns {Object} All performance statistics
   */
  getAllStats() {
    const stats = {};
    
    for (const [operation] of this.metrics) {
      stats[operation] = this.getStats(operation);
    }
    
    return stats;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * End tracking and record metrics
   * @private
   */
  _endTracking(trackerId, metadata = {}) {
    const tracker = this.activeTrackers.get(trackerId);
    if (!tracker) return;

    const duration = Date.now() - tracker.startTime;
    const memoryDelta = process.memoryUsage().heapUsed - tracker.startMemory;

    this.record(tracker.operation, duration, {
      ...metadata,
      memoryDelta: Math.round(memoryDelta / 1024), // KB
    });

    this.activeTrackers.delete(trackerId);

    return {
      operation: tracker.operation,
      duration,
      memoryDeltaKB: Math.round(memoryDelta / 1024),
    };
  }

  /**
   * Calculate percentile from sorted array
   * @private
   */
  _percentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return Math.round(sortedArray[index] || 0);
  }
}

// Export singleton instance
module.exports = new PerformanceTracker();