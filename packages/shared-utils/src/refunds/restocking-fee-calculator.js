const logger = require('../logging/logger');

/**
 * Restocking Fee Calculator
 * 
 * Calculates restocking fees based on:
 * - Product category default fees
 * - Item condition (opened, used, missing packaging)
 * - Return window timing
 * - Special handling requirements
 * 
 * FEE STRUCTURE:
 * - Electronics: 0-15% depending on condition
 * - Furniture: 10-25% for assembled/used items
 * - Clothing: 0% (no restocking fee)
 * - Special items: 0-50% for custom handling
 * 
 * @example
 *   const calc = require('@siamsiam/shared-utils').refunds.restockingFeeCalculator;
 *   const fee = calc.calculate({
 *     category: 'electronics',
 *     itemPrice: 500,
 *     isOpened: true,
 *     missingPackaging: true,
 *   });
 */

class RestockingFeeCalculator {
  constructor() {
    // Base restocking fees by category (percentage)
    this.baseFees = {
      electronics: 0,
      furniture: 10,
      appliances: 10,
      musical_instruments: 5,
      sporting_goods: 5,
      tools: 5,
      automotive: 10,
      default: 0,
    };

    // Additional fees for specific conditions
    this.conditionFees = {
      opened: 5,
      used: 10,
      missing_packaging: 5,
      missing_accessories: 10,
      damaged_packaging: 2,
      assembled: 15,
      installed: 20,
    };
  }

  /**
   * Calculate restocking fee
   * @param {Object} params - Calculation parameters
   * @param {string} params.category - Product category
   * @param {number} params.itemPrice - Item price
   * @param {boolean} params.isOpened - Is item opened
   * @param {boolean} params.isUsed - Is item used
   * @param {boolean} params.missingPackaging - Is packaging missing
   * @param {boolean} params.missingAccessories - Are accessories missing
   * @param {boolean} params.isAssembled - Is item assembled
   * @returns {Object} Fee calculation
   */
  calculate(params = {}) {
    const {
      category = 'default',
      itemPrice = 0,
      isOpened = false,
      isUsed = false,
      missingPackaging = false,
      missingAccessories = false,
      damagedPackaging = false,
      isAssembled = false,
      isInstalled = false,
      maxFeePercent = 50,
    } = params;

    // Start with base fee for category
    let feePercent = this.baseFees[category] || this.baseFees.default;

    // Add condition-based fees
    const appliedConditions = [];

    if (isOpened) {
      feePercent += this.conditionFees.opened;
      appliedConditions.push('opened');
    }

    if (isUsed) {
      feePercent += this.conditionFees.used;
      appliedConditions.push('used');
    }

    if (missingPackaging) {
      feePercent += this.conditionFees.missing_packaging;
      appliedConditions.push('missing_packaging');
    }

    if (missingAccessories) {
      feePercent += this.conditionFees.missing_accessories;
      appliedConditions.push('missing_accessories');
    }

    if (damagedPackaging) {
      feePercent += this.conditionFees.damaged_packaging;
      appliedConditions.push('damaged_packaging');
    }

    if (isAssembled) {
      feePercent += this.conditionFees.assembled;
      appliedConditions.push('assembled');
    }

    if (isInstalled) {
      feePercent += this.conditionFees.installed;
      appliedConditions.push('installed');
    }

    // Cap at maximum fee percentage
    feePercent = Math.min(feePercent, maxFeePercent);

    // Calculate fee amount
    const feeAmount = (itemPrice * feePercent) / 100;
    const roundedFee = Math.round(feeAmount * 100) / 100;

    return {
      feePercent,
      feeAmount: roundedFee,
      baseFeePercent: this.baseFees[category] || 0,
      appliedConditions,
      itemPrice,
      netAfterFee: itemPrice - roundedFee,
      isMaximumFee: feePercent >= maxFeePercent,
    };
  }

  /**
   * Get base restocking fee for a category
   * @param {string} category - Product category
   * @returns {number} Base fee percentage
   */
  getBaseFee(category) {
    return this.baseFees[category] || this.baseFees.default;
  }

  /**
   * Set base restocking fee for a category
   * @param {string} category - Product category
   * @param {number} feePercent - Fee percentage (0-100)
   */
  setBaseFee(category, feePercent) {
    this.baseFees[category] = Math.min(Math.max(feePercent, 0), 100);
    logger.info('Restocking fee updated', { category, feePercent });
  }
}

module.exports = new RestockingFeeCalculator();