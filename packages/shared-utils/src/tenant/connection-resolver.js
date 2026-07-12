const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * Database Connection Per Tenant
 * 
 * Resolves the appropriate database connection for each tenant
 * in a multi-tenant architecture. Supports:
 * - Database-per-tenant isolation
 * - Connection pooling per tenant
 * - Connection string resolution
 * - Failover handling
 * 
 * @example
 *   const resolver = require('@siamsiam/shared-utils').tenant.connectionResolver;
 *   const connection = resolver.getConnection('tenant_choppies');
 */

class ConnectionResolver {
  constructor() {
    this.connections = new Map(); // tenantId -> connection config
    this.defaultConnection = config.database.primary;
    this.isolationLevel = process.env.TENANT_ISOLATION_LEVEL || 'row_level';
  }

  /**
   * Get database connection for a tenant
   * @param {string} tenantId - Tenant identifier
   * @returns {Object} Database connection configuration
   */
  getConnection(tenantId) {
    // For row-level isolation, use shared database
    if (this.isolationLevel === 'row_level') {
      return this.defaultConnection;
    }

    // For database-per-tenant, resolve specific connection
    if (this.connections.has(tenantId)) {
      return this.connections.get(tenantId);
    }

    // Generate tenant-specific connection
    const tenantConnection = this._buildTenantConnection(tenantId);
    this.connections.set(tenantId, tenantConnection);

    return tenantConnection;
  }

  /**
   * Register a tenant-specific database connection
   * @param {string} tenantId - Tenant identifier
   * @param {Object} connectionConfig - Database connection config
   */
  registerConnection(tenantId, connectionConfig) {
    this.connections.set(tenantId, {
      ...this.defaultConnection,
      ...connectionConfig,
    });
    logger.info('Tenant database connection registered', { tenantId });
  }

  /**
   * Get all active tenant connections
   * @returns {Array} List of tenant connections
   */
  getAllConnections() {
    return Array.from(this.connections.entries()).map(([tenantId, config]) => ({
      tenantId,
      host: config.host,
      database: config.database,
    }));
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Build tenant-specific database connection
   * @private
   */
  _buildTenantConnection(tenantId) {
    const dbName = `siamsiam_tenant_${tenantId}`;
    
    return {
      ...this.defaultConnection,
      database: dbName,
    };
  }
}

// Export singleton instance
module.exports = new ConnectionResolver();