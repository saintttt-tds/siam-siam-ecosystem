const logger = require('../logging/logger');

/**
 * Refund Method Router
 * 
 * Routes refund to the correct payment method based on:
 * - Original transaction payment method
 * - Available refund options
 * - Merchant/store preferences
 * - Regulatory requirements
 * - Processing capabilities
 * 
 * REFUND METHODS:
 * - Card Refund: Back to original credit/debit card
 * - Mobile Money: Back to mobile wallet (EcoCash, M-Pesa, etc.)
 * - Bank Transfer: Direct bank deposit
 * - Wallet Credit: Platform wallet balance
 * - Store Credit: Merchant store credit
 * 
 * @example
 *   const router = require('@siamsiam/shared-utils').refunds.refundMethodRouter;
 *   const route = router.route({
 *     originalTransaction: { method: 'ecocash', amount: 100 },
 *     allowedMethods: ['mobile_money', 'wallet', 'store_credit'],
 *   });
 */

class RefundMethodRouter {
  constructor() {
    // Mapping of payment methods to available refund methods (in priority order)
    this.routingMap = {
      card: [
        { method: 'card_refund', processor: 'stripe', settlementDays: 5, priority: 1 },
        { method: 'wallet_credit', processor: 'internal', settlementDays: 0, priority: 2 },
        { method: 'store_credit', processor: 'internal', settlementDays: 0, priority: 3 },
      ],
      stripe: [
        { method: 'card_refund', processor: 'stripe', settlementDays: 5, priority: 1 },
      ],
      paypal: [
        { method: 'paypal_refund', processor: 'paypal', settlementDays: 3, priority: 1 },
      ],
      ecocash: [
        { method: 'mobile_money', processor: 'ecocash', settlementDays: 1, priority: 1 },
        { method: 'wallet_credit', processor: 'internal', settlementDays: 0, priority: 2 },
      ],
      onemoney: [
        { method: 'mobile_money', processor: 'onemoney', settlementDays: 1, priority: 1 },
        { method: 'wallet_credit', processor: 'internal', settlementDays: 0, priority: 2 },
      ],
      telecash: [
        { method: 'mobile_money', processor: 'telecash', settlementDays: 1, priority: 1 },
        { method: 'wallet_credit', processor: 'internal', settlementDays: 0, priority: 2 },
      ],
      mpesa: [
        { method: 'mobile_money', processor: 'mpesa', settlementDays: 1, priority: 1 },
        { method: 'wallet_credit', processor: 'internal', settlementDays: 0, priority: 2 },
      ],
      bank_transfer: [
        { method: 'bank_transfer', processor: 'bank', settlementDays: 3, priority: 1 },
        { method: 'wallet_credit', processor: 'internal', settlementDays: 0, priority: 2 },
      ],
      wallet: [
        { method: 'wallet_credit', processor: 'internal', settlementDays: 0, priority: 1 },
      ],
      cash_on_delivery: [
        { method: 'bank_transfer', processor: 'bank', settlementDays: 3, priority: 1 },
        { method: 'wallet_credit', processor: 'internal', settlementDays: 0, priority: 2 },
        { method: 'store_credit', processor: 'internal', settlementDays: 0, priority: 3 },
      ],
      payit: [
        { method: 'gateway_refund', processor: 'payit', settlementDays: 3, priority: 1 },
        { method: 'wallet_credit', processor: 'internal', settlementDays: 0, priority: 2 },
      ],
    };
  }

  /**
   * Route refund to appropriate method
   * @param {Object} params - Routing parameters
   * @param {Object} params.originalTransaction - Original transaction details
   * @param {Array} params.allowedMethods - Allowed refund methods (from policy)
   * @param {Object} params.preferences - User/merchant preferences
   * @returns {Object} Selected refund route
   */
  route(params = {}) {
    const {
      originalTransaction,
      allowedMethods = null,
      preferences = {},
    } = params;

    if (!originalTransaction) {
      throw new Error('Original transaction is required for refund routing');
    }

    const paymentMethod = originalTransaction.method || originalTransaction.paymentMethod || 'bank_transfer';
    
    // Get available routes for this payment method
    let availableRoutes = this.routingMap[paymentMethod] || this.routingMap.bank_transfer;

    // Filter by allowed methods if specified
    if (allowedMethods && allowedMethods.length > 0) {
      availableRoutes = availableRoutes.filter(route => 
        allowedMethods.includes(route.method)
      );
    }

    // Filter by user preferences
    if (preferences.preferredMethod) {
      const preferred = availableRoutes.find(r => r.method === preferences.preferredMethod);
      if (preferred) {
        availableRoutes = [preferred];
      }
    }

    // Sort by priority
    availableRoutes.sort((a, b) => a.priority - b.priority);

    // Select the best route
    const selectedRoute = availableRoutes[0];

    if (!selectedRoute) {
      logger.warn('No refund route available', { 
        paymentMethod, 
        allowedMethods,
      });
      
      return {
        method: 'manual',
        processor: 'admin',
        settlementDays: 7,
        requiresManualProcessing: true,
        reason: 'No automatic refund route available',
      };
    }

    return {
      ...selectedRoute,
      originalTransactionId: originalTransaction.id,
      originalPaymentMethod: paymentMethod,
      requiresApproval: this._requiresApproval(selectedRoute, originalTransaction),
      metadata: {
        originalProcessor: originalTransaction.processor,
        originalGatewayRef: originalTransaction.gatewayRef || originalTransaction.reference,
        routingReason: this._getRoutingReason(selectedRoute, params),
      },
    };
  }

  /**
   * Get all available refund methods for a payment method
   * @param {string} paymentMethod - Payment method
   * @returns {Array} Available methods
   */
  getAvailableMethods(paymentMethod) {
    return (this.routingMap[paymentMethod] || []).map(route => ({
      method: route.method,
      processor: route.processor,
      settlementDays: route.settlementDays,
      description: this._getMethodDescription(route.method),
    }));
  }

  /**
   * Add or update routing rule
   * @param {string} paymentMethod - Payment method
   * @param {Array} routes - Route configurations
   */
  setRoutes(paymentMethod, routes) {
    this.routingMap[paymentMethod] = routes;
    logger.info('Refund routing rules updated', { paymentMethod });
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Check if refund requires manual approval
   * @private
   */
  _requiresApproval(route, transaction) {
    // Large amounts need approval
    if (transaction.amount > 1000) return true;
    
    // Bank transfers always need approval
    if (route.method === 'bank_transfer') return true;
    
    // International refunds need approval
    if (transaction.isInternational) return true;
    
    return false;
  }

  /**
   * Get human-readable routing reason
   * @private
   */
  _getRoutingReason(route, params) {
    if (params.preferences?.preferredMethod === route.method) {
      return 'Selected based on user preference';
    }
    if (params.allowedMethods?.includes(route.method)) {
      return 'Selected from allowed methods';
    }
    return 'Default routing for payment method';
  }

  /**
   * Get human-readable method description
   * @private
   */
  _getMethodDescription(method) {
    const descriptions = {
      card_refund: 'Refund to original credit/debit card',
      paypal_refund: 'Refund to PayPal account',
      mobile_money: 'Refund to mobile money wallet',
      bank_transfer: 'Direct bank transfer',
      wallet_credit: 'Credit to platform wallet',
      store_credit: 'Credit to store account',
      gateway_refund: 'Refund via payment gateway',
      manual: 'Manual refund processing',
    };
    return descriptions[method] || 'Standard refund processing';
  }
}

// Export singleton instance
module.exports = new RefundMethodRouter();