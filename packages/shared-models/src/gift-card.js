const BaseModel = require('./base-model');
const crypto = require('crypto');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Gift Card Model - Gift Card Record
 * 
 * Manages digital and physical gift cards including issuance,
 * redemption, balance tracking, expiry, reloading, and fraud prevention.
 * 
 * TABLE: gift_cards
 * 
 * GIFT CARD TYPES:
 * - digital: Email/SMS delivered, instant
 * - physical: Plastic card, shipped to recipient
 * - egift: Digital with customizable design
 * - corporate: Bulk corporate gift cards
 * 
 * GIFT CARD LIFECYCLE:
 * 1. Purchased by customer
 * 2. Delivered to recipient (email/SMS/physical)
 * 3. Recipient activates (if required)
 * 4. Recipient redeems at checkout
 * 5. Balance tracked until depleted or expired
 * 6. Expired cards forfeited (subject to regulations)
 */

class GiftCard extends BaseModel {
  static tableName = 'gift_cards';
  static primaryKey = 'id';
  
  static fields = [
    'id',
    // Card identification
    'card_number', 'card_code_hash', 'card_code_prefix',
    'card_type', 'card_design', 'card_design_url',
    'batch_id', 'batch_name',
    // Issuer and purchaser
    'issuer_id', 'issuer_type', 'purchaser_id',
    'purchaser_name', 'purchaser_email', 'purchaser_phone',
    'purchase_order_id', 'purchase_transaction_id',
    // Recipient
    'recipient_name', 'recipient_email', 'recipient_phone',
    'recipient_user_id', 'message', 'message_type',
    'gift_note', 'occasion', 'delivery_date',
    // Financial
    'initial_balance', 'currency', 'current_balance',
    'available_balance', 'held_balance',
    'is_reloadable', 'max_balance', 'max_reload_amount',
    'reload_count', 'total_reloaded', 'total_redeemed',
    // Status and dates
    'status', 'sub_status', 'issued_at', 'activated_at',
    'expires_at', 'never_expires', 'expiry_reminder_sent',
    'expiry_reminder_date', 'first_used_at', 'last_used_at',
    // Redemption
    'total_redemptions', 'total_redeemed_amount',
    'redemption_history', 'last_redemption_at',
    'last_redemption_location', 'last_redemption_order_id',
    // Security
    'pin_hash', 'pin_attempts', 'pin_locked_until',
    'security_questions', 'fraud_check_passed',
    'fraud_check_date', 'is_frozen', 'frozen_reason',
    'frozen_at', 'frozen_by',
    // Delivery
    'delivery_method', 'delivery_status', 'delivery_tracking',
    'delivery_address_id', 'delivered_at',
    'delivery_attempts', 'delivery_error',
    // Physical card
    'is_physical', 'physical_card_printed', 'physical_card_shipped',
    'shipping_carrier', 'shipping_tracking_number',
    // Corporate
    'is_corporate', 'corporate_client_id', 'corporate_order_ref',
    'corporate_discount_percent', 'corporate_custom_message',
    // Compliance
    'terms_accepted', 'terms_accepted_at', 'terms_version',
    'gdpr_consent', 'marketing_consent',
    'source_of_funds_verified', 'aml_check_passed',
    'regulatory_reporting_ref',
    // Accounting
    'liability_account', 'revenue_recognition',
    'breakage_estimate', 'breakage_recognized',
    // Notifications
    'purchase_notification_sent', 'delivery_notification_sent',
    'activation_notification_sent', 'balance_notification_sent',
    'expiry_notification_sent',
    // Audit
    'audit_trail', 'last_audited_at',
    // Metadata
    'metadata', 'tags', 'notes',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    initial_balance: 'float', current_balance: 'float',
    available_balance: 'float', held_balance: 'float',
    max_balance: 'float', max_reload_amount: 'float',
    total_reloaded: 'float', total_redeemed: 'float',
    total_redeemed_amount: 'float', corporate_discount_percent: 'float',
    breakage_estimate: 'float', breakage_recognized: 'float',
    reload_count: 'integer', total_redemptions: 'integer',
    pin_attempts: 'integer', delivery_attempts: 'integer',
    redemption_history: 'json', security_questions: 'json',
    audit_trail: 'json', metadata: 'json', tags: 'json',
    is_reloadable: 'boolean', never_expires: 'boolean',
    is_frozen: 'boolean', fraud_check_passed: 'boolean',
    is_physical: 'boolean', physical_card_printed: 'boolean',
    physical_card_shipped: 'boolean', is_corporate: 'boolean',
    terms_accepted: 'boolean', gdpr_consent: 'boolean',
    marketing_consent: 'boolean', source_of_funds_verified: 'boolean',
    aml_check_passed: 'boolean', expiry_reminder_sent: 'boolean',
    purchase_notification_sent: 'boolean', delivery_notification_sent: 'boolean',
    activation_notification_sent: 'boolean', balance_notification_sent: 'boolean',
    expiry_notification_sent: 'boolean', pin_locked_until: 'datetime',
  };

