const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Complaint Escalation Model - Escalation Rules and History
 * 
 * Tracks complaint escalations through the support hierarchy.
 * Each escalation moves the complaint to a higher authority level.
 * 
 * TABLE: complaint_escalations
 * 
 * ESCALATION LEVELS:
 * 1 - Support Agent (frontline)
 * 2 - Senior Support Agent
 * 3 - Team Lead / Supervisor
 * 4 - Department Manager
 * 5 - Executive / Director
 */

class ComplaintEscalation extends BaseModel {
  static tableName = 'complaint_escalations';
  static primaryKey = 'id';
  static timestamps = false;
  
  static fields = [
    'id', 'complaint_id',
    'from_level', 'to_level',
    'from_team', 'to_team',
    'from_agent', 'to_agent',
    'escalated_by', 'escalated_by_name',
    'reason', 'reason_category',
    'notes', 'is_automatic',
    'escalation_rule_id',
    'metadata', 'tenant_id',
    'created_at',
  ];

  static casts = {
    from_level: 'integer',
    to_level: 'integer',
    is_automatic: 'boolean',
    metadata: 'json',
  };

  static reasonCategories = {
    SLA_BREACH: 'sla_breach',
    COMPLEXITY: 'complexity',
    CUSTOMER_REQUEST: 'customer_request',
    REFUND_REQUIRED: 'refund_required',
    LEGAL_THREAT: 'legal_threat',
    TECHNICAL_ISSUE: 'technical_issue',
    POLICY_DECISION: 'policy_decision',
    OTHER: 'other',
  };

  static levelNames = {
    1: 'Support Agent',
    2: 'Senior Support Agent',
    3: 'Team Lead',
    4: 'Department Manager',
    5: 'Executive',
  };

  /**
   * Escalate a complaint to the next level
   */
  static async escalate(complaintId, fromLevel, toLevel, escalatedBy, reason, options = {}) {
    return this.create({
      complaint_id: complaintId,
      from_level: fromLevel || 0,
      to_level: toLevel,
      from_team: options.fromTeam || null,
      to_team: options.toTeam || null,
      from_agent: options.fromAgent || null,
      to_agent: options.toAgent || null,
      escalated_by: escalatedBy,
      escalated_by_name: options.escalatedByName || null,
      reason: reason,
      reason_category: options.reasonCategory || this.reasonCategories.OTHER,
      notes: options.notes?.substring(0, 1000) || null,
      is_automatic: options.isAutomatic || false,
      escalation_rule_id: options.ruleId || null,
      metadata: options.metadata || {},
      tenant_id: options.tenantId || null,
    });
  }

  /**
   * Find escalation history for a complaint
   */
  static async findByComplaint(complaintId) {
    return this.findAll({
      where: { complaint_id: complaintId },
      orderBy: { created_at: 'ASC' },
    });
  }

  /**
   * Get current escalation level for a complaint
   */
  static async getCurrentLevel(complaintId) {
    const lastEscalation = await this.findOne({
      where: { complaint_id: complaintId },
      orderBy: { created_at: 'DESC' },
    });
    return lastEscalation?.to_level || 0;
  }

  /**
   * Check if complaint can be escalated further
   */
  static async canEscalate(complaintId, maxLevel = 5) {
    const currentLevel = await this.getCurrentLevel(complaintId);
    return currentLevel < maxLevel;
  }

  /**
   * Get escalation statistics
   */
  static async getEscalationStats(options = {}) {
    const text = `
      SELECT
        to_level,
        COUNT(*) as escalation_count,
        COUNT(DISTINCT complaint_id) as unique_complaints,
        reason_category,
        COUNT(*) as category_count
      FROM ${this.tableName}
      ${options.startDate ? 'WHERE created_at >= $1' : ''}
      GROUP BY to_level, reason_category
      ORDER BY to_level ASC, category_count DESC
    `;
    const values = options.startDate ? [options.startDate.toISOString()] : [];
    const result = await connectionPool.query(text, values);
    return result.rows;
  }

  /**
   * Get average time between escalations
   */
  static async getAverageEscalationTime() {
    const text = `
      SELECT
        complaint_id,
        AVG(
          EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (
            PARTITION BY complaint_id ORDER BY created_at
          ))) / 3600
        ) as avg_hours_between_escalations
      FROM ${this.tableName}
      GROUP BY complaint_id
      HAVING COUNT(*) > 1
    `;
    const result = await connectionPool.query(text);
    return result.rows;
  }
}

module.exports = ComplaintEscalation;