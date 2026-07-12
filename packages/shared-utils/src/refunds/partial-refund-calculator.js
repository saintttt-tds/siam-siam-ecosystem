const currencyValidator = require('../validators/currency-validator');
const logger = require('../logging/logger');

/**
 * Partial Refund Calculator
 * 
 * Calculates partial refund amounts for scenarios where:
 * - Only some items in an order are returned
 * - Partial quantity of an item is returned
 * - Item is kept but partial compensation is needed
 * - Service was partially rendered
 * 
 * PARTIAL REFUND TYPES:
 * - Item Selection: Refund specific items from order
 * - Quantity Split: Refund partial quantity of an item
 * - Damage Compensation: Partial refund for damaged items
 * - Service Adjustment: Partial refund for unsatisfactory service
 * 
 * @example
 *   const calc = require('@siamsiam/shared-utils').refunds.partialRefundCalculator;
 *   const result = calc.calculateItemSelection(order, ['item_1', 'item_3']);
 */

class PartialRefundCalculator {
  /**
   * Calculate refund for selected items from an order
   * @param {Object} order - Order with items array
   * @param {Array} selectedItemIds - Array of item IDs to refund
   * @param {Object} options - Calculation options
   * @returns {Object} Partial refund calculation
   */
  calculateItemSelection(order, selectedItemIds, options = {}) {
    if (!order.items || !Array.isArray(order.items)) {
      throw new Error('Order must have items array');
    }

    const selectedItems = order.items.filter(item => 
      selectedItemIds.includes(item.id)
    );

    if (selectedItems.length === 0) {
      return {
        valid: false,
        error: 'No matching items found for partial refund',
      };
    }

    const remainingItems = order.items.filter(item => 
      !selectedItemIds.includes(item.id)
    );

    // Calculate refund amounts
    const refundSubtotal = selectedItems.reduce((sum, item) => 
      sum + (item.price * item.quantity), 0
    );

    const orderSubtotal = order.items.reduce((sum, item) => 
      sum + (item.price * item.quantity), 0
    );

    // Proportional values
    const proportion = orderSubtotal > 0 ? refundSubtotal / orderSubtotal : 0;
    const refundTax = (order.tax || 0) * proportion;
    const refundShipping = (order.shippingCost || 0) * proportion;
    const refundDiscount = (order.discount || 0) * proportion;

    const netRefund = refundSubtotal + refundTax + refundShipping - refundDiscount;

    return {
      valid: true,
      type: 'item_selection',
      selectedItems: selectedItems.map(i => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        subtotal: i.price * i.quantity,
      })),
      remainingItems: remainingItems.map(i => ({
        id: i.id,
        name: i.name,
      })),
      calculation: {
        refundSubtotal,
        refundTax: Math.round(refundTax * 100) / 100,
        refundShipping: Math.round(refundShipping * 100) / 100,
        refundDiscount: Math.round(refundDiscount * 100) / 100,
        netRefund: Math.round(netRefund * 100) / 100,
        proportion: Math.round(proportion * 100),
      },
      formatted: currencyValidator.format(netRefund, order.currency || 'USD'),
      currency: order.currency || 'USD',
    };
  }

  /**
   * Calculate partial quantity refund for a single item
   * @param {Object} orderItem - Order item
   * @param {number} returnQuantity - Quantity being returned
   * @param {Object} order - Parent order
   * @returns {Object} Partial quantity refund calculation
   */
  calculateQuantitySplit(orderItem, returnQuantity, order = {}) {
    const totalQuantity = orderItem.quantity || 1;
    
    if (returnQuantity > totalQuantity) {
      return {
        valid: false,
        error: `Return quantity (${returnQuantity}) exceeds purchased quantity (${totalQuantity})`,
      };
    }

    const proportion = returnQuantity / totalQuantity;
    const itemSubtotal = orderItem.price * returnQuantity;
    const itemTax = (orderItem.tax || 0) * proportion;
    const netRefund = itemSubtotal + itemTax;

    return {
      valid: true,
      type: 'quantity_split',
      item: {
        id: orderItem.id,
        name: orderItem.name,
        totalQuantity,
        returnQuantity,
        keptQuantity: totalQuantity - returnQuantity,
      },
      calculation: {
        itemSubtotal,
        itemTax: Math.round(itemTax * 100) / 100,
        netRefund: Math.round(netRefund * 100) / 100,
        proportion: Math.round(proportion * 100),
      },
      formatted: currencyValidator.format(netRefund, order.currency || 'USD'),
      currency: order.currency || 'USD',
    };
  }

  /**
   * Calculate damage compensation refund
   * @param {Object} orderItem - Damaged order item
   * @param {string} damageLevel - Damage severity (minor, moderate, severe, total)
   * @param {Object} order - Parent order
   * @returns {Object} Damage compensation calculation
   */
  calculateDamageCompensation(orderItem, damageLevel = 'moderate', order = {}) {
    const compensationRates = {
      minor: 15,     // 15% refund for minor damage
      moderate: 35,  // 35% refund for moderate damage
      severe: 65,    // 65% refund for severe damage
      total: 100,    // 100% refund for total damage
    };

    const compensationPercent = compensationRates[damageLevel] || compensationRates.moderate;
    const itemTotal = orderItem.price * (orderItem.quantity || 1);
    const refundAmount = (itemTotal * compensationPercent) / 100;

    return {
      valid: true,
      type: 'damage_compensation',
      item: {
        id: orderItem.id,
        name: orderItem.name,
        damageLevel,
        compensationPercent,
      },
      calculation: {
        itemTotal,
        refundAmount: Math.round(refundAmount * 100) / 100,
        compensationPercent,
      },
      formatted: currencyValidator.format(refundAmount, order.currency || 'USD'),
      currency: order.currency || 'USD',
      note: `Customer keeps item with ${compensationPercent}% compensation for ${damageLevel} damage`,
    };
  }

  /**
   * Calculate service adjustment refund
   * @param {Object} serviceItem - Service item
   * @param {number} satisfactionPercent - Satisfaction level (0-100)
   * @param {Object} order - Parent order
   * @returns {Object} Service adjustment calculation
   */
  calculateServiceAdjustment(serviceItem, satisfactionPercent = 50, order = {}) {
    const refundPercent = Math.max(0, 100 - satisfactionPercent);
    const itemTotal = serviceItem.price * (serviceItem.quantity || 1);
    const refundAmount = (itemTotal * refundPercent) / 100;

    return {
      valid: true,
      type: 'service_adjustment',
      item: {
        id: serviceItem.id,
        name: serviceItem.name,
        satisfactionPercent,
        refundPercent,
      },
      calculation: {
        itemTotal,
        refundAmount: Math.round(refundAmount * 100) / 100,
        refundPercent,
      },
      formatted: currencyValidator.format(refundAmount, order.currency || 'USD'),
      currency: order.currency || 'USD',
      note: `${refundPercent}% refund for ${satisfactionPercent}% satisfaction level`,
    };
  }
}

module.exports = new PartialRefundCalculator();