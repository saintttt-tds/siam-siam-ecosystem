const winston = require('winston');
const config = require('@siamsiam/shared-config');

/**
 * Centralized Structured Logging Framework
 * 
 * Provides enterprise-grade logging across all SiamSiam services.
 * 
 * FEATURES:
 * - JSON structured format for ELK stack integration
 * - Multiple transport support (console, file, Elasticsearch, Loki)
 * - Log levels: error(0), warn(1), info(2), http(3), debug(4)
 * - Automatic metadata enrichment (service, environment, request ID)
 * - Sensitive data masking (passwords, tokens, PII)
 * - Log rotation for file transport
 * - Child loggers for request context
 * 
 * PRODUCTION CONFIGURATION:
 * - Use JSON format for Elasticsearch/Loki
 * - Enable file transport with rotation
 * - Configure Elasticsearch/Loki endpoints
 * - Set appropriate log level (info or warn)
 * - Never log sensitive data (PII, credentials, tokens)
 * 
 * @example
 *   const logger = require('@siamsiam/shared-utils').logging.logger;
 *   logger.info('User logged in', { userId: 123 });
 *   logger.error('Payment failed', { error: err.message, transactionId: 'txn_123' });
 *   
 *   // With request context
 *   const reqLogger = logger.createRequestLogger(reqId, userId);
 *   reqLogger.info('Processing request');
 */

// Sensitive fields that should NEVER appear in logs
const SENSITIVE_FIELDS = [
  'password', 'password_hash', 'pin', 'secret', 'apiKey', 'api_key',
  'authorization', 'credit_card', 'card_number', 'cvv', 'ssn',
  'accessToken', 'refreshToken', 'token', 'privateKey', 'private_key',
  'bearer', 'basic', 'auth', 'credential', 'passcode',
];

// Fields that should be partially masked (show first/last few chars)
const MASKED_FIELDS = [
  'email', 'phone', 'phoneNumber', 'ipAddress', 'ip',
];

/**
 * Recursively mask sensitive data in objects
 */
function maskSensitiveData(obj, depth = 0) {
  if (depth > 10 || !obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => maskSensitiveData(item, depth + 1));
  }
  
  const masked = { ...obj };
  
  for (const key in masked) {
    if (!masked.hasOwnProperty(key)) continue;
    
    const lowerKey = key.toLowerCase();
    
    // Completely redact sensitive fields
    if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
      masked[key] = '[REDACTED]';
    } 
    // Partially mask PII
    else if (MASKED_FIELDS.some(field => lowerKey.includes(field)) && typeof masked[key] === 'string') {
      const val = masked[key];
      if (val.length > 8) {
        masked[key] = val.substring(0, 3) + '***' + val.substring(val.length - 3);
      } else {
        masked[key] = '***';
      }
    } 
    // Recursively process nested objects
    else if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key] = maskSensitiveData(masked[key], depth + 1);
    }
  }
  
  return masked;
}

/**
 * Custom format to enrich logs with service metadata
 */
const enrichFormat = winston.format((info) => {
  info.service = config.isProduction 
    ? (process.env.SERVICE_NAME || 'siamsiam-api')
    : `siamsiam-${config.env}`;
  info.environment = config.env;
  info.timestamp = new Date().toISOString();
  info.pid = process.pid;
  info.hostname = process.env.HOSTNAME || 'unknown';
  
  // Mask sensitive data
  if (info.metadata) {
    info.metadata = maskSensitiveData(info.metadata);
  }
  
  return info;
});

/**
 * Custom format for development (human-readable)
 */
const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 
      ? `\n  ${JSON.stringify(meta, null, 2)}`
      : '';
    return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
  })
);

/**
 * Custom format for production (JSON for ELK)
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Create transports based on environment
const transports = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    level: config.monitoring.logging.level || 'info',
    format: config.isDevelopment ? developmentFormat : productionFormat,
  })
);

// File transport for production/staging
if (config.isProduction || config.isStaging) {
  const fs = require('fs');
  const logDir = '/var/log/siamsiam';
  
  // Create log directory if it doesn't exist
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (error) {
    // Fallback to local logs directory
    console.warn(`Cannot create ${logDir}, using ./logs instead`);
  }
  
  const finalLogDir = fs.existsSync(logDir) ? logDir : './logs';
  
  // Error log
  transports.push(
    new winston.transports.File({
      filename: `${finalLogDir}/error.log`,
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 10,
      format: productionFormat,
    })
  );
  
  // Combined log
  transports.push(
    new winston.transports.File({
      filename: `${finalLogDir}/combined.log`,
      maxsize: 10485760, // 10MB
      maxFiles: 20,
      format: productionFormat,
    })
  );
  
  // HTTP access log (separate file)
  transports.push(
    new winston.transports.File({
      filename: `${finalLogDir}/access.log`,
      level: 'http',
      maxsize: 10485760,
      maxFiles: 10,
      format: productionFormat,
    })
  );
}

// Elasticsearch transport (if configured in production)
if (config.isProduction && config.monitoring.logging.elasticsearch) {
  // PRODUCTION TODO: Add Elasticsearch transport
  // Requires: npm install winston-elasticsearch
  // const ElasticsearchTransport = require('winston-elasticsearch');
  // transports.push(new ElasticsearchTransport({
  //   level: 'info',
  //   clientOpts: { node: config.monitoring.logging.elasticsearch },
  //   indexPrefix: 'siamsiam-logs',
  //   indexSuffixPattern: 'YYYY.MM.DD',
  // }));
}

// Loki transport (if configured)
if (config.isProduction && config.monitoring.logging.loki) {
  // PRODUCTION TODO: Add Loki transport
  // Requires: npm install winston-loki
  // transports.push(new LokiTransport({
  //   host: config.monitoring.logging.loki,
  //   labels: { service: process.env.SERVICE_NAME, env: config.env },
  // }));
}

// Create the logger instance
const logger = winston.createLogger({
  level: config.monitoring.logging.level || 'info',
  levels: winston.config.npm.levels,
  format: winston.format.combine(
    enrichFormat(),
    winston.format.errors({ stack: true }),
  ),
  transports,
  exitOnError: false, // Don't crash on logging errors
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: '/var/log/siamsiam/exceptions.log',
      format: productionFormat,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: '/var/log/siamsiam/rejections.log',
      format: productionFormat,
    }),
  ],
});

// Handle logging errors gracefully
logger.on('error', (error) => {
  console.error('Logger error:', error);
});

/**
 * Create a child logger with request-specific context
 * Useful for tracing requests across services
 */
logger.createRequestLogger = (requestId, userId = null, tenantId = null) => {
  return logger.child({
    requestId,
    userId,
    tenantId,
    correlationId: requestId, // For distributed tracing
  });
};

/**
 * Create a service-specific logger
 */
logger.createServiceLogger = (serviceName) => {
  return logger.child({
    service: serviceName,
  });
};

// Freeze the logger to prevent modifications
Object.freeze(logger);

module.exports = logger;