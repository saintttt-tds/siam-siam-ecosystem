const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Security Event Model - Security Incident Record
 * 
 * Comprehensive security event logging for all security-related
 * activities including authentication attempts, access violations,
 * suspicious behavior, and system security events.
 * 
 * TABLE: security_events
 */

class SecurityEvent extends BaseModel {
  static tableName = 'security_events';
  static primaryKey = 'id';
  static timestamps = false;
  
  static fields = [
    'id', 'event_id', 'breach_id',
    'event_type', 'event_subtype', 'event_category',
    'severity', 'severity_level', 'risk_score',
    'status', 'resolution_status',
    'title', 'description', 'technical_details',
    'source_ip', 'source_port', 'source_country',
    'source_city', 'source_isp', 'source_organization',
    'source_latitude', 'source_longitude',
    'destination_ip', 'destination_port',
    'target_resource', 'target_resource_type',
    'target_resource_id', 'target_user_id',
    'actor_id', 'actor_type', 'actor_name',
    'actor_email', 'actor_role',
    'user_id', 'user_email', 'user_name',
    'session_id', 'device_id', 'device_fingerprint',
    'user_agent', 'request_method', 'request_path',
    'request_headers', 'request_body_summary',
    'response_status', 'response_time_ms',
    'authentication_method', 'authentication_success',
    'mfa_used', 'mfa_method', 'mfa_success',
    'geo_location', 'geo_anomaly', 'geo_anomaly_score',
    'time_anomaly', 'time_anomaly_score',
    'behavior_anomaly', 'behavior_anomaly_score',
    'velocity_anomaly', 'velocity_anomaly_details',
    'fraud_detected', 'fraud_score', 'fraud_details',
    'threat_indicator', 'threat_type', 'threat_source',
    'attack_pattern', 'attack_pattern_confidence',
    'mitre_tactic', 'mitre_technique', 'mitre_sub_technique',
    'vulnerability_id', 'vulnerability_cve',
    'blocked', 'block_reason', 'blocked_by',
    'allowed', 'allow_reason',
    'is_false_positive', 'false_positive_reason',
    'investigation_needed', 'investigation_priority',
    'investigation_assigned_to', 'investigation_status',
    'investigation_notes', 'investigation_conclusion',
    'investigation_closed_at', 'investigation_closed_by',
    'notification_sent', 'notification_channels',
    'notification_recipients', 'notification_sent_at',
    'alert_triggered', 'alert_sent_to', 'alert_sent_at',
    'remediation_action', 'remediation_status',
    'remediation_completed_at', 'remediation_by',
    'correlation_id', 'correlation_group',
    'related_event_ids', 'parent_event_id',
    'event_count_24h', 'event_count_7d',
    'first_seen_at', 'last_seen_at', 'occurrence_count',
    'raw_event_data', 'normalized_event_data',
    'compliance_relevant', 'compliance_frameworks',
    'retention_days', 'retention_expires_at',
    'metadata', 'tags', 'notes',
    'tenant_id', 'created_at',
  ];

  static casts = {
    severity_level: 'integer', risk_score: 'float',
    source_latitude: 'float', source_longitude: 'float',
    response_time_ms: 'integer', geo_anomaly_score: 'float',
    time_anomaly_score: 'float', behavior_anomaly_score: 'float',
    fraud_score: 'float', attack_pattern_confidence: 'float',
    event_count_24h: 'integer', event_count_7d: 'integer',
    occurrence_count: 'integer', retention_days: 'integer',
    authentication_success: 'boolean', mfa_used: 'boolean',
    mfa_success: 'boolean', geo_anomaly: 'boolean',
    time_anomaly: 'boolean', behavior_anomaly: 'boolean',
    velocity_anomaly: 'boolean', fraud_detected: 'boolean',
    blocked: 'boolean', allowed: 'boolean',
    is_false_positive: 'boolean', investigation_needed: 'boolean',
    notification_sent: 'boolean', alert_triggered: 'boolean',
    compliance_relevant: 'boolean',
    request_headers: 'json', geo_location: 'json',
    velocity_anomaly_details: 'json', fraud_details: 'json',
    raw_event_data: 'json', normalized_event_data: 'json',
    related_event_ids: 'json', notification_channels: 'json',
    notification_recipients: 'json', compliance_frameworks: 'json',
    metadata: 'json', tags: 'json',
  };

