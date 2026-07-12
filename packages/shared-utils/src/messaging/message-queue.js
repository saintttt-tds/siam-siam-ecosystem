const amqp = require('amqplib');
const config = require('@siamsiam/shared-config');
const logger = require('../logging/logger');

/**
 * RabbitMQ Message Queue Interface
 * 
 * Core messaging infrastructure for inter-service communication.
 * Provides low-level access to RabbitMQ with connection management,
 * channel pooling, and automatic reconnection.
 * 
 * ARCHITECTURE:
 * - Topic exchange for flexible routing
 * - Durable queues for message persistence
 * - Dead letter exchange for failed messages
 * - Manual acknowledgment for guaranteed processing
 * - Connection pooling for performance
 * 
 * PRODUCTION REQUIREMENTS:
 * - Use TLS (amqps://) for encrypted connections
 * - Configure appropriate vhosts per environment
 * - Set up clustering for high availability
 * - Monitor queue depths, consumer counts, and message rates
 * - Set memory/disk alarms appropriately
 * - Use separate connections for publishing and consuming
 * 
 * @example
 *   const mq = require('@siamsiam/shared-utils').messaging.messageQueue;
 *   
 *   // Publish
 *   await mq.publish('user.created', { userId: 123 });
 *   
 *   // Subscribe
 *   await mq.subscribe('auth.service.queue', async (content, msg) => {
 *     await processMessage(content);
 *   });
 */

class MessageQueue {
  constructor() {
    this.connection = null;
    this.channels = new Map();
    this.consumers = new Map();
    this.isConnected = false;
    this.isShuttingDown = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = config.rabbitmq.options.retry.maxAttempts || 10;
    
    // Metrics
    this.metrics = {
      messagesPublished: 0,
      messagesConsumed: 0,
      messagesFailed: 0,
      messagesRetried: 0,
      reconnections: 0,
    };
  }

  /**
   * Connect to RabbitMQ with exponential backoff retry
   */
  async connect() {
    if (this.isConnected) return;
    
    try {
      const url = config.rabbitmq.url;
      
      // PRODUCTION: Validate URL scheme
      if (config.isProduction && !url.startsWith('amqps://')) {
        logger.warn('⚠️ RabbitMQ not using TLS in production!');
      }
      
      logger.info('Connecting to RabbitMQ...', { 
        host: url.replace(/\/\/.*@/, '//***@'), // Mask credentials in logs
      });
      
      this.connection = await amqp.connect(url, {
        heartbeat: config.rabbitmq.options.heartbeat || 30,
        timeout: config.rabbitmq.options.connectionTimeout || 10000,
        // PRODUCTION: Add SSL options
        // cert: fs.readFileSync('/path/to/cert.pem'),
        // key: fs.readFileSync('/path/to/key.pem'),
        // ca: [fs.readFileSync('/path/to/ca.pem')],
      });

      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.isShuttingDown = false;

      // Connection event handlers
      this.connection.on('error', (err) => {
        logger.error('RabbitMQ connection error', { 
          error: err.message,
          code: err.code,
        });
        this._handleDisconnect();
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this._handleDisconnect();
      });

      this.connection.on('blocked', (reason) => {
        logger.warn('RabbitMQ connection blocked', { reason });
        // PRODUCTION: Send alert - broker is low on resources
      });

      this.connection.on('unblocked', () => {
        logger.info('RabbitMQ connection unblocked');
      });

      // Setup infrastructure (exchanges, queues, bindings)
      await this._setupInfrastructure();

      logger.info('✅ RabbitMQ connected and infrastructure ready');
    } catch (error) {
      logger.error('Failed to connect to RabbitMQ', { 
        error: error.message,
        code: error.code,
      });
      this._handleDisconnect();
    }
  }

