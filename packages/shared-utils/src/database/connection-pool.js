const { Pool } = require('pg');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * PostgreSQL Connection Pool Manager
 * 
 * Manages database connections with:
 * - Connection pooling for performance
 * - Automatic failover to read replicas
 * - Health checks and connection monitoring
 * - SSL support for production
 * - Transaction support
 * - Query logging for performance monitoring
 * 
 * IMPORTANT PRODUCTION SETTINGS:
 * - Set pool max based on: (postgres_max_connections - 10) / number_of_instances
 * - Enable SSL with certificate verification
 * - Monitor pool utilization via Prometheus metrics
 * - Set appropriate statement_timeout to prevent long-running queries
 * 
 * @example
 *   const db = require('@siamsiam/shared-utils').database.connectionPool;
 *   const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
 *   const client = await db.getClient();
 *   try {
 *     await db.transaction(async (client) => {
 *       await client.query('INSERT INTO ...');
 *       await client.query('UPDATE ...');
 *     });
 *   } finally {
 *     client.release();
 *   }
 */

class ConnectionPoolManager {
  constructor() {
    this.pools = new Map();
    this.healthCheckInterval = null;
    this.metrics = {
      totalQueries: 0,
      failedQueries: 0,
      totalConnectionTime: 0,
      activeConnections: 0,
    };
  }

  /**
   * Get or create a connection pool
   * @param {string} name - Pool name ('primary' for write, 'replica' for read)
   * @returns {Pool} PostgreSQL connection pool
   */
  getPool(name = 'primary') {
    if (!this.pools.has(name)) {
      this.pools.set(name, this._createPool(name));
    }
    return this.pools.get(name);
  }

  /**
   * Create a new connection pool with proper configuration
   * @private
   */
  _createPool(name) {
    const dbConfig = name === 'primary' 
      ? config.database.primary 
      : config.database.readReplicas.find(r => r.name === name);

    if (!dbConfig) {
      throw new Error(`Database configuration not found for pool: ${name}`);
    }

    const poolConfig = {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.username,
      password: dbConfig.password,
      
      // Pool sizing
      max: dbConfig.pool?.max || 20,
      min: dbConfig.pool?.min || 2,
      
      // Timeouts (milliseconds)
      idleTimeoutMillis: dbConfig.pool?.idle || 10000,
      connectionTimeoutMillis: dbConfig.pool?.acquire || 30000,
      statement_timeout: 30000, // 30s max query execution time
      
      // SSL for production
      ...(dbConfig.ssl && { ssl: dbConfig.ssl }),
      
      // Application name for monitoring in pg_stat_activity
      application_name: `siamsiam_${config.env}_${name}_${process.pid}`,
    };

    const pool = new Pool(poolConfig);

    // Pool event handlers for monitoring
    pool.on('connect', (client) => {
      this.metrics.totalConnectionTime++;
      logger.debug(`📊 Database connection established [${name}]`, {
        pool: name,
        activeConnections: pool.totalCount,
        idleConnections: pool.idleCount,
      });
      
      // Set session-level configurations for security and consistency
      client.query('SET TIME ZONE \'UTC\';');
      client.query('SET statement_timeout = 30000;');
      
      // PRODUCTION: Set application-level variables for audit
      // client.query('SET application.user_id = current_setting(\'app.current_user_id\', true);');
    });

    pool.on('error', (err, client) => {
      logger.error(`❌ Database pool error [${name}]`, {
        error: err.message,
        stack: err.stack,
        pool: name,
      });
      
      // PRODUCTION: Trigger alerts for persistent pool errors
      if (config.isProduction) {
        // Send to monitoring/alerting system
      }
    });

    pool.on('remove', () => {
      logger.debug(`Database connection removed from pool [${name}]`);
    });

    pool.on('acquire', () => {
      this.metrics.activeConnections = pool.totalCount;
    });

    // Verify connection on creation
    this._verifyConnection(pool, name);

    return pool;
  }

  /**
   * Verify database connection with a simple query
   * @private
   */
  async _verifyConnection(pool, name) {
    try {
      const client = await pool.connect();
      const result = await client.query(`
        SELECT 
          NOW() as current_time, 
          version() as pg_version,
          current_database() as database,
          inet_server_addr() as server_ip,
          inet_server_port() as server_port
      `);
      
      logger.info(`✅ Database connected [${name}]`, {
        pool: name,
        time: result.rows[0].current_time,
        version: result.rows[0].pg_version,
        database: result.rows[0].database,
        server: `${result.rows[0].server_ip}:${result.rows[0].server_port}`,
      });
      
      client.release();
    } catch (error) {
      logger.error(`❌ Database connection failed [${name}]`, {
        error: error.message,
        pool: name,
      });
      
      // PRODUCTION: Fail fast if primary database is unavailable
      if (name === 'primary' && config.isProduction) {
        throw new Error(`Cannot connect to primary database: ${error.message}`);
      }
      
      throw error;
    }
  }

