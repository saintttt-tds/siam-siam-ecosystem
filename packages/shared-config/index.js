// packages/shared-config/index.js
const dotenv = require('dotenv');
const path = require('path');

/**
 * SiamSiam Ecosystem - Centralized Configuration Manager
 * 
 * This module provides a single source of truth for all configuration
 * across the entire ecosystem. It handles:
 * - Environment-specific settings (dev, staging, prod)
 * - Sensitive credential management
 * - Service discovery configuration
 * - Feature flags
 */

// Load environment-specific .env file
const NODE_ENV = process.env.NODE_ENV || 'development';
const envFile = path.resolve(process.cwd(), `config/.env.${NODE_ENV}`);
dotenv.config({ path: envFile });

/**
 * Core configuration schema with validation
 * All values have sensible defaults for local development
 * but MUST be overridden in production via environment variables
 */
const config = {
  // Environment
  env: NODE_ENV,
  isProduction: NODE_ENV === 'production',
  isStaging: NODE_ENV === 'staging',
  isDevelopment: NODE_ENV === 'development',
  
  // Server defaults
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    host: process.env.HOST || '0.0.0.0',
    apiVersion: 'v1',
    cors: {
      origin: process.env.CORS_ORIGIN || '*', // CHANGE IN PRODUCTION: Set to specific domains
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-tenant-id'],
      credentials: true,
    },
    // Rate limiting defaults - TIGHTEN FOR PRODUCTION
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100, // 100 requests per window
      standardHeaders: true,
      legacyHeaders: false,
    },
  },

  /**
   * PostgreSQL Database Configuration
   * 
   * IMPORTANT: These are DEVELOPMENT defaults ONLY
   * PRODUCTION: Use environment variables or secrets manager
   * Use connection pooling (pg-pool) with these settings
   */
  database: {
    // Primary database
    primary: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME || 'siamsiam_dev',
      username: process.env.DB_USER || 'siamsiam_user',
      password: process.env.DB_PASSWORD || 'dev_password_change_me', // CHANGE IN PRODUCTION
      
      // Connection pool configuration
      pool: {
        max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
        min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
        idle: parseInt(process.env.DB_POOL_IDLE, 10) || 10000,
        acquire: parseInt(process.env.DB_POOL_ACQUIRE, 10) || 30000,
        evict: parseInt(process.env.DB_POOL_EVICT, 10) || 1000,
      },
      
      // SSL configuration - CRITICAL FOR PRODUCTION
      ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: true,
        ca: process.env.DB_CA_CERT, // Path to CA certificate
      } : false,
    },
    
    // Read replicas for scaling reads
    readReplicas: process.env.DB_READ_REPLICAS 
      ? JSON.parse(process.env.DB_READ_REPLICAS) 
      : [], // Format: [{ host: 'replica1.host', port: 5432, ... }]
    
    // Migration configuration
    migrations: {
      directory: path.resolve(process.cwd(), 'infrastructure/databases/migrations'),
      tableName: 'migrations',
      schema: 'public',
    },
  },

  /**
   * RabbitMQ Message Queue Configuration
   * 
   * Used for async communication between microservices
   * Critical for event-driven architecture
   */
  rabbitmq: {
    // Connection
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    // PRODUCTION URL FORMAT: amqps://username:password@rabbitmq.host:5671/vhost
    
    // Exchange configuration
    exchanges: {
      // Main event exchange for inter-service communication
      events: {
        name: 'siamsiam.events',
        type: 'topic', // topic exchange for flexible routing
        durable: true, // Survive broker restarts
      },
      // Dead letter exchange for failed messages
      deadLetter: {
        name: 'siamsiam.dlx',
        type: 'direct',
        durable: true,
      },
    },
    
    // Queue defaults
    queues: {
      // Service-specific queues
      auth: 'auth.service.queue',
      payment: 'payment.service.queue',
      delivery: 'delivery.service.queue',
      commerce: 'commerce.service.queue',
      notification: 'notification.service.queue',
      refund: 'refund.service.queue',
      referral: 'referral.service.queue',
      
      // Dead letter queue
      deadLetter: 'dead.letter.queue',
    },
    
    // Routing keys for topic exchange
    routingKeys: {
      // User events
      userCreated: 'user.created',
      userUpdated: 'user.updated',
      userDeleted: 'user.deleted',
      
      // Payment events
      paymentCompleted: 'payment.completed',
      paymentFailed: 'payment.failed',
      refundRequested: 'refund.requested',
      refundProcessed: 'refund.processed',
      
      // Order events
      orderCreated: 'order.created',
      orderShipped: 'order.shipped',
      orderDelivered: 'order.delivered',
      
      // Delivery events
      deliveryAssigned: 'delivery.assigned',
      deliveryPickedUp: 'delivery.picked_up',
      deliveryInTransit: 'delivery.in_transit',
      deliveryCompleted: 'delivery.completed',
      locationUpdated: 'location.updated',
    },
    
    // Connection options
    options: {
      heartbeat: 30, // seconds
      connectionTimeout: 10000, // ms
      // Retry strategy for connection failures
      retry: {
        minTimeout: 1000,
        maxTimeout: 30000,
        maxAttempts: 10,
      },
    },
  },

  /**
   * Redis Cache Configuration
   * 
   * Used for session storage, rate limiting, caching
   * and real-time features (pub/sub)
   */
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined, // CHANGE IN PRODUCTION
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    
    // Cluster mode for production
    cluster: process.env.REDIS_CLUSTER === 'true' ? {
      nodes: JSON.parse(process.env.REDIS_CLUSTER_NODES || '[]'),
    } : null,
    
    // TTL defaults (seconds)
    defaults: {
      session: 86400,        // 24 hours
      cache: 3600,           // 1 hour
      rateLimit: 900,        // 15 minutes
      otp: 300,              // 5 minutes
      websocket: 7200,       // 2 hours
    },
  },

  /**
   * JWT Authentication Configuration
   * 
   * CRITICAL: In production, use RS256 with key rotation
   * via HashiCorp Vault or AWS KMS
   */
  jwt: {
    // Access token (short-lived)
    accessToken: {
      secret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_in_production',
      expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
      algorithm: process.env.JWT_ALGORITHM || 'HS256', // CHANGE TO RS256 IN PRODUCTION
    },
    
    // Refresh token (long-lived)
    refreshToken: {
      secret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_in_production',
      expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
      algorithm: process.env.JWT_ALGORITHM || 'HS256',
    },
    
    // Token issuer
    issuer: process.env.JWT_ISSUER || 'siamsiam-api',
    audience: process.env.JWT_AUDIENCE || 'siamsiam-clients',
  },

  /**
   * Encryption Configuration
   * 
   * AES-256-GCM for data at rest
   * PRODUCTION: Use HSM or KMS for key management
   */
  encryption: {
    algorithm: 'aes-256-gcm',
    key: process.env.ENCRYPTION_KEY || 'dev-32-char-key-change-in-prod!!', // MUST be 32 bytes
    ivLength: 16,
    tagLength: 16,
  },

  /**
   * Service Discovery
   * 
   * In production, replace with Consul/etcd/K8s DNS
   */
  services: {
    apiGateway: {
      host: process.env.API_GATEWAY_HOST || 'localhost',
      port: parseInt(process.env.API_GATEWAY_PORT, 10) || 3000,
    },
    auth: {
      host: process.env.AUTH_SERVICE_HOST || 'localhost',
      port: parseInt(process.env.AUTH_SERVICE_PORT, 10) || 3001,
    },
    payment: {
      host: process.env.PAYMENT_SERVICE_HOST || 'localhost',
      port: parseInt(process.env.PAYMENT_SERVICE_PORT, 10) || 3002,
    },
    commerce: {
      host: process.env.COMMERCE_SERVICE_HOST || 'localhost',
      port: parseInt(process.env.COMMERCE_SERVICE_PORT, 10) || 3003,
    },
    delivery: {
      host: process.env.DELIVERY_SERVICE_HOST || 'localhost',
      port: parseInt(process.env.DELIVERY_SERVICE_PORT, 10) || 3004,
    },
    notification: {
      host: process.env.NOTIFICATION_SERVICE_HOST || 'localhost',
      port: parseInt(process.env.NOTIFICATION_SERVICE_PORT, 10) || 3005,
    },
    ussd: {
      host: process.env.USSD_SERVICE_HOST || 'localhost',
      port: parseInt(process.env.USSD_SERVICE_PORT, 10) || 3006,
    },
    corporateFx: {
      host: process.env.CORPORATE_FX_SERVICE_HOST || 'localhost',
      port: parseInt(process.env.CORPORATE_FX_SERVICE_PORT, 10) || 3007,
    },
    // AI Service (Python)
    ai: {
      host: process.env.AI_SERVICE_HOST || 'localhost',
      port: parseInt(process.env.AI_SERVICE_PORT, 10) || 5000,
      // Python service default port
    },
  },

  /**
   * Monitoring & Observability
   */
  monitoring: {
    // Prometheus metrics
    prometheus: {
      enabled: process.env.PROMETHEUS_ENABLED === 'true',
      port: parseInt(process.env.PROMETHEUS_PORT, 10) || 9090,
    },
    // Structured logging
    logging: {
      level: process.env.LOG_LEVEL || 'info', // debug, info, warn, error
      format: process.env.LOG_FORMAT || 'json', // json for ELK stack
      // ELK Stack endpoints (production)
      elasticsearch: process.env.ELASTICSEARCH_URL || null,
      // Loki for log aggregation
      loki: process.env.LOKI_URL || null,
    },
    // Alerting
    alerting: {
      slack: process.env.SLACK_WEBHOOK_URL || null,
      email: process.env.ALERT_EMAIL || null,
      pagerDuty: process.env.PAGERDUTY_KEY || null,
    },
  },

  /**
   * Third-party API Keys & Credentials
   * 
   * PRODUCTION: Use HashiCorp Vault or AWS Secrets Manager
   * NEVER commit real keys to version control
   */
  thirdParty: {
    // Payment providers
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder',
    },
    paypal: {
      clientId: process.env.PAYPAL_CLIENT_ID || 'placeholder',
      clientSecret: process.env.PAYPAL_CLIENT_SECRET || 'placeholder',
    },
    
    // African payment integrations
    ecocash: {
      apiKey: process.env.ECOCASH_API_KEY || 'placeholder',
      apiSecret: process.env.ECOCASH_API_SECRET || 'placeholder',
      merchantId: process.env.ECOCASH_MERCHANT_ID || 'placeholder',
    },
    
    // SMS/Notification providers
    africastalking: {
      apiKey: process.env.AFRICASTALKING_API_KEY || 'placeholder',
      username: process.env.AFRICASTALKING_USERNAME || 'sandbox',
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || 'placeholder',
      authToken: process.env.TWILIO_AUTH_TOKEN || 'placeholder',
      phoneNumber: process.env.TWILIO_PHONE_NUMBER || '+1234567890',
    },
    
    // Email providers
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY || 'placeholder',
      fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@siamsiam.com',
    },
    
    // Geolocation services
    googleMaps: {
      apiKey: process.env.GOOGLE_MAPS_API_KEY || 'placeholder',
    },
  },

  /**
   * Multi-tenancy Configuration
   * For white-label stores (choppies.axion.zw)
   */
  multiTenancy: {
    enabled: process.env.MULTI_TENANCY_ENABLED === 'true',
    defaultTenant: process.env.DEFAULT_TENANT || 'siamsiam',
    tenantHeader: 'x-tenant-id',
    domainMapping: {}, // In production, load from database
  },

  /**
   * Feature Flags
   * Control rollout of new features
   */
  features: {
    biometricAuth: process.env.FEATURE_BIOMETRIC === 'true',
    droneDelivery: process.env.FEATURE_DRONE_DELIVERY === 'false',
    cryptoPayments: process.env.FEATURE_CRYPTO === 'false',
    crossBorderCommerce: process.env.FEATURE_CROSS_BORDER === 'false',
    corporateFx: process.env.FEATURE_CORPORATE_FX === 'false',
    refunds: process.env.FEATURE_REFUNDS === 'true',
    referral: process.env.FEATURE_REFERRAL === 'true',
    aiRecommendations: process.env.FEATURE_AI_RECOMMENDATIONS === 'false',
    unifiedAccounts: process.env.FEATURE_UNIFIED_ACCOUNTS === 'false',
  },
};

