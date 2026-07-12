const logger = require('./logger');
const config = require('@siamsiam/shared-config');

/**
 * Compliance Audit Trail Logger
 * 
 * Specialized logger for audit events required by various compliance frameworks:
 * - PCI-DSS (payment card industry)
 * - GDPR (European data protection)
 * - SOC 2 (service organization controls)
 * - ISO 27001 (information security)
 * - Local financial regulations (RBZ, SARB, etc.)
 * 
 * AUDIT LOG REQUIREMENTS:
 * - Immutable (write-once, append-only)
 * - Include WHO, WHAT, WHEN, WHERE, WHY
 * - Stored separately from application logs
 * - Retained according to policy (typically 7 years)
 * - Signed/encrypted to prevent tampering
 * - Include before/after values for changes
 * 
 * PRODUCTION TODO:
 * - Store audit logs in a separate database
 * - Implement tamper-proof logging (blockchain or signed logs)
 * - Set up automatic archival after retention period
 * - Implement real-time alerting on suspicious audit patterns
 * 
 * @example
 *   AuditLogger.log({
 *     userId: 'user_123',
 *     action: 'payment.refund',
 *     resourceType: 'transaction',
 *     resourceId: 'txn_456',
 *     changes: { amount: 100, currency: 'USD' },
 *     status: 'success',
 *   });
 */

class AuditLogger {
  /**
   * Log an audit event
   * @param {Object} event - Audit event
   */
  static log(event) {
    if (!event.action) {
      throw new Error('Audit event must include an action');
    }

    const auditEntry = {
      // Audit metadata
      type: 'AUDIT',
      eventId: event.eventId || this._generateEventId(),
      timestamp: new Date().toISOString(),
      correlationId: event.correlationId || null,
      
      // WHO performed the action
      actor: {
        id: event.userId || 'system',
        type: event.userType || 'system', // admin, user, system, api, merchant
        name: event.userName || null,
        email: event.userEmail || null,
        ip: event.ipAddress || null,
        userAgent: event.userAgent || null,
        sessionId: event.sessionId || null,
        role: event.userRole || null,
      },
      
      // WHAT action was performed
      action: event.action,
      category: event.category || this._categorizeAction(event.action),
      description: event.description || null,
      
      // ON WHAT resource
      resource: {
        type: event.resourceType || 'unknown',
        id: event.resourceId || null,
        name: event.resourceName || null,
      },
      
      // WHERE (geographic context)
      location: {
        country: event.country || null,
        region: event.region || null,
        service: process.env.SERVICE_NAME || 'unknown',
        environment: config.env,
      },
      
      // WHEN (additional timing context)
      timing: {
        timestamp: new Date().toISOString(),
        unixMs: Date.now(),
      },
      
      // WHY (reason for the action)
      reason: event.reason || null,
      
      // WHAT changed
      changes: event.changes ? {
        before: event.changes.before || null,
        after: event.changes.after || null,
        delta: event.changes.delta || null,
      } : null,
      
      // RESULT of the action
      result: {
        status: event.status || 'success',
        errorCode: event.errorCode || null,
        errorMessage: event.errorMessage || null,
        durationMs: event.durationMs || null,
      },
      
      // COMPLIANCE flags
      compliance: {
        gdprRelevant: event.gdprRelevant || false,
        pciRelevant: event.pciRelevant || false,
        soxRelevant: event.soxRelevant || false,
        dataCategories: event.dataCategories || [],
        retentionYears: event.retentionYears || 7,
      },
      
      // Additional context
      metadata: event.metadata || {},
    };
    
    // Log with a special marker for easy filtering
    logger.info('AUDIT', auditEntry);
    
    // PRODUCTION TODO: Write to separate audit database
    // await AuditDatabase.insert(auditEntry);
    
    // PRODUCTION TODO: Sign audit entry for tamper-proofing
    // auditEntry.signature = signAuditEntry(auditEntry);
    
    return auditEntry.eventId;
  }

