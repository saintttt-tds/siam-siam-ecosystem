const logger = require('../logging/logger');

/**
 * Refund Processing Time Estimation
 * 
 * Calculates estimated timelines for refund processing based on:
 * - Payment method processing times
 * - Bank settlement periods
 * - Internal processing steps
 * - Weekends and holidays
 * 
 * TIMELINE STEPS:
 * 1. Request Submitted → Approval (0-24 hours)
 * 2. Approval → Processing (0-2 hours)
 * 3. Processing → Settlement (varies by method)
 * 4. Settlement → Funds Available (varies by method)
 * 
 * @example
 *   const timeline = require('@siamsiam/shared-utils').refunds.refundTimelineCalculator;
 *   const estimate = timeline.calculate('card', 'stripe');
 */

class RefundTimelineCalculator {
  constructor() {
    // Processing times in business days by method
    this.processingTimes = {
      card: { min: 5, max: 10, typical: 7 },
      stripe: { min: 5, max: 10, typical: 7 },
      paypal: { min: 3, max: 5, typical: 4 },
      bank_transfer: { min: 3, max: 7, typical: 5 },
      mobile_money: { min: 1, max: 3, typical: 1 },
      ecocash: { min: 1, max: 2, typical: 1 },
      onemoney: { min: 1, max: 2, typical: 1 },
      mpesa: { min: 1, max: 2, typical: 1 },
      wallet: { min: 0, max: 0, typical: 0 },
      wallet_credit: { min: 0, max: 0, typical: 0 },
      store_credit: { min: 0, max: 0, typical: 0 },
      cash_on_delivery: { min: 3, max: 7, typical: 5 },
    };

    // Internal processing steps (hours)
    this.internalSteps = {
      request_review: { min: 0, max: 24, typical: 4 },
      approval: { min: 0, max: 48, typical: 12 },
      processing: { min: 0, max: 4, typical: 1 },
      settlement: { min: 0, max: 2, typical: 1 },
    };
  }

  /**
   * Calculate refund timeline estimate
   * @param {string} paymentMethod - Original payment method
   * @param {string} processor - Payment processor/gateway
   * @param {Object} options - Additional options
   * @returns {Object} Timeline estimate
   */
  calculate(paymentMethod, processor = null, options = {}) {
    const method = processor || paymentMethod;
    const processingTime = this.processingTimes[method] || this.processingTimes.bank_transfer;

    // Calculate total business days
    const minDays = processingTime.min;
    const maxDays = processingTime.max;
    const typicalDays = processingTime.typical;

    // Calculate calendar days (add weekends)
    const minCalendar = this._businessToCalendar(minDays);
    const maxCalendar = this._businessToCalendar(maxDays);
    const typicalCalendar = this._businessToCalendar(typicalDays);

    // Calculate dates
    const now = new Date();
    const minDate = this._addBusinessDays(now, minDays);
    const maxDate = this._addBusinessDays(now, maxDays);
    const typicalDate = this._addBusinessDays(now, typicalDays);

    // Timeline steps
    const steps = this._generateTimelineSteps(now, processingTime);

    return {
      paymentMethod,
      processor: method,
      estimate: {
        businessDays: { min: minDays, max: maxDays, typical: typicalDays },
        calendarDays: { min: minCalendar, max: maxCalendar, typical: typicalCalendar },
        dates: {
          earliest: minDate.toISOString().split('T')[0],
          latest: maxDate.toISOString().split('T')[0],
          typical: typicalDate.toISOString().split('T')[0],
        },
      },
      steps,
      formatted: `Typically ${typicalDays} business day${typicalDays !== 1 ? 's' : ''} (${typicalCalendar} calendar day${typicalCalendar !== 1 ? 's' : ''})`,
      disclaimer: 'Actual processing times may vary depending on your financial institution.',
    };
  }

  /**
   * Get estimated completion date
   * @param {string} paymentMethod - Payment method
   * @param {Date} startDate - Start date (default: now)
   * @returns {Date} Estimated completion date
   */
  getEstimatedCompletion(paymentMethod, startDate = new Date()) {
    const processingTime = this.processingTimes[paymentMethod] || this.processingTimes.bank_transfer;
    return this._addBusinessDays(startDate, processingTime.typical);
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Generate timeline step details
   * @private
   */
  _generateTimelineSteps(startDate, processingTime) {
    const steps = [];
    let currentDate = new Date(startDate);

    // Step 1: Request Review
    const reviewHours = this.internalSteps.request_review.typical;
    currentDate = this._addHours(currentDate, reviewHours);
    steps.push({
      step: 'Request Review',
      description: 'Your refund request is being reviewed',
      estimatedCompletion: currentDate.toISOString(),
      duration: `${reviewHours} hours`,
    });

    // Step 2: Approval
    const approvalHours = this.internalSteps.approval.typical;
    currentDate = this._addHours(currentDate, approvalHours);
    steps.push({
      step: 'Approval',
      description: 'Refund has been approved',
      estimatedCompletion: currentDate.toISOString(),
      duration: `${approvalHours} hours`,
    });

    // Step 3: Processing
    const processingHours = this.internalSteps.processing.typical;
    currentDate = this._addHours(currentDate, processingHours);
    steps.push({
      step: 'Processing',
      description: 'Refund is being processed by payment provider',
      estimatedCompletion: currentDate.toISOString(),
      duration: `${processingHours} hours`,
    });

    // Step 4: Settlement
    const settlementDays = processingTime.typical;
    currentDate = this._addBusinessDays(currentDate, settlementDays);
    steps.push({
      step: 'Settlement',
      description: 'Funds should appear in your account',
      estimatedCompletion: currentDate.toISOString(),
      duration: `${settlementDays} business day${settlementDays !== 1 ? 's' : ''}`,
    });

    return steps;
  }

  /**
   * Convert business days to calendar days
   * @private
   */
  _businessToCalendar(businessDays) {
    // Rough conversion: 5 business days = 7 calendar days
    return Math.ceil(businessDays * 1.4);
  }

  /**
   * Add business days to a date
   * @private
   */
  _addBusinessDays(date, days) {
    const result = new Date(date);
    let added = 0;
    
    while (added < days) {
      result.setDate(result.getDate() + 1);
      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (result.getDay() !== 0 && result.getDay() !== 6) {
        added++;
      }
    }
    
    return result;
  }

  /**
   * Add hours to a date
   * @private
   */
  _addHours(date, hours) {
    const result = new Date(date);
    result.setHours(result.getHours() + hours);
    return result;
  }
}

// Export singleton instance
module.exports = new RefundTimelineCalculator();