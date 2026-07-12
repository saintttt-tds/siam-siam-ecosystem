const axios = require('axios');
const crypto = require('crypto');
const logger = require('../logging/logger');
const retryPolicy = require('./retry-policy');

/**
 * Outbound Webhook Dispatch Manager
 * 
 * Manages delivery of webhook events to external URLs registered
 * by developers and partners. Handles retry logic, signature generation,
 * and delivery tracking.
 * 
 * WEBHOOK SIGNATURE (for receivers to verify):
 *   HMAC-SHA256(webhook_secret, JSON.stringify(payload))
 *   Sent as header: X-SiamSiam-Signature: sha256=...
 * 
 * RETRY STRATEGY:
 *   - Immediate: 0s
 *   - Retry 1: 30s
 *   - Retry 2: 2m
 *   - Retry 3: 5m
 *   - Retry 4: 15m
 *   - Retry 5: 1h
 *   - Max attempts: 6 (including initial)
 * 
 * PRODUCTION TODO:
 * - Store webhook endpoints in database
 * - Implement webhook delivery logs
 * - Add webhook endpoint health monitoring
 * - Implement circuit breaker for failing endpoints
 * - Add rate limiting per endpoint
 * 
 * @example
 *   const webhookManager = require('@siamsiam/shared-utils').messaging.webhookManager;
 *   
 *   await webhookManager.dispatch({
 *     url: 'https://partner.com/webhooks/siamsiam',
 *     secret: 'whsec_abc123',
 *     event: 'payment.completed',
 *     data: { transactionId: 'txn_123', amount: 100 },
 *   });
 */

class WebhookManager {
  constructor() {
    this.deliveryLog = new Map(); // In-memory delivery tracking
    this.maxRetries = 5;
    this.retryDelays = [0, 30000, 120000, 300000, 900000, 3600000]; // 0s, 30s, 2m, 5m, 15m, 1h
    this.timeout = 10000; // 10 second timeout for webhook calls
    this.userAgent = 'SiamSiam-Webhook/1.0';
  }

  /**
   * Dispatch a webhook event
   * @param {Object} config - Webhook configuration
   * @param {string} config.url - Webhook URL
   * @param {string} config.secret - Webhook secret for signature
   * @param {string} config.event - Event type
   * @param {Object} config.data - Event payload
   * @param {string} config.webhookId - Webhook endpoint ID
   * @returns {Promise<Object>} Delivery result
   */
  async dispatch(config) {
    const { url, secret, event, data, webhookId } = config;
    
    if (!url || !event) {
      throw new Error('Webhook URL and event are required');
    }

    const deliveryId = this._generateDeliveryId();
    const payload = this._createPayload(event, data, deliveryId);
    const signature = this._generateSignature(payload, secret);

    logger.info('Dispatching webhook', {
      deliveryId,
      webhookId,
      event,
      url: this._maskUrl(url),
    });

    try {
      const result = await this._sendWithRetry(url, payload, signature, deliveryId);
      
      // Track delivery
      this._trackDelivery(deliveryId, {
        webhookId,
        event,
        url,
        status: result.success ? 'delivered' : 'failed',
        attempts: result.attempts,
        statusCode: result.statusCode,
        duration: result.duration,
        error: result.error,
      });

      return {
        deliveryId,
        success: result.success,
        attempts: result.attempts,
        statusCode: result.statusCode,
      };
    } catch (error) {
      logger.error('Webhook dispatch failed', {
        deliveryId,
        webhookId,
        event,
        error: error.message,
      });

      this._trackDelivery(deliveryId, {
        webhookId,
        event,
        url,
        status: 'failed',
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Send webhook with retry logic
   * @private
   */
  async _sendWithRetry(url, payload, signature, deliveryId) {
    let lastError = null;
    let lastStatusCode = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const delay = this.retryDelays[attempt] || this.retryDelays[this.retryDelays.length - 1];
      
      if (attempt > 0) {
        logger.debug(`Webhook retry ${attempt}/${this.maxRetries}`, {
          deliveryId,
          delayMs: delay,
        });
        await this._sleep(delay);
      }

      const startTime = Date.now();

      try {
        const response = await axios.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': this.userAgent,
            'X-SiamSiam-Event': payload.type,
            'X-SiamSiam-Delivery': deliveryId,
            'X-SiamSiam-Signature': signature,
            'X-SiamSiam-Timestamp': payload.timestamp,
          },
          timeout: this.timeout,
          validateStatus: (status) => status >= 200 && status < 500, // Accept 2xx, 3xx, 4xx
        });

        const duration = Date.now() - startTime;
        lastStatusCode = response.status;

        // Success (2xx)
        if (response.status >= 200 && response.status < 300) {
          logger.info('Webhook delivered successfully', {
            deliveryId,
            statusCode: response.status,
            duration: `${duration}ms`,
            attempt: attempt + 1,
          });

          return {
            success: true,
            attempts: attempt + 1,
            statusCode: response.status,
            duration,
          };
        }

        // Client error (4xx) - Don't retry
        if (response.status >= 400 && response.status < 500) {
          logger.warn('Webhook failed with client error (not retrying)', {
            deliveryId,
            statusCode: response.status,
            duration: `${duration}ms`,
          });

          return {
            success: false,
            attempts: attempt + 1,
            statusCode: response.status,
            duration,
            error: `Client error: ${response.status}`,
          };
        }

        // Server error (5xx) - Will retry
        logger.warn('Webhook failed with server error (will retry)', {
          deliveryId,
          statusCode: response.status,
          duration: `${duration}ms`,
          attempt: attempt + 1,
        });

        lastError = new Error(`Server error: ${response.status}`);
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Network errors
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
          logger.warn('Webhook network error (will retry)', {
            deliveryId,
            error: error.message,
            code: error.code,
            duration: `${duration}ms`,
            attempt: attempt + 1,
          });
          lastError = error;
          continue;
        }

        // DNS resolution failure
        if (error.code === 'ENOTFOUND') {
          logger.error('Webhook DNS resolution failed (not retrying)', {
            deliveryId,
            url: this._maskUrl(url),
            error: error.message,
          });
          return {
            success: false,
            attempts: attempt + 1,
            duration,
            error: 'DNS resolution failed',
          };
        }

        // Other errors
        logger.error('Webhook unexpected error', {
          deliveryId,
          error: error.message,
          duration: `${duration}ms`,
          attempt: attempt + 1,
        });
        lastError = error;
      }
    }

