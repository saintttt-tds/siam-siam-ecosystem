const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Notification Model - Notification Record
 * 
 * Records all notifications sent to users across all channels.
 * Tracks delivery status, read status, clicks, and user engagement.
 * Supports personalization, localization, and A/B testing.
 * 
 * TABLE: notifications
 * 
 * NOTIFICATION CHANNELS:
 * - email: HTML and plain text email
 * - sms: Short text messages
 * - push: Mobile push notifications (APNs, FCM)
 * - whatsapp: WhatsApp Business API messages
 * - in_app: In-app notification center
 * - voice: Voice calls for urgent alerts
 * 
 * NOTIFICATION PRIORITIES:
 * - urgent (0): Immediate delivery, bypass quiet hours
 * - high (1): Deliver ASAP
 * - normal (2): Standard delivery
 * - low (3): Can be batched/delayed
 */

class Notification extends BaseModel {
  static tableName = 'notifications';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id',
    // Notification type
    'type', 'sub_type', 'category', 'template_id',
    'template_version', 'template_name',
    // Content
    'title', 'subtitle', 'body', 'body_html',
    'body_plain_text', 'sms_body', 'push_title',
    'push_body', 'whatsapp_body',
    // Data and actions
    'data', 'icon_url', 'image_url', 'thumbnail_url',
    'deep_link', 'action_url', 'action_text',
    'secondary_action_url', 'secondary_action_text',
    'dismiss_action', 'action_data',
    // Priority and scheduling
    'priority', 'importance', 'channel',
    'scheduled_for', 'sent_at', 'expires_at',
    'ttl_seconds', 'is_time_sensitive',
    // Delivery tracking
    'status', 'delivery_status', 'provider',
    'provider_message_id', 'provider_status',
    'provider_response', 'delivered_at',
    'failed_at', 'error_code', 'error_message',
    'retry_count', 'max_retries', 'last_retry_at',
    // User engagement
    'read_at', 'clicked_at', 'dismissed_at',
    'interacted_at', 'interaction_type',
    'conversion_at', 'conversion_type',
    // Reference linking
    'reference_type', 'reference_id',
    'batch_id', 'campaign_id', 'journey_id',
    'step_id', 'experiment_id', 'variant',
    // Sender context
    'sender_id', 'sender_type', 'sender_name',
    'group_id', 'segment_id',
    // Personalization
    'personalization_data', 'locale', 'language',
    'timezone', 'user_preferences_applied',
    // Compliance
    'opt_out_link', 'unsubscribe_url',
    'preferences_url', 'is_transactional',
    'is_promotional', 'gdpr_consent_required',
    // Tracking
    'open_tracked', 'click_tracked',
    'tracking_pixel_url', 'tracking_enabled',
    'utm_source', 'utm_medium', 'utm_campaign',
    'utm_content', 'utm_term',
    // Cost
    'cost', 'cost_currency', 'billing_ref',
    'is_billable',
    // Device context
    'device_id', 'device_type', 'app_version',
    'os', 'os_version', 'screen_size',
    // Feedback
    'user_feedback', 'feedback_rating',
    'feedback_comment',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at',
  ];

  static casts = {
    data: 'json', action_data: 'json',
    personalization_data: 'json', provider_response: 'json',
    metadata: 'json', tags: 'json',
    priority: 'integer', importance: 'integer',
    retry_count: 'integer', max_retries: 'integer',
    ttl_seconds: 'integer', cost: 'float',
    feedback_rating: 'integer',
    is_time_sensitive: 'boolean', is_transactional: 'boolean',
    is_promotional: 'boolean', gdpr_consent_required: 'boolean',
    open_tracked: 'boolean', click_tracked: 'boolean',
    tracking_enabled: 'boolean', is_billable: 'boolean',
    user_preferences_applied: 'boolean',
  };

  static relations = {
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
  };

  static types = {
    ORDER_CONFIRMED: 'order_confirmed', ORDER_SHIPPED: 'order_shipped',
    ORDER_DELIVERED: 'order_delivered', ORDER_CANCELLED: 'order_cancelled',
    ORDER_OUT_FOR_DELIVERY: 'order_out_for_delivery',
    PAYMENT_RECEIVED: 'payment_received', PAYMENT_FAILED: 'payment_failed',
    PAYMENT_REFUNDED: 'payment_refunded', PAYMENT_PENDING: 'payment_pending',
    REFUND_PROCESSED: 'refund_processed', REFUND_APPROVED: 'refund_approved',
    REFUND_DENIED: 'refund_denied',
    DELIVERY_UPDATE: 'delivery_update', DRIVER_ASSIGNED: 'driver_assigned',
    DRIVER_NEARBY: 'driver_nearby', DELIVERY_DELAYED: 'delivery_delayed',
    SECURITY_ALERT: 'security_alert', LOGIN_ALERT: 'login_alert',
    PASSWORD_CHANGED: 'password_changed', NEW_DEVICE_LOGIN: 'new_device_login',
    OTP: 'otp', PASSWORD_RESET: 'password_reset',
    EMAIL_VERIFICATION: 'email_verification', PHONE_VERIFICATION: 'phone_verification',
    WELCOME: 'welcome', ONBOARDING: 'onboarding', KYC_UPDATE: 'kyc_update',
    KYC_APPROVED: 'kyc_approved', KYC_REJECTED: 'kyc_rejected',
    PROMOTIONAL: 'promotional', SYSTEM: 'system', MAINTENANCE: 'maintenance',
    BILL_DUE: 'bill_due', BILL_PAID: 'bill_paid', BILL_FAILED: 'bill_failed',
    DEPOSIT_CONFIRMED: 'deposit_confirmed', DEPOSIT_PENDING: 'deposit_pending',
    DEPOSIT_FAILED: 'deposit_failed',
    GIFT_SENT: 'gift_sent', GIFT_RECEIVED: 'gift_received',
    GIFT_REDEEMED: 'gift_redeemed',
    REFERRAL_EARNED: 'referral_earned', REFERRAL_SIGNUP: 'referral_signup',
    REFERRAL_MILESTONE: 'referral_milestone',
    ACCOUNT_SUSPENDED: 'account_suspended', ACCOUNT_REACTIVATED: 'account_reactivated',
    PROFILE_INCOMPLETE: 'profile_incomplete', VERIFICATION_REMINDER: 'verification_reminder',
    REVIEW_REQUEST: 'review_request', FEEDBACK_REQUEST: 'feedback_request',
    BACK_IN_STOCK: 'back_in_stock', PRICE_DROP: 'price_drop',
    WISHLIST_REMINDER: 'wishlist_reminder', ABANDONED_CART: 'abandoned_cart',
    LOYALTY_POINTS_EARNED: 'loyalty_points_earned',
    LOYALTY_TIER_UPGRADED: 'loyalty_tier_upgraded',
    LOYALTY_POINTS_EXPIRING: 'loyalty_points_expiring',
    CUSTOM: 'custom',
  };

  static statuses = {
    PENDING: 'pending', QUEUED: 'queued', SENDING: 'sending',
    SENT: 'sent', DELIVERED: 'delivered', READ: 'read',
    CLICKED: 'clicked', INTERACTED: 'interacted', CONVERTED: 'converted',
    FAILED: 'failed', BOUNCED: 'bounced', COMPLAINED: 'complained',
    DISMISSED: 'dismissed', EXPIRED: 'expired', CANCELLED: 'cancelled',
  };

  static channels = {
    EMAIL: 'email', SMS: 'sms', PUSH: 'push',
    WHATSAPP: 'whatsapp', IN_APP: 'in_app', VOICE: 'voice',
  };

  static priorities = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

  /**
   * Send a notification to a user
   */
  static async send(userId, type, data = {}, options = {}) {
    const notification = await this.create({
      user_id: userId,
      type,
      sub_type: options.subType,
      category: options.category,
      template_id: options.templateId,
      template_version: options.templateVersion,
      template_name: options.templateName,
      title: options.title,
      subtitle: options.subtitle,
      body: options.body,
      body_html: options.bodyHtml,
      body_plain_text: options.bodyPlainText,
      sms_body: options.smsBody,
      push_title: options.pushTitle,
      push_body: options.pushBody,
      data,
      icon_url: options.iconUrl,
      image_url: options.imageUrl,
      thumbnail_url: options.thumbnailUrl,
      deep_link: options.deepLink,
      action_url: options.actionUrl,
      action_text: options.actionText,
      secondary_action_url: options.secondaryActionUrl,
      secondary_action_text: options.secondaryActionText,
      priority: options.priority !== undefined ? options.priority : this.priorities.NORMAL,
      importance: options.importance || 2,
      channel: options.channel || this.channels.PUSH,
      scheduled_for: options.scheduledFor,
      expires_at: options.expiresAt,
      ttl_seconds: options.ttlSeconds || 86400,
      is_time_sensitive: options.isTimeSensitive || false,
      status: this.statuses.PENDING,
      reference_type: options.referenceType,
      reference_id: options.referenceId ? String(options.referenceId) : null,
      batch_id: options.batchId,
      campaign_id: options.campaignId,
      journey_id: options.journeyId,
      sender_id: options.senderId || 'system',
      sender_type: options.senderType || 'system',
      sender_name: options.senderName,
      personalization_data: options.personalizationData,
      locale: options.locale || 'en',
      language: options.language || 'en',
      is_transactional: options.isTransactional !== false,
      is_promotional: options.isPromotional || false,
      tracking_enabled: options.trackingEnabled !== false,
      cost: options.cost || 0,
      cost_currency: options.costCurrency || 'USD',
      device_id: options.deviceId,
      device_type: options.deviceType,
      metadata: options.metadata || {},
      tenant_id: options.tenantId || null,
    });

    return notification;
  }

  /**
   * Find notifications for a user with pagination
   */
  static async findByUser(userId, options = {}) {
    const { unreadOnly = false, channel = null, type = null } = options;

    const where = { user_id: userId };
    if (unreadOnly) {
      where.status = [this.statuses.PENDING, this.statuses.QUEUED, this.statuses.SENDING, this.statuses.SENT, this.statuses.DELIVERED];
    }
    if (channel) where.channel = channel;
    if (type) where.type = type;

    return this.paginate({
      where,
      orderBy: { created_at: 'DESC' },
      perPage: options.perPage || 20,
      page: options.page || 1,
    });
  }

  /**
   * Get unread notification count
   */
  static async getUnreadCount(userId) {
    return this.count({
      where: {
        user_id: userId,
        status: [
          this.statuses.PENDING, this.statuses.QUEUED,
          this.statuses.SENDING, this.statuses.SENT,
          this.statuses.DELIVERED,
        ],
      },
    });
  }

  /**
   * Mark a notification as read
   */
  static async markAsRead(notificationId, userId = null) {
    const criteria = { id: notificationId };
    if (userId) criteria.user_id = userId;

    return this.update(criteria, {
      status: this.statuses.READ,
      read_at: new Date().toISOString(),
      interacted_at: new Date().toISOString(),
      interaction_type: 'read',
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userId) {
    const result = await connectionPool.query(
      `UPDATE ${this.tableName}
       SET status = $1, read_at = $2, interacted_at = $2, interaction_type = 'read'
       WHERE user_id = $3
         AND status NOT IN ('$1', 'clicked', 'interacted', 'converted', 'dismissed', 'expired')`,
      [this.statuses.READ, new Date().toISOString(), userId]
    );
    return result.rowCount;
  }

  /**
   * Record a notification click
   */
  static async markClicked(notificationId, userId = null) {
    const criteria = { id: notificationId };
    if (userId) criteria.user_id = userId;

    return this.update(criteria, {
      status: this.statuses.CLICKED,
      clicked_at: new Date().toISOString(),
      interacted_at: new Date().toISOString(),
      interaction_type: 'clicked',
    });
  }

  /**
   * Dismiss a notification
   */
  static async dismiss(notificationId, userId = null) {
    const criteria = { id: notificationId };
    if (userId) criteria.user_id = userId;

    return this.update(criteria, {
      status: this.statuses.DISMISSED,
      dismissed_at: new Date().toISOString(),
    });
  }

  /**
   * Mark notification as delivered
   */
  static async markDelivered(notificationId, providerMessageId = null, providerResponse = null) {
    return this.update({ id: notificationId }, {
      status: this.statuses.DELIVERED,
      delivery_status: 'delivered',
      delivered_at: new Date().toISOString(),
      provider_message_id: providerMessageId,
      provider_response,
    });
  }

  /**
   * Mark notification as failed
   */
  static async markFailed(notificationId, errorCode, errorMessage) {
    const notification = await this.findById(notificationId);
    if (!notification) return null;

    const retryCount = (notification.retry_count || 0) + 1;
    const maxRetries = notification.max_retries || 3;
    const isFinalFailure = retryCount >= maxRetries;

    return this.update({ id: notificationId }, {
      status: isFinalFailure ? this.statuses.FAILED : this.statuses.PENDING,
      delivery_status: 'failed',
      failed_at: new Date().toISOString(),
      error_code: errorCode,
      error_message: errorMessage?.substring(0, 500),
      retry_count: retryCount,
      last_retry_at: new Date().toISOString(),
    });
  }

  /**
   * Get notification statistics
   */
  static async getStats(options = {}) {
    const text = `
      SELECT
        COUNT(*) as total_sent,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status = 'read' THEN 1 END) as read_count,
        COUNT(CASE WHEN status = 'clicked' THEN 1 END) as clicked,
        COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'bounced' THEN 1 END) as bounced,
        ROUND(100.0 * COUNT(CASE WHEN status = 'read' THEN 1 END) / NULLIF(COUNT(CASE WHEN status = 'delivered' THEN 1 END), 0), 2) as read_rate,
        ROUND(100.0 * COUNT(CASE WHEN status = 'clicked' THEN 1 END) / NULLIF(COUNT(CASE WHEN status = 'delivered' THEN 1 END), 0), 2) as click_rate,
        ROUND(100.0 * COUNT(CASE WHEN status = 'delivered' THEN 1 END) / NULLIF(COUNT(*), 0), 2) as delivery_rate
      FROM ${this.tableName}
      WHERE 1=1
        ${options.startDate ? 'AND created_at >= $1' : ''}
        ${options.endDate ? `AND created_at <= $${options.startDate ? 2 : 1}` : ''}
        ${options.campaignId ? `AND campaign_id = $${(options.startDate ? 2 : 1) + (options.endDate ? 1 : 0) + 1}` : ''}
    `;

    const values = [];
    if (options.startDate) values.push(options.startDate);
    if (options.endDate) values.push(options.endDate);
    if (options.campaignId) values.push(options.campaignId);

    const result = await connectionPool.query(text, values.length > 0 ? values : undefined);
    return result.rows[0];
  }
}

module.exports = Notification;