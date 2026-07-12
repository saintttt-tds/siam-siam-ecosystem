const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');
const SecurityEventLogger = require('../logging/security-events');

/**
 * Behavioral Anomaly Detection
 * 
 * Detects unusual patterns in user behavior that may indicate:
 * - Account compromise
 * - Fraudulent activity
 * - Insider threats
 * - Automated attacks
 * - Data exfiltration attempts
 * 
 * DETECTION METHODS:
 * - Statistical outlier detection
 * - Baseline deviation monitoring
 * - Time-series anomaly detection
 * - Frequency analysis
 * - Pattern matching against known attack signatures
 * 
 * PRODUCTION TODO:
 * - Integrate with ML models for advanced detection
 * - Implement real-time scoring
 * - Add automated response actions
 * - Create anomaly dashboards
 * 
 * @example
 *   const detector = require('@siamsiam/shared-utils').security.anomalyDetector;
 *   const result = await detector.analyzeUserBehavior(userId, action, context);
 *   if (result.isAnomalous) { /* trigger investigation * / }
 */

class AnomalyDetector {
  constructor() {
    // Behavior baselines (userId -> metrics)
    this.baselines = new Map();
    
    // Recent activities for analysis
    this.recentActivities = new Map();
    
    // Anomaly thresholds
    this.thresholds = {
      loginFrequency: 3.0,      // Standard deviations from mean
      transactionAmount: 3.0,
      sessionDuration: 2.5,
      dataAccessVolume: 3.0,
      apiCallRate: 2.5,
      geoVelocity: 800,         // km/h (impossible travel)
    };

    // Activity window (keep last 24 hours of data)
    this.activityWindow = 86400000;
    
    // Periodic cleanup
    this._startCleanup();
  }

