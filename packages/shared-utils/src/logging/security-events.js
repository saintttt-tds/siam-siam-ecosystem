const logger = require('./logger');
const AuditLogger = require('./audit-logger');
const config = require('@siamsiam/shared-config');

/**
 * Security Incident Logging and Alerting
 * 
 * Specialized logger for security-related events with automatic
 * alerting for critical incidents. Tracks and reports:
 * 
 * - Failed login attempts / brute force attacks
 * - Unauthorized access attempts
 * - API key compromises
 * - SQL injection / XSS attempts
 * - Suspicious user behavior
 * - Data breach indicators
 * - DDoS attack patterns
 * 
 * PRODUCTION TODO:
 * - Integrate with SIEM systems (Splunk, ELK Security)
 * - Set up PagerDuty/OpsGenie for critical alerts
 * - Implement automated IP blocking for attacks
 * - Create security dashboards in Grafana
 * - Set up real-time Slack/Teams notifications
 * 
 * @example
 *   SecurityEventLogger.logFailedLogin('user@email.com', '192.168.1.1', 5);
 *   SecurityEventLogger.logSQLInjectionAttempt('10.0.0.1', 'DROP TABLE users');
 */

class SecurityEventLogger {
  // Severity levels
  static SEVERITY = {
    INFO: 'info',
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical',
  };

  // Event types for categorization
  static EVENT_TYPES = {
    AUTHENTICATION: 'authentication',
    AUTHORIZATION: 'authorization',
    INPUT_VALIDATION: 'input_validation',
    DATA_ACCESS: 'data_access',
    NETWORK: 'network',
    MALWARE: 'malware',
    CONFIGURATION: 'configuration',
    COMPLIANCE: 'compliance',
    ANOMALY: 'anomaly',
  };

