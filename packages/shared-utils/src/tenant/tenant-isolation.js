const logger = require('../logging/logger');

/**
 * Data Isolation Per Tenant
 * 
 * Ensures strict data isolation between tenants:
 * - Query scoping (WHERE tenant_id = ?)
 * - Data access enforcement
 * - Cross-tenant access prevention
 * - Tenant-specific data filtering
 * 
 * ISOLATION LEVELS:
 * - Database per tenant: Separate database for each tenant
 * - Schema per tenant: Separate schema within shared database
 * - Row-level: tenant_id column with row-level security
 * 
 * @example
 *   const isolation = require('@siamsiam/shared-utils').tenant.tenantIsolation;
 *   
 *   // Add tenant filter to query
 *   const query = isolation.addTenantFilter(
 *     'SELECT * FROM orders WHERE status = $1',
 *     'tenant_123'
 *   );
 *   // Result: 'SELECT * FROM orders WHERE status = $1 AND tenant_id = $2'
 */

class TenantIsolation {
  constructor() {
    this.isolationLevel = process.env.TENANT_ISOLATION_LEVEL || 'row_level';
    this.tenantColumn = 'tenant_id';
    
    // Tables excluded from tenant isolation (global tables)
    this.globalTables = new Set([
      'countries', 'currencies', 'exchange_rates',
      'migrations', 'feature_flags', 'global_config',
      'admin_users', 'audit_logs',
    ]);
  }

  /**
   * Add tenant filter to a SQL query
   * @param {string} query - Original SQL query
   * @param {string} tenantId - Tenant identifier
   * @param {Object} options - Options
   * @returns {Object} Modified query with tenant filter
   */
  addTenantFilter(query, tenantId, options = {}) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for data isolation');
    }

    const {
      tableName = null,
      tableAlias = null,
      paramOffset = 0,
    } = options;

    // Check if table is global (no tenant filter)
    if (tableName && this.globalTables.has(tableName)) {
      return { text: query, values: [] };
    }

    // Build tenant filter
    const column = tableAlias 
      ? `${tableAlias}.${this.tenantColumn}`
      : this.tenantColumn;

    const newParamIndex = paramOffset + 1;
    const tenantFilter = ` AND ${column} = $${newParamIndex}`;

    // Add WHERE clause or extend existing WHERE
    let modifiedQuery;
    if (query.toUpperCase().includes('WHERE')) {
      modifiedQuery = query.replace(/WHERE/i, `WHERE ${column} = $${newParamIndex} AND `);
    } else if (query.toUpperCase().includes('GROUP BY') || 
               query.toUpperCase().includes('ORDER BY') ||
               query.toUpperCase().includes('LIMIT')) {
      // Add WHERE before GROUP BY/ORDER BY/LIMIT
      modifiedQuery = query.replace(
        /(GROUP BY|ORDER BY|LIMIT)/i,
        `WHERE ${column} = $${newParamIndex} $1`
      );
    } else {
      modifiedQuery = `${query} WHERE ${column} = $${newParamIndex}`;
    }

    return {
      text: modifiedQuery,
      values: [tenantId],
    };
  }

  /**
   * Validate that a resource belongs to the current tenant
   * @param {Object} resource - Resource to validate
   * @param {string} tenantId - Current tenant ID
   * @returns {boolean} True if resource belongs to tenant
   */
  validateOwnership(resource, tenantId) {
    if (!resource) return false;
    if (!tenantId) return false;
    
    return resource[this.tenantColumn] === tenantId;
  }

  /**
   * Get tenant-scoped cache key
   * @param {string} key - Original cache key
   * @param {string} tenantId - Tenant identifier
   * @returns {string} Tenant-scoped cache key
   */
  getTenantCacheKey(key, tenantId) {
    return `tenant:${tenantId}:${key}`;
  }

  /**
   * Check if cross-tenant access is allowed for a resource
   * @param {string} resourceType - Type of resource
   * @returns {boolean} True if cross-tenant access allowed
   */
  isCrossTenantAccessAllowed(resourceType) {
    return this.globalTables.has(resourceType);
  }
}

// Export singleton instance
module.exports = new TenantIsolation();