  /**
   * Analyze user behavior for anomalies
   * @param {string} userId - User identifier
   * @param {string} action - Action being performed
   * @param {Object} context - Action context (IP, location, amount, etc.)
   * @returns {Object} Analysis result
   */
  analyzeBehavior(userId, action, context = {}) {
    const anomalies = [];
    let totalScore = 0;

    // Get or create baseline for user
    let baseline = this.baselines.get(userId);
    if (!baseline) {
      baseline = this._createBaseline();
      this.baselines.set(userId, baseline);
    }

    // Record the activity
    this._recordActivity(userId, action, context);

    // Analyze based on action type
    switch (action) {
      case 'login':
        const loginAnomaly = this._analyzeLoginAnomaly(userId, context);
        if (loginAnomaly.isAnomalous) {
          anomalies.push(loginAnomaly);
          totalScore += loginAnomaly.score;
        }
        break;

      case 'transaction':
        const txnAnomaly = this._analyzeTransactionAnomaly(userId, context);
        if (txnAnomaly.isAnomalous) {
          anomalies.push(txnAnomaly);
          totalScore += txnAnomaly.score;
        }
        break;

      case 'data_export':
        const exportAnomaly = this._analyzeDataExportAnomaly(userId, context);
        if (exportAnomaly.isAnomalous) {
          anomalies.push(exportAnomaly);
          totalScore += exportAnomaly.score;
        }
        break;

      case 'api_call':
        const apiAnomaly = this._analyzeApiCallAnomaly(userId, context);
        if (apiAnomaly.isAnomalous) {
          anomalies.push(apiAnomaly);
          totalScore += apiAnomaly.score;
        }
        break;
    }

    // Update baseline with new data
    this._updateBaseline(userId, action, context);

    const isAnomalous = totalScore >= 50;

    if (isAnomalous) {
      logger.warn('Behavioral anomaly detected', {
        userId,
        action,
        score: totalScore,
        anomalies: anomalies.map(a => a.type),
      });

      SecurityEventLogger.logSuspiciousActivity(
        userId,
        `anomalous_${action}`,
        { score: totalScore, anomalies }
      );
    }

    return {
      userId,
      action,
      isAnomalous,
      score: totalScore,
      anomalies,
      recommended: totalScore >= 70 ? 'investigate' : 
                   totalScore >= 50 ? 'monitor' : 'normal',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get user baseline data
   */
  getBaseline(userId) {
    const baseline = this.baselines.get(userId);
    if (!baseline) return null;

    return {
      userId,
      logins: {
        count: baseline.loginCount,
        avgFrequency: baseline.loginFrequency,
        usualIPs: Array.from(baseline.usualIPs || []),
        usualLocations: baseline.usualLocations || [],
      },
      transactions: {
        count: baseline.transactionCount,
        avgAmount: baseline.averageTransactionAmount,
        stdDevAmount: baseline.transactionAmountStdDev,
        usualCurrencies: Array.from(baseline.usualCurrencies || []),
      },
      dataExports: {
        count: baseline.exportCount,
        avgVolume: baseline.averageExportVolume,
      },
      apiCalls: {
        count: baseline.apiCallCount,
        avgRate: baseline.averageApiCallRate,
      },
      lastUpdated: baseline.lastUpdated,
    };
  }

  /**
   * Reset baseline for a user
   */
  resetBaseline(userId) {
    this.baselines.delete(userId);
    this.recentActivities.delete(userId);
    logger.info('User baseline reset', { userId });
  }

  // ==================== PRIVATE ANALYZERS ====================

  /**
   * Analyze login anomaly
   * @private
   */
  _analyzeLoginAnomaly(userId, context) {
    const baseline = this.baselines.get(userId);

    // Check login frequency
    const recentLogins = this._getRecentActivities(userId, 'login', 3600000);
    const loginCount = recentLogins.length;
    
    if (baseline.loginCount > 0 && loginCount > baseline.loginFrequency * 3) {
      return {
        type: 'high_login_frequency',
        isAnomalous: true,
        score: 60,
        detail: `${loginCount} logins in last hour (baseline: ${Math.round(baseline.loginFrequency)})`,
      };
    }

    // Check for new IP
    if (context.ip && baseline.usualIPs && !baseline.usualIPs.has(context.ip)) {
      return {
        type: 'new_ip_address',
        isAnomalous: true,
        score: 40,
        detail: 'Login from new IP address',
      };
    }

    // Check for impossible travel
    const lastLogin = recentLogins[recentLogins.length - 2]; // Previous login
    if (lastLogin && context.location && lastLogin.context?.location) {
      const distance = this._calculateDistance(
        lastLogin.context.location.lat, lastLogin.context.location.lng,
        context.location.lat, context.location.lng
      );
      
      const timeDiff = (Date.now() - lastLogin.timestamp) / 3600000; // hours
      
      if (timeDiff > 0 && distance / timeDiff > this.thresholds.geoVelocity) {
        return {
          type: 'impossible_travel',
          isAnomalous: true,
          score: 90,
          detail: `Traveled ${Math.round(distance)}km in ${Math.round(timeDiff)}h`,
        };
      }
    }

    return { isAnomalous: false, score: 0 };
  }

  /**
   * Analyze transaction anomaly
   * @private
   */
  _analyzeTransactionAnomaly(userId, context) {
    const baseline = this.baselines.get(userId);

    // Check amount anomaly
    if (context.amount && baseline.averageTransactionAmount > 0) {
      const stdDevs = Math.abs(
        (context.amount - baseline.averageTransactionAmount) / 
        (baseline.transactionAmountStdDev || 1)
      );

      if (stdDevs > this.thresholds.transactionAmount) {
        return {
          type: 'unusual_transaction_amount',
          isAnomalous: true,
          score: Math.min(80, Math.round(stdDevs * 20)),
          detail: `Amount ${context.amount} is ${stdDevs.toFixed(1)} std devs from mean (${baseline.averageTransactionAmount.toFixed(2)})`,
        };
      }
    }

    // Check unusual currency
    if (context.currency && baseline.usualCurrencies) {
      if (!baseline.usualCurrencies.has(context.currency)) {
        return {
          type: 'unusual_currency',
          isAnomalous: true,
          score: 30,
          detail: `Transaction in unusual currency: ${context.currency}`,
        };
      }
    }

    // Check transaction velocity
    const recentTxns = this._getRecentActivities(userId, 'transaction', 300000); // 5 min
    if (recentTxns.length > 5) {
      return {
        type: 'high_transaction_velocity',
        isAnomalous: true,
        score: 70,
        detail: `${recentTxns.length} transactions in 5 minutes`,
      };
    }

    return { isAnomalous: false, score: 0 };
  }

  /**
   * Analyze data export anomaly
   * @private
   */
  _analyzeDataExportAnomaly(userId, context) {
    const baseline = this.baselines.get(userId);

    // Check export volume
    if (context.recordCount && baseline.averageExportVolume > 0) {
      const ratio = context.recordCount / baseline.averageExportVolume;
      
      if (ratio > 10) {
        return {
          type: 'unusual_export_volume',
          isAnomalous: true,
          score: 70,
          detail: `Exporting ${context.recordCount} records (${ratio}x baseline)`,
        };
      }
    }

    // Check multiple exports in short time
    const recentExports = this._getRecentActivities(userId, 'data_export', 300000);
    if (recentExports.length > 3) {
      return {
        type: 'multiple_exports',
        isAnomalous: true,
        score: 60,
        detail: `${recentExports.length} exports in 5 minutes`,
      };
    }

    return { isAnomalous: false, score: 0 };
  }

  /**
   * Analyze API call anomaly
   * @private
   */
  _analyzeApiCallAnomaly(userId, context) {
    // Check API call rate
    const recentCalls = this._getRecentActivities(userId, 'api_call', 60000);
    const rate = recentCalls.length; // Calls per minute
    
    if (rate > 100) {
      return {
        type: 'high_api_call_rate',
        isAnomalous: true,
        score: 50,
        detail: `${rate} API calls in last minute`,
      };
    }

    // Check for unusual endpoints
    if (context.endpoint && this._isSuspiciousEndpoint(context.endpoint)) {
      return {
        type: 'suspicious_endpoint_access',
        isAnomalous: true,
        score: 40,
        detail: `Accessing suspicious endpoint: ${context.endpoint}`,
      };
    }

    return { isAnomalous: false, score: 0 };
  }

  // ==================== PRIVATE HELPERS ====================

  /**
   * Create a new baseline for a user
   * @private
   */
  _createBaseline() {
    return {
      loginCount: 0,
      loginFrequency: 0,
      usualIPs: new Set(),
      usualLocations: [],
      
      transactionCount: 0,
      averageTransactionAmount: 0,
      transactionAmountStdDev: 0,
      transactionAmounts: [],
      usualCurrencies: new Set(),
      
      exportCount: 0,
      averageExportVolume: 0,
      
      apiCallCount: 0,
      averageApiCallRate: 0,
      
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Update baseline with new data
   * @private
   */
  _updateBaseline(userId, action, context) {
    const baseline = this.baselines.get(userId);
    if (!baseline) return;

    switch (action) {
      case 'login':
        baseline.loginCount++;
        if (context.ip) baseline.usualIPs.add(context.ip);
        if (context.location) baseline.usualLocations.push(context.location);
        baseline.loginFrequency = baseline.loginCount / 
          ((Date.now() - new Date(baseline.createdAt).getTime()) / 3600000);
        break;

      case 'transaction':
        baseline.transactionCount++;
        if (context.amount) {
          baseline.transactionAmounts.push(context.amount);
          baseline.averageTransactionAmount = this._calculateMean(baseline.transactionAmounts);
          baseline.transactionAmountStdDev = this._calculateStdDev(
            baseline.transactionAmounts, 
            baseline.averageTransactionAmount
          );
        }
        if (context.currency) baseline.usualCurrencies.add(context.currency);
        break;

      case 'data_export':
        baseline.exportCount++;
        if (context.recordCount) {
          baseline.averageExportVolume = 
            (baseline.averageExportVolume * (baseline.exportCount - 1) + context.recordCount) / 
            baseline.exportCount;
        }
        break;

      case 'api_call':
        baseline.apiCallCount++;
        break;
    }

    baseline.lastUpdated = new Date().toISOString();
  }

  /**
   * Record user activity
   * @private
   */
  _recordActivity(userId, action, context) {
    if (!this.recentActivities.has(userId)) {
      this.recentActivities.set(userId, []);
    }

    this.recentActivities.get(userId).push({
      action,
      context,
      timestamp: Date.now(),
    });
  }

  /**
   * Get recent activities for a user
   * @private
   */
  _getRecentActivities(userId, action = null, windowMs = 3600000) {
    const activities = this.recentActivities.get(userId) || [];
    const cutoff = Date.now() - windowMs;

    return activities.filter(a => 
      a.timestamp > cutoff && 
      (!action || a.action === action)
    );
  }

  /**
   * Calculate mean of array
   * @private
   */
  _calculateMean(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Calculate standard deviation
   * @private
   */
  _calculateStdDev(values, mean) {
    if (values.length < 2) return 0;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  /**
   * Calculate distance between coordinates
   * @private
   */
  _calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Check if endpoint is suspicious
   * @private
   */
  _isSuspiciousEndpoint(endpoint) {
    const suspicious = [
      '/admin',
      '/api/admin',
      '/debug',
      '/.env',
      '/config',
      '/backup',
      '/phpmyadmin',
      '/wp-admin',
      '/.git',
    ];
    return suspicious.some(s => endpoint.toLowerCase().includes(s));
  }

  /**
   * Start periodic cleanup of old data
   * @private
   */
  _startCleanup() {
    setInterval(() => {
      const cutoff = Date.now() - this.activityWindow;
      
      for (const [userId, activities] of this.recentActivities) {
        const filtered = activities.filter(a => a.timestamp > cutoff);
        if (filtered.length === 0) {
          this.recentActivities.delete(userId);
        } else {
          this.recentActivities.set(userId, filtered);
        }
      }
    }, 3600000); // Every hour
  }
}

// Export singleton instance
module.exports = new AnomalyDetector();