/**
 * Environment-specific overrides
 */
const environmentOverrides = {
  development: {
    database: {
      primary: {
        database: 'siamsiam_dev',
        pool: { max: 5, min: 1 },
      },
    },
    monitoring: {
      logging: { level: 'debug', format: 'pretty' },
    },
  },
  
  staging: {
    database: {
      primary: {
        pool: { max: 10, min: 2 },
        ssl: { rejectUnauthorized: true },
      },
    },
    monitoring: {
      logging: { level: 'info', format: 'json' },
    },
  },
  
  production: {
    database: {
      primary: {
        pool: { max: 50, min: 5 },
        ssl: { rejectUnauthorized: true },
      },
    },
    server: {
      cors: {
        origin: process.env.CORS_ORIGIN, // MUST BE SET
      },
      rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 50, // Stricter in production
      },
    },
    monitoring: {
      logging: { level: 'warn', format: 'json' },
      prometheus: { enabled: true },
    },
  },
};

// Apply environment overrides
const envConfig = environmentOverrides[NODE_ENV] || {};

/**
 * Deep merge utility for configuration
 */
function deepMerge(target, source) {
  const output = { ...target };
  for (const key in source) {
    if (source[key] instanceof Object && key in target) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

/**
 * Validate required production configuration
 */
function validateProductionConfig(config) {
  if (NODE_ENV === 'production') {
    const errors = [];
    
    if (config.database.primary.password === 'dev_password_change_me') {
      errors.push('Database password must be set in production!');
    }
    if (config.jwt.accessToken.secret === 'dev_access_secret_change_in_production') {
      errors.push('JWT secret must be set in production!');
    }
    if (config.encryption.key === 'dev-32-char-key-change-in-prod!!') {
      errors.push('Encryption key must be set in production!');
    }
    if (config.server.cors.origin === '*') {
      errors.push('CORS origin must be restricted in production!');
    }
    
    if (errors.length > 0) {
      console.error('❌ PRODUCTION CONFIGURATION ERRORS:');
      errors.forEach(err => console.error(`  - ${err}`));
      console.error('\nSet these via environment variables or secrets manager.');
      process.exit(1); // Fail fast in production with bad config
    }
  }
}

// Merge and validate
const finalConfig = deepMerge(config, envConfig);
validateProductionConfig(finalConfig);

/**
 * Get configuration value by dot-notation path
 * @param {string} path - Dot notation path to config value (e.g., 'database.primary.host')
 * @returns {*} Configuration value
 */
function get(path) {
  return path.split('.').reduce((obj, key) => obj?.[key], finalConfig);
}

module.exports = {
  ...finalConfig,
  get,
  env: NODE_ENV,
};

// Log configuration on startup (hide secrets)
if (finalConfig.isDevelopment) {
  console.log('📋 SiamSiam Configuration Loaded:');
  console.log(`  Environment: ${NODE_ENV}`);
  console.log(`  Database: ${finalConfig.database.primary.host}:${finalConfig.database.primary.port}/${finalConfig.database.primary.database}`);
  console.log(`  RabbitMQ: ${finalConfig.rabbitmq.url}`);
  console.log(`  Redis: ${finalConfig.redis.host}:${finalConfig.redis.port}`);
  console.log(`  API Gateway: ${finalConfig.services.apiGateway.host}:${finalConfig.services.apiGateway.port}`);
}