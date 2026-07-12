const logger = require('../logging/logger');
const refundPolicyEngine = require('./refund-policy-engine');

/**
 * Refund Eligibility Checker
 * 
 * Comprehensive checker that determines if an order item qualifies
 * for a refund based on multiple factors:
 * - Order status and timeline
 * - Product category policies
 * - Item condition
 * - Previous refund history
 * - Payment method constraints
 * - Merchant-specific rules
 * 
 * @example
 *   const checker = require('@siamsiam/shared-utils').refunds.refundEligibilityChecker;
 *   
 *   const result = await checker.check({
 *     orderItem: { id: 'item_123', category: 'electronics', price: 299.99 },
 *     order: { id: 'order_456', status: 'delivered', deliveredAt: '2024-01-01' },
 *     userId: 'user_789',
 *   });
 */

class RefundEligibilityChecker {
  constructor() {
    // Order statuses that allow refunds
    this.refundableStatuses = new Set([
      'completed', 'delivered', 'partially_delivered',
    ]);

    // Statuses that allow cancellation (full refund before shipping)
    this.cancellableStatuses = new Set([
      'pending', 'confirmed', 'processing',
    ]);

    // Maximum refund requests per order item
    this.maxRefundAttempts = 3;
  }

  /**
   * Check if an order item is eligible for refund
   * @param {Object} params - Check parameters
   * @param {Object} params.orderItem - Order item details
   * @param {Object} params.order - Order details
   * @param {string} params.userId - User requesting refund
   * @param {Object} params.merchant - Merchant information
   * @param {Array} params.previousRefunds - Previous refund attempts
   * @returns {Object} Eligibility result
   */
  check(params = {}) {
    const {
      orderItem,
      order = {},
      userId = null,
      merchant = null,
      previousRefunds = [],
    } = params;

    // Validate required fields
    if (!orderItem) {
      return { eligible: false, reason: 'Order item is required' };
    }

    // Check if item has already been fully refunded
    if (orderItem.refundStatus === 'fully_refunded') {
      return {
        eligible: false,
        reason: 'This item has already been fully refunded',
        code: 'ALREADY_REFUNDED',
      };
    }

    // Check if a refund request is already in progress
    if (orderItem.refundStatus === 'pending' || orderItem.refundStatus === 'processing') {
      return {
        eligible: false,
        reason: 'A refund request is already being processed for this item',
        code: 'REFUND_IN_PROGRESS',
      };
    }

    // Check maximum refund attempts
    if (previousRefunds.length >= this.maxRefundAttempts) {
      return {
        eligible: false,
        reason: `Maximum refund attempts (${this.maxRefundAttempts}) reached for this item`,
        code: 'MAX_ATTEMPTS_REACHED',
        attempts: previousRefunds.length,
      };
    }

    // Check if order can be refunded
    const orderCheck = this._checkOrderStatus(order);
    if (!orderCheck.eligible) {
      return orderCheck;
    }

    // Calculate days since relevant date
    const referenceDate = this._getReferenceDate(order);
    if (!referenceDate) {
      return {
        eligible: false,
        reason: 'Cannot determine purchase date for refund eligibility',
        code: 'NO_REFERENCE_DATE',
      };
    }

    const daysSinceReference = this._daysSince(referenceDate);
    if (daysSinceReference < 0) {
      return {
        eligible: false,
        reason: 'Invalid order date detected',
        code: 'INVALID_DATE',
      };
    }

    // Check user authorization
    if (userId && order.userId && userId !== order.userId) {
      // User is not the order owner - check if authorized
      const isAuthorized = this._checkUserAuthorization(userId, order);
      if (!isAuthorized) {
        return {
          eligible: false,
          reason: 'You are not authorized to request a refund for this order',
          code: 'UNAUTHORIZED',
        };
      }
    }

    // Evaluate refund policy
    const policyResult = refundPolicyEngine.evaluate({
      productCategory: orderItem.category || orderItem.productCategory,
      daysSincePurchase: daysSinceReference,
      merchantPolicy: merchant?.refundPolicy || order.merchant?.refundPolicy || null,
      productPolicy: orderItem.refundPolicy || null,
      orderType: order.type || 'standard',
      productCondition: orderItem.condition || 'good',
      isOpened: orderItem.isOpened || false,
      hasOriginalPackaging: orderItem.hasOriginalPackaging !== false,
      hasTags: orderItem.hasTags !== false,
      isDamaged: orderItem.isDamaged || false,
      purchasePrice: {
        amount: orderItem.price,
        currency: order.currency || 'USD',
      },
    });

    if (!policyResult.eligible) {
      return {
        eligible: false,
        reason: policyResult.reason,
        code: 'POLICY_DENIED',
        policy: policyResult.policy,
        refundWindow: policyResult.refundWindow,
        daysSincePurchase: daysSinceReference,
      };
    }

    // Determine return requirements
    const requiresReturn = !orderItem.isDigital && 
                           policyResult.condition !== 'non_refundable';

    return {
      eligible: true,
      code: 'ELIGIBLE',
      requiresReturn,
      policy: policyResult.policy,
      refundWindow: policyResult.refundWindow,
      daysSincePurchase: daysSinceReference,
      daysRemaining: policyResult.daysRemaining,
      restockingFee: policyResult.restockingFee,
      requiresApproval: policyResult.requiresApproval,
      requiresOriginalPackaging: policyResult.requiresOriginalPackaging,
      allowedRefundMethods: policyResult.allowedRefundMethods,
      partialRefundsAllowed: policyResult.partialRefundsAllowed,
      description: policyResult.description,
      referenceDate,
    };
  }

