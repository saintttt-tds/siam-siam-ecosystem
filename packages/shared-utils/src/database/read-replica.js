const config = require('@siamsiam/shared-config');
const connectionPool = require('./connection-pool');
const logger = require('../logging/logger');

/**
 * Read/Write Splitting for Database Replicas
 * 
 * Manages routing of database queries to appropriate instances:
 * - WRITE operations (INSERT, UPDATE, DELETE) -> Primary database
 * - READ operations (SELECT) -> Read replicas (if available)
 * 
 * BENEFITS:
 * - Distributes read load across replicas
 * - Improves query performance
 * - Provides high availability
 * - Enables horizontal scaling
 * 
 * PRODUCTION CONSIDERATIONS:
 * - Replication lag: replicas may have slight delays
 * - Use for queries that can tolerate eventual consistency
 * - Critical reads (e.g., auth) should use primary
 * - Monitor replication lag in production
 * - Implement automatic failover if replica is unavailable
 * 
 * @example
 *   // Read from replica (for non-critical data)
 *   const users = await readReplica.query('SELECT * FROM users WHERE active = $1', [true]);
 *   
 *   // Force read from primary (for critical/real-time data)
 *   const balance = await readReplica.query('SELECT balance FROM wallets WHERE user_id = $1', [userId], { forcePrimary: true });
 */

class ReadReplicaManager {
  constructor() {
    this.replicas = config.database.readReplicas || [];
    this.currentReplicaIndex = 0;
    this.replicaHealth = new Map();
    this.healthCheckInterval = null;
    this.maxReplicationLag = 5000; // 5 seconds max lag
  }

  /**
   * Check if read replicas are configured
   */
  hasReplicas() {
    return this.replicas.length > 0;
  }

  /**
   * Get the next healthy replica (round-robin)
   */
  getReplica() {
    if (!this.hasReplicas()) {
      return null;
    }

    const healthyReplicas = this.replicas.filter((_, index) => {
      return this.replicaHealth.get(index) !== 'unhealthy';
    });

    if (healthyReplicas.length === 0) {
      logger.warn('No healthy replicas available, falling back to primary');
      return null;
    }

    // Round-robin selection
    const replica = healthyReplicas[this.currentReplicaIndex % healthyReplicas.length];
    this.currentReplicaIndex = (this.currentReplicaIndex + 1) % healthyReplicas.length;
    
    return replica;
  }

  /**
   * Execute a read query on a replica (or primary if no replicas)
   * @param {string} text - SQL query
   * @param {Array} params - Query parameters
   * @param {Object} options - Query options
   * @param {boolean} options.forcePrimary - Force use of primary database
   * @returns {Promise<Object>} Query result
   */
  async query(text, params = [], options = {}) {
    // Determine if query is a write operation
    const isWriteOperation = this._isWriteOperation(text);
    
    // Use primary for write operations, or if forced
    if (isWriteOperation || options.forcePrimary || !this.hasReplicas()) {
      return connectionPool.query(text, params, { pool: 'primary' });
    }

    // Try replica first
    const replica = this.getReplica();
    
    if (!replica) {
      // No healthy replica, fallback to primary
      logger.debug('No replica available, reading from primary');
      return connectionPool.query(text, params, { pool: 'primary' });
    }

    try {
      const result = await connectionPool.query(text, params, { pool: replica.name });
      
      // Check replication lag
      if (this._hasExcessiveLag(result)) {
        logger.warn('Replica has excessive lag, retrying on primary', {
          replica: replica.name,
        });
        return connectionPool.query(text, params, { pool: 'primary' });
      }
      
      return result;
    } catch (error) {
      logger.error(`Replica query failed, falling back to primary`, {
        replica: replica.name,
        error: error.message,
      });
      
      // Mark replica as unhealthy temporarily
      this._markReplicaUnhealthy(replica.name);
      
      // Fallback to primary
      return connectionPool.query(text, params, { pool: 'primary' });
    }
  }

  /**
   * Execute a write query - always on primary
   */
  async write(text, params = []) {
    return connectionPool.query(text, params, { pool: 'primary' });
  }

  /**
   * Execute a transaction - always on primary
   */
  async transaction(callback) {
    return connectionPool.transaction(callback, 'primary');
  }

  /**
   * Start monitoring replica health and replication lag
   */
  startHealthCheck(intervalMs = 10000) {
    if (!this.hasReplicas() || this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(async () => {
      for (let i = 0; i < this.replicas.length; i++) {
        const replica = this.replicas[i];
        
        try {
          const client = await connectionPool.getPool(replica.name).connect();
          
          // Check replication lag
          const result = await client.query(`
            SELECT 
              CASE 
                WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() THEN 0
                ELSE EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())) * 1000
              END as replication_lag_ms
          `);
          
          const lag = parseInt(result.rows[0]?.replication_lag_ms || 0);
          
          if (lag > this.maxReplicationLag) {
            logger.warn(`Replica ${replica.name} has high replication lag`, {
              lag: `${lag}ms`,
            });
          }
          
          this.replicaHealth.set(i, 'healthy');
          client.release();
        } catch (error) {
          logger.error(`Replica health check failed: ${replica.name}`, {
            error: error.message,
          });
          this._markReplicaUnhealthy(replica.name);
        }
      }
    }, intervalMs);

    if (this.healthCheckInterval.unref) {
      this.healthCheckInterval.unref();
    }
  }

  /**
   * Get replica statistics
   */
  getStats() {
    const stats = {
      hasReplicas: this.hasReplicas(),
      replicas: [],
    };

    if (this.hasReplicas()) {
      stats.replicas = this.replicas.map((replica, index) => ({
        name: replica.name,
        host: replica.host,
        port: replica.port,
        status: this.replicaHealth.get(index) || 'unknown',
      }));
    }

    return stats;
  }

  /**
   * Check if SQL query is a write operation
   * @private
   */
  _isWriteOperation(sql) {
    const normalized = sql.trim().toUpperCase();
    const writeKeywords = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'CREATE', 'ALTER', 'DROP', 'GRANT', 'REVOKE'];
    
    return writeKeywords.some(keyword => normalized.startsWith(keyword));
  }

  /**
   * Check if replica has excessive replication lag
   * @private
   */
  _hasExcessiveLag(result) {
    // This would need actual replication lag monitoring
    // For now, rely on the health check mechanism
    return false;
  }

  /**
   * Mark a replica as unhealthy
   * @private
   */
  _markReplicaUnhealthy(name) {
    const index = this.replicas.findIndex(r => r.name === name);
    if (index >= 0) {
      this.replicaHealth.set(index, 'unhealthy');
      
      // Auto-recover after 60 seconds
      setTimeout(() => {
        if (this.replicaHealth.get(index) === 'unhealthy') {
          this.replicaHealth.set(index, 'unknown');
          logger.info(`Replica ${name} marked for health recheck`);
        }
      }, 60000);
    }
  }

  /**
   * Stop health checks and cleanup
   */
  shutdown() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

// Export singleton instance
module.exports = new ReadReplicaManager();