const crypto = require('crypto');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');
const SecurityEventLogger = require('../logging/security-events');

/**
 * ML-Based Fraud Pattern Detection
 * 
 * Detects fraudulent activities using rule-based heuristics and
 * pattern matching. Designed to be extended with ML models.
 * 
 * DETECTION SIGNALS:
 * - Velocity checks (too many actions in short time)
 * - Amount anomalies (unusual transaction amounts)
 * - Location inconsistencies (impossible travel)
 * - Device fingerprinting (known fraud devices)
 * - Behavioral patterns (unusual user behavior)
 * - Time-based patterns (unusual hours)
 * - Pattern matching (known fraud patterns)
 * 
 * PRODUCTION TODO:
 * - Integrate with ML model for advanced detection
 * - Add third-party fraud detection APIs
 * - Implement real-time scoring
 * - Add automated blocking rules
 * 
 * @example
 *   const fraud = require('@siamsiam/shared-utils').security.fraudDetection;
 *   const score = await fraud.analyzeTransaction(transaction, user, context);
 *   if (score > 80) { /* block transaction * / }
 */

class FraudDetection {
  constructor() {
    // Risk score weights
    this.weights = {
      velocity: 25,
      amountAnomaly: 20,
      locationInconsistency: 20,
      deviceFingerprint: 15,
      timeAnomaly: 10,
      patternMatch: 10,
    };

    // Maximum risk score (0-100)
    this.maxScore = 100;
    
    // High risk threshold
    this.highRiskThreshold = 80;
    this.mediumRiskThreshold = 50;
    
    // Velocity limits
    this.velocityLimits = {
      transactions: { count: 10, windowMs: 300000 },    // 10 transactions in 5 min
      logins: { count: 5, windowMs: 300000 },            // 5 logins in 5 min
      apiCalls: { count: 100, windowMs: 60000 },         // 100 API calls in 1 min
      passwordResets: { count: 3, windowMs: 3600000 },   // 3 resets in 1 hour
    };

    // Suspicious countries (example - customize for your market)
    this.highRiskCountries = new Set([
      // PRODUCTION: Add high-risk countries based on your threat model
    ]);

    // Known fraud patterns
    this.fraudPatterns = [
      {
        name: 'rapid_small_transactions',
        description: 'Multiple small transactions in quick succession',
        check: (events) => events.filter(e => 
          e.type === 'transaction' && e.amount < 5
        ).length > 5,
      },
      {
        name: 'unusual_amount_pattern',
        description: 'Transaction amount matches common fraud amounts',
        check: (transaction) => {
          const suspiciousAmounts = [0.01, 0.99, 1.00, 9.99, 49.99, 99.99];
          return suspiciousAmounts.includes(transaction.amount);
        },
      },
      {
        name: 'impossible_travel',
        description: 'Login from geographically impossible locations',
        check: (locations) => this._detectImpossibleTravel(locations),
      },
    ];

    // Store recent events for pattern detection
    this.recentEvents = new Map();
    this.eventRetentionMs = 3600000; // 1 hour
  }

