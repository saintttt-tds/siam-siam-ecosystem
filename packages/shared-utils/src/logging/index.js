/**
 * Logging Module Index
 * 
 * Centralized logging infrastructure for the entire SiamSiam ecosystem.
 * Provides structured logging, audit trails, security event logging,
 * and log rotation for production environments.
 */

module.exports = {
  logger: require('./logger'),
  auditLogger: require('./audit-logger'),
  securityEvents: require('./security-events'),
  structuredLogging: require('./structured-logging'),
  logRotator: require('./log-rotator'),
};