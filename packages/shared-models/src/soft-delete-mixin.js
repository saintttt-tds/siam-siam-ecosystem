const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Soft Delete Behavior Mixin
 * 
 * Adds soft delete capability to models. Instead of permanently
 * removing records, sets a deleted_at timestamp. Records are
 * automatically excluded from normal queries unless explicitly
 * included.
 * 
 * Provides:
 * - Soft delete (sets deleted_at)
 * - Restore (clears deleted_at)
 * - Force delete (permanent removal)
 * - Query scopes for trashed records
 * - Automatic filtering of soft-deleted records
 * - Cascade soft delete support
 * 
 * @mixin
 * @example
 *   class User extends BaseModel {
 *     static softDelete = true;
 *     static softDeleteColumn = 'deleted_at';
 *   }
 */

const SoftDeleteMixin = {
  /**
   * Apply soft delete mixin to a model class
   * @param {typeof BaseModel} ModelClass - The model class to extend
   */
  applyTo(ModelClass) {
    // Mark model as soft-deletable
    ModelClass.softDelete = true;
    ModelClass.softDeleteColumn = 'deleted_at';
    
    // Add soft delete fields
    if (!ModelClass.fields.includes('deleted_at')) {
      ModelClass.fields.push('deleted_at');
    }
    if (!ModelClass.fields.includes('deleted_by')) {
      ModelClass.fields.push('deleted_by');
    }
    if (!ModelClass.fields.includes('restored_at')) {
      ModelClass.fields.push('restored_at');
    }

    // Add soft delete methods
    Object.assign(ModelClass, {
      /**
       * Soft delete a record (or multiple records)
       * @param {string|Object} id - Record ID or query criteria
       * @param {Object} options - Delete options
       * @param {string} options.deletedBy - User performing the delete
       * @param {string} options.reason - Reason for deletion
       * @returns {Promise<number>} Number of records affected
       */
      async softDelete(idOrCriteria, options = {}) {
        const data = {
          deleted_at: new Date().toISOString(),
          deleted_by: options.deletedBy || null,
        };

        if (typeof idOrCriteria === 'object') {
          // Bulk soft delete by criteria
          const criteria = idOrCriteria;
          return ModelClass.update(criteria, data);
        } else {
          // Single record soft delete
          const record = await ModelClass.findById(idOrCriteria);
          if (!record) return 0;
          
          record.deleted_at = data.deleted_at;
          record.deleted_by = data.deleted_by;
          await record.save();
          return 1;
        }
      },

      /**
       * Restore a soft-deleted record
       * @param {string} id - Record ID to restore
       * @param {Object} options - Restore options
       * @returns {Promise<Object|null>} Restored record or null
       */
      async restore(id, options = {}) {
        const record = await ModelClass.findById(id, { withTrashed: true });
        if (!record || !record.deleted_at) return null;

        record.deleted_at = null;
        record.deleted_by = null;
        record.restored_at = new Date().toISOString();
        await record.save();

        logger.info('Record restored', {
          table: ModelClass.tableName,
          id,
          restoredBy: options.restoredBy || 'system',
        });

        return record;
      },

      /**
       * Permanently delete a record (bypasses soft delete)
       * @param {string} id - Record ID to permanently delete
       * @returns {Promise<boolean>} True if deleted
       */
      async forceDelete(id) {
        const text = `DELETE FROM ${ModelClass.tableName} WHERE ${ModelClass.primaryKey} = $1`;
        const result = await require('@siamsiam/shared-utils').database.connectionPool.query(text, [id]);
        
        if (result.rowCount > 0) {
          logger.warn('Record permanently deleted', {
            table: ModelClass.tableName,
            id,
          });
        }
        
        return result.rowCount > 0;
      },

      /**
       * Find soft-deleted records
       * @param {Object} criteria - Query criteria
       * @returns {Promise<Array>} Soft-deleted records
       */
      async findTrashed(criteria = {}) {
        return ModelClass.findAll({
          ...criteria,
          withTrashed: true,
          whereNotNull: ['deleted_at'],
        });
      },

      /**
       * Find records including soft-deleted
       * @param {Object} criteria - Query criteria
       * @returns {Promise<Array>} All records including trashed
       */
      async findWithTrashed(criteria = {}) {
        return ModelClass.findAll({
          ...criteria,
          withTrashed: true,
        });
      },

      /**
       * Purge soft-deleted records older than specified days
       * @param {number} olderThanDays - Delete records older than this many days
       * @returns {Promise<number>} Number of records purged
       */
      async purgeDeleted(olderThanDays = 90) {
        const text = `
          DELETE FROM ${ModelClass.tableName}
          WHERE deleted_at IS NOT NULL
            AND deleted_at < NOW() - INTERVAL '${olderThanDays} days'
        `;
        const result = await require('@siamsiam/shared-utils').database.connectionPool.query(text);
        
        if (result.rowCount > 0) {
          logger.info('Purged soft-deleted records', {
            table: ModelClass.tableName,
            count: result.rowCount,
            olderThanDays,
          });
        }
        
        return result.rowCount;
      },

      /**
       * Get count of soft-deleted records
       * @returns {Promise<number>} Count of trashed records
       */
      async getTrashedCount() {
        const text = `
          SELECT COUNT(*) as count
          FROM ${ModelClass.tableName}
          WHERE deleted_at IS NOT NULL
        `;
        const result = await require('@siamsiam/shared-utils').database.connectionPool.query(text);
        return parseInt(result.rows[0].count);
      },
    });
  },
};

module.exports = SoftDeleteMixin;