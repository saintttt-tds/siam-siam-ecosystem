const logger = require('../logging/logger');
const fs = require('fs');
const path = require('path');

/**
 * Refund Policy Rule Evaluation Engine
 * 
 * Core engine for evaluating refund policies across multiple layers:
 * 1. Platform default policies (config/policies/*.json)
 * 2. Product category policies (built-in rules)
 * 3. Merchant/store-specific policies (custom overrides)
 * 4. Individual product exceptions
 * 
 * POLICY EVALUATION ORDER (highest to lowest priority):
 * 1. Product-specific override
 * 2. Merchant/store custom policy
 * 3. Category policy (electronics, clothing, etc.)
 * 4. Platform default policy
 * 
 * POLICY ATTRIBUTES:
 * - returnWindow: Days allowed for returns (0 = non-refundable)
 * - condition: Required item condition for refund
 * - restockingFee: Percentage fee for returns
 * - requiresOriginalPackaging: Whether original packaging is required
 * - allowedRefundMethods: Valid refund methods
 * - exceptions: Special case handling
 * 
 * @example
 *   const engine = require('@siamsiam/shared-utils').refunds.refundPolicyEngine;
 *   
 *   const result = engine.evaluate({
 *     productCategory: 'electronics',
 *     daysSincePurchase: 10,
 *     merchantPolicy: { returnWindow: 14, restockingFee: 10 },
 *     isOpened: true,
 *     hasOriginalPackaging: false,
 *   });
 *   
 *   if (result.eligible) {
 *     console.log(`Eligible for refund with ${result.restockingFee}% restocking fee`);
 *   }
 */

class RefundPolicyEngine {
  constructor() {
    // Load category-specific policies from config
    this.categoryPolicies = {};
    this._loadCategoryPolicies();
    
    // Default platform-wide policy (applied when no specific policy matches)
    this.defaultPolicy = {
      returnWindow: 14,
      condition: 'good_condition',
      restockingFee: 0,
      requiresOriginalPackaging: false,
      allowedRefundMethods: ['original_payment', 'wallet', 'store_credit'],
      partialRefundsAllowed: true,
      maxPartialRefunds: 3,
      requiresApproval: false,
      approvalThreshold: null, // Amount above which approval is needed
      exceptions: [],
      description: 'Standard 14-day return policy',
    };

    // Define category-specific default policies
    this._defineCategoryDefaults();
  }

