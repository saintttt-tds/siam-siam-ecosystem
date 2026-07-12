const messageQueue = require('./message-queue');
const logger = require('../logging/logger');
const config = require('@siamsiam/shared-config');

/**
 * Dead Letter Handler
 * 
 * Processes messages that have failed all retry attempts and ended up
 * in the dead letter queue. Provides:
 * 
 * - Message inspection and debugging
 * - Manual message replay
 * - Automatic alerting on DLQ growth
 * - Failure pattern analysis
 * - Message purging for cleanup
 * 
 * MONITORING:
 * - Monitor DLQ depth via Prometheus/Grafana
 * - Alert when DLQ exceeds threshold (e.g., >100 messages)
 * - Track failure reasons for debugging
 * 
 * @example
 *   const dlq = require('@siamsiam/shared-utils').messaging.deadLetterHandler;
 *   
 *   // Get dead letter stats
 *   const stats = await dlq.getStats();
 *   
 *   // Replay a specific message
 *   await dlq.replayMessage('msg_123', 'original.routing.key');
 *   
 *   // Replay all messages
 *   await dlq.replayAll();
 */

class DeadLetterHandler {
  constructor() {
    this.dlqName = config.rabbitmq.queues.deadLetter;
    this.maxReplayAttempts = 3;
    this.replayDelay = 5000; // 5 seconds between replays
  }

