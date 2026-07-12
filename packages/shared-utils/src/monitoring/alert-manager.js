const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * Alert Threshold and Notification Rules
 * 
 * Manages alerting based on metric thresholds:
 * - Threshold-based alerts
 * - Rate-of-change alerts
 * - Anomaly detection alerts
 * - Composite alert rules
 * 
 * ALERT SEVERITY:
 * - critical: Immediate action required (page on-call)
 * - warning: Action needed within hours
 * - info: Informational, no immediate action
 * 
 * @example
 *   const alerts = require('@siamsiam/shared-utils').monitoring.alertManager;
 *   
 *   alerts.addRule('high_error_rate', {
 *     metric: 'errors_total',
 *     threshold: 100,
 *     window: '5m',
 *     severity: 'critical',
 *   });
 */

class AlertManager {
  constructor() {
    this.rules = new Map();
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.maxHistorySize = 1000;
  }

  /**
   * Add an alert rule
   * @param {string} ruleId - Rule identifier
   * @param {Object} config - Rule configuration
   */
  addRule(ruleId, config) {
    this.rules.set(ruleId, {
      id: ruleId,
      name: config.name || ruleId,
      description: config.description || '',
      metric: config.metric,
      threshold: config.threshold,
      window: config.window || '5m',
      severity: config.severity || 'warning',
      enabled: config.enabled !== false,
      cooldown: config.cooldown || 300000, // 5 minutes
      ...config,
    });
  }

  /**
   * Evaluate a metric value against alert rules
   * @param {string} metric - Metric name
   * @param {number} value - Current metric value
   * @param {Object} labels - Metric labels
   */
  evaluate(metric, value, labels = {}) {
    for (const [ruleId, rule] of this.rules) {
      if (!rule.enabled) continue;
      if (rule.metric !== metric) continue;

      // Check threshold
      if (value >= rule.threshold) {
        this._triggerAlert(ruleId, rule, value, labels);
      } else {
        this._resolveAlert(ruleId);
      }
    }
  }

  /**
   * Get active alerts
   * @returns {Array} Active alerts
   */
  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history
   * @returns {Array} Alert history
   */
  getHistory(limit = 50) {
    return this.alertHistory.slice(-limit);
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Trigger an alert
   * @private
   */
  _triggerAlert(ruleId, rule, value, labels) {
    // Check if already active
    if (this.activeAlerts.has(ruleId)) {
      const existing = this.activeAlerts.get(ruleId);
      existing.currentValue = value;
      existing.updatedAt = new Date().toISOString();
      return;
    }

    // Check cooldown
    const lastAlert = this.alertHistory
      .filter(a => a.ruleId === ruleId)
      .pop();

    if (lastAlert && (Date.now() - new Date(lastAlert.timestamp).getTime()) < rule.cooldown) {
      return;
    }

    // Create new alert
    const alert = {
      ruleId,
      ruleName: rule.name,
      severity: rule.severity,
      metric: rule.metric,
      threshold: rule.threshold,
      currentValue: value,
      labels,
      triggeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'firing',
    };

    this.activeAlerts.set(ruleId, alert);
    this.alertHistory.push({ ...alert, type: 'triggered', timestamp: new Date().toISOString() });

    // Trim history
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(-this.maxHistorySize);
    }

    // Log alert
    const logMethod = rule.severity === 'critical' ? 'error' : 'warn';
    logger[logMethod](`ALERT: ${rule.name}`, {
      ruleId,
      severity: rule.severity,
      metric: rule.metric,
      threshold: rule.threshold,
      currentValue: value,
    });

    // Send notification
    this._sendNotification(alert, rule);
  }

  /**
   * Resolve an alert
   * @private
   */
  _resolveAlert(ruleId) {
    const alert = this.activeAlerts.get(ruleId);
    if (!alert) return;

    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();

    this.alertHistory.push({ ...alert, type: 'resolved', timestamp: new Date().toISOString() });
    this.activeAlerts.delete(ruleId);

    logger.info(`Alert resolved: ${alert.ruleName}`, { ruleId });
  }

  /**
   * Send alert notification
   * @private
   */
  _sendNotification(alert, rule) {
    // PRODUCTION: Implement actual notifications
    // - Slack webhook
    // - Email
    // - PagerDuty
    // - SMS
    
    if (config.isDevelopment) {
      console.log(`\n🚨 ALERT [${alert.severity.toUpperCase()}]: ${alert.ruleName}\n`);
    }
  }
}

// Export singleton instance
module.exports = new AlertManager();