  /**
   * Evaluate refund policy for a given context
   * @param {Object} context - Complete evaluation context
   * @param {string} context.productCategory - Product category
   * @param {number} context.daysSincePurchase - Days since purchase date
   * @param {Object} context.merchantPolicy - Merchant's custom policy (optional)
   * @param {Object} context.productPolicy - Product-specific policy (optional)
   * @param {string} context.orderType - Order type (standard, preorder, gift)
   * @param {string} context.productCondition - Current product condition
   * @param {boolean} context.isOpened - Whether product has been opened
   * @param {boolean} context.hasOriginalPackaging - Whether original packaging exists
   * @param {boolean} context.hasTags - Whether tags are still attached
   * @param {boolean} context.isDamaged - Whether product is damaged
   * @param {Object} context.purchasePrice - Purchase price info
   * @returns {Object} Policy evaluation result
   */
  evaluate(context = {}) {
    const {
      productCategory,
      daysSincePurchase = 0,
      merchantPolicy = null,
      productPolicy = null,
      orderType = 'standard',
      productCondition = 'good',
      isOpened = false,
      hasOriginalPackaging = true,
      hasTags = true,
      isDamaged = false,
      purchasePrice = null,
    } = context;

    // Stack policies by priority (highest first)
    const policyStack = [
      { source: 'product', policy: productPolicy },
      { source: 'merchant', policy: merchantPolicy },
      { source: 'category', policy: this._getCategoryPolicy(productCategory) },
      { source: 'platform', policy: this.defaultPolicy },
    ];

    // Merge policies (higher priority overrides lower)
    const effectivePolicy = this._mergePolicies(policyStack);

    // Check if category is inherently non-refundable
    if (effectivePolicy.returnWindow === 0 || effectivePolicy.condition === 'non_refundable') {
      return {
        eligible: false,
        reason: this._getNonRefundableReason(productCategory, effectivePolicy),
        policy: effectivePolicy,
        refundWindow: 0,
        daysSincePurchase,
      };
    }

    // Check return window
    if (daysSincePurchase > effectivePolicy.returnWindow) {
      return {
        eligible: false,
        reason: `Return window of ${effectivePolicy.returnWindow} days has expired (${daysSincePurchase} days since purchase)`,
        policy: effectivePolicy,
        refundWindow: effectivePolicy.returnWindow,
        daysSincePurchase,
        daysOver: daysSincePurchase - effectivePolicy.returnWindow,
        expiredReturnWindow: true,
      };
    }

    // Check condition requirements
    const conditionCheck = this._checkConditionRequirements(
      effectivePolicy.condition,
      {
        productCondition,
        isOpened,
        hasOriginalPackaging,
        hasTags,
        isDamaged,
      }
    );

    if (!conditionCheck.passed) {
      return {
        eligible: false,
        reason: conditionCheck.reason,
        policy: effectivePolicy,
        refundWindow: effectivePolicy.returnWindow,
        conditionFailed: true,
        conditionDetails: conditionCheck.details,
      };
    }

    // Check for exceptions that might allow refund despite policy
    const exceptionResult = this._checkExceptions(effectivePolicy, context);
    if (exceptionResult.override) {
      return {
        eligible: exceptionResult.eligible,
        reason: exceptionResult.reason,
        policy: effectivePolicy,
        refundWindow: effectivePolicy.returnWindow,
        exceptionApplied: true,
        exceptionType: exceptionResult.type,
      };
    }

    // Calculate applicable restocking fee
    const restockingFeeResult = this._calculateRestockingFee(effectivePolicy, context);

    // Check if approval is required
    const requiresApproval = this._checkApprovalRequired(effectivePolicy, purchasePrice);

    // All checks passed
    return {
      eligible: true,
      policy: effectivePolicy,
      refundWindow: effectivePolicy.returnWindow,
      daysSincePurchase,
      daysRemaining: effectivePolicy.returnWindow - daysSincePurchase,
      restockingFee: restockingFeeResult.percentage,
      restockingFeeReason: restockingFeeResult.reason,
      requiresApproval,
      requiresOriginalPackaging: effectivePolicy.requiresOriginalPackaging,
      allowedRefundMethods: effectivePolicy.allowedRefundMethods,
      partialRefundsAllowed: effectivePolicy.partialRefundsAllowed,
      condition: effectivePolicy.condition,
      description: effectivePolicy.description,
    };
  }

  /**
   * Batch evaluate multiple items
   * @param {Array} items - Array of evaluation contexts
   * @returns {Array} Array of evaluation results
   */
  evaluateBatch(items) {
    return items.map(item => ({
      itemId: item.id || item.productId,
      ...this.evaluate(item),
    }));
  }

  /**
   * Check if any items in an order are eligible for refund
   * @param {Array} itemResults - Results from evaluateBatch
   * @returns {Object} Order-level eligibility summary
   */
  getOrderEligibility(itemResults) {
    const eligibleItems = itemResults.filter(r => r.eligible);
    const ineligibleItems = itemResults.filter(r => !r.eligible);

    return {
      hasEligibleItems: eligibleItems.length > 0,
      hasIneligibleItems: ineligibleItems.length > 0,
      totalItems: itemResults.length,
      eligibleCount: eligibleItems.length,
      ineligibleCount: ineligibleItems.length,
      eligibleItems: eligibleItems.map(i => i.itemId),
      ineligibleItems: ineligibleItems.map(i => ({
        itemId: i.itemId,
        reason: i.reason,
      })),
      canPartialRefund: eligibleItems.length > 0 && eligibleItems.length < itemResults.length,
    };
  }

