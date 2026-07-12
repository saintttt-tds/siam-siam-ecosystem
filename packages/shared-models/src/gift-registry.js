const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Gift Registry Model - Gift Wishlist/Registry
 * 
 * Allows users to create gift registries for special events.
 * Friends and family can view the registry and purchase items.
 * Supports group gifting, cash gifts, and thank you tracking.
 * 
 * TABLE: gift_registries
 * 
 * REGISTRY TYPES:
 * - wedding: Wedding gift registry
 * - baby_shower: Baby shower registry
 * - birthday: Birthday wishlist
 * - graduation: Graduation gifts
 * - housewarming: New home gifts
 * - anniversary: Anniversary celebration
 * - charity: Donation registry
 * - custom: Custom event type
 * 
 * REGISTRY LIFECYCLE:
 * 1. User creates registry with event details
 * 2. User adds desired items/products
 * 3. User shares registry link with friends/family
 * 4. Guests view and purchase items from registry
 * 5. Items marked as purchased (prevents duplicates)
 * 6. User sends thank you notes to gift givers
 * 7. Registry expires after event date + grace period
 */

class GiftRegistry extends BaseModel {
  static tableName = 'gift_registries';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id',
    // Registry details
    'title', 'description', 'slug',
    'event_type', 'event_subtype', 'event_date',
    'event_location', 'event_address', 'event_timezone',
    // Registrant(s)
    'registrant_name', 'registrant_partner_name',
    'co_registrant_name', 'co_registrant_email',
    'registrant_message', 'registrant_photo_url',
    // Sharing
    'is_public', 'is_searchable', 'share_url',
    'share_code', 'share_expires_at',
    'custom_domain', 'custom_slug',
    // Visual customization
    'cover_photo_url', 'profile_photo_url',
    'theme_color', 'theme_font', 'custom_css',
    'layout_style', 'header_message',
    // Items
    'items', 'total_items', 'purchased_items',
    'total_value', 'purchased_value', 'remaining_value',
    'currency', 'allow_custom_items',
    // Cash gifts
    'allow_cash_gifts', 'cash_gift_title',
    'cash_gift_message', 'cash_gift_minimum',
    'cash_gift_suggested_amounts', 'cash_fund_name',
    'total_cash_gifts', 'cash_gift_count',
    // Group gifting
    'allow_group_gifting', 'group_gift_threshold',
    'group_gift_message',
    // Shipping
    'shipping_address_id', 'shipping_address_json',
    'allow_guest_shipping', 'shipping_instructions',
    'preferred_shipping_method',
    // Notifications
    'notify_on_purchase', 'notify_on_cash_gift',
    'notification_email', 'notification_phone',
    'purchase_notifications', 'last_notification_at',
    // Thank you
    'thank_you_message', 'thank_you_sent_count',
    'auto_thank_you', 'thank_you_template',
    // Privacy and security
    'password_protected', 'password_hash',
    'require_approval', 'show_purchaser_names',
    'show_purchase_amounts',
    // Status
    'status', 'sub_status', 'status_history',
    'published_at', 'expires_at',
    'grace_period_days', 'grace_period_ends_at',
    // Engagement metrics
    'view_count', 'unique_visitors', 'share_count',
    'purchase_count', 'cash_gift_count_total',
    'conversion_rate', 'average_purchase_value',
    // Social
    'social_shares', 'facebook_shares', 'twitter_shares',
    'whatsapp_shares', 'email_shares', 'copy_link_clicks',
    // Dates
    'created_date', 'last_updated_date',
    'last_purchase_at', 'last_viewed_at',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    items: 'json',
    cash_gift_suggested_amounts: 'json',
    shipping_address_json: 'json',
    purchase_notifications: 'json',
    social_shares: 'json',
    status_history: 'json',
    metadata: 'json',
    tags: 'json',
    is_public: 'boolean',
    is_searchable: 'boolean',
    allow_custom_items: 'boolean',
    allow_cash_gifts: 'boolean',
    allow_group_gifting: 'boolean',
    allow_guest_shipping: 'boolean',
    notify_on_purchase: 'boolean',
    notify_on_cash_gift: 'boolean',
    auto_thank_you: 'boolean',
    password_protected: 'boolean',
    require_approval: 'boolean',
    show_purchaser_names: 'boolean',
    show_purchase_amounts: 'boolean',
    total_items: 'integer',
    purchased_items: 'integer',
    total_value: 'float',
    purchased_value: 'float',
    remaining_value: 'float',
    cash_gift_minimum: 'float',
    total_cash_gifts: 'float',
    cash_gift_count: 'integer',
    group_gift_threshold: 'float',
    thank_you_sent_count: 'integer',
    grace_period_days: 'integer',
    view_count: 'integer',
    unique_visitors: 'integer',
    share_count: 'integer',
    purchase_count: 'integer',
    cash_gift_count_total: 'integer',
    conversion_rate: 'float',
    average_purchase_value: 'float',
  };

  static relations = {
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
    shippingAddress: { type: 'belongsTo', model: 'Address', foreignKey: 'shipping_address_id', ownerKey: 'id' },
  };

  static eventTypes = {
    WEDDING: 'wedding', BABY_SHOWER: 'baby_shower', BIRTHDAY: 'birthday',
    GRADUATION: 'graduation', HOUSEWARMING: 'housewarming',
    ANNIVERSARY: 'anniversary', CHARITY: 'charity',
    HOLIDAY: 'holiday', CORPORATE: 'corporate', OTHER: 'other',
  };

  static statuses = {
    DRAFT: 'draft', ACTIVE: 'active', PUBLISHED: 'published',
    COMPLETED: 'completed', EXPIRED: 'expired',
    PRIVATE: 'private', DELETED: 'deleted', PAUSED: 'paused',
  };

  static generateShareCode() {
    const crypto = require('crypto');
    return `GIFT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  static generateSlug(title) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
  }

  /**
   * Create a new gift registry
   */
  static async createRegistry(userId, registryDetails) {
    const shareCode = this.generateShareCode();
    const slug = registryDetails.slug || this.generateSlug(registryDetails.title);
    const gracePeriodDays = registryDetails.gracePeriodDays || 90;
    const eventDate = registryDetails.eventDate ? new Date(registryDetails.eventDate) : null;
    const expiresAt = eventDate 
      ? new Date(eventDate.getTime() + gracePeriodDays * 86400000).toISOString()
      : new Date(Date.now() + 365 * 86400000).toISOString();

    return this.create({
      user_id: userId,
      title: registryDetails.title,
      description: registryDetails.description?.substring(0, 2000),
      slug,
      event_type: registryDetails.eventType || this.eventTypes.OTHER,
      event_subtype: registryDetails.eventSubtype,
      event_date: eventDate?.toISOString(),
      event_location: registryDetails.eventLocation,
      event_address: registryDetails.eventAddress,
      event_timezone: registryDetails.timezone || 'UTC',
      registrant_name: registryDetails.registrantName,
      registrant_partner_name: registryDetails.registrantPartnerName,
      co_registrant_name: registryDetails.coRegistrantName,
      co_registrant_email: registryDetails.coRegistrantEmail?.toLowerCase(),
      registrant_message: registryDetails.message?.substring(0, 1000),
      registrant_photo_url: registryDetails.photoUrl,
      is_public: registryDetails.isPublic !== false,
      is_searchable: registryDetails.isSearchable || false,
      share_url: `https://siamsiam.com/gift/${slug}`,
      share_code: shareCode,
      cover_photo_url: registryDetails.coverPhotoUrl,
      profile_photo_url: registryDetails.profilePhotoUrl,
      theme_color: registryDetails.themeColor || '#8B4513',
      theme_font: registryDetails.themeFont || 'default',
      items: registryDetails.items || [],
      total_items: (registryDetails.items || []).length,
      total_value: (registryDetails.items || []).reduce((sum, item) => sum + (item.price || 0), 0),
      remaining_value: (registryDetails.items || []).reduce((sum, item) => sum + (item.price || 0), 0),
      currency: registryDetails.currency || 'USD',
      allow_custom_items: registryDetails.allowCustomItems !== false,
      allow_cash_gifts: registryDetails.allowCashGifts || false,
      cash_gift_title: registryDetails.cashGiftTitle || 'Cash Gift',
      cash_gift_message: registryDetails.cashGiftMessage,
      cash_gift_minimum: registryDetails.cashGiftMinimum || 5,
      cash_gift_suggested_amounts: registryDetails.cashGiftSuggestedAmounts || [25, 50, 100, 250],
      allow_group_gifting: registryDetails.allowGroupGifting || false,
      group_gift_threshold: registryDetails.groupGiftThreshold || 200,
      shipping_address_id: registryDetails.shippingAddressId,
      allow_guest_shipping: registryDetails.allowGuestShipping !== false,
      notify_on_purchase: registryDetails.notifyOnPurchase !== false,
      notification_email: registryDetails.notificationEmail,
      notification_phone: registryDetails.notificationPhone,
      show_purchaser_names: registryDetails.showPurchaserNames !== false,
      show_purchase_amounts: registryDetails.showPurchaseAmounts || false,
      status: this.statuses.ACTIVE,
      published_at: new Date().toISOString(),
      expires_at: expiresAt,
      grace_period_days: gracePeriodDays,
      grace_period_ends_at: expiresAt,
      status_history: [{ status: this.statuses.ACTIVE, timestamp: new Date().toISOString() }],
      metadata: registryDetails.metadata || {},
      tenant_id: registryDetails.tenantId || null,
    });
  }

  /**
   * Add an item to the registry
   */
  static async addItem(registryId, item) {
    const registry = await this.findById(registryId);
    if (!registry) throw new Error('Registry not found');
    if (![this.statuses.ACTIVE, this.statuses.DRAFT].includes(registry.status)) {
      throw new Error('Cannot add items to a non-active registry');
    }

    const items = [...(registry.items || [])];
    const newItem = {
      id: `item_${Date.now()}`,
      name: item.name,
      description: item.description,
      price: item.price,
      currency: item.currency || registry.currency,
      quantity: item.quantity || 1,
      purchased: 0,
      imageUrl: item.imageUrl,
      productUrl: item.productUrl,
      productId: item.productId,
      category: item.category,
      priority: item.priority || 'normal',
      notes: item.notes,
      addedAt: new Date().toISOString(),
    };
    items.push(newItem);

    const totalValue = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const purchasedValue = items.reduce((sum, i) => sum + (i.price * i.purchased), 0);

    return this.update({ id: registryId }, {
      items, total_items: items.length,
      total_value: totalValue, purchased_value: purchasedValue,
      remaining_value: totalValue - purchasedValue,
    });
  }

  /**
   * Record a purchase from the registry
   */
  static async recordPurchase(registryId, itemId, quantity = 1, amount = null) {
    const registry = await this.findById(registryId);
    if (!registry) throw new Error('Registry not found');

    const items = [...(registry.items || [])];
    const itemIndex = items.findIndex(i => i.id === itemId);
    
    if (itemIndex === -1) throw new Error('Item not found in registry');
    
    const item = items[itemIndex];
    const purchaseAmount = amount || (item.price * quantity);
    
    // Check if item is already fully purchased
    if (item.purchased >= item.quantity) {
      throw new Error('Item has already been fully purchased');
    }

    // Update item purchase count
    items[itemIndex] = {
      ...item,
      purchased: Math.min(item.purchased + quantity, item.quantity),
      lastPurchasedAt: new Date().toISOString(),
    };

    const purchasedValue = items.reduce((sum, i) => sum + (i.price * i.purchased), 0);
    const purchasedItems = items.filter(i => i.purchased > 0).length;
    const remainingValue = Math.max(0, registry.total_value - purchasedValue);

    const updates = {
      items, purchased_items: purchasedItems,
      purchased_value: Math.round(purchasedValue * 100) / 100,
      remaining_value: Math.round(remainingValue * 100) / 100,
      purchase_count: (registry.purchase_count || 0) + 1,
      last_purchase_at: new Date().toISOString(),
    };

    // Complete registry if all items purchased
    if (remainingValue <= 0) {
      updates.status = this.statuses.COMPLETED;
      updates.status_history = [...(registry.status_history || []), { status: this.statuses.COMPLETED, timestamp: new Date().toISOString(), note: 'All items purchased' }];
    }

    return this.update({ id: registryId }, updates);
  }

  /**
   * Record a cash gift contribution
   */
  static async recordCashGift(registryId, amount, donorName = null, message = null) {
    const registry = await this.findById(registryId);
    if (!registry) throw new Error('Registry not found');
    if (!registry.allow_cash_gifts) throw new Error('Cash gifts not enabled for this registry');

    return this.update({ id: registryId }, {
      total_cash_gifts: (registry.total_cash_gifts || 0) + amount,
      cash_gift_count: (registry.cash_gift_count || 0) + 1,
      cash_gift_count_total: (registry.cash_gift_count_total || 0) + 1,
    });
  }

  /**
   * Find registries by user
   */
  static async findByUser(userId, options = {}) {
    return this.paginate({
      where: { user_id: userId, status: { operator: '!=', value: this.statuses.DELETED } },
      orderBy: { event_date: 'ASC' },
      ...options,
    });
  }

  /**
   * Find public registries
   */
  static async findPublic(options = {}) {
    return this.paginate({
      where: { is_public: true, status: this.statuses.ACTIVE },
      orderBy: { event_date: 'ASC' },
      ...options,
    });
  }

  /**
   * Find registry by share code
   */
  static async findByShareCode(shareCode) {
    return this.findOne({
      where: { share_code: shareCode.toUpperCase(), is_public: true, status: [this.statuses.ACTIVE, this.statuses.PUBLISHED] },
    });
  }

  /**
   * Find registry by slug
   */
  static async findBySlug(slug) {
    return this.findOne({
      where: { slug, is_public: true, status: [this.statuses.ACTIVE, this.statuses.PUBLISHED] },
    });
  }

  /**
   * Record a registry view
   */
  static async recordView(registryId, visitorId = null) {
    await connectionPool.query(
      `UPDATE ${this.tableName} SET view_count = view_count + 1, unique_visitors = CASE WHEN $2 IS NOT NULL THEN unique_visitors + 1 ELSE unique_visitors END, last_viewed_at = NOW() WHERE id = $1`,
      [registryId, visitorId]
    );
  }

  /**
   * Record a registry share
   */
  static async recordShare(registryId, platform = 'other') {
    const registry = await this.findById(registryId);
    const socialShares = { ...(registry.social_shares || {}) };
    socialShares[platform] = (socialShares[platform] || 0) + 1;

    await this.update({ id: registryId }, {
      share_count: (registry.share_count || 0) + 1,
      social_shares: socialShares,
    });
  }

  /**
   * Send thank you message
   */
  static async sendThankYou(registryId, message, recipientCount = 1) {
    return this.update({ id: registryId }, {
      thank_you_message: message?.substring(0, 1000),
      thank_you_sent_count: (await this.findById(registryId))?.thank_you_sent_count + recipientCount || recipientCount,
    });
  }

  /**
   * Process expired registries
   */
  static async processExpired() {
    const result = await connectionPool.query(
      `UPDATE ${this.tableName} SET status = $1, status_history = status_history || jsonb_build_array(jsonb_build_object('status', $1, 'timestamp', NOW()::text)) WHERE status IN ('active', 'published') AND expires_at < NOW()`,
      [this.statuses.EXPIRED]
    );
    if (result.rowCount > 0) logger.info('Expired gift registries processed', { count: result.rowCount });
    return result.rowCount;
  }

  /**
   * Get registry statistics
   */
  static async getStats(registryId) {
    const registry = await this.findById(registryId);
    if (!registry) return null;

    return {
      totalValue: registry.total_value,
      purchasedValue: registry.purchased_value,
      remainingValue: registry.remaining_value,
      completionPercent: registry.total_value > 0 ? Math.round((registry.purchased_value / registry.total_value) * 100) : 0,
      totalItems: registry.total_items,
      purchasedItems: registry.purchased_items,
      viewCount: registry.view_count,
      purchaseCount: registry.purchase_count,
      cashGiftTotal: registry.total_cash_gifts,
      cashGiftCount: registry.cash_gift_count,
      daysUntilEvent: registry.event_date ? Math.ceil((new Date(registry.event_date) - new Date()) / 86400000) : null,
      daysUntilExpiry: Math.ceil((new Date(registry.expires_at) - new Date()) / 86400000),
      shareCount: registry.share_count,
    };
  }
}

module.exports = GiftRegistry;