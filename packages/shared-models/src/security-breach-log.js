const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Security Breach Log Model - Data Breach Documentation
 * 
 * Records and documents security breaches, data incidents,
 * and unauthorized access events for compliance and reporting.
 * Supports GDPR 72-hour breach notification requirements.
 * 
 * TABLE: security_breach_logs
 */

class SecurityBreachLog extends BaseModel {
  static tableName = 'security_breach_logs';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'breach_number', 'breach_type', 'breach_category',
    'severity', 'severity_level', 'status', 'sub_status',
    'title', 'description', 'technical_details',
    'discovered_at', 'discovered_by', 'discovery_method',
    'breach_start_date', 'breach_end_date', 'contained_at',
    'containment_method', 'containment_verified_by',
    'affected_systems', 'affected_data_types',
    'affected_record_count', 'affected_user_count',
    'data_exposed', 'data_exposed_description',
    'attack_vector', 'vulnerability_exploited',
    'vulnerability_cve', 'threat_actor', 'threat_actor_type',
    'impact_assessment', 'impact_level', 'impact_description',
    'financial_impact_estimate', 'reputational_impact',
    'regulatory_impact', 'legal_impact',
    'regulatory_bodies_notified', 'regulatory_notification_date',
    'gdpr_72hr_deadline', 'gdpr_72hr_met', 'gdpr_notification_ref',
    'affected_users_notified', 'user_notification_date',
    'user_notification_method', 'notification_template_used',
    'remediation_plan', 'remediation_status',
    'remediation_completed_at', 'remediation_verified_by',
    'root_cause', 'root_cause_analysis_url',
    'lessons_learned', 'preventive_measures',
    'preventive_measures_implemented', 'implemented_at',
    'police_report_filed', 'police_report_number',
    'insurance_claim_filed', 'insurance_claim_number',
    'insurance_claim_amount', 'insurance_status',
    'legal_counsel_engaged', 'legal_counsel_name',
    'pr_Statement', 'pr_released_at',
    'board_notified', 'board_notified_at',
    'regulator_follow_up_required', 'regulator_follow_up_date',
    'regulator_follow_up_status', 'regulator_findings',
    'post_incident_review_date', 'post_incident_review_findings',
    'reopened', 'reopened_at', 'reopen_reason',
    'closed_at', 'closed_by', 'closure_notes',
    'status_history', 'audit_trail',
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    severity_level: 'integer', affected_record_count: 'integer',
    affected_user_count: 'integer', financial_impact_estimate: 'float',
    insurance_claim_amount: 'float', gdpr_72hr_met: 'boolean',
    affected_users_notified: 'boolean', regulatory_bodies_notified: 'boolean',
    remediation_completed_at: 'datetime', preventive_measures_implemented: 'boolean',
    police_report_filed: 'boolean', insurance_claim_filed: 'boolean',
    legal_counsel_engaged: 'boolean', board_notified: 'boolean',
    regulator_follow_up_required: 'boolean', reopened: 'boolean',
    affected_systems: 'json', affected_data_types: 'json',
    impact_assessment: 'json', remediation_plan: 'json',
    status_history: 'json', audit_trail: 'json',
    metadata: 'json', tags: 'json',
  };

  static relations = {
    securityEvents: { type: 'hasMany', model: 'SecurityEvent', foreignKey: 'breach_id', localKey: 'id' },
  };

  static severities = {
    CRITICAL: { name: 'critical', level: 5, description: 'Large-scale data breach affecting many users' },
    HIGH: { name: 'high', level: 4, description: 'Significant data exposure' },
    MEDIUM: { name: 'medium', level: 3, description: 'Limited data exposure' },
    LOW: { name: 'low', level: 2, description: 'Minor incident' },
    NEGLIGIBLE: { name: 'negligible', level: 1, description: 'No data exposure' },
  };

  static statuses = {
    INVESTIGATING: 'investigating', CONTAINED: 'contained',
    REMEDIATING: 'remediating', REMEDIATED: 'remediated',
    CLOSED: 'closed', REOPENED: 'reopened',
    REPORTED_TO_REGULATOR: 'reported_to_regulator',
  };

  static generateBreachNumber() { return `BRCH-${Date.now().toString(36).toUpperCase()}`; }

  /**
   * Log a security breach
   */
  static async logBreach(breachData) {
    return this.create({
      breach_number: this.generateBreachNumber(),
      breach_type: breachData.breachType,
      breach_category: breachData.breachCategory,
      severity: breachData.severity, severity_level: breachData.severityLevel || 3,
      status: this.statuses.INVESTIGATING, title: breachData.title,
      description: breachData.description?.substring(0, 5000),
      discovered_at: breachData.discoveredAt || new Date().toISOString(),
      discovered_by: breachData.discoveredBy, discovery_method: breachData.discoveryMethod,
      breach_start_date: breachData.breachStartDate,
      affected_systems: breachData.affectedSystems || [],
      affected_data_types: breachData.affectedDataTypes || [],
      affected_record_count: breachData.affectedRecordCount || 0,
      affected_user_count: breachData.affectedUserCount || 0,
      data_exposed: breachData.dataExposed || false,
      attack_vector: breachData.attackVector,
      impact_assessment: breachData.impactAssessment || {},
      gdpr_72hr_deadline: breachData.gdpr72hrDeadline || new Date(Date.now() + 72 * 3600000).toISOString(),
      status_history: [{ status: this.statuses.INVESTIGATING, timestamp: new Date().toISOString() }],
      metadata: breachData.metadata || {}, tenant_id: breachData.tenantId,
    });
  }

  /**
   * Record containment
   */
  static async recordContainment(breachId, method, verifiedBy) {
    return this.update({ id: breachId }, {
      status: this.statuses.CONTAINED, contained_at: new Date().toISOString(),
      containment_method: method, containment_verified_by: verifiedBy,
    });
  }

  /**
   * Record regulatory notification
   */
  static async recordRegulatoryNotification(breachId, ref, within72hr = true) {
    return this.update({ id: breachId }, {
      status: this.statuses.REPORTED_TO_REGULATOR,
      regulatory_bodies_notified: true,
      regulatory_notification_date: new Date().toISOString(),
      gdpr_72hr_met: within72hr, gdpr_notification_ref: ref,
    });
  }
}

module.exports = SecurityBreachLog;