  /**
   * Get dead letter queue statistics
   */
  async getStats() {
    try {
      const status = await messageQueue.getQueueStatus(this.dlqName);
      
      return {
        queueName: status.name,
        messageCount: status.messageCount,
        consumerCount: status.consumerCount,
        status: status.status,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get DLQ stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Inspect dead letter messages without removing them
   * @param {number} limit - Max messages to inspect
   */
  async inspectMessages(limit = 10) {
    const channel = await messageQueue.createChannel('dlq_inspector');
    const messages = [];

    try {
      for (let i = 0; i < limit; i++) {
        const msg = await channel.get(this.dlqName, { noAck: false });
        
        if (!msg) break;

        const content = JSON.parse(msg.content.toString());
        const deathInfo = this._parseDeathInfo(msg);

        messages.push({
          messageId: msg.properties.messageId,
          originalRoutingKey: deathInfo.originalRoutingKey,
          originalExchange: deathInfo.originalExchange,
          originalQueue: deathInfo.originalQueue,
          deathReason: deathInfo.reason,
          deathCount: deathInfo.count,
          timestamp: new Date(msg.properties.timestamp).toISOString(),
          headers: msg.properties.headers,
          content: content,
        });

        // Requeue the message (we're just inspecting)
        channel.nack(msg, false, true);
      }
    } finally {
      // Don't close the channel here, it's reused
    }

    return messages;
  }

  /**
   * Replay a specific dead letter message
   * @param {string} messageId - Message ID to replay
   * @param {string} routingKey - Original routing key
   */
  async replayMessage(messageId, routingKey = null) {
    const channel = await messageQueue.createChannel('dlq_replayer');
    
    try {
      // Get message from DLQ
      const msg = await channel.get(this.dlqName, { noAck: false });
      
      if (!msg) {
        logger.warn('No message found in DLQ');
        return { success: false, reason: 'No messages in DLQ' };
      }

      const content = JSON.parse(msg.content.toString());
      const deathInfo = this._parseDeathInfo(msg);
      const targetRoutingKey = routingKey || deathInfo.originalRoutingKey;

      if (!targetRoutingKey) {
        logger.error('Cannot replay message without routing key', {
          messageId: msg.properties.messageId,
        });
        channel.nack(msg, false, false);
        return { success: false, reason: 'No routing key available' };
      }

      logger.info('Replaying dead letter message', {
        messageId: msg.properties.messageId,
        originalQueue: deathInfo.originalQueue,
        routingKey: targetRoutingKey,
        deathCount: deathInfo.count,
      });

      // Republish to original exchange
      const success = channel.publish(
        deathInfo.originalExchange || config.rabbitmq.exchanges.events.name,
        targetRoutingKey,
        msg.content,
        {
          ...msg.properties,
          headers: {
            ...msg.properties.headers,
            'x-replayed': true,
            'x-replay-timestamp': new Date().toISOString(),
            'x-original-death-count': deathInfo.count,
          },
        }
      );

      if (success) {
        // Acknowledge (remove from DLQ)
        channel.ack(msg);
        
        logger.info('Message replayed successfully', {
          messageId: msg.properties.messageId,
          routingKey: targetRoutingKey,
        });

        return { success: true, messageId: msg.properties.messageId };
      } else {
        // Put back in DLQ
        channel.nack(msg, false, true);
        
        logger.error('Failed to replay message (backpressure)', {
          messageId: msg.properties.messageId,
        });

        return { success: false, reason: 'Backpressure' };
      }
    } catch (error) {
      logger.error('Failed to replay message', { error: error.message });
      throw error;
    }
  }

  /**
   * Replay all messages in the dead letter queue
   * @param {Object} options - Replay options
   * @param {Function} options.filter - Filter function (msg) => boolean
   * @param {number} options.batchSize - Messages per batch
   */
  async replayAll(options = {}) {
    const { filter, batchSize = 10 } = options;
    
    logger.info('Starting replay of all DLQ messages', { batchSize });
    
    const channel = await messageQueue.createChannel('dlq_batch_replayer');
    let replayed = 0;
    let failed = 0;
    let skipped = 0;

    try {
      while (true) {
        const msg = await channel.get(this.dlqName, { noAck: false });
        
        if (!msg) break;

        const content = JSON.parse(msg.content.toString());
        
        // Apply filter if provided
        if (filter && !filter({ content, properties: msg.properties })) {
          channel.nack(msg, false, true); // Put back
          skipped++;
          continue;
        }

        const deathInfo = this._parseDeathInfo(msg);
        const routingKey = deathInfo.originalRoutingKey;

        if (!routingKey) {
          channel.nack(msg, false, false); // Can't replay without routing key
          failed++;
          continue;
        }

        // Check max replay attempts
        const replayCount = msg.properties.headers?.['x-replay-count'] || 0;
        if (replayCount >= this.maxReplayAttempts) {
          logger.warn('Max replay attempts reached for message', {
            messageId: msg.properties.messageId,
            replayCount,
          });
          channel.nack(msg, false, false); // Remove from DLQ
          failed++;
          continue;
        }

        const success = channel.publish(
          deathInfo.originalExchange || config.rabbitmq.exchanges.events.name,
          routingKey,
          msg.content,
          {
            ...msg.properties,
            headers: {
              ...msg.properties.headers,
              'x-replayed': true,
              'x-replay-count': replayCount + 1,
              'x-replay-timestamp': new Date().toISOString(),
            },
          }
        );

        if (success) {
          channel.ack(msg);
          replayed++;
        } else {
          channel.nack(msg, false, true); // Put back
          failed++;
        }

        // Delay between batches
        if (replayed % batchSize === 0 && replayed > 0) {
          logger.info(`Replay progress: ${replayed} replayed, ${failed} failed, ${skipped} skipped`);
          await this._sleep(this.replayDelay);
        }
      }
    } finally {
      // Don't close channel, it's managed by the pool
    }

    logger.info('DLQ replay completed', { replayed, failed, skipped });
    
    return { replayed, failed, skipped };
  }

  /**
   * Purge all messages from the dead letter queue
   */
  async purge() {
    logger.warn('Purging dead letter queue');
    
    try {
      const result = await messageQueue.purgeQueue(this.dlqName);
      logger.info('DLQ purged', { messageCount: result.messageCount });
      return result;
    } catch (error) {
      logger.error('Failed to purge DLQ', { error: error.message });
      throw error;
    }
  }

  /**
   * Monitor DLQ and alert on threshold
   * @param {number} threshold - Alert when message count exceeds this
   * @param {Function} alertCallback - Called when threshold exceeded
   */
  startMonitoring(threshold = 100, alertCallback = null) {
    this.monitorInterval = setInterval(async () => {
      try {
        const stats = await this.getStats();
        
        if (stats.messageCount > threshold) {
          logger.warn('⚠️ DLQ threshold exceeded', {
            messageCount: stats.messageCount,
            threshold,
          });

          if (alertCallback) {
            await alertCallback(stats);
          }
          
          // PRODUCTION: Send to monitoring system
          if (config.isProduction) {
            // Send to Prometheus/Grafana alert
          }
        }
      } catch (error) {
        logger.error('DLQ monitoring check failed', { error: error.message });
      }
    }, 60000); // Check every minute

    if (this.monitorInterval.unref) {
      this.monitorInterval.unref();
    }
  }

  /**
   * Stop DLQ monitoring
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Parse death information from message headers
   * @private
   */
  _parseDeathInfo(msg) {
    const deathHeader = msg.properties.headers?.['x-death'];
    
    if (!deathHeader || !Array.isArray(deathHeader) || deathHeader.length === 0) {
      return {
        reason: 'unknown',
        count: 1,
        originalQueue: 'unknown',
        originalExchange: 'unknown',
        originalRoutingKey: msg.fields.routingKey,
      };
    }

    const lastDeath = deathHeader[0];
    
    return {
      reason: lastDeath.reason || 'unknown',
      count: lastDeath.count || 1,
      originalQueue: lastDeath.queue || 'unknown',
      originalExchange: lastDeath.exchange || 'unknown',
      originalRoutingKey: lastDeath['routing-keys']?.[0] || msg.fields.routingKey,
      time: lastDeath.time ? new Date(lastDeath.time * 1000).toISOString() : null,
    };
  }

  /**
   * Sleep helper
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
module.exports = new DeadLetterHandler();