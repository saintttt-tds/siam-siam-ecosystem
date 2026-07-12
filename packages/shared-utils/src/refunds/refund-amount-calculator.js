const currencyValidator = require('../validators/currency-validator');
const logger = require('../logging/logger');

/**
 * Refund Amount Calculator
 * 
 * Calculates the exact refund amount including:
 * - Item price calculations
 * - Proportional tax refunds
 * - Shipping cost handling
 * - Restocking fee deductions
 * - Promotional discount adjustments
 * - Partial refund calculations
 * - Multi-currency support
 * 
 * CALCULATION FORMULA:
 * Gross Refund = Item Subtotal + Tax + Shipping
 * Deductions = Restocking Fee + Discount Adjustment
 * Net Refund = Gross Refund - Deductions
 * 
 * @example
 *   const calculator = require('@siamsiam/shared-utils').refunds.refundAmountCalculator;
 *   
 *   const result = calculator.calculate({
 *     orderItem: { price: 100, quantity: 2, taxRate: 15 },
 *     order: { shippingCost: 10, discount: 20, subtotal: 200, currency: 'USD' },
 *     options: { refundShipping: true, restockingFeePercent: 10 },
 *   });
 */

class RefundAmountCalculator {
  constructor() {
    this.defaultCurrency = 'USD';
  }

  /**
   * Calculate refund amount for an order item
   * @param {Object} params - Calculation parameters
   * @param {Object} params.orderItem - Order item details
   * @param {Object} params.order - Parent order details
   * @param {Object} params.options - Calculation options
   * @returns {Object} Detailed refund amount breakdown
   */
  calculate(params = {}) {
    const {
      orderItem,
      order = {},
      options = {},
    } = params;

    if (!orderItem) {
      throw new Error('Order item is required for refund calculation');
    }

    const {
      refundShipping = false,
      restockingFeePercent = 0,
      isPartialRefund = false,
      partialQuantity = 1,
      partialReason = null,
      includeTax = true,
      currency = order.currency || this.defaultCurrency,
    } = options;

    // Base calculations
    const itemPrice = parseFloat(orderItem.price) || 0;
    const quantity = isPartialRefund ? Math.min(partialQuantity, orderItem.quantity || 1) : (orderItem.quantity || 1);
    const itemSubtotal = this._round(itemPrice * quantity);

    // Tax calculation (proportional)
    const taxRate = parseFloat(orderItem.taxRate || order.taxRate || 0);
    const taxAmount = includeTax ? this._round(itemSubtotal * (taxRate / 100)) : 0;

    // Shipping cost (proportional to item)
    let shippingAmount = 0;
    if (refundShipping && order.shippingCost) {
      const orderSubtotal = parseFloat(order.subtotal || order.total || 1);
      if (orderSubtotal > 0) {
        const itemProportion = itemSubtotal / orderSubtotal;
        shippingAmount = this._round(order.shippingCost * itemProportion);
      }
    }

    // Gross refund before deductions
    const grossRefund = this._round(itemSubtotal + taxAmount + shippingAmount);

    // Restocking fee
    let restockingFee = 0;
    if (restockingFeePercent > 0) {
      restockingFee = this._round(itemSubtotal * (restockingFeePercent / 100));
    }

    // Discount adjustment (proportional)
    let discountDeduction = 0;
    if (order.discount && order.discount > 0) {
      const orderSubtotal = parseFloat(order.subtotal || order.total || 1);
      if (orderSubtotal > 0) {
        const itemProportion = itemSubtotal / orderSubtotal;
        discountDeduction = this._round(order.discount * itemProportion);
      }
    }

    // Additional fees
    let additionalFees = 0;
    if (orderItem.additionalFees) {
      additionalFees = parseFloat(orderItem.additionalFees) || 0;
    }

    // Total deductions
    const totalDeductions = this._round(restockingFee + discountDeduction + additionalFees);

    // Final net refund
    const netRefund = Math.max(0, this._round(grossRefund - totalDeductions));

    // Determine if this is a full refund
    const originalItemTotal = this._round(itemPrice * (orderItem.quantity || 1));
    const isFullRefund = !isPartialRefund && netRefund >= originalItemTotal;

    return {
      currency,
      breakdown: {
        itemPrice,
        quantity,
        itemSubtotal,
        taxRate,
        taxAmount,
        shippingAmount,
        grossRefund,
        restockingFee,
        restockingFeePercent,
        discountDeduction,
        additionalFees,
        totalDeductions,
        netRefund,
      },
      formatted: {
        itemSubtotal: currencyValidator.format(itemSubtotal, currency),
        taxAmount: currencyValidator.format(taxAmount, currency),
        shippingAmount: currencyValidator.format(shippingAmount, currency),
        grossRefund: currencyValidator.format(grossRefund, currency),
        restockingFee: currencyValidator.format(restockingFee, currency),
        totalDeductions: currencyValidator.format(totalDeductions, currency),
        netRefund: currencyValidator.format(netRefund, currency),
      },
      isFullRefund,
      isPartialRefund,
      refundPercent: originalItemTotal > 0 
        ? this._round((netRefund / originalItemTotal) * 100) 
        : 0,
    };
  }

