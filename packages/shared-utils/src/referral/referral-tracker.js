const logger = require('../logging/logger');

/**
 * Referral Conversion Tracking
 * 
 * Tracks all referral events and conversions:
 * - Referral creation and sharing
 * - Link clicks and impressions
 * - Sign-ups via referral
 * - Qualifying actions
 * - Commission earnings
 * - Payout processing
 * 
 * TRACKING EVENTS:
 * - created: Referral code/link generated
 * - shared: Referral shared via social/email/messaging
 * - clicked: Referral link clicked
 * - signed_up: User signed up using referral
 * - converted: Referral conversion completed
 * - commission_earned: Commission credited
 * - commission_paid: Commission paid out
 * - expired: Referral expired
 * - deactivated: Referral deactivated
 * 
 * @example
 *   const tracker = require('@siamsiam/shared-utils').referral.referralTracker;
 *   
 *   tracker.trackEvent('ref_123', 'shared', { channel: 'whatsapp', userId: 'user_456' });
 *   const events = tracker.getEvents('ref_123');
 *   const stats = tracker.getStats('user_789');
 */

class ReferralTracker {
  constructor() {
    // Event storage: referralId -> events array
    this.events = new Map();
    
    // Maximum events to store per referral
    this.maxEventsPerReferral = 1000;
    
    // Cleanup old events after 90 days
    this.eventRetentionDays = 90;
  }

  /**
   * Track a referral event
   * @param {string} referralId - Referral identifier
   * @param {string} eventType - Type of event
   * @param {Object} data - Event data
   */
  trackEvent(referralId, eventType, data = {}) {
    if (!this.events.has(referralId)) {
      this.events.set(referralId, []);
    }

    const events = this.events.get(referralId);
    
    // Prevent duplicate events
    if (eventType === 'converted' || eventType === 'commission_earned') {
      const duplicate = events.find(e => 
        e.type === eventType && 
        e.data?.userId === data?.userId
      );
      if (duplicate) {
        logger.debug('Duplicate referral event ignored', { referralId, eventType });
        return;
      }
    }

    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      referralId,
      type: eventType,
      data,
      timestamp: new Date().toISOString(),
    };

    events.push(event);

    // Trim old events
    if (events.length > this.maxEventsPerReferral) {
      events.splice(0, events.length - this.maxEventsPerReferral);
    }

    logger.debug('Referral event tracked', { referralId, eventType });
  }

  /**
   * Get all events for a referral
   * @param {string} referralId - Referral identifier
   * @param {string} eventType - Filter by event type (optional)
   * @returns {Array} Array of events
   */
  getEvents(referralId, eventType = null) {
    const events = this.events.get(referralId) || [];
    
    if (eventType) {
      return events.filter(e => e.type === eventType);
    }
    
    return events;
  }

  /**
   * Get referral statistics
   * @param {string} referralId - Referral identifier
   * @returns {Object} Referral statistics
   */
  getReferralStats(referralId) {
    const events = this.events.get(referralId) || [];
    
    const stats = {
      referralId,
      totalEvents: events.length,
      shares: 0,
      clicks: 0,
      signups: 0,
      conversions: 0,
      commissionsEarned: 0,
      commissionsPaid: 0,
      totalEarned: 0,
      conversionRate: 0,
      firstEvent: events[0]?.timestamp || null,
      lastEvent: events[events.length - 1]?.timestamp || null,
    };

    for (const event of events) {
      switch (event.type) {
        case 'shared': stats.shares++; break;
        case 'clicked': stats.clicks++; break;
        case 'signed_up': stats.signups++; break;
        case 'converted': stats.conversions++; break;
        case 'commission_earned':
          stats.commissionsEarned++;
          stats.totalEarned += (event.data?.amount || 0);
          break;
        case 'commission_paid': stats.commissionsPaid++; break;
      }
    }

    // Calculate conversion rate
    if (stats.clicks > 0) {
      stats.conversionRate = Math.round((stats.conversions / stats.clicks) * 10000) / 100;
    }

    // Calculate share-to-conversion rate
    if (stats.shares > 0) {
      stats.shareConversionRate = Math.round((stats.conversions / stats.shares) * 10000) / 100;
    }

    return stats;
  }

  /**
   * Get aggregated statistics for a user across all referrals
   * @param {string} userId - User identifier
   * @param {Map} referrals - Map of all referrals (from ReferralEngine)
   * @returns {Object} User referral statistics
   */
  getUserStats(userId, referrals) {
    const userReferrals = [];
    
    // Find all referrals for this user
    for (const [id, referral] of referrals) {
      if (referral.referrerId === userId) {
        userReferrals.push(id);
      }
    }

    const stats = {
      userId,
      totalReferrals: userReferrals.length,
      activeReferrals: 0,
      totalClicks: 0,
      totalConversions: 0,
      totalEarned: 0,
      conversionRate: 0,
    };

    for (const refId of userReferrals) {
      const refStats = this.getReferralStats(refId);
      const referral = referrals.get(refId);
      
      if (referral?.status === 'active') stats.activeReferrals++;
      stats.totalClicks += refStats.clicks;
      stats.totalConversions += refStats.conversions;
      stats.totalEarned += refStats.totalEarned;
    }

    if (stats.totalClicks > 0) {
      stats.conversionRate = Math.round((stats.totalConversions / stats.totalClicks) * 10000) / 100;
    }

    return stats;
  }

  /**
   * Get event counts by type for a date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Object} Event counts by type
   */
  getEventCountsByDate(startDate, endDate = new Date()) {
    const counts = {};
    
    for (const [, events] of this.events) {
      for (const event of events) {
        const eventDate = new Date(event.timestamp);
        if (eventDate >= startDate && eventDate <= endDate) {
          counts[event.type] = (counts[event.type] || 0) + 1;
        }
      }
    }
    
    return counts;
  }
}

// Export singleton instance
module.exports = new ReferralTracker();