  static relations = {
    breach: { type: 'belongsTo', model: 'SecurityBreachLog', foreignKey: 'breach_id', ownerKey: 'id' },
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
  };

  static eventTypes = {
    AUTHENTICATION: 'authentication', AUTHORIZATION: 'authorization',
    ACCESS_CONTROL: 'access_control', DATA_ACCESS: 'data_access',
    DATA_MODIFICATION: 'data_modification', DATA_EXPORT: 'data_export',
    API_REQUEST: 'api_request', RATE_LIMIT: 'rate_limit',
    BRUTE_FORCE: 'brute_force', SQL_INJECTION: 'sql_injection',
    XSS_ATTACK: 'xss_attack', CSRF_ATTACK: 'csrf_attack',
    DDOS_ATTACK: 'ddos_attack', MALWARE_DETECTED: 'malware_detected',
    INTRUSION: 'intrusion', RECONNAISSANCE: 'reconnaissance',
    PRIVILEGE_ESCALATION: 'privilege_escalation',
    POLICY_VIOLATION: 'policy_violation', CONFIG_CHANGE: 'config_change',
    CERTIFICATE_EXPIRY: 'certificate_expiry', SYSTEM_ERROR: 'system_error',
    ANOMALY_DETECTED: 'anomaly_detected', FRAUD_ATTEMPT: 'fraud_attempt',
    ACCOUNT_LOCKOUT: 'account_lockout', PASSWORD_CHANGE: 'password_change',
    MFA_EVENT: 'mfa_event', SESSION_EVENT: 'session_event',
    IP_BLOCKED: 'ip_blocked', IP_UNBLOCKED: 'ip_unblocked',
    GEO_ANOMALY: 'geo_anomaly', IMPOSSIBLE_TRAVEL: 'impossible_travel',
  };

  static severities = {
    CRITICAL: { name: 'critical', level: 5 },
    HIGH: { name: 'high', level: 4 },
    MEDIUM: { name: 'medium', level: 3 },
    LOW: { name: 'low', level: 2 },
    INFO: { name: 'info', level: 1 },
  };