  /**
   * Batch check multiple items in an order
   * @param {Array} orderItems - Array of order items
   * @param {Object} order - Order details
   * @returns {Object} Batch check results
   */
  checkBatch(orderItems, order = {}) {
    const results = orderItems.map(item => ({
      itemId: item.id,
      productName: item.name || item.productName,
      ...this.check({ orderItem: item, order }),
    }));

    return {
      items: results,
      summary: {
        totalItems: results.length,
        eligibleItems: results.filter(r => r.eligible).length,
        ineligibleItems: results.filter(r => !r.eligible).length,
        allEligible: results.every(r => r.eligible),
        anyEligible: results.some(r => r.eligible),
      },
    };
  }

  /**
   * Quick check - is item likely eligible?
   * @param {Object} orderItem - Order item
   * @param {Object} order - Order
   * @returns {boolean} Quick eligibility indicator
   */
  quickCheck(orderItem, order = {}) {
    const result = this.check({ orderItem, order });
    return result.eligible;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Check if order status allows refunds
   * @private
   */
  _checkOrderStatus(order) {
    if (!order.status) {
      return {
        eligible: false,
        reason: 'Order status is unknown',
        code: 'UNKNOWN_STATUS',
      };
    }

    if (this.refundableStatuses.has(order.status)) {
      return { eligible: true, code: 'OK' };
    }

    if (this.cancellableStatuses.has(order.status)) {
      return {
        eligible: true,
        code: 'CANCELLABLE',
        reason: 'Order can be cancelled for full refund',
        isCancellation: true,
      };
    }

    return {
      eligible: false,
      reason: `Orders with status '${order.status}' cannot be refunded`,
      code: 'INVALID_STATUS',
      currentStatus: order.status,
      allowedStatuses: Array.from(this.refundableStatuses),
    };
  }

  /**
   * Get reference date for calculating return window
   * @private
   */
  _getReferenceDate(order) {
    // Priority: delivered > completed > shipped > created
    return order.deliveredAt || order.completedAt || order.shippedAt || order.createdAt || null;
  }

  /**
   * Calculate days since a date
   * @private
   */
  _daysSince(dateString) {
    if (!dateString) return 999;
    const date = new Date(dateString);
    const now = new Date();
    return Math.floor((now - date) / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if user is authorized to request refund
   * @private
   */
  _checkUserAuthorization(userId, order) {
    // Order owner
    if (order.userId === userId) return true;
    
    // Gift recipient (if gift orders support recipient refunds)
    if (order.giftRecipientId === userId && order.allowRecipientRefund) return true;
    
    // Admin override
    // PRODUCTION: Check admin permissions
    
    return false;
  }
}

// Export singleton instance
module.exports = new RefundEligibilityChecker();