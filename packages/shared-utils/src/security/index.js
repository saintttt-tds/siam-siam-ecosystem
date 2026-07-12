/**
 * Security Module Index
 * 
 * Comprehensive security utilities including encryption,
 * rate limiting, fraud detection, API key management,
 * and various protection mechanisms.
 */

module.exports = {
  encryption: require('./encryption'),
  rateLimiter: require('./rate-limiter'),
  fraudDetection: require('./fraud-detection'),
  apiKeyManager: require('./api-key-manager'),
  requestSigning: require('./request-signing'),
  ipWhitelist: require('./ip-whitelist'),
  userAgentValidator: require('./user-agent-validator'),
  anomalyDetector: require('./anomaly-detector'),
  sqlInjectionPrevention: require('./sql-injection-prevention'),
  xssPrevention: require('./xss-prevention'),
  csrfProtection: require('./csrf-protection'),
  secretsManager: require('./secrets-manager'),
};