  /**
   * Handle disconnection with automatic reconnection
   * @private
   */
  async _handleDisconnect() {
    this.isConnected = false;
    this.channels.clear();
    this.consumers.clear();

    if (this.isShuttingDown) {
      logger.info('Not reconnecting - graceful shutdown in progress');
      return;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.metrics.reconnections++;
      
      // Exponential backoff with jitter
      const baseDelay = config.rabbitmq.options.retry.minTimeout || 1000;
      const maxDelay = config.rabbitmq.options.retry.maxTimeout || 30000;
      const delay = Math.min(
        baseDelay * Math.pow(2, this.reconnectAttempts),
        maxDelay
      );
      const jitter = delay * 0.1 * (Math.random() * 2 - 1); // ±10% jitter
      const finalDelay = Math.round(delay + jitter);

      logger.warn(`RabbitMQ reconnecting in ${finalDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => this.connect(), finalDelay);
    } else {
      logger.error('❌ Max RabbitMQ reconnection attempts reached');
      
      // PRODUCTION: Send critical alert
      if (config.isProduction) {
        // Trigger PagerDuty/OpsGenie alert
      }
    }
  }

  /**
   * Setup exchanges, queues, and bindings
   * @private
   */
  async _setupInfrastructure() {
    const channel = await this.connection.createChannel();
    
    try {
      // ========== EXCHANGES ==========
      
      // Main event exchange (topic)
      await channel.assertExchange(
        config.rabbitmq.exchanges.events.name,
        config.rabbitmq.exchanges.events.type,
        {
          durable: config.rabbitmq.exchanges.events.durable,
          autoDelete: false,
          internal: false,
        }
      );
      
      logger.debug('Event exchange asserted', {
        name: config.rabbitmq.exchanges.events.name,
      });

      // Dead letter exchange
      await channel.assertExchange(
        config.rabbitmq.exchanges.deadLetter.name,
        config.rabbitmq.exchanges.deadLetter.type,
        {
          durable: config.rabbitmq.exchanges.deadLetter.durable,
          autoDelete: false,
          internal: false,
        }
      );

      // ========== QUEUES ==========
      
      const queues = config.rabbitmq.queues;
      
      for (const [service, queueName] of Object.entries(queues)) {
        if (queueName.includes('dead')) continue;
        
        await channel.assertQueue(queueName, {
          durable: true,
          exclusive: false,
          autoDelete: false,
          arguments: {
            'x-dead-letter-exchange': config.rabbitmq.exchanges.deadLetter.name,
            'x-dead-letter-routing-key': `${service}.dead`,
            'x-message-ttl': 86400000, // 24 hours TTL
            'x-max-length': 100000, // Max queue length
            'x-overflow': 'reject-publish', // Reject when full
          },
        });

        // Bind to exchange with service-specific routing
        await channel.bindQueue(
          queueName,
          config.rabbitmq.exchanges.events.name,
          `${service}.#` // Matches all events for this service
        );
        
        logger.debug('Queue asserted and bound', { queue: queueName, service });
      }

      // Dead letter queue
      await channel.assertQueue(config.rabbitmq.queues.deadLetter, {
        durable: true,
        arguments: {
          'x-message-ttl': 604800000, // 7 days TTL for dead letters
        },
      });

      await channel.bindQueue(
        config.rabbitmq.queues.deadLetter,
        config.rabbitmq.exchanges.deadLetter.name,
        '#'
      );

      logger.info('✅ RabbitMQ infrastructure setup complete');
    } catch (error) {
      logger.error('Failed to setup RabbitMQ infrastructure', { 
        error: error.message,
      });
      throw error;
    } finally {
      await channel.close();
    }
  }

  /**
   * Create or get a channel from the pool
   * Channels are lightweight connections that share a TCP connection
   */
  async createChannel(name = 'default') {
    if (!this.isConnected) {
      throw new Error('Not connected to RabbitMQ');
    }

    if (!this.channels.has(name)) {
      const channel = await this.connection.createChannel();
      
      // Set prefetch to control concurrent message processing
      await channel.prefetch(1); // Process one message at a time
      
      channel.on('error', (err) => {
        logger.error(`Channel error [${name}]`, { error: err.message });
        this.channels.delete(name);
      });

      channel.on('close', () => {
        logger.debug(`Channel closed [${name}]`);
        this.channels.delete(name);
      });

      channel.on('drain', () => {
        logger.debug(`Channel drain [${name}]`);
      });

      this.channels.set(name, channel);
    }

    return this.channels.get(name);
  }

  /**
   * Publish a message to the event exchange
   * @param {string} routingKey - Routing key (e.g., 'user.created')
   * @param {Object} data - Message payload (will be JSON serialized)
   * @param {Object} options - Publishing options
   * @returns {boolean} Whether the message was sent (false = backpressure)
   */
  async publish(routingKey, data, options = {}) {
    try {
      const channel = await this.createChannel('publisher');
      
      const messageId = options.messageId || this._generateMessageId();
      
      const messageOptions = {
        persistent: true, // Survive broker restart
        contentType: 'application/json',
        contentEncoding: 'utf-8',
        messageId,
        timestamp: Date.now(),
        correlationId: options.correlationId || messageId,
        expiration: options.expiration || undefined,
        headers: {
          source: process.env.SERVICE_NAME || 'unknown',
          environment: config.env,
          timestamp: new Date().toISOString(),
          ...options.headers,
        },
        ...options,
      };

      const success = channel.publish(
        config.rabbitmq.exchanges.events.name,
        routingKey,
        Buffer.from(JSON.stringify(data)),
        messageOptions
      );

      if (success) {
        this.metrics.messagesPublished++;
        logger.debug('Message published', { 
          routingKey, 
          messageId,
          exchange: config.rabbitmq.exchanges.events.name,
        });
      } else {
        // Channel write buffer is full - backpressure
        logger.warn('Message publish returned false (backpressure)', { 
          routingKey,
          messageId,
        });
        
        // PRODUCTION: Implement circuit breaker or fallback
        // Could buffer to disk or use an alternative queue
      }

      return success;
    } catch (error) {
      logger.error('Failed to publish message', {
        routingKey,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Subscribe to a queue and process messages
   * @param {string} queueName - Queue to consume from
   * @param {Function} handler - Async message handler (content, rawMessage) => Promise<void>
   * @param {Object} options - Consumer options
   */
  async subscribe(queueName, handler, options = {}) {
    try {
      const channelName = options.channelName || `consumer_${queueName}`;
      const channel = await this.createChannel(channelName);
      
      // Ensure queue exists
      await channel.assertQueue(queueName, { durable: true });
      
      // Bind if routing pattern is provided
      if (options.routingPattern) {
        await channel.bindQueue(
          queueName,
          config.rabbitmq.exchanges.events.name,
          options.routingPattern
        );
      }

      const consumerTag = (await channel.consume(queueName, async (msg) => {
        if (!msg) return;

        const startTime = Date.now();
        
        try {
          const content = JSON.parse(msg.content.toString());
          const routingKey = msg.fields.routingKey;
          
          logger.debug('Message received', {
            queue: queueName,
            routingKey,
            messageId: msg.properties.messageId,
            redelivered: msg.fields.redelivered,
          });

          // Call handler
          await handler(content, msg);
          
          // Acknowledge on success
          channel.ack(msg);
          this.metrics.messagesConsumed++;
          
          const duration = Date.now() - startTime;
          logger.debug('Message processed successfully', {
            queue: queueName,
            messageId: msg.properties.messageId,
            duration: `${duration}ms`,
          });
        } catch (error) {
          const duration = Date.now() - startTime;
          
          logger.error('Message processing failed', {
            queue: queueName,
            messageId: msg.properties.messageId,
            error: error.message,
            duration: `${duration}ms`,
            redeliveryCount: msg.fields.redelivered ? '1+' : '0',
          });

          this.metrics.messagesFailed++;

          // Determine retry strategy
          const shouldRetry = options.requeueOnError || false;
          const maxRetries = options.maxRetries || 3;
          const retryCount = (msg.properties.headers?.['x-retry-count'] || 0) + 1;

          if (shouldRetry && retryCount <= maxRetries) {
            // Requeue with retry count header
            const retryDelay = this._calculateRetryDelay(retryCount);
            
            channel.nack(msg, false, false); // Don't requeue
            
            // Republish with retry count
            channel.publish(
              config.rabbitmq.exchanges.events.name,
              msg.fields.routingKey,
              msg.content,
              {
                ...msg.properties,
                headers: {
                  ...msg.properties.headers,
                  'x-retry-count': retryCount,
                  'x-last-error': error.message,
                },
                expiration: retryDelay.toString(),
              }
            );
            
            this.metrics.messagesRetried++;
            
            logger.info('Message scheduled for retry', {
              queue: queueName,
              messageId: msg.properties.messageId,
              retryCount,
              delayMs: retryDelay,
            });
          } else {
            // Send to dead letter queue (nack without requeue)
            channel.nack(msg, false, false);
            
            logger.warn('Message sent to dead letter queue', {
              queue: queueName,
              messageId: msg.properties.messageId,
              retryCount,
              maxRetries,
            });
          }
        }
      }, {
        noAck: false, // Manual acknowledgment
        exclusive: options.exclusive || false,
      })).consumerTag;

      // Store consumer for management
      const consumerId = `${queueName}_${consumerTag}`;
      this.consumers.set(consumerId, {
        channel,
        consumerTag,
        queueName,
        channelName,
      });

      logger.info(`Subscribed to queue: ${queueName}`, {
        consumerTag,
        channelName,
      });

      return { consumerTag, consumerId };
    } catch (error) {
      logger.error('Failed to subscribe to queue', {
        queue: queueName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Unsubscribe from a queue
   */
  async unsubscribe(consumerId) {
    const consumer = this.consumers.get(consumerId);
    
    if (consumer) {
      try {
        await consumer.channel.cancel(consumer.consumerTag);
        this.consumers.delete(consumerId);
        logger.info(`Unsubscribed from queue: ${consumer.queueName}`);
      } catch (error) {
        logger.error('Failed to unsubscribe', {
          queue: consumer.queueName,
          error: error.message,
        });
      }
    }
  }

  /**
   * Get queue status
   */
  async getQueueStatus(queueName) {
    try {
      const channel = await this.createChannel('admin');
      const status = await channel.checkQueue(queueName);
      
      return {
        name: status.queue,
        messageCount: status.messageCount,
        consumerCount: status.consumerCount,
        status: 'ok',
      };
    } catch (error) {
      logger.error('Failed to get queue status', {
        queue: queueName,
        error: error.message,
      });
      return {
        name: queueName,
        status: 'error',
        error: error.message,
      };
    }
  }

  /**
   * Get all queue statuses
   */
  async getAllQueueStatuses() {
    const statuses = {};
    
    for (const [queueName] of Object.entries(config.rabbitmq.queues)) {
      statuses[queueName] = await this.getQueueStatus(queueName);
    }
    
    return statuses;
  }

  /**
   * Purge a queue (delete all messages)
   */
  async purgeQueue(queueName) {
    try {
      const channel = await this.createChannel('admin');
      const result = await channel.purgeQueue(queueName);
      logger.info(`Queue purged: ${queueName}`, { messageCount: result.messageCount });
      return result;
    } catch (error) {
      logger.error('Failed to purge queue', {
        queue: queueName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get connection metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      activeChannels: this.channels.size,
      activeConsumers: this.consumers.size,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('Shutting down RabbitMQ connections...');
    this.isShuttingDown = true;
    
    // Cancel all consumers
    for (const [id, consumer] of this.consumers) {
      try {
        await consumer.channel.cancel(consumer.consumerTag);
        logger.debug(`Consumer cancelled: ${consumer.queueName}`);
      } catch (error) {
        logger.warn(`Failed to cancel consumer: ${consumer.queueName}`, {
          error: error.message,
        });
      }
    }
    this.consumers.clear();
    
    // Close all channels
    for (const [name, channel] of this.channels) {
      try {
        await channel.close();
        logger.debug(`Channel closed: ${name}`);
      } catch (error) {
        logger.warn(`Failed to close channel: ${name}`, {
          error: error.message,
        });
      }
    }
    this.channels.clear();
    
    // Close connection
    if (this.connection) {
      try {
        await this.connection.close();
        logger.info('RabbitMQ connection closed');
      } catch (error) {
        logger.warn('Failed to close RabbitMQ connection', {
          error: error.message,
        });
      }
    }
    
    this.isConnected = false;
    logger.info('✅ RabbitMQ shutdown complete');
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Calculate retry delay with exponential backoff
   * @private
   */
  _calculateRetryDelay(retryCount) {
    const baseDelay = 1000; // 1 second
    const maxDelay = 60000; // 1 minute
    const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
    // Add jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.round(delay + jitter);
  }

  /**
   * Generate unique message ID
   * @private
   */
  _generateMessageId() {
    const crypto = require('crypto');
    return `msg_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  }
}

// Singleton instance
const messageQueue = new MessageQueue();

module.exports = messageQueue;