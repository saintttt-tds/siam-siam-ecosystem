const messageQueue = require('./message-queue');
const logger = require('../logging/logger');
const config = require('@siamsiam/shared-config');

/**
 * Internal Pub/Sub Event System
 * 
 * Provides a high-level event bus abstraction over RabbitMQ
 * for inter-service communication. Services can publish events
 * and subscribe to events they're interested in.
 * 
 * EVENT NAMING CONVENTION:
 *   {resource}.{action}
 *   Examples: user.created, payment.completed, order.shipped
 * 
 * FEATURES:
 * - Topic-based publish/subscribe
 * - Event versioning support
 * - Event correlation (causation tracking)
 * - Automatic retry for failed subscribers
 * - Event schema validation (optional)
 * 
 * @example
 *   const eventBus = require('@siamsiam/shared-utils').messaging.eventBus;
 *   
 *   // Publish
 *   await eventBus.publish('user.created', { userId: 123, email: 'user@example.com' });
 *   
 *   // Subscribe
 *   await eventBus.subscribe('user.#', async (event) => {
 *     console.log(`User event: ${event.type}`, event.data);
 *   });
 */

class EventBus {
  constructor() {
    this.handlers = new Map();
    this.serviceName = process.env.SERVICE_NAME || 'unknown';
    this.eventVersion = '1.0';
  }

  /**
   * Publish an event
   * @param {string} eventType - Event type (e.g., 'user.created')
   * @param {Object} data - Event payload
   * @param {Object} options - Publishing options
   * @returns {Promise<string>} Event ID
   */
  async publish(eventType, data, options = {}) {
    const event = this._createEvent(eventType, data, options);
    
    try {
      const routingKey = this._eventTypeToRoutingKey(eventType);
      
      const published = await messageQueue.publish(routingKey, event, {
        messageId: event.id,
        correlationId: options.correlationId || event.id,
        headers: {
          eventType,
          eventVersion: this.eventVersion,
          source: this.serviceName,
          timestamp: event.timestamp,
        },
      });
      
      if (published) {
        logger.debug('Event published', { eventType, eventId: event.id });
      }
      
      // Emit locally for in-process subscribers
      this._emitLocal(eventType, event);
      
      return event.id;
    } catch (error) {
      logger.error('Failed to publish event', {
        eventType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Subscribe to events matching a pattern
   * @param {string} pattern - Event pattern (e.g., 'user.#' for all user events)
   * @param {Function} handler - Event handler function
   * @param {Object} options - Subscription options
   */
  async subscribe(pattern, handler, options = {}) {
    const queueName = options.queueName || this._patternToQueueName(pattern);
    const routingPattern = this._patternToRoutingKey(pattern);
    
    // Store handler for potential local dispatch
    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, []);
    }
    this.handlers.get(pattern).push(handler);
    
    try {
      await messageQueue.subscribe(queueName, async (content, msg) => {
        const event = content;
        
        // Check event version compatibility
        if (options.minVersion && this._compareVersions(event.version, options.minVersion) < 0) {
          logger.debug('Event version too old, skipping', {
            eventType: event.type,
            eventVersion: event.version,
            minVersion: options.minVersion,
          });
          return;
        }
        
        logger.debug('Event received', {
          eventType: event.type,
          eventId: event.id,
          source: event.source,
        });
        
        try {
          await handler(event, msg);
        } catch (error) {
          logger.error('Event handler failed', {
            eventType: event.type,
            eventId: event.id,
            error: error.message,
          });
          throw error; // Re-throw to trigger nack/retry
        }
      }, {
        requeueOnError: options.requeueOnError || false,
      });
      
      logger.info(`Subscribed to events: ${pattern}`, {
        queueName,
        routingPattern,
      });
    } catch (error) {
      logger.error('Failed to subscribe to events', {
        pattern,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Unsubscribe from events
   */
  async unsubscribe(pattern, handler) {
    const handlers = this.handlers.get(pattern);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
      if (handlers.length === 0) {
        this.handlers.delete(pattern);
      }
    }
  }

  /**
   * Request-response pattern (RPC over events)
   */
  async request(eventType, data, timeout = 30000) {
    const correlationId = this._generateId();
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Request timeout for ${eventType} after ${timeout}ms`));
      }, timeout);
      
      // Subscribe to response
      this.subscribe(`${eventType}.response`, async (event) => {
        if (event.correlationId === correlationId) {
          clearTimeout(timer);
          resolve(event.data);
        }
      }, { queueName: `rpc.response.${correlationId}` });
      
      // Publish request
      this.publish(eventType, data, { correlationId }).catch(reject);
    });
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Create an event object
   * @private
   */
  _createEvent(eventType, data, options = {}) {
    return {
      id: options.eventId || this._generateId(),
      type: eventType,
      version: options.version || this.eventVersion,
      source: options.source || this.serviceName,
      timestamp: new Date().toISOString(),
      correlationId: options.correlationId || null,
      causationId: options.causationId || null,
      tenantId: options.tenantId || null,
      userId: options.userId || null,
      data: data,
      metadata: options.metadata || {},
    };
  }

  /**
   * Convert event type to routing key
   * @private
   */
  _eventTypeToRoutingKey(eventType) {
    // 'user.created' -> 'user.created'
    // 'payment.refund.processed' -> 'payment.refund.processed'
    return eventType;
  }

  /**
   * Convert subscription pattern to routing key pattern
   * @private
   */
  _patternToRoutingKey(pattern) {
    // 'user.#' -> 'user.#' (all user events)
    // 'payment.*' -> 'payment.*' (single-level wildcard)
    return pattern;
  }

  /**
   * Convert pattern to queue name
   * @private
   */
  _patternToQueueName(pattern) {
    // 'user.#' -> 'siamsiam.events.user.all'
    const clean = pattern.replace(/[#*.]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    return `${this.serviceName}.events.${clean}`;
  }

  /**
   * Emit event to local handlers
   * @private
   */
  _emitLocal(eventType, event) {
    for (const [pattern, handlers] of this.handlers) {
      if (this._matchesPattern(eventType, pattern)) {
        for (const handler of handlers) {
          try {
            handler(event);
          } catch (error) {
            logger.error('Local event handler failed', {
              eventType,
              pattern,
              error: error.message,
            });
          }
        }
      }
    }
  }

  /**
   * Check if event type matches subscription pattern
   * @private
   */
  _matchesPattern(eventType, pattern) {
    // Convert RabbitMQ pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '[^.]+')
      .replace(/#/g, '.*');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(eventType);
  }

  /**
   * Compare semantic versions
   * @private
   */
  _compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const a = parts1[i] || 0;
      const b = parts2[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    
    return 0;
  }

  /**
   * Generate unique ID
   * @private
   */
  _generateId() {
    const crypto = require('crypto');
    return `evt_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }
}

// Export singleton instance
module.exports = new EventBus();