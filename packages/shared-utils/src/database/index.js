/**
 * Database Module Index
 * 
 * Centralizes all database-related utilities including:
 * - Connection pooling with failover
 * - Dynamic query building
 * - Migration management
 * - Data encryption at rest
 * - Read/write splitting for replicas
 * 
 * All database operations should flow through these utilities
 * to ensure consistent connection management, error handling,
 * and security across the ecosystem.
 */

module.exports = {
  connectionPool: require('./connection-pool'),
  queryBuilder: require('./query-builder'),
  migrationsRunner: require('./migrations-runner'),
  encryptionAtRest: require('./encryption-at-rest'),
  readReplica: require('./read-replica'),
};