  /**
   * Log a security event
   * @param {string} type - Event type
   * @param {Object} details - Event details
   * @param {string} severity - Severity level
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Created event
   */
  static log(type, details, severity = 'medium', metadata = {}) {
    const event = {
      eventId: `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      timestamp: new Date().toISOString(),
      environment: config.env,
      service: process.env.SERVICE_NAME || 'unknown',
      details: this._sanitizeDetails(details),
      metadata: {
        ...metadata,
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
      },
    };

    // Log based on severity
    const logMessage = `Security Event: ${type} [${severity.toUpperCase()}]`;
    
    switch (severity) {
      case this.SEVERITY.CRITICAL:
        logger.error(`🚨 CRITICAL: ${logMessage}`, event);
        this._sendImmediateAlert(event);
        break;
      case this.SEVERITY.HIGH:
        logger.error(`🔴 HIGH: ${logMessage}`, event);
        this._sendImmediateAlert(event);
        break;
      case this.SEVERITY.MEDIUM:
        logger.warn(`🟡 MEDIUM: ${logMessage}`, event);
        this._sendDelayedAlert(event);
        break;
      case this.SEVERITY.LOW:
        logger.info(`🟢 LOW: ${logMessage}`, event);
        break;
      default:
        logger.info(`ℹ️ ${logMessage}`, event);
    }

    // Always create audit trail for security events
    AuditLogger.logSecurity(type, details, severity, metadata);

    // Store for analysis
    this._storeSecurityEvent(event);

    return event;
  }

  // ==================== AUTHENTICATION EVENTS ====================

  /**
   * Failed login attempt
   */
  static logFailedLogin(email, ipAddress, attemptCount, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.AUTHENTICATION,
      {
        action: 'failed_login',
        email: this._maskEmail(email),
        ipAddress,
        attemptCount,
        timestamp: new Date().toISOString(),
      },
      attemptCount > 10 ? this.SEVERITY.HIGH : 
      attemptCount > 5 ? this.SEVERITY.MEDIUM : 
      this.SEVERITY.LOW,
      metadata
    );
  }

  /**
   * Successful login from new device/location
   */
  static logNewDeviceLogin(userId, deviceInfo, ipAddress, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.AUTHENTICATION,
      {
        action: 'new_device_login',
        userId,
        deviceInfo,
        ipAddress,
      },
      this.SEVERITY.LOW,
      metadata
    );
  }

  /**
   * Brute force attack detected
   */
  static logBruteForceAttempt(ipAddress, endpoint, requestCount, timeWindow, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.NETWORK,
      {
        action: 'brute_force',
        ipAddress,
        endpoint,
        requestCount,
        timeWindowSeconds: timeWindow,
        rate: `${(requestCount / timeWindow).toFixed(2)} req/s`,
      },
      this.SEVERITY.HIGH,
      metadata
    );
  }

  /**
   * Account lockout
   */
  static logAccountLockout(userId, email, reason, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.AUTHENTICATION,
      {
        action: 'account_lockout',
        userId,
        email: this._maskEmail(email),
        reason,
      },
      this.SEVERITY.MEDIUM,
      metadata
    );
  }

  /**
   * MFA bypass attempt
   */
  static logMFABypassAttempt(userId, method, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.AUTHENTICATION,
      {
        action: 'mfa_bypass_attempt',
        userId,
        method,
      },
      this.SEVERITY.HIGH,
      metadata
    );
  }

  // ==================== AUTHORIZATION EVENTS ====================

  /**
   * Unauthorized access attempt
   */
  static logUnauthorizedAccess(ipAddress, resource, userId = null, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.AUTHORIZATION,
      {
        action: 'unauthorized_access',
        ipAddress,
        resource,
        userId,
        attemptedAt: new Date().toISOString(),
      },
      this.SEVERITY.HIGH,
      metadata
    );
  }

  /**
   * Privilege escalation attempt
   */
  static logPrivilegeEscalation(userId, currentRole, attemptedRole, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.AUTHORIZATION,
      {
        action: 'privilege_escalation',
        userId,
        currentRole,
        attemptedRole,
      },
      this.SEVERITY.HIGH,
      metadata
    );
  }

  /**
   * API key compromise
   */
  static logApiKeyCompromise(apiKeyId, userId, applicationId, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.AUTHORIZATION,
      {
        action: 'api_key_compromise',
        apiKeyId: this._maskApiKey(apiKeyId),
        userId,
        applicationId,
      },
      this.SEVERITY.CRITICAL,
      metadata
    );
  }

  /**
   * Suspicious API usage pattern
   */
  static logSuspiciousApiUsage(apiKeyId, endpoint, requestCount, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.ANOMALY,
      {
        action: 'suspicious_api_usage',
        apiKeyId: this._maskApiKey(apiKeyId),
        endpoint,
        requestCount,
      },
      this.SEVERITY.MEDIUM,
      metadata
    );
  }

  // ==================== INPUT VALIDATION EVENTS ====================

  /**
   * SQL injection attempt detected
   */
  static logSQLInjectionAttempt(ipAddress, input, endpoint, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.INPUT_VALIDATION,
      {
        action: 'sql_injection_attempt',
        ipAddress,
        endpoint,
        inputSample: input.substring(0, 100),
        inputLength: input.length,
      },
      this.SEVERITY.HIGH,
      metadata
    );
  }

  /**
   * XSS attempt detected
   */
  static logXSSAttempt(ipAddress, input, endpoint, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.INPUT_VALIDATION,
      {
        action: 'xss_attempt',
        ipAddress,
        endpoint,
        inputSample: input.substring(0, 100),
      },
      this.SEVERITY.HIGH,
      metadata
    );
  }

  /**
   * Malformed request detected
   */
  static logMalformedRequest(ipAddress, endpoint, reason, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.INPUT_VALIDATION,
      {
        action: 'malformed_request',
        ipAddress,
        endpoint,
        reason,
      },
      this.SEVERITY.LOW,
      metadata
    );
  }

  // ==================== DATA ACCESS EVENTS ====================

  /**
   * Potential data breach
   */
  static logDataBreach(resourceType, affectedRecords, details, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.DATA_ACCESS,
      {
        action: 'data_breach',
        resourceType,
        affectedRecords,
        details,
        detectedAt: new Date().toISOString(),
      },
      this.SEVERITY.CRITICAL,
      metadata
    );
  }

  /**
   * Unusual data export
   */
  static logUnusualDataExport(userId, resourceType, recordCount, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.DATA_ACCESS,
      {
        action: 'unusual_data_export',
        userId,
        resourceType,
        recordCount,
      },
      recordCount > 1000 ? this.SEVERITY.HIGH : this.SEVERITY.MEDIUM,
      metadata
    );
  }

  /**
   * Sensitive data access
   */
  static logSensitiveDataAccess(userId, dataType, resourceId, reason = null, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.DATA_ACCESS,
      {
        action: 'sensitive_data_access',
        userId,
        dataType,
        resourceId,
        reason,
      },
      this.SEVERITY.LOW,
      metadata
    );
  }

  // ==================== NETWORK EVENTS ====================

  /**
   * DDoS attack detected
   */
  static logDDoSAttack(ipAddresses, requestRate, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.NETWORK,
      {
        action: 'ddos_attack',
        ipAddresses: ipAddresses.slice(0, 10), // Limit IPs logged
        requestRate,
        detectedAt: new Date().toISOString(),
      },
      this.SEVERITY.CRITICAL,
      metadata
    );
  }

  /**
   * Port scanning detected
   */
  static logPortScan(ipAddress, ports, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.NETWORK,
      {
        action: 'port_scan',
        ipAddress,
        ports: ports.slice(0, 20),
      },
      this.SEVERITY.MEDIUM,
      metadata
    );
  }

  /**
   * Unusual traffic pattern
   */
  static logUnusualTraffic(ipAddress, pattern, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.ANOMALY,
      {
        action: 'unusual_traffic',
        ipAddress,
        pattern,
      },
      this.SEVERITY.MEDIUM,
      metadata
    );
  }

  // ==================== CONFIGURATION EVENTS ====================

  /**
   * Security configuration change
   */
  static logSecurityConfigChange(adminId, configKey, oldValue, newValue, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.CONFIGURATION,
      {
        action: 'security_config_change',
        adminId,
        configKey,
        changedAt: new Date().toISOString(),
      },
      this.SEVERITY.MEDIUM,
      metadata
    );
  }

  /**
   * Certificate expiration warning
   */
  static logCertificateExpiring(certificateName, daysRemaining, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.CONFIGURATION,
      {
        action: 'certificate_expiring',
        certificateName,
        daysRemaining,
      },
      daysRemaining < 7 ? this.SEVERITY.HIGH : 
      daysRemaining < 30 ? this.SEVERITY.MEDIUM : 
      this.SEVERITY.LOW,
      metadata
    );
  }

  // ==================== ANOMALY EVENTS ====================

  /**
   * Suspicious user behavior
   */
  static logSuspiciousActivity(userId, activity, details, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.ANOMALY,
      {
        action: 'suspicious_activity',
        userId,
        activity,
        details,
      },
      this.SEVERITY.MEDIUM,
      metadata
    );
  }

  /**
   * Geolocation anomaly (login from unusual location)
   */
  static logGeolocationAnomaly(userId, currentLocation, usualLocation, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.ANOMALY,
      {
        action: 'geolocation_anomaly',
        userId,
        currentLocation,
        usualLocation,
      },
      this.SEVERITY.MEDIUM,
      metadata
    );
  }

  /**
   * Rate limit exceeded
   */
  static logRateLimitExceeded(ipAddress, endpoint, limit, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.NETWORK,
      {
        action: 'rate_limit_exceeded',
        ipAddress,
        endpoint,
        limit,
      },
      this.SEVERITY.LOW,
      metadata
    );
  }

  /**
   * Fraud detection alert
   */
  static logFraudAlert(transactionId, reason, score, metadata = {}) {
    return this.log(
      this.EVENT_TYPES.ANOMALY,
      {
        action: 'fraud_alert',
        transactionId,
        reason,
        riskScore: score,
      },
      score > 80 ? this.SEVERITY.HIGH : 
      score > 50 ? this.SEVERITY.MEDIUM : 
      this.SEVERITY.LOW,
      metadata
    );
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Send immediate alert for critical/high severity events
   * @private
   */
  static async _sendImmediateAlert(event) {
    // Slack alert
    if (config.monitoring.alerting.slack) {
      try {
        // PRODUCTION TODO: Implement Slack webhook
        // await this._sendSlackAlert(event);
      } catch (error) {
        logger.error('Failed to send Slack alert', { error: error.message });
      }
    }

    // Email alert
    if (config.monitoring.alerting.email) {
      // PRODUCTION TODO: Implement email alerts
    }

    // PagerDuty
    if (config.monitoring.alerting.pagerDuty) {
      // PRODUCTION TODO: Implement PagerDuty integration
    }

    // Log to console in development
    if (config.isDevelopment) {
      console.error('\n🚨 SECURITY ALERT:', JSON.stringify(event, null, 2), '\n');
    }
  }

  /**
   * Send delayed/batched alert for medium severity events
   * @private
   */
  static async _sendDelayedAlert(event) {
    // Batch medium severity events and send every 5 minutes
    if (!this._delayedAlerts) {
      this._delayedAlerts = [];
      setTimeout(() => this._flushDelayedAlerts(), 300000); // 5 minutes
    }
    this._delayedAlerts.push(event);
  }

  /**
   * Flush batched alerts
   * @private
   */
  static async _flushDelayedAlerts() {
    if (this._delayedAlerts && this._delayedAlerts.length > 0) {
      logger.warn(`Security digest: ${this._delayedAlerts.length} medium severity events`, {
        events: this._delayedAlerts,
      });
      this._delayedAlerts = [];
    }
  }

  /**
   * Store security event for analysis
   * @private
   */
  static _storeSecurityEvent(event) {
    // In-memory store for recent events (circular buffer)
    if (!this._recentEvents) {
      this._recentEvents = [];
      this._maxRecentEvents = 1000;
    }
    
    this._recentEvents.push(event);
    if (this._recentEvents.length > this._maxRecentEvents) {
      this._recentEvents.shift();
    }
    
    // PRODUCTION TODO: Store in security_events database table
    // PRODUCTION TODO: Send to SIEM system
  }

  /**
   * Get recent security events
   */
  static getRecentEvents(limit = 100) {
    return (this._recentEvents || []).slice(-limit);
  }

  /**
   * Sanitize event details to prevent log injection
   * @private
   */
  static _sanitizeDetails(details) {
    if (!details || typeof details !== 'object') return {};
    
    const sanitized = {};
    for (const [key, value] of Object.entries(details)) {
      if (typeof value === 'string') {
        // Remove newlines and null bytes
        sanitized[key] = value
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\0/g, '')
          .substring(0, 1000); // Truncate long values
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Mask email for privacy
   * @private
   */
  static _maskEmail(email) {
    if (!email || !email.includes('@')) return 'unknown@unknown.com';
    const [local, domain] = email.split('@');
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    return `${local.substring(0, 2)}***${local.substring(local.length - 1)}@${domain}`;
  }

  /**
   * Mask API key for security
   * @private
   */
  static _maskApiKey(apiKey) {
    if (!apiKey || apiKey.length < 8) return '***';
    return apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4);
  }
}

module.exports = SecurityEventLogger;