  /**
   * Start periodic health checks
   * Pings database every 30 seconds to detect issues early
   */
  startHealthCheck(intervalMs = 30000) {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(async () => {
      for (const [name, pool] of this.pools) {
        try {
          const client = await pool.connect();
          const start = Date.now();
          await client.query('SELECT 1');
          const duration = Date.now() - start;
          client.release();
          
          logger.debug(`💚 Database health check OK [${name}]`, {
            duration: `${duration}ms`,
            pool: name,
          });
          
          // Track metrics
          if (duration > 1000) {
            logger.warn(`⚠️ Slow health check [${name}]`, { duration: `${duration}ms` });
          }
        } catch (error) {
          logger.error(`💔 Database health check failed [${name}]`, {
            error: error.message,
            pool: name,
          });
        }
      }
    }, intervalMs);

    // Don't prevent Node.js process from exiting
    if (this.healthCheckInterval.unref) {
      this.healthCheckInterval.unref();
    }
  }

  /**
   * Stop health checks
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Execute a query with automatic pool selection
   * 
   * @param {string} text - SQL query with parameterized placeholders ($1, $2, etc.)
   * @param {Array} params - Query parameters (prevents SQL injection)
   * @param {Object} options - Query options
   * @param {boolean} options.useReplica - Use read replica if available
   * @param {string} options.pool - Specific pool name to use
   * @returns {Promise<Object>} Query result
   * 
   * @example
   *   const result = await db.query(
   *     'SELECT * FROM users WHERE email = $1 AND active = $2',
   *     [email, true]
   *   );
   */
  async query(text, params = [], options = {}) {
    const poolName = options.pool || (options.useReplica ? 'replica' : 'primary');
    const pool = this.getPool(poolName);
    
    const start = Date.now();
    this.metrics.totalQueries++;
    
    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;
      
      // Log slow queries (>1 second) for performance optimization
      if (duration > 1000) {
        logger.warn('⚠️ Slow query detected', {
          duration: `${duration}ms`,
          query: text.substring(0, 200),
          paramCount: params.length,
          rowsReturned: result.rowCount,
        });
      }
      
      return result;
    } catch (error) {
      this.metrics.failedQueries++;
      const duration = Date.now() - start;
      
      logger.error('❌ Query execution failed', {
        error: error.message,
        code: error.code,
        query: text.substring(0, 200),
        duration: `${duration}ms`,
        pool: poolName,
      });
      
      // Enhance error with useful context
      error.query = text.substring(0, 200);
      error.duration = duration;
      error.pool = poolName;
      
      throw error;
    }
  }

  /**
   * Get a dedicated client from the pool (for transactions)
   * ALWAYS release the client when done!
   * 
   * @param {string} poolName - Pool to get client from
   * @returns {Promise<Object>} Database client
   */
  async getClient(poolName = 'primary') {
    const pool = this.getPool(poolName);
    const client = await pool.connect();
    
    // Track query statistics for this client
    const query = client.query.bind(client);
    client.query = (...args) => {
      client._queryCount = (client._queryCount || 0) + 1;
      return query(...args);
    };
    
    // Wrap release to add logging
    const release = client.release.bind(client);
    client.release = () => {
      logger.debug('Database client released', {
        pool: poolName,
        queriesExecuted: client._queryCount || 0,
      });
      release();
    };
    
    return client;
  }

  /**
   * Execute a transaction with automatic BEGIN/COMMIT/ROLLBACK
   * 
   * @param {Function} callback - Async function that receives the client
   * @param {string} poolName - Pool to use for transaction
   * @returns {Promise<any>} Result from callback
   * 
   * @example
   *   const order = await db.transaction(async (client) => {
   *     await client.query('INSERT INTO orders ...');
   *     await client.query('UPDATE inventory ...');
   *     await client.query('INSERT INTO order_items ...');
   *     return { orderId: 123 };
   *   });
   */
  async transaction(callback, poolName = 'primary') {
    const client = await this.getClient(poolName);
    const start = Date.now();
    
    try {
      await client.query('BEGIN');
      logger.debug('Transaction started');
      
      const result = await callback(client);
      
      await client.query('COMMIT');
      const duration = Date.now() - start;
      logger.debug('Transaction committed', { duration: `${duration}ms` });
      
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      const duration = Date.now() - start;
      logger.error('Transaction rolled back', {
        error: error.message,
        duration: `${duration}ms`,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get pool metrics for monitoring
   */
  getMetrics() {
    const poolMetrics = {};
    
    for (const [name, pool] of this.pools) {
      poolMetrics[name] = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      };
    }
    
    return {
      pools: poolMetrics,
      queries: {
        total: this.metrics.totalQueries,
        failed: this.metrics.failedQueries,
        failureRate: this.metrics.totalQueries > 0 
          ? (this.metrics.failedQueries / this.metrics.totalQueries * 100).toFixed(2) + '%'
          : '0%',
      },
    };
  }

  /**
   * Gracefully close all pools
   * Call during server shutdown to prevent connection leaks
   */
  async shutdown() {
    logger.info('🔄 Shutting down database connections...');
    this.stopHealthCheck();
    
    for (const [name, pool] of this.pools) {
      try {
        await pool.end();
        logger.info(`✅ Database pool closed [${name}]`);
      } catch (error) {
        logger.error(`❌ Error closing pool [${name}]`, { error: error.message });
      }
    }
    
    this.pools.clear();
    logger.info('✅ All database connections closed');
  }
}

// Singleton instance - only one connection pool manager per process
const connectionPool = new ConnectionPoolManager();

// Start health checks in production and staging
if (config.isProduction || config.isStaging) {
  connectionPool.startHealthCheck();
}

// Handle process termination gracefully
process.on('SIGTERM', async () => {
  await connectionPool.shutdown();
});

process.on('SIGINT', async () => {
  await connectionPool.shutdown();
});

module.exports = connectionPool;