  // ==================== CONVENIENCE METHODS ====================

  /**
   * Authentication events
   */
  static logAuth(userId, action, ipAddress, status, metadata = {}) {
    return this.log({
      userId,
      userType: 'user',
      action: `auth.${action}`, // auth.login, auth.logout, auth.mfa_verified
      category: 'authentication',
      resourceType: 'session',
      resourceId: userId,
      ipAddress,
      status,
      ...metadata,
    });
  }

  /**
   * Admin action logging
   */
  static logAdminAction(adminId, action, resourceType, resourceId, changes = null) {
    return this.log({
      userId: adminId,
      userType: 'admin',
      action: `admin.${action}`,
      category: 'admin_action',
      resourceType,
      resourceId,
      changes,
      status: 'success',
    });
  }

  /**
   * Payment events (PCI-DSS relevant)
   */
  static logPayment(transactionId, action, amount, currency, status, metadata = {}) {
    return this.log({
      userId: metadata.userId || 'system',
      userType: 'system',
      action: `payment.${action}`,
      category: 'payment',
      resourceType: 'transaction',
      resourceId: transactionId,
      changes: { amount, currency },
      status,
      pciRelevant: true,
      ...metadata,
    });
  }

  /**
   * Data access events (GDPR relevant)
   */
  static logDataAccess(userId, resourceType, resourceId, action, metadata = {}) {
    return this.log({
      userId,
      userType: 'admin',
      action: `data.${action}`, // data.view, data.export, data.delete
      category: 'data_management',
      resourceType,
      resourceId,
      gdprRelevant: true,
      ...metadata,
    });
  }

  /**
   * Data modification events
   */
  static logDataChange(userId, resourceType, resourceId, changes, reason = null) {
    return this.log({
      userId,
      userType: 'user',
      action: `${resourceType}.updated`,
      category: 'data_modification',
      resourceType,
      resourceId,
      changes,
      reason,
      status: 'success',
    });
  }

  /**
   * Security events
   */
  static logSecurity(eventType, details, severity = 'medium', metadata = {}) {
    return this.log({
      userId: 'system',
      userType: 'system',
      action: `security.${eventType}`,
      category: 'security',
      resourceType: 'security_event',
      resourceId: `sec_${Date.now()}`,
      status: severity === 'critical' ? 'failure' : 'success',
      metadata: { ...details, severity },
      ...metadata,
    });
  }

  /**
   * API key operations
   */
  static logApiKeyOperation(userId, applicationId, action, metadata = {}) {
    return this.log({
      userId,
      userType: 'developer',
      action: `api_key.${action}`,
      category: 'api_management',
      resourceType: 'api_key',
      resourceId: applicationId,
      ...metadata,
    });
  }

  /**
   * Configuration changes
   */
  static logConfigChange(adminId, configKey, oldValue, newValue, reason) {
    return this.log({
      userId: adminId,
      userType: 'admin',
      action: 'config.updated',
      category: 'configuration',
      resourceType: 'config',
      resourceId: configKey,
      changes: { before: oldValue, after: newValue },
      reason,
      status: 'success',
    });
  }

  // ==================== PRIVATE HELPERS ====================

  /**
   * Generate a unique event ID
   * @private
   */
  static _generateEventId() {
    const crypto = require('crypto');
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    return `audit_${timestamp}_${random}`;
  }

  /**
   * Categorize action automatically
   * @private
   */
  static _categorizeAction(action) {
    const categories = {
      'auth': 'authentication',
      'login': 'authentication',
      'payment': 'payment',
      'refund': 'payment',
      'order': 'commerce',
      'delivery': 'logistics',
      'user': 'user_management',
      'admin': 'admin_action',
      'config': 'configuration',
      'data': 'data_management',
      'security': 'security',
      'api': 'api_management',
    };

    for (const [key, category] of Object.entries(categories)) {
      if (action.includes(key)) return category;
    }

    return 'general';
  }
}

module.exports = AuditLogger;