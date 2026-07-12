const BaseModel = require('./base-model');
const logger = require('@siamsiam/shared-utils').logging.logger;

/**
 * Refund Policy Model - Refund Policy Definition
 * 
 * Defines refund policies at platform, category, merchant, and product levels.
 * Policies cascade with inheritance: product > merchant > category > platform.
 * 
 * TABLE: refund_policies
 */

class RefundPolicy extends BaseModel {
  static tableName = 'refund_policies';
  static primaryKey = 'id';
  
  static fields = [
    'id', 'name', 'slug', 'description',
    'policy_type', 'policy_scope', 'scope_id',
    'category', 'sub_category',
    'return_window_days', 'return_window_type',
    'condition_required', 'condition_description',
    'restocking_fee_percent', 'restocking_fee_maximum',
    'restocking_fee_description',
    'requires_original_packaging', 'requires_tags',
    'requires_accessories', 'requires_manuals',
    'allowed_refund_methods', 'default_refund_method',
    'partial_refunds_allowed', 'max_partial_refunds',
    'requires_approval', 'approval_threshold',
    'auto_approve_under', 'auto_approve_conditions',
    'shipping_refundable', 'shipping_refund_conditions',
    'return_shipping_paid_by', 'return_label_provided',
    'exchange_allowed', 'exchange_window_days',
    'store_credit_offered', 'store_credit_bonus_percent',
    'digital_product_policy', 'service_policy',
    'exceptions', 'exception_conditions',
    'is_active', 'is_default', 'priority',
    'effective_from', 'effective_until',
    'terms_and_conditions', 'legal_disclaimer',
    'metadata', 'tags',
    'tenant_id', 'version',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ];

  static casts = {
    return_window_days: 'integer', exchange_window_days: 'integer',
    max_partial_refunds: 'integer', priority: 'integer',
    restocking_fee_percent: 'float', restocking_fee_maximum: 'float',
    approval_threshold: 'float', auto_approve_under: 'float',
    store_credit_bonus_percent: 'float',
    requires_original_packaging: 'boolean', requires_tags: 'boolean',
    requires_accessories: 'boolean', requires_manuals: 'boolean',
    partial_refunds_allowed: 'boolean', requires_approval: 'boolean',
    shipping_refundable: 'boolean', return_label_provided: 'boolean',
    exchange_allowed: 'boolean', store_credit_offered: 'boolean',
    is_active: 'boolean', is_default: 'boolean',
    allowed_refund_methods: 'json', auto_approve_conditions: 'json',
    exceptions: 'json', exception_conditions: 'json',
    metadata: 'json', tags: 'json',
  };

  static policyTypes = {
    PLATFORM: 'platform', CATEGORY: 'category',
    MERCHANT: 'merchant', PRODUCT: 'product',
  };

  static returnWindowTypes = {
    DAYS_FROM_PURCHASE: 'days_from_purchase',
    DAYS_FROM_DELIVERY: 'days_from_delivery',
    DAYS_FROM_SHIPPING: 'days_from_shipping',
    EXTENDED_HOLIDAY: 'extended_holiday',
  };

  /**
   * Get applicable policy for a product/merchant/category
   */
  static async getApplicablePolicy(merchantId = null, category = null, productId = null) {
    // Check product-level policy (highest priority)
    if (productId) {
      const productPolicy = await this.findOne({
        where: { policy_type: this.policyTypes.PRODUCT, scope_id: productId, is_active: true },
      });
      if (productPolicy) return productPolicy;
    }

    // Check merchant-level policy
    if (merchantId) {
      const merchantPolicy = await this.findOne({
        where: { policy_type: this.policyTypes.MERCHANT, scope_id: merchantId, is_active: true },
      });
      if (merchantPolicy) return merchantPolicy;
    }

    // Check category-level policy
    if (category) {
      const categoryPolicy = await this.findOne({
        where: { policy_type: this.policyTypes.CATEGORY, category, is_active: true },
      });
      if (categoryPolicy) return categoryPolicy;
    }

    // Fall back to platform default
    return this.findOne({
      where: { policy_type: this.policyTypes.PLATFORM, is_default: true, is_active: true },
    });
  }

  /**
   * Create a custom policy
   */
  static async createPolicy(policyData) {
    return this.create({
      name: policyData.name, slug: policyData.slug, description: policyData.description,
      policy_type: policyData.policyType || this.policyTypes.MERCHANT,
      policy_scope: policyData.policyScope, scope_id: policyData.scopeId,
      category: policyData.category, sub_category: policyData.subCategory,
      return_window_days: policyData.returnWindowDays || 14,
      return_window_type: policyData.returnWindowType || this.returnWindowTypes.DAYS_FROM_DELIVERY,
      condition_required: policyData.conditionRequired || 'good_condition',
      restocking_fee_percent: policyData.restockingFeePercent || 0,
      restocking_fee_maximum: policyData.restockingFeeMaximum,
      requires_original_packaging: policyData.requiresOriginalPackaging !== false,
      requires_tags: policyData.requiresTags || false,
      allowed_refund_methods: policyData.allowedRefundMethods || ['original_payment', 'wallet'],
      partial_refunds_allowed: policyData.partialRefundsAllowed !== false,
      requires_approval: policyData.requiresApproval || false,
      approval_threshold: policyData.approvalThreshold,
      auto_approve_under: policyData.autoApproveUnder || 50,
      shipping_refundable: policyData.shippingRefundable !== false,
      exchange_allowed: policyData.exchangeAllowed !== false,
      is_active: true, priority: policyData.priority || 10,
      metadata: policyData.metadata || {}, tenant_id: policyData.tenantId,
    });
  }
}

module.exports = RefundPolicy;