  /**
   * Add or update a category policy
   * @param {string} category - Category name
   * @param {Object} policy - Policy configuration
   */
  setCategoryPolicy(category, policy) {
    this.categoryPolicies[category] = {
      ...this.categoryPolicies[category],
      ...policy,
    };
    logger.info('Category refund policy updated', { category });
  }

  /**
   * Get all defined policies
   * @returns {Object} All policies keyed by category
   */
  getAllPolicies() {
    return {
      categories: { ...this.categoryPolicies },
      default: { ...this.defaultPolicy },
    };
  }

  /**
   * Get policy for a specific category
   * @param {string} category - Category name
   * @returns {Object} Category policy (or default if not found)
   */
  getCategoryPolicy(category) {
    return this._getCategoryPolicy(category);
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Load category policies from config files
   * @private
   */
  _loadCategoryPolicies() {
    // PRODUCTION: Load from database or config service
    // For now, policies are defined in _defineCategoryDefaults
  }

  /**
   * Define built-in category policies
   * @private
   */
  _defineCategoryDefaults() {
    this.categoryPolicies = {
      electronics: {
        returnWindow: 14,
        condition: 'unopened_or_defective',
        restockingFee: 0,
        requiresOriginalPackaging: true,
        allowedRefundMethods: ['original_payment', 'store_credit'],
        partialRefundsAllowed: false,
        requiresApproval: true,
        approvalThreshold: 100, // USD equivalent
        exceptions: [
          { type: 'defective', override: true, returnWindow: 30, reason: 'Defective electronics have 30-day return' },
        ],
        description: '14-day return for unopened electronics; 30-day for defective items',
      },
      
      clothing: {
        returnWindow: 30,
        condition: 'unworn_with_tags',
        restockingFee: 0,
        requiresOriginalPackaging: false,
        allowedRefundMethods: ['original_payment', 'wallet', 'store_credit'],
        partialRefundsAllowed: true,
        maxPartialRefunds: 5,
        requiresApproval: false,
        exceptions: [
          { type: 'sale_item', override: false, reason: 'Sale items are final sale' },
          { type: 'underwear', override: false, reason: 'Underwear cannot be returned for hygiene reasons' },
        ],
        description: '30-day return for unworn clothing with tags attached',
      },
      
      furniture: {
        returnWindow: 7,
        condition: 'unused',
        restockingFee: 15,
        requiresOriginalPackaging: true,
        allowedRefundMethods: ['original_payment', 'store_credit'],
        partialRefundsAllowed: false,
        requiresApproval: true,
        approvalThreshold: 200,
        exceptions: [
          { type: 'defective', override: true, returnWindow: 30, restockingFee: 0, reason: 'Defective furniture has 30-day return with no restocking fee' },
          { type: 'assembled', override: false, reason: 'Assembled furniture cannot be returned' },
        ],
        description: '7-day return for unused furniture; 15% restocking fee applies',
      },
      
      digital_products: {
        returnWindow: 0,
        condition: 'non_refundable',
        restockingFee: 0,
        requiresOriginalPackaging: false,
        allowedRefundMethods: [],
        partialRefundsAllowed: false,
        requiresApproval: false,
        exceptions: [
          { type: 'not_downloaded', override: true, returnWindow: 7, reason: 'Digital products not yet downloaded can be refunded within 7 days' },
          { type: 'defective', override: true, returnWindow: 30, reason: 'Defective digital products have 30-day refund window' },
        ],
        description: 'Digital products are non-refundable once downloaded',
      },
      
      perishable_goods: {
        returnWindow: 0,
        condition: 'non_refundable',
        restockingFee: 0,
        requiresOriginalPackaging: false,
        allowedRefundMethods: [],
        partialRefundsAllowed: false,
        requiresApproval: false,
        exceptions: [
          { type: 'spoiled_on_delivery', override: true, returnWindow: 1, reason: 'Spoiled items reported within 24 hours qualify for refund' },
          { type: 'wrong_item', override: true, returnWindow: 1, reason: 'Wrong item delivered qualifies for refund' },
        ],
        description: 'Perishable goods are non-refundable except for quality issues at delivery',
      },
      
      custom_made: {
        returnWindow: 0,
        condition: 'non_refundable',
        restockingFee: 0,
        requiresOriginalPackaging: false,
        allowedRefundMethods: [],
        partialRefundsAllowed: false,
        requiresApproval: false,
        exceptions: [
          { type: 'not_as_specified', override: true, returnWindow: 14, reason: 'Custom items not matching specifications can be returned' },
          { type: 'defective_materials', override: true, returnWindow: 30, reason: 'Custom items with defective materials have 30-day return' },
        ],
        description: 'Custom-made items are non-refundable unless not matching specifications',
      },
      
      services: {
        returnWindow: 7,
        condition: 'case_by_case',
        restockingFee: 0,
        requiresOriginalPackaging: false,
        allowedRefundMethods: ['original_payment', 'wallet'],
        partialRefundsAllowed: true,
        requiresApproval: true,
        approvalThreshold: 50,
        exceptions: [
          { type: 'not_rendered', override: true, returnWindow: 30, reason: 'Services not yet rendered can be cancelled within 30 days' },
          { type: 'unsatisfactory', override: true, reason: 'Unsatisfactory service delivery reviewed case-by-case' },
        ],
        description: 'Services reviewed on a case-by-case basis; 7-day window for standard requests',
      },
      
      subscription: {
        returnWindow: 14,
        condition: 'prorated',
        restockingFee: 0,
        requiresOriginalPackaging: false,
        allowedRefundMethods: ['original_payment', 'wallet'],
        partialRefundsAllowed: true,
        requiresApproval: false,
        exceptions: [
          { type: 'annual_prepaid', override: true, returnWindow: 30, reason: 'Annual subscriptions have 30-day cancellation window' },
        ],
        description: '14-day cancellation with prorated refund for unused portion',
      },
      
      gift_cards: {
        returnWindow: 0,
        condition: 'non_refundable',
        restockingFee: 0,
        requiresOriginalPackaging: false,
        allowedRefundMethods: [],
        partialRefundsAllowed: false,
        requiresApproval: false,
        exceptions: [
          { type: 'unauthorized_purchase', override: true, returnWindow: 60, reason: 'Unauthorized gift card purchases can be disputed within 60 days' },
        ],
        description: 'Gift cards are non-refundable',
      },
      
      health_beauty: {
        returnWindow: 14,
        condition: 'sealed',
        restockingFee: 0,
        requiresOriginalPackaging: true,
        allowedRefundMethods: ['original_payment', 'store_credit'],
        partialRefundsAllowed: false,
        requiresApproval: false,
        exceptions: [
          { type: 'allergic_reaction', override: true, returnWindow: 30, reason: 'Products causing allergic reactions can be returned within 30 days' },
          { type: 'opened', override: false, reason: 'Opened health/beauty products cannot be returned for hygiene reasons' },
        ],
        description: '14-day return for sealed health & beauty products',
      },
      
      software: {
        returnWindow: 0,
        condition: 'non_refundable',
        restockingFee: 0,
        requiresOriginalPackaging: false,
        allowedRefundMethods: [],
        partialRefundsAllowed: false,
        requiresApproval: false,
        exceptions: [
          { type: 'license_not_activated', override: true, returnWindow: 7, reason: 'Unactivated software licenses can be refunded within 7 days' },
          { type: 'compatibility_issue', override: true, returnWindow: 14, reason: 'Software with documented compatibility issues has 14-day return' },
        ],
        description: 'Software is non-refundable once license is activated',
      },
      
      event_tickets: {
        returnWindow: 0,
        condition: 'non_refundable',
        restockingFee: 0,
        requiresOriginalPackaging: false,
        allowedRefundMethods: [],
        partialRefundsAllowed: false,
        requiresApproval: false,
        exceptions: [
          { type: 'event_cancelled', override: true, returnWindow: 365, reason: 'Cancelled events qualify for full refund' },
          { type: 'event_rescheduled', override: true, returnWindow: 30, reason: 'Rescheduled events allow refund requests within 30 days of notice' },
        ],
        description: 'Event tickets are non-refundable unless event is cancelled',
      },
      
      // Default fallback for uncategorized items
      default: {
        returnWindow: 14,
        condition: 'good_condition',
        restockingFee: 0,
        requiresOriginalPackaging: false,
        allowedRefundMethods: ['original_payment', 'wallet', 'store_credit'],
        partialRefundsAllowed: true,
        maxPartialRefunds: 3,
        requiresApproval: false,
        exceptions: [],
        description: 'Standard 14-day return policy for items in good condition',
      },
    };
  }

  /**
   * Get category policy with fallback to default
   * @private
   */
  _getCategoryPolicy(category) {
    if (category && this.categoryPolicies[category]) {
      return { ...this.categoryPolicies[category] };
    }
    return { ...this.categoryPolicies.default };
  }

  /**
   * Merge policy stack by priority
   * @private
   */
  _mergePolicies(policyStack) {
    // Start with lowest priority (platform default)
    let merged = { ...this.defaultPolicy };

    // Apply each layer (higher priority overrides lower)
    for (const { source, policy } of policyStack) {
      if (policy && typeof policy === 'object') {
        merged = {
          ...merged,
          ...policy,
          _source: source, // Track which source provided the final values
        };
      }
    }

    return merged;
  }

  /**
   * Check if product condition meets policy requirements
   * @private
   */
  _checkConditionRequirements(condition, details) {
    const { productCondition, isOpened, hasOriginalPackaging, hasTags, isDamaged } = details;

    switch (condition) {
      case 'non_refundable':
        return {
          passed: false,
          reason: 'This item category is non-refundable',
          details: { condition },
        };

      case 'unopened_or_defective':
        if (isDamaged) {
          return {
            passed: true,
            reason: 'Defective items qualify for return',
            details: { exception: 'defective' },
          };
        }
        if (isOpened) {
          return {
            passed: false,
            reason: 'Item must be unopened for return (unless defective)',
            details: { isOpened },
          };
        }
        if (!hasOriginalPackaging) {
          return {
            passed: false,
            reason: 'Original packaging is required for return',
            details: { hasOriginalPackaging },
          };
        }
        return { passed: true };

      case 'unopened':
        if (isOpened) {
          return {
            passed: false,
            reason: 'Product must be unopened for refund',
            details: { isOpened },
          };
        }
        return { passed: true };

      case 'unworn_with_tags':
        if (isDamaged) {
          return {
            passed: false,
            reason: 'Damaged items cannot be returned',
            details: { isDamaged },
          };
        }
        if (!hasTags) {
          return {
            passed: false,
            reason: 'Original tags must be attached for return',
            details: { hasTags },
          };
        }
        return { passed: true };

      case 'sealed':
        if (isOpened) {
          return {
            passed: false,
            reason: 'Product seal must be intact for return',
            details: { isOpened },
          };
        }
        return { passed: true };

      case 'unused':
        if (isDamaged) {
          return {
            passed: false,
            reason: 'Damaged items cannot be returned as unused',
            details: { isDamaged },
          };
        }
        return { passed: true };

      case 'good_condition':
        if (isDamaged) {
          return {
            passed: false,
            reason: 'Items must be in good condition for return',
            details: { isDamaged },
          };
        }
        return { passed: true };

      case 'case_by_case':
        // Requires manual review
        return {
          passed: true,
          reason: 'Subject to manual review',
          details: { requiresReview: true },
        };

      case 'prorated':
        // Always passes, amount adjusted separately
        return { passed: true };

      default:
        return {
          passed: true,
          reason: 'Condition requirement met',
        };
    }
  }

  /**
   * Check for exceptions that might override policy
   * @private
   */
  _checkExceptions(policy, context) {
    if (!policy.exceptions || policy.exceptions.length === 0) {
      return { override: false };
    }

    for (const exception of policy.exceptions) {
      if (this._exceptionMatches(exception, context)) {
        return {
          override: true,
          eligible: exception.override,
          reason: exception.reason,
          type: exception.type,
          modifiedPolicy: {
            returnWindow: exception.returnWindow || policy.returnWindow,
            restockingFee: exception.restockingFee !== undefined ? exception.restockingFee : policy.restockingFee,
          },
        };
      }
    }

    return { override: false };
  }

  /**
   * Check if exception matches the current context
   * @private
   */
  _exceptionMatches(exception, context) {
    // Match by exception type against context
    switch (exception.type) {
      case 'defective':
        return context.isDamaged === true;
      case 'sale_item':
        return context.orderType === 'sale';
      case 'underwear':
        return context.productCategory === 'underwear' || context.productSubCategory === 'underwear';
      case 'not_downloaded':
        return context.isDownloaded === false;
      case 'spoiled_on_delivery':
        return context.deliveryIssue === 'spoiled';
      case 'wrong_item':
        return context.deliveryIssue === 'wrong_item';
      case 'not_as_specified':
        return context.matchesSpecification === false;
      case 'defective_materials':
        return context.isDamaged === true && context.damageType === 'material_defect';
      case 'not_rendered':
        return context.serviceRendered === false;
      case 'unsatisfactory':
        return context.satisfaction === 'unsatisfactory';
      case 'annual_prepaid':
        return context.subscriptionType === 'annual';
      case 'unauthorized_purchase':
        return context.authorized === false;
      case 'allergic_reaction':
        return context.allergicReaction === true;
      case 'opened':
        return context.isOpened === true;
      case 'license_not_activated':
        return context.licenseActivated === false;
      case 'compatibility_issue':
        return context.compatibilityIssue === true;
      case 'event_cancelled':
        return context.eventCancelled === true;
      case 'event_rescheduled':
        return context.eventRescheduled === true;
      case 'assembled':
        return context.isAssembled === true;
      default:
        return false;
    }
  }

  /**
   * Calculate applicable restocking fee
   * @private
   */
  _calculateRestockingFee(policy, context) {
    let percentage = policy.restockingFee || 0;
    let reason = null;

    // Increase fee for opened items
    if (context.isOpened && percentage === 0) {
      percentage = 5;
      reason = 'Opened item restocking fee applied';
    }

    // Increase fee for missing packaging
    if (!context.hasOriginalPackaging && policy.requiresOriginalPackaging) {
      percentage = Math.max(percentage, 10);
      reason = 'Missing original packaging fee applied';
    }

    return { percentage, reason };
  }

  /**
   * Check if approval is required for this refund
   * @private
   */
  _checkApprovalRequired(policy, purchasePrice) {
    if (policy.requiresApproval) {
      if (policy.approvalThreshold && purchasePrice) {
        return purchasePrice.amount > policy.approvalThreshold;
      }
      return true;
    }
    return false;
  }

  /**
   * Get human-readable reason for non-refundable items
   * @private
   */
  _getNonRefundableReason(category, policy) {
    const categoryName = this._getCategoryDisplayName(category);
    
    if (policy.description) {
      return `${categoryName}: ${policy.description}`;
    }
    
    return `${categoryName} is non-refundable per platform policy`;
  }

  /**
   * Get display name for category
   * @private
   */
  _getCategoryDisplayName(category) {
    const names = {
      electronics: 'Electronics',
      clothing: 'Clothing & Apparel',
      furniture: 'Furniture',
      digital_products: 'Digital Products',
      perishable_goods: 'Perishable Goods',
      custom_made: 'Custom-Made Items',
      services: 'Services',
      subscription: 'Subscriptions',
      gift_cards: 'Gift Cards',
      health_beauty: 'Health & Beauty',
      software: 'Software Licenses',
      event_tickets: 'Event Tickets',
      default: 'This Item',
    };
    return names[category] || names.default;
  }
}

// Export singleton instance
module.exports = new RefundPolicyEngine();