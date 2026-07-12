/**
 * Structured Logging Helpers for ELK Stack
 * 
 * Provides consistent log entry structures for different event types,
 * making it easy to parse and query logs in Elasticsearch/Kibana.
 * 
 * All methods return standardized objects that can be passed as
 * metadata to the logger, ensuring consistent field names and types
 * across the entire ecosystem.
 * 
 * QUERY EXAMPLES IN KIBANA:
 *   type: "API_REQUEST" AND statusCode: [400 TO 599]
 *   type: "DB_QUERY" AND duration: >1000
 *   type: "EXTERNAL_API" AND service: "stripe"
 *   type: "BUSINESS_EVENT" AND event: "order.completed"
 * 
 * @example
 *   logger.info('API Request completed', StructuredLogger.logRequest(req, res, duration));
 *   logger.debug('Database query executed', StructuredLogger.logQuery(sql, params, duration));
 */

class StructuredLogger {
  /**
   * Log an API request/response cycle
   */
  static logRequest(req, res, duration) {
    return {
      type: 'API_REQUEST',
      request: {
        id: req.id || null,
        method: req.method,
        url: req.originalUrl,
        path: req.path,
        query: Object.keys(req.query || {}).length > 0 ? req.query : undefined,
        headers: {
          contentType: req.get('content-type'),
          userAgent: req.get('user-agent'),
          acceptLanguage: req.get('accept-language'),
          xForwardedFor: req.get('x-forwarded-for'),
        },
        bodySize: req.headers['content-length'] ? parseInt(req.headers['content-length']) : 0,
      },
      response: {
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        bodySize: res.get('content-length') ? parseInt(res.get('content-length')) : 0,
      },
      performance: {
        durationMs: duration,
        durationSeconds: (duration / 1000).toFixed(3),
      },
      client: {
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent')?.substring(0, 200),
      },
      auth: {
        userId: req.user?.id || null,
        userType: req.user?.type || null,
        authenticated: !!req.user,
        tenantId: req.headers['x-tenant-id'] || null,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log a database query execution
   */
  static logQuery(query, params, duration, rowsAffected) {
    return {
      type: 'DB_QUERY',
      query: {
        text: query.substring(0, 500), // Truncate long queries
        hash: this._hashQuery(query), // For grouping similar queries
        type: this._categorizeQuery(query),
        paramCount: params?.length || 0,
      },
      performance: {
        durationMs: duration,
        rowsAffected: rowsAffected || 0,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log an external API call (payment gateway, SMS provider, etc.)
   */
  static logExternalCall(service, endpoint, method, duration, statusCode, success) {
    return {
      type: 'EXTERNAL_API',
      service: service,
      request: {
        method: method || 'POST',
        endpoint: endpoint,
      },
      response: {
        statusCode: statusCode,
        success: success,
      },
      performance: {
        durationMs: duration,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log a message queue event
   */
  static logMessageEvent(exchange, routingKey, action, messageId) {
    return {
      type: 'MESSAGE_QUEUE',
      queue: {
        exchange: exchange,
        routingKey: routingKey,
        action: action, // published, consumed, acked, nacked, dead_lettered
        messageId: messageId,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log a cache operation (Redis)
   */
  static logCacheOperation(operation, keyPattern, hit, duration) {
    return {
      type: 'CACHE',
      operation: {
        type: operation, // get, set, delete, exists
        keyPattern: keyPattern.substring(0, 100), // Group similar keys
        hit: hit,
      },
      performance: {
        durationMs: duration || 0,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log a business event (order placed, payment completed, etc.)
   */
  static logBusinessEvent(event, data, userId = null) {
    return {
      type: 'BUSINESS_EVENT',
      event: {
        name: event,
        category: this._categorizeBusinessEvent(event),
      },
      data: data ? JSON.stringify(data).substring(0, 2000) : null, // Limit size
      actor: {
        userId: userId,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log a user action
   */
  static logUserAction(userId, action, resource, details = null) {
    return {
      type: 'USER_ACTION',
      user: {
        id: userId,
      },
      action: action,
      resource: resource,
      details: details,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log a system event
   */
  static logSystemEvent(component, event, details = null) {
    return {
      type: 'SYSTEM_EVENT',
      component: component,
      event: event,
      details: details,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log a performance metric
   */
  static logPerformanceMetric(metric, value, unit, tags = {}) {
    return {
      type: 'PERFORMANCE_METRIC',
      metric: {
        name: metric,
        value: value,
        unit: unit,
        tags: tags,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log an error with context
   */
  static logError(error, context = {}) {
    return {
      type: 'ERROR',
      error: {
        name: error.name,
        message: error.message,
        code: error.code || null,
        stack: error.stack?.substring(0, 2000),
        isOperational: error.isOperational || false,
      },
      context: context,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log a security event (structured for SIEM)
   */
  static logSecurityEvent(eventType, severity, details = {}) {
    return {
      type: 'SECURITY',
      event: {
        type: eventType,
        severity: severity,
        details: details,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log a compliance event
   */
  static logComplianceEvent(regulation, action, details = {}) {
    return {
      type: 'COMPLIANCE',
      compliance: {
        regulation: regulation, // GDPR, PCI-DSS, SOX, etc.
        action: action,
        details: details,
      },
      timestamp: new Date().toISOString(),
    };
  }

  // ==================== PRIVATE HELPERS ====================

  /**
   * Hash query for grouping similar queries in analytics
   * @private
   */
  static _hashQuery(query) {
    const crypto = require('crypto');
    // Normalize query: collapse whitespace, remove literals
    const normalized = query
      .replace(/\s+/g, ' ')
      .replace(/'[^']*'/g, '?')
      .replace(/\$\d+/g, '?')
      .trim();
    return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 8);
  }

  /**
   * Categorize SQL query type
   * @private
   */
  static _categorizeQuery(query) {
    const trimmed = query.trim().toUpperCase();
    if (trimmed.startsWith('SELECT')) return 'SELECT';
    if (trimmed.startsWith('INSERT')) return 'INSERT';
    if (trimmed.startsWith('UPDATE')) return 'UPDATE';
    if (trimmed.startsWith('DELETE')) return 'DELETE';
    if (trimmed.startsWith('CREATE')) return 'DDL';
    if (trimmed.startsWith('ALTER')) return 'DDL';
    if (trimmed.startsWith('DROP')) return 'DDL';
    if (trimmed.startsWith('BEGIN')) return 'TRANSACTION';
    if (trimmed.startsWith('COMMIT')) return 'TRANSACTION';
    if (trimmed.startsWith('ROLLBACK')) return 'TRANSACTION';
    return 'OTHER';
  }

  /**
   * Categorize business event
   * @private
   */
  static _categorizeBusinessEvent(event) {
    const categories = {
      'order': 'commerce',
      'payment': 'payment',
      'refund': 'payment',
      'delivery': 'logistics',
      'user': 'account',
      'auth': 'authentication',
      'notification': 'communication',
      'complaint': 'support',
      'review': 'commerce',
      'referral': 'marketing',
    };

    for (const [key, category] of Object.entries(categories)) {
      if (event.includes(key)) return category;
    }

    return 'general';
  }
}

module.exports = StructuredLogger;