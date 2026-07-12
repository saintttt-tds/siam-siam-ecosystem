const logger = require('../logging/logger');

/**
 * Prometheus Metrics Collection
 * 
 * Collects and exposes application metrics in Prometheus format.
 * Supports counters, gauges, histograms, and summaries.
 * 
 * METRIC TYPES:
 * - Counter: Monotonically increasing value (total requests, errors)
 * - Gauge: Value that can go up and down (active connections, memory)
 * - Histogram: Distribution of values (response times, sizes)
 * - Summary: Similar to histogram with quantiles
 * 
 * LABEL BEST PRACTICES:
 * - Keep cardinality low (< 10 unique values per label)
 * - Don't use user IDs or request IDs as labels
 * - Use meaningful label names
 * 
 * @example
 *   const metrics = require('@siamsiam/shared-utils').monitoring.metricsCollector;
 *   
 *   metrics.incrementCounter('http_requests_total', { method: 'GET', status: '200' });
 *   metrics.setGauge('active_connections', 42);
 *   metrics.observeHistogram('http_request_duration_ms', 150);
 */

class MetricsCollector {
  constructor() {
    // Counter metrics (cumulative values)
    this.counters = new Map();
    
    // Gauge metrics (point-in-time values)
    this.gauges = new Map();
    
    // Histogram metrics (distribution of values)
    this.histograms = new Map();
    
    // Metric descriptions for Prometheus HELP
    this.descriptions = new Map();
    
    // Default labels applied to all metrics
    this.defaultLabels = {
      service: process.env.SERVICE_NAME || 'unknown',
      environment: process.env.NODE_ENV || 'development',
    };
  }

  /**
   * Increment a counter metric
   * @param {string} name - Metric name
   * @param {Object} labels - Metric labels
   * @param {number} value - Amount to increment (default: 1)
   */
  incrementCounter(name, labels = {}, value = 1) {
    const key = this._buildKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  /**
   * Set a gauge metric
   * @param {string} name - Metric name
   * @param {number} value - Gauge value
   * @param {Object} labels - Metric labels
   */
  setGauge(name, value, labels = {}) {
    const key = this._buildKey(name, labels);
    this.gauges.set(key, value);
  }

  /**
   * Increment a gauge
   * @param {string} name - Metric name
   * @param {number} value - Amount to increment
   * @param {Object} labels - Metric labels
   */
  incrementGauge(name, value = 1, labels = {}) {
    const key = this._buildKey(name, labels);
    const current = this.gauges.get(key) || 0;
    this.gauges.set(key, current + value);
  }

  /**
   * Decrement a gauge
   * @param {string} name - Metric name
   * @param {number} value - Amount to decrement
   * @param {Object} labels - Metric labels
   */
  decrementGauge(name, value = 1, labels = {}) {
    this.incrementGauge(name, -value, labels);
  }

  /**
   * Observe a histogram value
   * @param {string} name - Metric name
   * @param {number} value - Observed value
   * @param {Object} labels - Metric labels
   */
  observeHistogram(name, value, labels = {}) {
    const key = this._buildKey(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, {
        count: 0,
        sum: 0,
        buckets: {},
        values: [],
      });
    }
    
    const histogram = this.histograms.get(key);
    histogram.count++;
    histogram.sum += value;
    histogram.values.push(value);
    
    // Keep last 1000 values for percentile calculation
    if (histogram.values.length > 1000) {
      histogram.values = histogram.values.slice(-1000);
    }
  }

  /**
   * Get all metrics in Prometheus text format
   * @returns {string} Prometheus-formatted metrics
   */
  getPrometheusMetrics() {
    let output = '';

    // Add HELP and TYPE for each metric
    const metricNames = new Set();
    
    for (const [key] of this.counters) metricNames.add(key.split('{')[0]);
    for (const [key] of this.gauges) metricNames.add(key.split('{')[0]);
    for (const [key] of this.histograms) metricNames.add(key.split('{')[0]);

    for (const name of metricNames) {
      const description = this.descriptions.get(name);
      if (description) {
        output += `# HELP ${name} ${description.help}\n`;
        output += `# TYPE ${name} ${description.type}\n`;
      }
    }

    // Output counters
    for (const [key, value] of this.counters) {
      output += `${key} ${value}\n`;
    }

    // Output gauges
    for (const [key, value] of this.gauges) {
      output += `${key} ${value}\n`;
    }

    // Output histograms
    for (const [key, histogram] of this.histograms) {
      const baseName = key.split('{')[0];
      output += `${baseName}_count${this._extractLabels(key)} ${histogram.count}\n`;
      output += `${baseName}_sum${this._extractLabels(key)} ${histogram.sum}\n`;
    }

    return output;
  }

  /**
   * Register a metric description
   * @param {string} name - Metric name
   * @param {string} help - Help text
   * @param {string} type - Metric type (counter, gauge, histogram)
   */
  registerMetric(name, help, type) {
    this.descriptions.set(name, { help, type });
  }

  /**
   * Get current value of a metric
   * @param {string} name - Metric name
   * @param {Object} labels - Metric labels
   * @returns {number} Metric value
   */
  getValue(name, labels = {}) {
    const key = this._buildKey(name, labels);
    return this.counters.get(key) || this.gauges.get(key) || 0;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Build a unique metric key from name and labels
   * @private
   */
  _buildKey(name, labels = {}) {
    const allLabels = { ...this.defaultLabels, ...labels };
    const labelStr = Object.entries(allLabels)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  /**
   * Extract labels portion from a metric key
   * @private
   */
  _extractLabels(key) {
    const match = key.match(/\{.*\}/);
    return match ? match[0] : '';
  }
}

// Export singleton instance
const collector = new MetricsCollector();

// Register common metrics
collector.registerMetric('http_requests_total', 'Total HTTP requests', 'counter');
collector.registerMetric('http_request_duration_ms', 'HTTP request duration in milliseconds', 'histogram');
collector.registerMetric('active_connections', 'Number of active connections', 'gauge');
collector.registerMetric('errors_total', 'Total number of errors', 'counter');

module.exports = collector;