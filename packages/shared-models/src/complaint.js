const BaseModel = require('./base-model');

/**
 * Complaint Model
 * 
 * Customer complaint ticket system.
 * Tracks issues, resolutions, and escalations.
 * 
 * TABLE: complaints
 * 
 * FIELDS:
 * - id: UUID primary key
 * - user_id: Complainant user ID
 * - order_id: Related order (optional)
 * - type: Complaint type
 * - priority: Priority level
 * - status: Current status
 * - subject: Brief subject
 * - description: Detailed description
 * - assigned_to: Admin/staff assigned
 * - resolved_at: Resolution timestamp
 * - resolution: Resolution notes
 * - satisfaction_rating: User satisfaction (1-5)
 */

class Complaint extends BaseModel {
  static tableName = 'complaints';
  static fields = [
    'id', 'user_id', 'order_id', 'type', 'priority',
    'status', 'subject', 'description', 'assigned_to',
    'resolved_at', 'resolution', 'satisfaction_rating',
    'attachments', 'escalation_level',
    'tenant_id', 'created_at', 'updated_at',
  ];

  static types = {
    ORDER_ISSUE: 'order_issue',
    PAYMENT_ISSUE: 'payment_issue',
    DELIVERY_ISSUE: 'delivery_issue',
    PRODUCT_QUALITY: 'product_quality',
    REFUND_REQUEST: 'refund_request',
    ACCOUNT_ISSUE: 'account_issue',
    TECHNICAL: 'technical',
    OTHER: 'other',
  };

  static priorities = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent',
  };

  static statuses = {
    OPEN: 'open',
    IN_PROGRESS: 'in_progress',
    WAITING_CUSTOMER: 'waiting_customer',
    WAITING_THIRD_PARTY: 'waiting_third_party',
    RESOLVED: 'resolved',
    CLOSED: 'closed',
    ESCALATED: 'escalated',
  };

  /**
   * Find complaints by user
   * @param {string} userId - User ID
   */
  static async findByUser(userId) {
    return this.findAll({
      where: { user_id: userId },
      orderBy: { created_at: 'DESC' },
    });
  }

  /**
   * Find complaints assigned to staff
   * @param {string} staffId - Staff ID
   */
  static async findAssigned(staffId) {
    return this.findAll({
      where: { assigned_to: staffId },
      orderBy: { priority: 'ASC', created_at: 'ASC' },
    });
  }

  /**
   * Get complaint statistics
   */
  static async getStats() {
    const text = `
      SELECT
        status,
        COUNT(*) as count
      FROM ${this.tableName}
      GROUP BY status
    `;
    const result = await require('@siamsiam/shared-utils').database.connectionPool.query(text);
    return result.rows;
  }
}

module.exports = Complaint              ;