    // All retries exhausted
    logger.error('Webhook delivery failed after all retries', {
      deliveryId,
      attempts: this.maxRetries + 1,
      lastError: lastError?.message,
    });

    return {
      success: false,
      attempts: this.maxRetries + 1,
      statusCode: lastStatusCode,
      error: lastError?.message,
    };
  }

  /**
   * Create webhook payload
   * @private
   */
  _createPayload(event, data, deliveryId) {
    return {
      id: deliveryId,
      type: event,
      timestamp: new Date().toISOString(),
      data: data,
      apiVersion: 'v1',
    };
  }

  /**
   * Generate HMAC signature for webhook
   * @private
   */
  _generateSignature(payload, secret) {
    if (!secret) return null;
    
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    const signature = hmac.digest('hex');
    
    return `sha256=${signature}`;
  }

  /**
   * Verify a webhook signature (for inbound webhooks)
   */
  static verifySignature(payload, signature, secret) {
    if (!secret || !signature) return false;
    
    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
      .digest('hex')}`;
    
    // Constant-time comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  /**
   * Track webhook delivery
   * @private
   */
  _trackDelivery(deliveryId, info) {
    this.deliveryLog.set(deliveryId, {
      ...info,
      trackedAt: new Date().toISOString(),
    });

    // Clean old entries (keep last 10000)
    if (this.deliveryLog.size > 10000) {
      const keys = Array.from(this.deliveryLog.keys());
      for (let i = 0; i < keys.length - 10000; i++) {
        this.deliveryLog.delete(keys[i]);
      }
    }

    // PRODUCTION TODO: Store in database
  }

  /**
   * Get delivery status
   */
  getDeliveryStatus(deliveryId) {
    return this.deliveryLog.get(deliveryId) || { status: 'unknown' };
  }

  /**
   * Mask URL for logging (hide query params and credentials)
   * @private
   */
  _maskUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      return url?.substring(0, 50) + '...';
    }
  }

  /**
   * Generate unique delivery ID
   * @private
   */
  _generateDeliveryId() {
    return `whd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep helper for retry delays
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
module.exports = new WebhookManager();