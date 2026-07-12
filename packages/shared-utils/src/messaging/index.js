/**
 * Messaging Module Index
 * 
 * Centralized message queue infrastructure using RabbitMQ.
 * Enables asynchronous communication between microservices
 * with guaranteed delivery, retry policies, and dead letter handling.
 */

module.exports = {
  eventBus: require('./event-bus'),
  messageQueue: require('./message-queue'),
  webhookManager: require('./webhook-manager'),
  deadLetterHandler: require('./dead-letter-handler'),
  retryPolicy: require('./retry-policy'),
};