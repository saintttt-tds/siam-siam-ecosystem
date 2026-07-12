const { connectionPool } = require('@siamsiam/shared-utils').database;
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Audit Trail Mixin
 * 
 * Adds automatic audit logging to model operations.
 * Tracks who made changes, what changed, and when.
 * 
 * AUDIT ACTIONS:
 * - created: Record created
 * - updated: Record modified (tracks before/after)
 * - deleted: Record deleted
 * - restored: Record restored from soft delete
 * - viewed: Record accessed (configurable)
 * 
 * @example
 *   class User extends BaseModel {
 *     // Apply audit mixin
 *   }
 *   Object.assign(User, AuditMixin);
 */

const AuditMixin = {
  auditEnabled: true,
  auditTable: 'admin_audit_log',

  /**
   * Log an audit event
   * @param {string} action - Action performed
   * @param {string} recordId - Record identifier
   * @param {Object} changes - Changes made
   * @param {string} userId - User who performed action
   */
  async logAudit(action, recordId, changes = null, userId = null) {
    if (!this.auditEnabled) return;

    const auditEntry = {
      table_name: this.tableName,
      record_id: String(recordId),
      action,
      changes: changes ? JSON.stringify(changes) : null,
      performed_by: userId || 'system',
      performed_at: new Date().toISOString(),
      ip_address: null,
      user_agent: null,
    };

    const columns = Object.keys(auditEntry);
    const values = Object.values(auditEntry);
    const placeholders = values.map((_, i) => `$${i + 1}`);

    const text = `
      INSERT INTO ${this.auditTable} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
    `;

    try {
      await connectionPool.query(text, values);
    } catch (error) {
      logger.error('Failed to write audit log', {
        table: this.tableName,
        action,
        error: error.message,
      });
    }
  },

  /**
   * Create record with audit
   */
  async createWithAudit(data, userId = null) {
    const record = await this.create(data);
    await this.logAudit('created', record[this.primaryKey], { after: data }, userId);
    return record;
  },

  /**
   * Update record with audit
   */
  async updateWithAudit(id, data, userId = null) {
    const before = await this.findById(id);
    const record = await this.update(id, data);
    
    if (record) {
      const changes = this._diffChanges(before, record);
      await this.logAudit('updated', id, changes, userId);
    }
    
    return record;
  },

  /**
   * Diff before and after states
   * @private
   */
  _diffChanges(before, after) {
    if (!before || !after) return null;

    const changes = {};
    
    for (const key of Object.keys(after)) {
      if (key === 'updated_at') continue;
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changes[key] = {
          from: before[key],
          to: after[key],
        };
      }
    }

    return Object.keys(changes).length > 0 ? changes : null;
  },
};

module.exports = AuditMixin;