// services/api-gateway/server.js
const http = require('http');
const app = require('./app');
const config = require('@siamsiam/shared-config');
const logger = require('@siamsiam/shared-utils').logging.logger;
const messageQueue = require('@siamsiam/shared-utils').messaging.messageQueue;
const redisClient = require('@siamsiam/shared-utils').cache.redisClient;

/**
 * SiamSiam API Gateway - Server Entry Point
 * 
 * This is the main entry point for ALL client requests.
 * It handles:
 * - Request routing to appropriate microservices
 * - Authentication and authorization
 * - Rate limiting and throttling
 * - Request/response transformation
 * - API versioning
 * - Health checks
 * 
 * PRODUCTION TODO:
 * - Add HTTPS/TLS termination (handled by Nginx/load balancer)
 * - Enable cluster mode for multi-core CPU utilization
 * - Add request ID tracking via headers
 * - Implement distributed tracing (Jaeger/Zipkin)
 */

const PORT = config.services.apiGateway.port || 3000;
const HOST = config.services.apiGateway.host || '0.0.0.0';

// Create HTTP server
const server = http.createServer(app);

// Start server
async function startServer() {
  try {
    // Initialize infrastructure connections
    logger.info('Starting API Gateway...');
    
    // Connect to Redis (if enabled)
    try {
      await redisClient.connect();
      logger.info('Redis connected');
    } catch (error) {
      logger.warn('Redis connection failed - continuing without cache', { error: error.message });
      // Don't fail startup if Redis is down
    }
    
    // Connect to RabbitMQ
    try {
      await messageQueue.connect();
      logger.info('RabbitMQ connected');
    } catch (error) {
      logger.warn('RabbitMQ connection failed - continuing without message queue', { error: error.message });
      // Don't fail startup if RabbitMQ is down (services should be resilient)
    }

    // Start listening
    server.listen(PORT, HOST, () => {
      logger.info(`
╔══════════════════════════════════════════════════════════╗
║           SiamSiam API Gateway Started! 🚀               ║
╠══════════════════════════════════════════════════════════╣
║  Environment: ${config.env.padEnd(42)}║
║  Port:        ${String(PORT).padEnd(42)}║
║  Host:        ${HOST.padEnd(42)}║
║  API Version: ${config.server.apiVersion.padEnd(42)}║
╚══════════════════════════════════════════════════════════╝
      `);
    });

  } catch (error) {
    logger.error('Failed to start API Gateway', { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal) {
  logger.info(`${signal} received - starting graceful shutdown...`);
  
  server.close(async () => {
    logger.info('HTTP server closed');
    
    // Close infrastructure connections
    await redisClient.shutdown();
    await messageQueue.shutdown();
    
    logger.info('Graceful shutdown complete');
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason });
  // Don't exit - let the process continue but log the error
});

startServer();

module.exports = server;