  static relations = {
    purchaser: { type: 'belongsTo', model: 'User', foreignKey: 'purchaser_id', ownerKey: 'id' },
    recipient: { type: 'belongsTo', model: 'User', foreignKey: 'recipient_user_id', ownerKey: 'id' },
  };

  static cardTypes = { DIGITAL: 'digital', PHYSICAL: 'physical', EGIFT: 'egift', CORPORATE: 'corporate' };
  static statuses = { PENDING: 'pending', ACTIVE: 'active', REDEEMED: 'redeemed', PARTIALLY_REDEEMED: 'partially_redeemed', EXPIRED: 'expired', CANCELLED: 'cancelled', FROZEN: 'frozen', VOIDED: 'voided' };
  static deliveryMethods = { EMAIL: 'email', SMS: 'sms', PRINT: 'print', SHIPPING: 'shipping', IN_APP: 'in_app' };
  static occasions = { BIRTHDAY: 'birthday', WEDDING: 'wedding', ANNIVERSARY: 'anniversary', GRADUATION: 'graduation', THANK_YOU: 'thank_you', CONGRATULATIONS: 'congratulations', CHRISTMAS: 'christmas', OTHER: 'other' };

  static generateCardNumber() { return `GC-${crypto.randomBytes(8).toString('hex').toUpperCase()}`; }
  static generateCardCode() { return crypto.randomBytes(6).toString('hex').toUpperCase(); }

  /**
   * Issue a new gift card
   */
  static async issue(purchaserId, amount, currency = 'USD', options = {}) {
    if (amount < 5) throw new Error('Minimum gift card amount is 5.00');
    if (amount > 5000) throw new Error('Maximum gift card amount is 5,000.00');

    const cardCode = this.generateCardCode();
    const cardCodeHash = crypto.createHash('sha256').update(cardCode).digest('hex');
    const pin = options.pin || crypto.randomInt(1000, 9999).toString();
    const pinHash = crypto.createHash('sha256').update(pin).digest('hex');

    const giftCard = await this.create({
      card_number: this.generateCardNumber(), card_code_hash: cardCodeHash,
      card_code_prefix: cardCode.substring(0, 4), card_type: options.cardType || this.cardTypes.DIGITAL,
      card_design: options.design || 'standard', issuer_id: options.issuerId || 'system',
      issuer_type: options.issuerType || 'platform', purchaser_id: purchaserId,
      purchaser_name: options.purchaserName, purchaser_email: options.purchaserEmail,
      purchase_order_id: options.orderId, purchase_transaction_id: options.transactionId,
      recipient_name: options.recipientName, recipient_email: options.recipientEmail,
      recipient_phone: options.recipientPhone, message: options.message,
      message_type: options.messageType || 'text', gift_note: options.giftNote,
      occasion: options.occasion, delivery_date: options.deliveryDate || new Date().toISOString(),
      initial_balance: amount, currency: currency.toUpperCase(),
      current_balance: amount, available_balance: amount, held_balance: 0,
      is_reloadable: options.isReloadable || false, max_balance: options.maxBalance || 5000,
      status: this.statuses.ACTIVE, issued_at: new Date().toISOString(),
      activated_at: new Date().toISOString(),
      expires_at: options.expiresAt || new Date(Date.now() + 365 * 86400000).toISOString(),
      never_expires: options.neverExpires || false,
      pin_hash: pinHash, is_physical: options.isPhysical || false,
      delivery_method: options.deliveryMethod || this.deliveryMethods.EMAIL,
      delivery_address_id: options.deliveryAddressId,
      is_corporate: options.isCorporate || false,
      corporate_client_id: options.corporateClientId,
      terms_accepted: true, terms_accepted_at: new Date().toISOString(),
      fraud_check_passed: true, fraud_check_date: new Date().toISOString(),
      purchase_notification_sent: false, metadata: options.metadata || {},
      tenant_id: options.tenantId || null,
    });

    logger.info('Gift card issued', { cardId: giftCard.id, cardNumber: giftCard.card_number, amount, currency });

    // Return card code only once (never stored in plain text)
    return { giftCard, cardCode, pin, message: 'Store this information securely. Card code and PIN will not be shown again.' };
  }