  static generateEventId() {
    return `sec-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Log a security event
   */
  static async log(eventData) {
    const eventId = this.generateEventId();
    const now = new Date().toISOString();

    // Check for correlation with previous events
    let eventCount24h = 0;
    let eventCount7d = 0;
    if (eventData.userId || eventData.sourceIp) {
      const criteria = {};
      if (eventData.userId) criteria.user_id = eventData.userId;
      if (eventData.sourceIp) criteria.source_ip = eventData.sourceIp;
      
      eventCount24h = await this.count({
        where: { ...criteria, created_at: { operator: '>=', value: new Date(Date.now() - 86400000).toISOString() } },
      });
      eventCount7d = await this.count({
        where: { ...criteria, created_at: { operator: '>=', value: new Date(Date.now() - 604800000).toISOString() } },
      });
    }

    return this.create({
      event_id: eventId, breach_id: eventData.breachId,
      event_type: eventData.eventType, event_subtype: eventData.eventSubtype,
      event_category: eventData.eventCategory,
      severity: eventData.severity || this.severities.MEDIUM.name,
      severity_level: eventData.severityLevel || 3,
      risk_score: eventData.riskScore || 0,
      status: 'open', title: eventData.title?.substring(0, 500),
      description: eventData.description?.substring(0, 2000),
      technical_details: eventData.technicalDetails?.substring(0, 2000),
      source_ip: eventData.sourceIp, source_country: eventData.sourceCountry,
      source_city: eventData.sourceCity, source_isp: eventData.sourceIsp,
      source_latitude: eventData.sourceLatitude,
      source_longitude: eventData.sourceLongitude,
      target_resource: eventData.targetResource,
      target_resource_type: eventData.targetResourceType,
      target_resource_id: eventData.targetResourceId,
      target_user_id: eventData.targetUserId,
      actor_id: eventData.actorId, actor_type: eventData.actorType,
      actor_name: eventData.actorName, actor_email: eventData.actorEmail,
      user_id: eventData.userId, user_email: eventData.userEmail,
      session_id: eventData.sessionId, device_id: eventData.deviceId,
      device_fingerprint: eventData.deviceFingerprint,
      user_agent: eventData.userAgent?.substring(0, 500),
      request_method: eventData.requestMethod,
      request_path: eventData.requestPath?.substring(0, 500),
      request_headers: eventData.requestHeaders,
      authentication_method: eventData.authenticationMethod,
      authentication_success: eventData.authenticationSuccess,
      mfa_used: eventData.mfaUsed, mfa_method: eventData.mfaMethod,
      mfa_success: eventData.mfaSuccess,
      geo_anomaly: eventData.geoAnomaly || false,
      geo_anomaly_score: eventData.geoAnomalyScore,
      time_anomaly: eventData.timeAnomaly || false,
      behavior_anomaly: eventData.behaviorAnomaly || false,
      fraud_detected: eventData.fraudDetected || false,
      fraud_score: eventData.fraudScore, fraud_details: eventData.fraudDetails,
      threat_indicator: eventData.threatIndicator,
      threat_type: eventData.threatType,
      attack_pattern: eventData.attackPattern,
      mitre_tactic: eventData.mitreTactic,
      mitre_technique: eventData.mitreTechnique,
      blocked: eventData.blocked || false, block_reason: eventData.blockReason,
      allowed: eventData.allowed !== false,
      investigation_needed: eventData.investigationNeeded || false,
      notification_sent: false, alert_triggered: false,
      correlation_id: eventData.correlationId,
      correlation_group: eventData.correlationGroup,
      event_count_24h: eventCount24h, event_count_7d: eventCount7d,
      first_seen_at: eventData.firstSeenAt || now,
      last_seen_at: now, occurrence_count: 1,
      compliance_relevant: eventData.complianceRelevant || false,
      compliance_frameworks: eventData.complianceFrameworks || [],
      retention_days: eventData.retentionDays || 365,
      retention_expires_at: new Date(Date.now() + (eventData.retentionDays || 365) * 86400000).toISOString(),
      metadata: eventData.metadata || {}, tags: eventData.tags || [],
      tenant_id: eventData.tenantId,
    });
  }

  /**
   * Find events by user
   */
  static async findByUser(userId, options = {}) {
    return this.paginate({
      where: { user_id: userId },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Find events by IP address
   */
  static async findByIP(ipAddress, options = {}) {
    return this.paginate({
      where: { source_ip: ipAddress },
      orderBy: { created_at: 'DESC' },
      ...options,
    });
  }

  /**
   * Find events by type and severity
   */
  static async findByTypeAndSeverity(eventType, severity, options = {}) {
    return this.findAll({
      where: { event_type: eventType, severity, ...options.where },
      orderBy: { created_at: 'DESC' },
      limit: options.limit || 100,
    });
  }

  /**
   * Get security event statistics
   */
  static async getStats(startDate = null, endDate = null) {
    const text = `
      SELECT
        event_type, severity,
        COUNT(*) as event_count,
        COUNT(DISTINCT source_ip) as unique_ips,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(CASE WHEN blocked = true THEN 1 END) as blocked_count,
        COUNT(CASE WHEN fraud_detected = true THEN 1 END) as fraud_count,
        AVG(risk_score) as avg_risk_score
      FROM ${this.tableName}
      WHERE 1=1
        ${startDate ? 'AND created_at >= $1' : ''}
        ${endDate ? `AND created_at <= $${startDate ? 2 : 1}` : ''}
      GROUP BY event_type, severity
      ORDER BY event_count DESC
    `;
    const values = [];
    if (startDate) values.push(startDate);
    if (endDate) values.push(endDate);
    const result = await connectionPool.query(text, values.length > 0 ? values : undefined);
    return result.rows;
  }

  /**
   * Mark event as investigated
   */
  static async markInvestigated(eventId, conclusion, investigatedBy) {
    return this.update({ id: eventId }, {
      status: 'closed', resolution_status: 'investigated',
      investigation_status: 'completed',
      investigation_conclusion: conclusion?.substring(0, 2000),
      investigation_closed_at: new Date().toISOString(),
      investigation_closed_by: investigatedBy,
    });
  }
}

module.exports = SecurityEvent;