  /**
   * Analyze a transaction for fraud
   * @param {Object} transaction - Transaction details
   * @param {Object} user - User details
   * @param {Object} context - Additional context (IP, device, location, etc.)
   * @returns {Promise<Object>} Fraud analysis result
   */
  async analyzeTransaction(transaction, user, context = {}) {
    const signals = [];
    let totalScore = 0;

    // 1. Velocity Check
    const velocityScore = await this._checkVelocity(transaction, user);
    signals.push({ type: 'velocity', score: velocityScore });
    totalScore += velocityScore * (this.weights.velocity / 100);

    // 2. Amount Anomaly Check
    const amountScore = this._checkAmountAnomaly(transaction, user);
    signals.push({ type: 'amount_anomaly', score: amountScore });
    totalScore += amountScore * (this.weights.amountAnomaly / 100);

    // 3. Location Consistency Check
    const locationScore = await this._checkLocation(transaction, user, context);
    signals.push({ type: 'location', score: locationScore });
    totalScore += locationScore * (this.weights.locationInconsistency / 100);

    // 4. Device Fingerprint Check
    const deviceScore = this._checkDevice(transaction, user, context);
    signals.push({ type: 'device', score: deviceScore });
    totalScore += deviceScore * (this.weights.deviceFingerprint / 100);

    // 5. Time Anomaly Check
    const timeScore = this._checkTimeAnomaly(transaction, user, context);
    signals.push({ type: 'time', score: timeScore });
    totalScore += timeScore * (this.weights.timeAnomaly / 100);

    // 6. Pattern Match Check
    const patternScore = this._checkPatterns(transaction, user, context);
    signals.push({ type: 'pattern', score: patternScore });
    totalScore += patternScore * (this.weights.patternMatch / 100);

    // Normalize score
    totalScore = Math.min(Math.round(totalScore), this.maxScore);

    // Determine risk level
    const riskLevel = totalScore >= this.highRiskThreshold ? 'high' :
                     totalScore >= this.mediumRiskThreshold ? 'medium' : 'low';

    // Log high risk transactions
    if (riskLevel === 'high') {
      SecurityEventLogger.logFraudAlert(
        transaction.id,
        'High risk transaction detected',
        totalScore
      );
    }

    // Store event for future analysis
    this._storeEvent('transaction', {
      id: transaction.id,
      userId: user?.id,
      amount: transaction.amount,
      currency: transaction.currency,
      timestamp: Date.now(),
      score: totalScore,
      riskLevel,
    });

    return {
      transactionId: transaction.id,
      riskScore: totalScore,
      riskLevel,
      signals,
      recommended: riskLevel === 'high' ? 'block' :
                  riskLevel === 'medium' ? 'review' : 'allow',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Analyze login attempt for fraud
   * @param {Object} user - User details
   * @param {Object} context - Login context
   * @returns {Promise<Object>} Fraud analysis result
   */
  async analyzeLogin(user, context = {}) {
    const signals = [];
    let totalScore = 0;

    // Check login velocity
    const loginCount = this._getRecentEventCount(user.id, 'login');
    if (loginCount > this.velocityLimits.logins.count) {
      const score = Math.min(100, (loginCount / this.velocityLimits.logins.count) * 100);
      signals.push({ type: 'login_velocity', score });
      totalScore += score * 0.3;
    }

    // Check device
    if (context.deviceId && user.knownDevices) {
      const isKnownDevice = user.knownDevices.includes(context.deviceId);
      if (!isKnownDevice) {
        signals.push({ type: 'unknown_device', score: 40 });
        totalScore += 40 * 0.25;
      }
    }

    // Check location
    if (context.location && user.usualLocations) {
      const isUsualLocation = this._isUsualLocation(context.location, user.usualLocations);
      if (!isUsualLocation) {
        signals.push({ type: 'unusual_location', score: 60 });
        totalScore += 60 * 0.25;
      }
    }

    // Check time
    const hour = new Date().getHours();
    if (hour < 5 || hour > 22) {
      signals.push({ type: 'unusual_time', score: 20 });
      totalScore += 20 * 0.1;
    }

    // Check IP reputation
    if (context.ip && this._isHighRiskIP(context.ip)) {
      signals.push({ type: 'high_risk_ip', score: 80 });
      totalScore += 80 * 0.1;
    }

    totalScore = Math.min(Math.round(totalScore), this.maxScore);

    // Store login event
    this._storeEvent('login', {
      userId: user.id,
      timestamp: Date.now(),
      score: totalScore,
      context: {
        ip: context.ip,
        device: context.deviceId,
      },
    });

    return {
      userId: user.id,
      riskScore: totalScore,
      riskLevel: totalScore >= this.highRiskThreshold ? 'high' :
                 totalScore >= this.mediumRiskThreshold ? 'medium' : 'low',
      signals,
      requiresMFA: totalScore >= this.mediumRiskThreshold,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Report confirmed fraud for learning
   */
  reportFraud(transactionId, fraudType, details = {}) {
    SecurityEventLogger.logFraudAlert(
      transactionId,
      `Confirmed fraud: ${fraudType}`,
      100
    );

    // PRODUCTION TODO: Feed confirmed fraud back to ML model
    logger.warn('Confirmed fraud reported', {
      transactionId,
      fraudType,
      details,
    });
  }

  /**
   * Add a custom fraud pattern
   */
  addPattern(pattern) {
    if (typeof pattern.check === 'function') {
      this.fraudPatterns.push(pattern);
      logger.info('Custom fraud pattern added', { name: pattern.name });
    }
  }

  // ==================== PRIVATE CHECKS ====================

  /**
   * Check transaction velocity
   * @private
   */
  async _checkVelocity(transaction, user) {
    const recentTransactions = this._getRecentEvents(
      user?.id,
      'transaction',
      this.velocityLimits.transactions.windowMs
    );

    const count = recentTransactions.length;
    const limit = this.velocityLimits.transactions.count;

    if (count > limit * 1.5) return 100;
    if (count > limit) return 70;
    if (count > limit * 0.7) return 40;
    return 0;
  }

  /**
   * Check for amount anomalies
   * @private
   */
  _checkAmountAnomaly(transaction, user) {
    if (!user?.averageTransactionAmount) return 0;

    const avg = user.averageTransactionAmount;
    const current = transaction.amount;

    // Transaction significantly larger than average
    if (current > avg * 5) return 80;
    if (current > avg * 3) return 60;
    if (current > avg * 2) return 30;

    // Unusually small transaction (testing)
    if (current < avg * 0.01 && current > 0) return 40;

    return 0;
  }

  /**
   * Check location consistency
   * @private
   */
  async _checkLocation(transaction, user, context) {
    if (!context.location || !user?.lastLocation) return 0;

    // Check if high-risk country
    if (this.highRiskCountries.has(context.location.country)) {
      return 80;
    }

    // Check impossible travel
    if (user.lastLocation && context.location) {
      const distance = this._calculateDistance(
        user.lastLocation.lat, user.lastLocation.lng,
        context.location.lat, context.location.lng
      );
      
      const timeSinceLastAction = Date.now() - (user.lastActionTime || 0);
      const hoursSinceLastAction = timeSinceLastAction / 3600000;
      
      // Impossible travel: can't travel > 500km/hour
      if (hoursSinceLastAction > 0 && distance / hoursSinceLastAction > 500) {
        return 100;
      }
    }

    return 0;
  }

  /**
   * Check device fingerprint
   * @private
   */
  _checkDevice(transaction, user, context) {
    if (!context.deviceFingerprint) return 0;

    // PRODUCTION TODO: Check against known fraud devices database
    // For now, return 0 (no device-based scoring)
    return 0;
  }

  /**
   * Check for time-based anomalies
   * @private
   */
  _checkTimeAnomaly(transaction, user, context) {
    const hour = new Date().getHours();
    const dayOfWeek = new Date().getDay();

    // Unusual hours (2 AM - 5 AM)
    if (hour >= 2 && hour <= 5) return 30;

    // Weekend for corporate transactions
    if ((dayOfWeek === 0 || dayOfWeek === 6) && 
        transaction.type === 'corporate_fx') {
      return 40;
    }

    return 0;
  }

  /**
   * Check against known fraud patterns
   * @private
   */
  _checkPatterns(transaction, user, context) {
    let score = 0;

    for (const pattern of this.fraudPatterns) {
      try {
        const events = this._getRecentEvents(user?.id, 'transaction', 3600000);
        if (pattern.check(transaction, events)) {
          score += 30;
          logger.debug('Fraud pattern matched', { pattern: pattern.name });
        }
      } catch (error) {
        logger.error('Fraud pattern check failed', {
          pattern: pattern.name,
          error: error.message,
        });
      }
    }

    return Math.min(score, 100);
  }

  /**
   * Detect impossible travel between locations
   * @private
   */
  _detectImpossibleTravel(locations) {
    if (locations.length < 2) return false;

    for (let i = 1; i < locations.length; i++) {
      const prev = locations[i - 1];
      const curr = locations[i];
      
      const distance = this._calculateDistance(
        prev.lat, prev.lng,
        curr.lat, curr.lng
      );
      
      const timeDiff = (curr.timestamp - prev.timestamp) / 3600000; // hours
      
      // Impossible to travel more than 800 km/h (commercial flight speed)
      if (distance / timeDiff > 800) return true;
    }

    return false;
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * @private
   */
  _calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = this._toRad(lat2 - lat1);
    const dLon = this._toRad(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this._toRad(lat1)) * Math.cos(this._toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   * @private
   */
  _toRad(deg) {
    return deg * (Math.PI / 180);
  }

  /**
   * Check if IP is high risk
   * @private
   */
  _isHighRiskIP(ip) {
    // PRODUCTION TODO: Integrate with IP reputation service
    return false;
  }

  /**
   * Check if location is usual for user
   * @private
   */
  _isUsualLocation(location, usualLocations) {
    const threshold = 100; // 100km radius
    return usualLocations.some(usual => 
      this._calculateDistance(
        location.lat, location.lng,
        usual.lat, usual.lng
      ) < threshold
    );
  }

  /**
   * Store event for velocity/pattern detection
   * @private
   */
  _storeEvent(type, data) {
    const key = data.userId || 'anonymous';
    if (!this.recentEvents.has(key)) {
      this.recentEvents.set(key, []);
    }

    const events = this.recentEvents.get(key);
    events.push({ type, ...data, timestamp: Date.now() });

    // Remove old events
    const cutoff = Date.now() - this.eventRetentionMs;
    while (events.length > 0 && events[0].timestamp < cutoff) {
      events.shift();
    }
  }

  /**
   * Get recent events for a user
   * @private
   */
  _getRecentEvents(userId, type = null, windowMs = 3600000) {
    const key = userId || 'anonymous';
    const events = this.recentEvents.get(key) || [];
    const cutoff = Date.now() - windowMs;

    return events.filter(e => 
      e.timestamp > cutoff && 
      (!type || e.type === type)
    );
  }

  /**
   * Get count of recent events
   * @private
   */
  _getRecentEventCount(userId, type = null, windowMs = 3600000) {
    return this._getRecentEvents(userId, type, windowMs).length;
  }
}

// Export singleton instance
module.exports = new FraudDetection();