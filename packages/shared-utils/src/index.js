/**
 * SiamSiam Shared Utilities - Main Entry Point
 * 
 * This package provides all shared functionality used across
 * the entire SiamSiam ecosystem. Each module is designed to be
 * independently importable for tree-shaking and minimal bundles.
 * 
 * Usage:
 *   const { database, auth, logging } = require('@siamsiam/shared-utils');
 *   const pool = database.connectionPool.getPool();
 *   const token = auth.jwtService.generateToken({ userId: 123 });
 * 
 * @module @siamsiam/shared-utils
 */

module.exports = {
  // Database utilities
  database: require('./database'),
  
  // Authentication & authorization
  auth: require('./auth'),
  
  // Logging framework
  logging: require('./logging'),
  
  // Message queue (RabbitMQ)
  messaging: require('./messaging'),
  
  // Security utilities
  security: require('./security'),
  
  // Geolocation services
  geolocation: require('./geolocation'),
  
  // Real-time features (WebSocket, SSE)
  realtime: require('./realtime'),
  
  // USSD gateway utilities
  ussd: require('./ussd'),
  
  // Input validators
  validators: require('./validators'),
  
  // Cache layer (Redis)
  cache: require('./cache'),
  
  // Cryptographic operations
  crypto: require('./crypto'),
  
  // Refund processing
  refunds: require('./refunds'),
  
  // Referral system
  referral: require('./referral'),
  
  // Multi-tenancy
  tenant: require('./tenant'),
  
  // Monitoring & observability
  monitoring: require('./monitoring'),
};