  /**
   * Redeem a gift card (apply to purchase)
   */
  static async redeem(cardCode, pin, amount, orderId = null, options = {}) {
    const cardCodeHash = crypto.createHash('sha256').update(cardCode.toUpperCase()).digest('hex');
    const card = await this.findOne({
      where: { card_code_hash: cardCodeHash, status: [this.statuses.ACTIVE, this.statuses.PARTIALLY_REDEEMED] },
    });
    
    if (!card) throw new Error('Invalid gift card code');
    if (card.status === this.statuses.FROZEN) throw new Error(`Gift card is frozen: ${card.frozen_reason}`);
    if (card.is_frozen) throw new Error('Gift card is currently frozen');
    
    // Verify PIN
    if (card.pin_hash) {
      const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(pinHash), Buffer.from(card.pin_hash))) {
        const attempts = (card.pin_attempts || 0) + 1;
        if (attempts >= 3) {
          await this.update({ id: card.id }, { pin_attempts: attempts, pin_locked_until: new Date(Date.now() + 30 * 60000).toISOString(), is_frozen: true, frozen_reason: 'Too many incorrect PIN attempts' });
        } else {
          await this.update({ id: card.id }, { pin_attempts: attempts });
        }
        throw new Error('Invalid PIN');
      }
    }

    // Check expiry
    if (!card.never_expires && new Date(card.expires_at) < new Date()) {
      await this.update({ id: card.id }, { status: this.statuses.EXPIRED });
      throw new Error('Gift card has expired');
    }

    // Check balance
    const redeemAmount = Math.min(amount, card.available_balance);
    if (redeemAmount <= 0) throw new Error('Insufficient balance');

    const newBalance = card.current_balance - redeemAmount;
    const history = card.redemption_history || [];
    history.push({
      amount: redeemAmount, orderId, location: options.location,
      redeemedAt: new Date().toISOString(), remainingBalance: newBalance,
      redemptionMethod: options.method || 'online',
    });

    const newStatus = newBalance <= 0.01 ? this.statuses.REDEEMED : this.statuses.PARTIALLY_REDEEMED;

    const updated = await this.update({ id: card.id }, {
      current_balance: newBalance, available_balance: newBalance,
      total_redemptions: (card.total_redemptions || 0) + 1,
      total_redeemed_amount: (card.total_redeemed_amount || 0) + redeemAmount,
      redemption_history: history, status: newStatus,
      first_used_at: card.first_used_at || new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      last_redemption_at: new Date().toISOString(),
      last_redemption_location: options.location, last_redemption_order_id: orderId,
      pin_attempts: 0,
    });

    logger.info('Gift card redeemed', { cardId: card.id, redeemAmount, newBalance, orderId });

    return { ...updated, redeemedAmount: redeemAmount, remainingBalance: newBalance };
  }

  /**
   * Check gift card balance
   */
  static async checkBalance(cardCode, pin = null) {
    const cardCodeHash = crypto.createHash('sha256').update(cardCode.toUpperCase()).digest('hex');
    const card = await this.findOne({
      where: { card_code_hash: cardCodeHash, status: [this.statuses.ACTIVE, this.statuses.PARTIALLY_REDEEMED] },
    });
    if (!card) return null;

    let pinVerified = true;
    if (card.pin_hash && pin) {
      const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
      pinVerified = crypto.timingSafeEqual(Buffer.from(pinHash), Buffer.from(card.pin_hash));
    }

    return {
      cardNumber: card.card_number, cardType: card.card_type,
      balance: card.current_balance, availableBalance: card.available_balance,
      currency: card.currency, status: card.status,
      expiresAt: card.expires_at, neverExpires: card.never_expires,
      isReloadable: card.is_reloadable, pinVerified,
      lastUsedAt: card.last_used_at,
    };
  }

  /**
   * Reload a gift card with additional funds
   */
  static async reload(cardCode, pin, amount, options = {}) {
    const cardCodeHash = crypto.createHash('sha256').update(cardCode.toUpperCase()).digest('hex');
    const card = await this.findOne({
      where: { card_code_hash: cardCodeHash, status: [this.statuses.ACTIVE, this.statuses.PARTIALLY_REDEEMED] },
    });
    if (!card) throw new Error('Invalid gift card');
    if (!card.is_reloadable) throw new Error('This gift card is not reloadable');

    const newBalance = card.current_balance + amount;
    if (newBalance > card.max_balance) throw new Error(`Reload would exceed maximum balance of ${card.max_balance}`);
    if (amount > card.max_reload_amount) throw new Error(`Maximum single reload amount is ${card.max_reload_amount}`);

    return this.update({ id: card.id }, {
      current_balance: newBalance, available_balance: newBalance,
      total_reloaded: (card.total_reloaded || 0) + amount,
      reload_count: (card.reload_count || 0) + 1,
      status: this.statuses.ACTIVE,
      metadata: { ...(card.metadata || {}), lastReloadAt: new Date().toISOString(), lastReloadAmount: amount },
    });
  }

  /**
   * Freeze a gift card (fraud prevention)
   */
  static async freeze(cardId, reason, frozenBy) {
    return this.update({ id: cardId }, { is_frozen: true, frozen_reason: reason, frozen_at: new Date().toISOString(), frozen_by: frozenBy, status: this.statuses.FROZEN });
  }

  /**
   * Unfreeze a gift card
   */
  static async unfreeze(cardId, unfrozenBy) {
    const card = await this.findById(cardId);
    return this.update({ id: cardId }, { is_frozen: false, frozen_reason: null, frozen_at: null, frozen_by: null, status: card.current_balance > 0 ? this.statuses.ACTIVE : this.statuses.REDEEMED });
  }

  /**
   * Cancel/void a gift card
   */
  static async cancel(cardId, reason, cancelledBy) {
    return this.update({ id: cardId }, { status: this.statuses.CANCELLED, notes: reason, metadata: { ...(await this.findById(cardId))?.metadata || {}, cancelledBy, cancelledAt: new Date().toISOString() } });
  }

  /**
   * Process expired gift cards
   */
  static async processExpiry() {
    const result = await connectionPool.query(
      `UPDATE ${this.tableName} SET status = $1 WHERE status IN ('active', 'partially_redeemed') AND never_expires = false AND expires_at < NOW()`,
      [this.statuses.EXPIRED]
    );
    if (result.rowCount > 0) logger.info('Expired gift cards processed', { count: result.rowCount });
    return result.rowCount;
  }

  /**
   * Send expiry reminders
   */
  static async sendExpiryReminders(daysBeforeExpiry = 30) {
    const cards = await this.findAll({
      where: { status: [this.statuses.ACTIVE, this.statuses.PARTIALLY_REDEEMED], never_expires: false, expiry_reminder_sent: false },
    });
    let sent = 0;
    for (const card of cards) {
      const daysUntilExpiry = Math.ceil((new Date(card.expires_at) - new Date()) / 86400000);
      if (daysUntilExpiry <= daysBeforeExpiry && daysUntilExpiry > 0) {
        await this.update({ id: card.id }, { expiry_reminder_sent: true, expiry_reminder_date: new Date().toISOString() });
        sent++;
      }
    }
    return sent;
  }

  /**
   * Get gift card sales report
   */
  static async getSalesReport(startDate, endDate) {
    const text = `SELECT card_type, COUNT(*) as cards_sold, SUM(initial_balance) as total_value, SUM(total_redeemed_amount) as total_redeemed, AVG(initial_balance) as avg_card_value FROM ${this.tableName} WHERE issued_at BETWEEN $1 AND $2 GROUP BY card_type ORDER BY total_value DESC`;
    const result = await connectionPool.query(text, [startDate, endDate]);
    return result.rows;
  }
}

module.exports = GiftCard;