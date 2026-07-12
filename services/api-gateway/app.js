// services/api-gateway/app.js
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
const config = require('@siamsiam/shared-config');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { rateLimiter } = require('@siamsiam/shared-utils').security;

// Import routes and middleware
const routes = require('./routes');
const { serviceRouter } = require('./middleware/service-router');
const { circuitBreaker } = require('./middleware/circuit-breaker');
const { errorHandler } = require('./middleware/error-handler');
const { tenantIdentifier } = require('./middleware/tenant-identifier');

/**
 * Express Application Setup
 * 
 * Configures all middleware, routes, and error handling
 * for the API Gateway.
 */
const app = express();

// ============================================
// GLOBAL MIDDLEWARE
// ============================================

// Security headers (Helmet)
app.use(helmet({
  contentSecurityPolicy: false, // Configure based on your frontend
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors(config.server.cors));

// Compression (gzip responses)
app.use(compression());

// Parse JSON and URL-encoded bodies
app.use(express.json({ limit: '10mb' })); // Increase for image uploads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID for tracing
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', req.id);
  next();
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  
  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel]('API Request', {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent')?.substring(0, 100),
      tenantId: req.headers['x-tenant-id'],
    });
  });
  
  next();
});

// ============================================
// RATE LIMITING
// ============================================

// Global rate limiter
app.use(rateLimiter.createMiddleware({
  windowMs: config.server.rateLimit.windowMs,
  max: config.server.rateLimit.max,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
    retryAfter: config.server.rateLimit.windowMs / 1000,
  },
}));

// ============================================
// TENANT IDENTIFICATION
// ============================================

// Identify tenant from custom domain or header
app.use(tenantIdentifier);

// ============================================
// ROUTING
// ============================================

// Health check endpoint (no auth required)
app.get('/health', routes.health);

// API routes
app.use(`/api/${config.server.apiVersion}`, serviceRouter);

// Webhook endpoints (different auth)
app.use('/webhooks', routes.webhooks);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
    requestId: req.id,
  });
});

// Global error handler
app.use(errorHandler);

module.exports = app;