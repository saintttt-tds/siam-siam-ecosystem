/**
 * Real-time Module Index
 * 
 * WebSocket and Server-Sent Events infrastructure for
 * real-time features across the ecosystem.
 */

module.exports = {
  websocketManager: require('./websocket-manager'),
  sseManager: require('./sse-manager'),
  presenceTracker: require('./presence-tracker'),
  roomManager: require('./room-manager'),
  broadcastService: require('./broadcast-service'),
};