  /**
   * Calculate refund for entire order
   * @param {Object} order - Order with items array
   * @param {Object} options - Calculation options
   * @returns {Object} Order-level refund calculation
   */
  calculateOrderRefund(order, options = {}) {
    if (!order.items || !Array.isArray(order.items)) {
      throw new Error('Order must have items array');
    }

    const itemCalculations = order.items.map(item => 
      this.calculate({ orderItem: item, order, options })
    );

    const totalNetRefund = this._round(
      itemCalculations.reduce((sum, calc) => sum + calc.breakdown.netRefund, 0)
    );

    return {
      currency: order.currency || this.defaultCurrency,
      itemCount: itemCalculations.length,
      items: itemCalculations,
      totalNetRefund,
      formattedTotal: currencyValidator.format(totalNetRefund, order.currency),
      breakdown: {
        totalItemSubtotal: this._round(itemCalculations.reduce((s, c) => s + c.breakdown.itemSubtotal, 0)),
        totalTax: this._round(itemCalculations.reduce((s, c) => s + c.breakdown.taxAmount, 0)),
        totalShipping: this._round(itemCalculations.reduce((s, c) => s + c.breakdown.shippingAmount, 0)),
        totalDeductions: this._round(itemCalculations.reduce((s, c) => s + c.breakdown.totalDeductions, 0)),
      },
    };
  }

  /**
   * Calculate prorated refund for subscriptions
   * @param {Object} subscription - Subscription details
   * @param {Date} cancellationDate - Cancellation date
   * @returns {Object} Prorated refund calculation
   */
  calculateProratedRefund(subscription, cancellationDate = new Date()) {
    const startDate = new Date(subscription.startDate);
    const endDate = new Date(subscription.endDate);
    const cancelDate = new Date(cancellationDate);

    // Total subscription days
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    // Used days
    const usedDays = Math.ceil((cancelDate - startDate) / (1000 * 60 * 60 * 24));
    
    // Unused days
    const unusedDays = Math.max(0, totalDays - usedDays);

    // Prorated refund
    const totalAmount = parseFloat(subscription.amount) || 0;
    const dailyRate = totalDays > 0 ? totalAmount / totalDays : 0;
    const refundAmount = this._round(dailyRate * unusedDays);

    return {
      currency: subscription.currency || this.defaultCurrency,
      subscription: {
        totalDays,
        usedDays,
        unusedDays,
        totalAmount,
        dailyRate: this._round(dailyRate),
      },
      refundAmount,
      formattedRefund: currencyValidator.format(refundAmount, subscription.currency),
      refundPercent: totalAmount > 0 ? this._round((refundAmount / totalAmount) * 100) : 0,
    };
  }

  /**
   * Round to 2 decimal places
   * @private
   */
  _round(value) {
    return Math.round(value * 100) / 100;
  }
}

// Export singleton instance
module.exports = new RefundAmountCalculator();