const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;
const { connectionPool } = require('@siamsiam/shared-utils').database;

/**
 * Recurring Payment Model - Recurring Bill Payment Setup
 * 
 * Manages automated recurring payments for bills, subscriptions,
 * and other periodic charges. Supports multiple frequencies,
 * payment methods, and failure handling.
 * 
 * TABLE: recurring_payments
 */

class RecurringPayment extends BaseModel {
  static tableName = 'recurring_payments';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'user_id', 'biller_id', 'meter_number_id',
    'payment_name', 'payment_type', 'payment_category',
    'amount', 'currency', 'maximum_amount',
    'amount_type', 'variable_amount_allowed',
    'frequency', 'frequency_interval', 'frequency_day',
    'frequency_day_of_week', 'frequency_month_day',
    'start_date', 'end_date', 'next_payment_date',
    'last_payment_date', 'last_payment_amount',
    'last_payment_status', 'last_payment_reference',
    'payment_method', 'payment_source_id',
    'payment_source_type', 'payment_source_last4',
    'is_active', 'is_paused', 'paused_reason',
    'paused_at', 'paused_until', 'resumed_at',
    'total_payments', 'successful_payments',
    'failed_payments', 'skipped_payments',
    'total_amount_paid', 'max_failures',
    'consecutive_failures', 'failure_action',
    'retry_on_failure', 'retry_delay_hours',
    'max_retries', 'retry_count',
    'next_retry_at', 'last_error', 'last_error_at',
    'notification_enabled', 'notification_before_days',
    'notification_after_status', 'notification_channels',
    'receipt_enabled', 'receipt_email',
    'last_notification_at', 'last_receipt_at',
    'customer_reference', 'account_number',
    'billing_address_id', 'notes',
    'status_history', 'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    amount: 'float', maximum_amount: 'float',
    last_payment_amount: 'float', total_amount_paid: 'float',
    frequency_interval: 'integer', frequency_day: 'integer',
    frequency_day_of_week: 'integer', frequency_month_day: 'integer',
    total_payments: 'integer', successful_payments: 'integer',
    failed_payments: 'integer', skipped_payments: 'integer',
    max_failures: 'integer', consecutive_failures: 'integer',
    retry_delay_hours: 'integer', max_retries: 'integer',
    retry_count: 'integer', notification_before_days: 'integer',
    is_active: 'boolean', is_paused: 'boolean',
    variable_amount_allowed: 'boolean', retry_on_failure: 'boolean',
    notification_enabled: 'boolean', receipt_enabled: 'boolean',
    notification_channels: 'json', status_history: 'json',
    metadata: 'json', tags: 'json',
  };

  static relations = {
    user: { type: 'belongsTo', model: 'User', foreignKey: 'user_id', ownerKey: 'id' },
    biller: { type: 'belongsTo', model: 'Biller', foreignKey: 'biller_id', ownerKey: 'id' },
  };

  static frequencies = {
    DAILY: 'daily', WEEKLY: 'weekly', BIWEEKLY: 'biweekly',
    MONTHLY: 'monthly', QUARTERLY: 'quarterly',
    SEMI_ANNUALLY: 'semi_annually', ANNUALLY: 'annually',
  };

  static failureActions = {
    RETRY: 'retry', SKIP: 'skip', PAUSE: 'pause', CANCEL: 'cancel',
  };

  /**
   * Create a recurring payment
   */
  static async createRecurringPayment(userId, paymentDetails) {
    return this.create({
      user_id: userId, biller_id: paymentDetails.billerId,
      meter_number_id: paymentDetails.meterNumberId,
      payment_name: paymentDetails.paymentName || 'Recurring Payment',
      payment_type: paymentDetails.paymentType || 'bill',
      payment_category: paymentDetails.paymentCategory,
      amount: paymentDetails.amount, currency: paymentDetails.currency || 'USD',
      maximum_amount: paymentDetails.maximumAmount,
      amount_type: paymentDetails.amountType || 'fixed',
      frequency: paymentDetails.frequency || this.frequencies.MONTHLY,
      frequency_day: paymentDetails.frequencyDay || 1,
      start_date: paymentDetails.startDate || new Date().toISOString(),
      end_date: paymentDetails.endDate,
      next_payment_date: paymentDetails.nextPaymentDate || new Date().toISOString(),
      payment_method: paymentDetails.paymentMethod,
      payment_source_id: paymentDetails.paymentSourceId,
      payment_source_type: paymentDetails.paymentSourceType,
      is_active: true, max_failures: paymentDetails.maxFailures || 3,
      failure_action: paymentDetails.failureAction || this.failureActions.PAUSE,
      retry_on_failure: paymentDetails.retryOnFailure !== false,
      retry_delay_hours: paymentDetails.retryDelayHours || 24,
      max_retries: paymentDetails.maxRetries || 3,
      notification_enabled: paymentDetails.notificationEnabled !== false,
      notification_before_days: paymentDetails.notificationBeforeDays || 3,
      customer_reference: paymentDetails.customerReference,
      account_number: paymentDetails.accountNumber,
      metadata: paymentDetails.metadata || {}, tenant_id: paymentDetails.tenantId,
    });
  }

  /**
   * Find active recurring payments
   */
  static async findActive(userId = null) {
    const criteria = { is_active: true, is_paused: false };
    if (userId) criteria.user_id = userId;
    return this.findAll({ where: criteria, orderBy: { next_payment_date: 'ASC' } });
  }

  /**
   * Find payments due for processing
   */
  static async findDueForProcessing() {
    return this.findAll({
      where: { is_active: true, is_paused: false, next_payment_date: { operator: '<=', value: new Date().toISOString() } },
    });
  }

  /**
   * Record successful payment
   */
  static async recordSuccess(recurringId, amount, reference) {
    const payment = await this.findById(recurringId);
    const nextDate = this._calculateNextDate(payment.frequency, payment.frequency_day);
    return this.update({ id: recurringId }, {
      last_payment_date: new Date().toISOString(), last_payment_amount: amount,
      last_payment_status: 'success', last_payment_reference: reference,
      next_payment_date: nextDate, total_payments: connectionPool.raw('total_payments + 1'),
      successful_payments: connectionPool.raw('successful_payments + 1'),
      total_amount_paid: connectionPool.raw(`total_amount_paid + ${amount}`),
      consecutive_failures: 0, retry_count: 0, last_error: null,
    });
  }

  /**
   * Record failed payment
   */
  static async recordFailure(recurringId, error) {
    const payment = await this.findById(recurringId);
    const consecutive = (payment.consecutive_failures || 0) + 1;
    const updates = {
      last_payment_status: 'failed', last_error: error?.substring(0, 500),
      last_error_at: new Date().toISOString(), failed_payments: connectionPool.raw('failed_payments + 1'),
      consecutive_failures: consecutive,
    };
    if (consecutive >= (payment.max_failures || 3)) {
      updates.is_paused = true; updates.paused_reason = `Exceeded maximum failures (${payment.max_failures})`;
      updates.paused_at = new Date().toISOString();
    }
    return this.update({ id: recurringId }, updates);
  }

  /**
   * Pause recurring payment
   */
  static async pause(recurringId, reason) {
    return this.update({ id: recurringId }, { is_paused: true, paused_reason: reason, paused_at: new Date().toISOString() });
  }

  /**
   * Resume recurring payment
   */
  static async resume(recurringId) {
    return this.update({ id: recurringId }, { is_paused: false, paused_reason: null, resumed_at: new Date().toISOString(), consecutive_failures: 0 });
  }

  /**
   * Calculate next payment date
   */
  static _calculateNextDate(frequency, dayOfMonth = 1) {
    const now = new Date();
    switch (frequency) {
      case 'daily': return new Date(now.setDate(now.getDate() + 1)).toISOString();
      case 'weekly': return new Date(now.setDate(now.getDate() + 7)).toISOString();
      case 'monthly': {
        const next = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(dayOfMonth, 28));
        return next.toISOString();
      }
      default: return new Date(now.setMonth(now.getMonth() + 1)).toISOString();
    }
  }
}

module.exports = RecurringPayment;