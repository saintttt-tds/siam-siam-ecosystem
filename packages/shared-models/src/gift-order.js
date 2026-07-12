const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Gift Order Model - Gift Purchase Order
 * 
 * Extends standard orders with gift-specific features including
 * personalized messages, gift wrapping, scheduled delivery,
 * anonymous sending, and gift receipt options.
 * 
 * TABLE: gift_orders
 * 
 * GIFT FEATURES:
 * - Personalized messages (text, voice, video)
 * - Gift wrapping (standard, premium, luxury, eco)
 * - Scheduled delivery for special occasions
 * - Anonymous sending (recipient doesn't know sender)
 * - Gift receipts (hide prices from recipient)
 * - Group gifting (multiple people contribute)
 * - Registry integration (wedding, baby shower, etc.)
 * 
 * DELIVERY OPTIONS:
 * - Immediate: Send right away
 * - Scheduled: Deliver on specific date
 * - Pre-announcement: Notify recipient before delivery
 * - Surprise: No notification until delivery
 */

class GiftOrder extends BaseModel {
  static tableName = 'gift_orders';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'order_id', 'sender_id',
    // Sender preferences
    'is_anonymous', 'reveal_sender_on', 'anonymous_alias',
    'sender_name_display', 'sender_message_style',
    // Recipient information
    'recipient_name', 'recipient_email', 'recipient_phone',
    'recipient_address_id', 'recipient_user_id',
    'recipient_notification_preference',
    // Gift message
    'message', 'message_type', 'message_format',
    'message_audio_url', 'message_video_url',
    'message_font', 'message_color', 'message_card_design',
    // Gift wrapping
    'gift_wrap_type', 'gift_wrap_color', 'gift_wrap_pattern',
    'gift_wrap_message', 'gift_bag', 'tissue_paper',
    'tissue_paper_color', 'ribbon', 'ribbon_color',
    'gift_box', 'gift_tag', 'gift_tag_message',
    // Gift receipt
    'gift_receipt', 'include_price', 'include_exchange_info',
    'return_policy_notes',
    // Scheduling
    'is_scheduled', 'delivery_date', 'delivery_window_start',
    'delivery_window_end', 'cannot_deliver_before',
    'timezone', 'is_recurring_annual',
    // Pre-delivery
    'pre_announcement_sent', 'pre_announcement_date',
    'pre_announcement_channel', 'pre_announcement_message',
    // Delivery
    'delivery_method', 'delivery_instructions',
    'leave_at_door', 'require_signature', 'signature_name',
    'delivery_confirmation_method', 'delivery_confirmation_sent',
    // Recipient actions
    'recipient_notified', 'notification_date',
    'notification_channel', 'notification_status',
    'recipient_viewed', 'viewed_at',
    'recipient_accepted', 'accepted_at',
    'recipient_redeemed', 'redeemed_at', 'redemption_method',
    'recipient_exchanged', 'exchanged_at', 'exchange_order_id',
    'recipient_returned', 'returned_at', 'return_order_id',
    // Gift registry
    'gift_registry_id', 'gift_registry_item_id',
    'registry_contribution', 'registry_message',
    // Group gifting
    'group_gift_id', 'group_gift_contribution',
    'group_gift_target_amount', 'group_gift_deadline',
    'group_gift_status',
    // Return/Exchange policy
    'returnable', 'return_window_days', 'exchangeable',
    'exchange_window_days', 'return_to_sender',
    // Thank you
    'thank_you_sent', 'thank_you_date', 'thank_you_message',
    'thank_you_channel',
    // Notifications timeline
    'notifications_sent', 'notification_history',
    // Status
    'status', 'sub_status', 'status_history',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    is_anonymous: 'boolean', gift_receipt: 'boolean',
    include_price: 'boolean', include_exchange_info: 'boolean',
    is_scheduled: 'boolean', is_recurring_annual: 'boolean',
    gift_bag: 'boolean', tissue_paper: 'boolean', ribbon: 'boolean',
    gift_box: 'boolean', gift_tag: 'boolean',
    leave_at_door: 'boolean', require_signature: 'boolean',
    pre_announcement_sent: 'boolean', delivery_confirmation_sent: 'boolean',
    recipient_notified: 'boolean', recipient_viewed: 'boolean',
    recipient_accepted: 'boolean', recipient_redeemed: 'boolean',
    recipient_exchanged: 'boolean', recipient_returned: 'boolean',
    returnable: 'boolean', exchangeable: 'boolean',
    return_to_sender: 'boolean', thank_you_sent: 'boolean',
    group_gift_contribution: 'float', group_gift_target_amount: 'float',
    return_window_days: 'integer', exchange_window_days: 'integer',
    notification_history: 'json', status_history: 'json',
    metadata: 'json', tags: 'json',
  };

  static relations = {
    order: { type: 'belongsTo', model: 'Order', foreignKey: 'order_id', ownerKey: 'id' },
    sender: { type: 'belongsTo', model: 'User', foreignKey: 'sender_id', ownerKey: 'id' },
    recipient: { type: 'belongsTo', model: 'User', foreignKey: 'recipient_user_id', ownerKey: 'id' },
    registry: { type: 'belongsTo', model: 'GiftRegistry', foreignKey: 'gift_registry_id', ownerKey: 'id' },
  };

  static messageTypes = { TEXT: 'text', VOICE: 'voice', VIDEO: 'video', CARD: 'card', NONE: 'none' };
  static giftWrapTypes = { STANDARD: 'standard', PREMIUM: 'premium', LUXURY: 'luxury', ECO: 'eco', MINIMAL: 'minimal', NONE: 'none' };
  static statuses = {
    PENDING: 'pending', SCHEDULED: 'scheduled', PROCESSING: 'processing',
    IN_TRANSIT: 'in_transit', DELIVERED: 'delivered', NOTIFIED: 'notified',
    VIEWED: 'viewed', ACCEPTED: 'accepted', REDEEMED: 'redeemed',
    EXCHANGED: 'exchanged', RETURNED: 'returned', CANCELLED: 'cancelled',
    FAILED: 'failed',
  };
  static deliveryConfirmationMethods = { PHOTO: 'photo', SIGNATURE: 'signature', SMS_CODE: 'sms_code', EMAIL: 'email', NONE: 'none' };

  /**
   * Create a gift order
   */
  static async createGiftOrder(orderId, senderId, giftDetails) {
    const order = await require('./order').findById(orderId);
    if (!order) throw new Error('Order not found');

    return this.create({
      order_id: orderId, sender_id: senderId,
      is_anonymous: giftDetails.isAnonymous || false,
      anonymous_alias: giftDetails.anonymousAlias || null,
      reveal_sender_on: giftDetails.revealSenderOn || null,
      recipient_name: giftDetails.recipientName,
      recipient_email: giftDetails.recipientEmail?.toLowerCase().trim(),
      recipient_phone: giftDetails.recipientPhone,
      recipient_address_id: giftDetails.recipientAddressId || order.shipping_address_id,
      recipient_notification_preference: giftDetails.notificationPreference || 'email',
      message: giftDetails.message?.substring(0, 1000) || null,
      message_type: giftDetails.messageType || this.messageTypes.TEXT,
      message_format: giftDetails.messageFormat || 'plain',
      message_audio_url: giftDetails.messageAudioUrl,
      message_video_url: giftDetails.messageVideoUrl,
      message_font: giftDetails.messageFont || 'default',
      message_color: giftDetails.messageColor || '#333333',
      gift_wrap_type: giftDetails.giftWrapType || this.giftWrapTypes.STANDARD,
      gift_wrap_color: giftDetails.giftWrapColor || 'white',
      gift_wrap_message: giftDetails.giftWrapMessage || null,
      gift_bag: giftDetails.giftBag || false,
      tissue_paper: giftDetails.tissuePaper !== false,
      ribbon: giftDetails.ribbon !== false,
      gift_receipt: giftDetails.giftReceipt !== false,
      include_price: giftDetails.includePrice !== false,
      include_exchange_info: giftDetails.includeExchangeInfo !== false,
      is_scheduled: giftDetails.isScheduled || false,
      delivery_date: giftDetails.deliveryDate || null,
      delivery_window_start: giftDetails.deliveryWindowStart || null,
      delivery_window_end: giftDetails.deliveryWindowEnd || null,
      cannot_deliver_before: giftDetails.cannotDeliverBefore || null,
      timezone: giftDetails.timezone || 'UTC',
      delivery_instructions: giftDetails.deliveryInstructions?.substring(0, 500),
      leave_at_door: giftDetails.leaveAtDoor || false,
      require_signature: giftDetails.requireSignature || false,
      gift_registry_id: giftDetails.registryId,
      gift_registry_item_id: giftDetails.registryItemId,
      group_gift_id: giftDetails.groupGiftId,
      group_gift_contribution: giftDetails.groupGiftContribution || 0,
      returnable: giftDetails.returnable !== false,
      return_window_days: giftDetails.returnWindowDays || 30,
      exchangeable: giftDetails.exchangeable !== false,
      status: giftDetails.isScheduled ? this.statuses.SCHEDULED : this.statuses.PENDING,
      status_history: [{ status: giftDetails.isScheduled ? this.statuses.SCHEDULED : this.statuses.PENDING, timestamp: new Date().toISOString() }],
      metadata: giftDetails.metadata || {}, tenant_id: giftDetails.tenantId || null,
    });
  }

  /**
   * Send gift notification to recipient
   */
  static async notifyRecipient(giftOrderId, channel = 'email', message = null) {
    const gift = await this.findById(giftOrderId);
    if (!gift) throw new Error('Gift order not found');

    const history = gift.notification_history || [];
    history.push({ channel, message, sentAt: new Date().toISOString(), status: 'sent' });

    const status = gift.status === this.statuses.SCHEDULED ? this.statuses.NOTIFIED : gift.status;

    return this.update({ id: giftOrderId }, {
      recipient_notified: true, notification_date: new Date().toISOString(),
      notification_channel: channel, notification_status: 'sent',
      pre_announcement_sent: true, pre_announcement_date: new Date().toISOString(),
      pre_announcement_channel: channel, pre_announcement_message: message,
      notification_history: history, status,
      status_history: [...(gift.status_history || []), { status, timestamp: new Date().toISOString() }],
    });
  }

  /**
   * Mark gift as viewed by recipient
   */
  static async markViewed(giftOrderId) {
    const gift = await this.findById(giftOrderId);
    if (!gift) throw new Error('Gift order not found');
    if (gift.recipient_viewed) return gift;

    return this.update({ id: giftOrderId }, {
      recipient_viewed: true, viewed_at: new Date().toISOString(),
      status: this.statuses.VIEWED,
      status_history: [...(gift.status_history || []), { status: this.statuses.VIEWED, timestamp: new Date().toISOString() }],
    });
  }

  /**
   * Mark gift as redeemed by recipient
   */
  static async markRedeemed(giftOrderId, method = 'delivery') {
    return this.update({ id: giftOrderId }, {
      recipient_redeemed: true, redeemed_at: new Date().toISOString(),
      redemption_method: method, status: this.statuses.REDEEMED,
      status_history: [...(await this.findById(giftOrderId))?.status_history || [], { status: this.statuses.REDEEMED, timestamp: new Date().toISOString() }],
    });
  }

  /**
   * Process scheduled gift deliveries
   */
  static async processScheduledDeliveries() {
    const gifts = await this.findAll({
      where: { status: this.statuses.SCHEDULED, delivery_date: { operator: '<=', value: new Date().toISOString() } },
    });
    let processed = 0;
    for (const gift of gifts) {
      await this.notifyRecipient(gift.id, gift.recipient_notification_preference || 'email');
      processed++;
    }
    if (processed > 0) logger.info('Processed scheduled gift deliveries', { count: processed });
    return processed;
  }

  /**
   * Find gifts by sender
   */
  static async findBySender(senderId, options = {}) {
    return this.paginate({ where: { sender_id: senderId }, orderBy: { created_at: 'DESC' }, ...options });
  }

  /**
   * Find gifts by recipient
   */
  static async findByRecipient(recipientEmail, options = {}) {
    return this.paginate({ where: { recipient_email: recipientEmail?.toLowerCase().trim() }, orderBy: { created_at: 'DESC' }, ...options });
  }

  /**
   * Send thank you message from recipient to sender
   */
  static async sendThankYou(giftOrderId, message, channel = 'email') {
    return this.update({ id: giftOrderId }, {
      thank_you_sent: true, thank_you_date: new Date().toISOString(),
      thank_you_message: message?.substring(0, 1000), thank_you_channel: channel,
    });
  }
}

module.exports = GiftOrder;